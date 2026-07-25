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
  /** Prefiks leadowy `leads/{leadId}` — używany domyślnie, gdy brak `storagePrefix`. */
  leadId?: string;
  /** Alternatywny prefiks ścieżki w buckecie (np. `investors/{id}`) dla załączników spoza świata leadów. */
  storagePrefix?: string;
  url: string;
  filename?: string;
  mime?: string;
  authHeader?: Record<string, string>;
}): Promise<StoredAttachment | null> {
  const prefix = opts.storagePrefix ?? (opts.leadId ? `leads/${opts.leadId}` : null);
  if (!prefix) {
    console.error("[attachments] downloadAndStore: missing leadId/storagePrefix");
    return null;
  }
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
    const path = `${prefix}/${Date.now()}-${safeName}`;
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
  return { inserted: count ?? rows.length };
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
