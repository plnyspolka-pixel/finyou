// Pobieranie załączników (Messenger/IG URL lub Mailgun storage URL) i upload do bucketu `pliki-klienta`
// pod prefiksem leads/{lead_id}/...
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type StoredAttachment = {
  name: string;
  mime: string;
  size: number;
  path: string; // ścieżka w buckecie `pliki-klienta`
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
    const path = `leads/${opts.leadId}/${Date.now()}-${safeName}`;
    const mime = opts.mime ?? res.headers.get("content-type") ?? "application/octet-stream";
    const { error } = await admin().storage.from(CLIENT_FILES_BUCKET).upload(path, buf, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      console.error("[attachments] upload error", error);
      return null;
    }
    return { name: safeName, mime, size: buf.byteLength, path };
  } catch (e) {
    console.error("[attachments] download error", e);
    return null;
  }
}

/** lead → loan_application_id: wprost z leada albo najnowszy wniosek jego klienta. */
async function resolveLeadLoanApplicationId(
  s: SupabaseClient,
  leadId: string,
): Promise<string | null> {
  const { data: lead } = await s
    .from("leads")
    .select("id, client_id, loan_application_id")
    .eq("id", leadId)
    .maybeSingle();
  let loanApplicationId: string | null = lead?.loan_application_id ?? null;
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
  return loanApplicationId;
}

/**
 * Po pobraniu załączników z maila/Messengera podpina je też pod klienta:
 * - znajduje loan_application_id powiązany z leadem (przez leads.loan_application_id
 *   lub przez clients → najnowsze loan_applications),
 * - dla każdego załącznika zakłada rekord w public.documents (file_path wskazuje
 *   na bucket "pliki-klienta", tę samą ścieżkę co w Storage).
 * Idempotentne best-effort — błędy logujemy i lecimy dalej.
 */
export async function attachStoredToClientDocuments(opts: {
  leadId: string;
  stored: StoredAttachment[];
  sourceLabel?: string; // np. "inbound-email" / "messenger"
}): Promise<{ inserted: number }> {
  if (!opts.stored.length) return { inserted: 0 };
  const s = admin();

  const loanApplicationId = await resolveLeadLoanApplicationId(s, opts.leadId);
  if (!loanApplicationId) {
    // bez wniosku nie mamy gdzie podpiąć — zostaną w lead_communications.attachments,
    // a domknie je backfillLeadAttachmentsToDocuments, gdy wniosek powstanie
    return { inserted: 0 };
  }

  const label = opts.sourceLabel ?? "inbound";
  const rows = opts.stored.map((a) => ({
    loan_application_id: loanApplicationId,
    document_type: `attachment_${label}`,
    file_name: a.name,
    file_path: a.path,
    file_url: a.path, // tylko ścieżka w buckecie "pliki-klienta" — signed URL generujemy w UI
    status: "received",
    visibility_level: "pelne" as const,
  }));

  const { error, count } = await s.from("documents").insert(rows, { count: "exact" });
  if (error) {
    console.error("[attachments] documents insert error", error);
    return { inserted: 0 };
  }

  // Skoro wniosek już jest, przy okazji domknij też STARSZE załączniki leada,
  // które przyszły zanim wniosek istniał (zostały tylko w lead_communications).
  try {
    await backfillLeadAttachmentsToDocuments({ leadId: opts.leadId, loanApplicationId });
  } catch (e) {
    console.error("[attachments] backfill after attach error", e);
  }

  return { inserted: count ?? rows.length };
}

/**
 * Domyka historyczne załączniki leada do tabeli `documents`:
 *  1) przepina osierocone rekordy documents (loan_application_id NULL,
 *     file_path `leads/{leadId}/…`) na wniosek leada,
 *  2) zakłada rekordy documents dla załączników z lead_communications,
 *     których jeszcze w documents nie ma (dedup po file_path).
 *
 * Naprawia sprawy, w których klient przysłał pliki (Messenger/e-mail) ZANIM
 * powstał wniosek — takie pliki zostawały wyłącznie w
 * lead_communications.attachments i listy wniosków pokazywały „brak plików".
 * Idempotentne, bezpieczne do wołania wielokrotnie.
 */
export async function backfillLeadAttachmentsToDocuments(opts: {
  leadId: string;
  loanApplicationId?: string | null;
}): Promise<{ inserted: number; relinked: number }> {
  const s = admin();
  const loanApplicationId =
    opts.loanApplicationId ?? (await resolveLeadLoanApplicationId(s, opts.leadId));
  if (!loanApplicationId) return { inserted: 0, relinked: 0 };

  // 1) osierocone documents (upload sprzed powstania wniosku)
  const { count: relinked } = await s
    .from("documents")
    .update({ loan_application_id: loanApplicationId }, { count: "exact" })
    .is("loan_application_id", null)
    .like("file_path", `leads/${opts.leadId}/%`);

  // 2) załączniki z wiadomości bez rekordu w documents
  const { data: comms } = await s
    .from("lead_communications")
    .select("channel, attachments")
    .eq("lead_id", opts.leadId)
    .not("attachments", "is", null);

  type CommAttachment = { path?: string | null; name?: string | null };
  const byPath = new Map<string, { name: string | null; channel: string | null }>();
  for (const c of (comms ?? []) as { channel: string | null; attachments: unknown }[]) {
    const atts = Array.isArray(c.attachments) ? (c.attachments as CommAttachment[]) : [];
    for (const a of atts) {
      if (a?.path && !byPath.has(a.path)) {
        byPath.set(a.path, { name: a.name ?? null, channel: c.channel });
      }
    }
  }
  if (byPath.size === 0) return { inserted: 0, relinked: relinked ?? 0 };

  const paths = Array.from(byPath.keys());
  const existing = new Set<string>();
  for (let i = 0; i < paths.length; i += 200) {
    const { data: docs } = await s
      .from("documents")
      .select("file_path")
      .in("file_path", paths.slice(i, i + 200));
    for (const d of (docs ?? []) as { file_path: string | null }[]) {
      if (d.file_path) existing.add(d.file_path);
    }
  }

  const rows = paths
    .filter((p) => !existing.has(p))
    .map((p) => {
      const meta = byPath.get(p)!;
      const label = (meta.channel ?? "inbound").toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
      return {
        loan_application_id: loanApplicationId,
        document_type: `attachment_${label}`,
        file_name: meta.name ?? p.split("/").pop() ?? "plik",
        file_path: p,
        file_url: p,
        status: "received",
        visibility_level: "pelne" as const,
      };
    });
  if (rows.length === 0) return { inserted: 0, relinked: relinked ?? 0 };

  const { error, count } = await s.from("documents").insert(rows, { count: "exact" });
  if (error) {
    console.error("[attachments] backfill documents insert error", error);
    return { inserted: 0, relinked: relinked ?? 0 };
  }
  return { inserted: count ?? rows.length, relinked: relinked ?? 0 };
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
