// Rozwiązywanie załączników wychodzących: referencja (ścieżka w Storage lub URL)
// → pobrany plik zakodowany base64, gotowy do wysłania przez Resend jako
// normalny załącznik maila (a nie link w treści).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OutboundAttachmentRef } from "./email-attachments.types";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

export type ResolvedAttachment = {
  filename: string;
  content: string; // base64
  contentType?: string;
  sizeBytes: number;
};

// Resend limituje cały mail do ~40 MB — zostawiamy margines na treść i narzut base64.
export const MAX_ATTACHMENTS_TOTAL_BYTES = 30 * 1024 * 1024;

// Wszystkie pliki klienta leżą w jednym buckecie `pliki-klienta`;
// materiały marketingowe mają nadal własny bucket.
const CANDIDATE_BUCKETS = [CLIENT_FILES_BUCKET, "marketing-materials"];

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

async function downloadRef(
  ref: OutboundAttachmentRef,
): Promise<{ buf: Buffer; contentType?: string } | null> {
  const url =
    ref.url && isHttpUrl(ref.url) ? ref.url : ref.path && isHttpUrl(ref.path) ? ref.path : null;
  if (url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return {
      buf: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? undefined,
    };
  }
  const path = (ref.path ?? "").replace(/^\/+/, "");
  if (!path) return null;
  const buckets = Array.from(
    new Set([ref.bucket, ...CANDIDATE_BUCKETS].filter((b): b is string => !!b)),
  );
  for (const bucket of buckets) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (!error && data) {
      return { buf: Buffer.from(await data.arrayBuffer()), contentType: data.type || undefined };
    }
  }
  return null;
}

/**
 * Pobiera pliki dla podanych referencji i zwraca je jako base64.
 * Nie wysyła maila "po cichu" bez plików: każdy problem (plik nie do pobrania,
 * przekroczony limit rozmiaru) ląduje w `errors` — caller decyduje, czy przerwać.
 */
export async function resolveOutboundAttachments(
  refs: OutboundAttachmentRef[],
): Promise<{ attachments: ResolvedAttachment[]; errors: string[] }> {
  const attachments: ResolvedAttachment[] = [];
  const errors: string[] = [];
  let total = 0;
  for (const ref of refs) {
    const dl = await downloadRef(ref).catch((e) => {
      console.error("[outbound-attachments] download error", ref.name, e);
      return null;
    });
    if (!dl) {
      errors.push(`Nie udało się pobrać załącznika „${ref.name}”.`);
      continue;
    }
    if (total + dl.buf.byteLength > MAX_ATTACHMENTS_TOTAL_BYTES) {
      errors.push(
        `Załączniki przekraczają limit ${Math.round(MAX_ATTACHMENTS_TOTAL_BYTES / 1024 / 1024)} MB — „${ref.name}” się nie zmieścił.`,
      );
      continue;
    }
    total += dl.buf.byteLength;
    attachments.push({
      filename: ref.name,
      content: dl.buf.toString("base64"),
      contentType: ref.mime ?? dl.contentType,
      sizeBytes: dl.buf.byteLength,
    });
  }
  return { attachments, errors };
}
