// Naprawa plików klienta „przeniesionych" migracją 20260715090000 samym
// UPDATE storage.objects.bucket_id: wiersz jest w `pliki-klienta`, ale plik
// w magazynie Storage został pod kluczem starego bucketu ('property-photos' /
// 'documents'), więc pobranie kończy się 404 NoSuchKey (puste miniatury
// u operatora). Szczegóły i funkcje SQL — migracja
// 20260929180000_pliki_klienta_naprawa_przeniesionych.sql.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { WRITE_IDEMPOTENT, handle, ok, requireRolesAdmin } from "../_helpers";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

const OLD_BUCKETS = ["property-photos", "documents"] as const;

type Candidate = { name: string; mimetype: string | null; size: number | null };
type Outcome = "ok" | "naprawiony" | "do_naprawy" | "brak_kopii" | "blad";

const objectUrl = (bucket: string, path: string) =>
  `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

/** Czy plik fizycznie istnieje pod `bucket/path`? Pobiera 1 bajt (Range). */
async function readable(bucket: string, path: string): Promise<boolean | "blad"> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Brak SUPABASE_SERVICE_ROLE_KEY na serwerze.");
  const res = await fetch(objectUrl(bucket, path), {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: "bytes=0-0" },
  });
  await res.body?.cancel();
  if (res.ok) return true;
  // Storage zwraca 400/404 z NoSuchKey / „not found" — to jest nasz przypadek.
  if (res.status === 400 || res.status === 404) return false;
  return "blad";
}

export const repairClientFiles = defineTool({
  name: "repair_client_files",
  title: "Repair client files moved without their data",
  description:
    "Naprawia pliki klienta w buckecie `pliki-klienta`, które mają wpis w bazie, ale nie dają się pobrać (404 NoSuchKey — puste miniatury i podgląd u operatora). Przyczyna: lipcowa migracja przeniosła tylko metadane ze starych bucketów. Narzędzie sprawdza partię plików sprzed migracji; uszkodzone pobiera ze starego bucketu i wgrywa ponownie do `pliki-klienta`. `dry_run: true` tylko liczy. Wywołuj w pętli z `after` = `next_after`, aż `done: true`. Tylko administrator.",
  inputSchema: {
    dry_run: z.boolean().default(true).describe("true — tylko raport, bez zmian."),
    after: z
      .string()
      .max(1000)
      .default("")
      .describe("Kursor: nazwa ostatniego sprawdzonego pliku (`next_after` z poprzedniej partii)."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = (await requireRolesAdmin(ctx, ["administrator"])) as any;
      const dryRun = a.dry_run ?? true;
      const limit = a.limit ?? 25;

      const { data, error } = await db.rpc("pliki_klienta_do_naprawy", {
        p_after: a.after ?? "",
        p_limit: limit,
      });
      if (error) throw new Error(`pliki_klienta_do_naprawy: ${error.message}`);
      const candidates = (data ?? []) as Candidate[];

      const counts: Record<Outcome, number> = {
        ok: 0,
        naprawiony: 0,
        do_naprawy: 0,
        brak_kopii: 0,
        blad: 0,
      };
      const problems: Array<{ name: string; status: Outcome; detail?: string }> = [];

      for (const c of candidates) {
        let status: Outcome;
        let detail: string | undefined;
        try {
          const current = await readable(CLIENT_FILES_BUCKET, c.name);
          if (current === true) {
            status = "ok";
          } else if (current === "blad") {
            status = "blad";
            detail = "Storage nie odpowiedział poprawnie przy sprawdzaniu pliku.";
          } else if (dryRun) {
            status = "do_naprawy";
          } else {
            ({ status, detail } = await restore(db, c));
          }
        } catch (e) {
          status = "blad";
          detail = (e as Error)?.message ?? String(e);
        }
        counts[status] += 1;
        if (status !== "ok") problems.push({ name: c.name, status, detail });
      }

      const done = candidates.length < limit;
      return ok({
        dry_run: dryRun,
        checked: candidates.length,
        counts,
        problems: problems.slice(0, 50),
        next_after: candidates.at(-1)?.name ?? a.after ?? "",
        done,
      });
    }),
});

/** Odzyskuje plik ze starego bucketu i wgrywa go do `pliki-klienta`. */
async function restore(db: any, c: Candidate): Promise<{ status: Outcome; detail?: string }> {
  for (const bucket of OLD_BUCKETS) {
    const { data: added, error: addErr } = await db.rpc("pliki_klienta_cien", {
      p_name: c.name,
      p_bucket: bucket,
      p_add: true,
    });
    if (addErr) throw new Error(`pliki_klienta_cien(${bucket}): ${addErr.message}`);
    try {
      const { data: blob, error: dlErr } = await db.storage.from(bucket).download(c.name);
      if (dlErr || !blob) continue;
      const { error: upErr } = await db.storage.from(CLIENT_FILES_BUCKET).upload(c.name, blob, {
        upsert: true,
        contentType: c.mimetype || blob.type || "application/octet-stream",
      });
      if (upErr) return { status: "blad", detail: `upload: ${upErr.message}` };
      if ((await readable(CLIENT_FILES_BUCKET, c.name)) !== true) {
        return { status: "blad", detail: "Po wgraniu plik nadal nie daje się pobrać." };
      }
      return { status: "naprawiony", detail: `z bucketu ${bucket}` };
    } finally {
      // Wiersz-cień usuwamy tylko, jeśli to my go dodaliśmy.
      if (added) {
        await db.rpc("pliki_klienta_cien", { p_name: c.name, p_bucket: bucket, p_add: false });
      }
    }
  }
  return { status: "brak_kopii", detail: "Nie znaleziono pliku w starych bucketach." };
}

export const storageRepairTools = [repairClientFiles];
