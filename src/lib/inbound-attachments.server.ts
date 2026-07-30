// Pobieranie załączników (Messenger/IG URL lub Mailgun storage URL) i upload do bucketu `pliki-klienta`
// pod prefiksem leads/{lead_id}/...
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { sha256Hex, partitionByContentHash } from "@/lib/uploads/file-dedup";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type StoredAttachment = {
  name: string;
  mime: string;
  size: number;
  path: string; // ścieżka w buckecie `pliki-klienta`
  contentHash: string | null; // SHA-256 treści (hex); null gdy hashowanie się nie powiodło
  deduped?: boolean; // true = binarka już istniała dla tego leada, zwrócono istniejącą ścieżkę
};

export async function downloadAndStore(opts: {
  leadId: string;
  url: string;
  filename?: string;
  mime?: string;
  authHeader?: Record<string, string>;
}): Promise<StoredAttachment | null> {
  try {
    const res = await fetch(opts.url, { headers: opts.authHeader });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const ext = guessExt(opts.filename, opts.mime, res.headers.get("content-type"));
    // Rozszerzenie także w NAZWIE (nie tylko w ścieżce) — file_name bez ".jpg"
    // sprawiał, że UI nie rozpoznawał obrazka i nie pokazywał miniatury.
    const safeName =
      (opts.filename ?? `file-${Date.now()}`).replace(/[^\w.\-]+/g, "_") +
      ((opts.filename ?? "").includes(".") ? "" : ext);
    const mime = opts.mime ?? res.headers.get("content-type") ?? "application/octet-stream";
    const s = admin();

    // Dedup po treści: ten sam załącznik wysłany ponownie (cytowany wątek
    // mailowy, re-send na Messengerze, retry webhooka) nie tworzy drugiej
    // kopii w Storage — wskazujemy już istniejącą ścieżkę.
    const contentHash = await sha256Hex(buf);
    if (contentHash) {
      const { data: dup } = await s
        .from("client_file_hashes")
        .select("storage_path, file_name")
        .eq("lead_id", opts.leadId)
        .eq("content_hash", contentHash)
        .limit(1)
        .maybeSingle();
      if (dup?.storage_path) {
        return {
          name: (dup.file_name as string | null) ?? safeName,
          mime,
          size: buf.byteLength,
          path: dup.storage_path as string,
          contentHash,
          deduped: true,
        };
      }
    }

    const path = `leads/${opts.leadId}/${Date.now()}-${safeName}`;
    const { error } = await s.storage.from(CLIENT_FILES_BUCKET).upload(path, buf, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      console.error("[attachments] upload error", error);
      return null;
    }
    if (contentHash) {
      // Best-effort — 23505 z wyścigu równoległych webhooków ignorujemy.
      await s.from("client_file_hashes").insert({
        lead_id: opts.leadId,
        content_hash: contentHash,
        storage_path: path,
        file_name: safeName,
        byte_size: buf.byteLength,
      });
    }
    return { name: safeName, mime, size: buf.byteLength, path, contentHash, deduped: false };
  } catch (e) {
    console.error("[attachments] download error", e);
    return null;
  }
}

/**
 * Po pobraniu załączników z maila/Messengera podpina je też pod klienta:
 * - znajduje loan_application_id powiązany z leadem (przez leads.loan_application_id
 *   lub przez clients → najnowsze loan_applications),
 * - dla każdego załącznika zakłada rekord w public.documents (file_path wskazuje
 *   na bucket "pliki-klienta", tę samą ścieżkę co w Storage),
 * - pomija duplikaty: załączniki, których hash treści już występuje w documents
 *   tego wniosku (a także powtórzenia wewnątrz jednej partii).
 * Idempotentne best-effort — błędy logujemy i lecimy dalej.
 */
export async function attachStoredToClientDocuments(opts: {
  leadId: string;
  stored: StoredAttachment[];
  sourceLabel?: string; // np. "inbound-email" / "messenger"
}): Promise<{ inserted: number; skippedDuplicates: number }> {
  if (!opts.stored.length) return { inserted: 0, skippedDuplicates: 0 };
  const s = admin();

  // 1) lead → loan_application_id / client_id
  const { data: lead } = await s
    .from("leads")
    .select("id, client_id, loan_application_id")
    .eq("id", opts.leadId)
    .maybeSingle();

  let loanApplicationId: string | null = lead?.loan_application_id ?? null;

  // 2) Fallback — najnowszy wniosek klienta
  if (!loanApplicationId && lead?.client_id) {
    const { data: la } = await s
      .from("loan_applications")
      .select("id")
      .eq("client_id", lead.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    loanApplicationId = la?.id ?? null;
  }

  if (!loanApplicationId) {
    // bez wniosku nie mamy gdzie podpiąć — zostaną w lead_communications.attachments
    return { inserted: 0, skippedDuplicates: 0 };
  }

  // 3) Dedup po treści względem dokumentów już podpiętych pod wniosek.
  const hashes = opts.stored.map((a) => a.contentHash).filter((h): h is string => !!h);
  const knownHashes = new Set<string>();
  if (hashes.length) {
    const { data: existing } = await s
      .from("documents")
      .select("content_hash")
      .eq("loan_application_id", loanApplicationId)
      .in("content_hash", hashes);
    (existing ?? []).forEach((d: { content_hash: string | null }) => {
      if (d.content_hash) knownHashes.add(d.content_hash);
    });
  }
  const { fresh, duplicates } = partitionByContentHash(opts.stored, knownHashes);
  if (duplicates.length) {
    console.log(
      `[attachments] pominięto ${duplicates.length} duplikat(ów) dla wniosku ${loanApplicationId}`,
    );
  }
  if (!fresh.length) return { inserted: 0, skippedDuplicates: duplicates.length };

  const label = opts.sourceLabel ?? "inbound";
  const rows = fresh.map((a) => ({
    loan_application_id: loanApplicationId,
    document_type: `attachment_${label}`,
    file_name: a.name,
    file_path: a.path,
    file_url: a.path, // tylko ścieżka w buckecie "pliki-klienta" — signed URL generujemy w UI
    status: "received",
    visibility_level: "pelne" as const,
    content_hash: a.contentHash,
  }));

  const { error, count } = await s.from("documents").insert(rows, { count: "exact" });
  if (error) {
    console.error("[attachments] documents insert error", error);
    return { inserted: 0, skippedDuplicates: duplicates.length };
  }

  // 4) Rejestr hashy w zakresie wniosku — dzięki temu dedup łapie też
  //    ten sam plik wgrany później ręcznie w panelu (uploadFile).
  const registryRows = fresh
    .filter((a) => a.contentHash)
    .map((a) => ({
      loan_application_id: loanApplicationId,
      lead_id: opts.leadId,
      content_hash: a.contentHash,
      storage_path: a.path,
      file_name: a.name,
      byte_size: a.size,
    }));
  if (registryRows.length) {
    // Wstawiamy pojedynczo, żeby 23505 jednego wiersza nie ubił całej partii.
    for (const row of registryRows) {
      await s.from("client_file_hashes").insert(row);
    }
  }

  return { inserted: count ?? rows.length, skippedDuplicates: duplicates.length };
}

function guessExt(name?: string, mime?: string, contentType?: string | null): string {
  if (name && name.includes(".")) return "";
  const m = (mime ?? contentType ?? "").toLowerCase();
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("heic")) return ".heic";
  if (m.includes("msword") || m.includes("officedocument.wordprocessing")) return ".docx";
  return "";
}
