// Pobieranie załączników (Messenger/IG URL lub Mailgun storage URL) i upload do bucketu `documents`
// pod prefiksem leads/{lead_id}/...
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type StoredAttachment = {
  name: string;
  mime: string;
  size: number;
  path: string; // ścieżka w bucket `documents`
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
    const safeName = (opts.filename ?? `file-${Date.now()}`).replace(/[^\w.\-]+/g, "_");
    const path = `leads/${opts.leadId}/${Date.now()}-${safeName}${safeName.includes(".") ? "" : ext}`;
    const mime = opts.mime ?? res.headers.get("content-type") ?? "application/octet-stream";
    const { error } = await admin().storage.from("documents").upload(path, buf, {
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
