// Zapis wygenerowanej umowy .docx do Storage + wpis do generated_documents.
// Wspólne dla kreatora (silnik z profilu), agenta umowy i narzędzi MCP.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function zapiszUmoweDocx(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    bytes: Uint8Array;
    numerUmowy?: string | null;
    templateName: string;
    formData: Record<string, unknown>;
    signedUrlTtlS?: number;
  },
): Promise<{ docxPath: string; signedUrl: string | null }> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const nazwa = (opts.numerUmowy || "umowa-pozyczki")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(0, 60);
  const docxPath = `generated/${opts.userId}/${ts}_${nazwa}.docx`;

  const { error: upErr } = await supabase.storage
    .from(CLIENT_FILES_BUCKET)
    .upload(docxPath, new Blob([new Uint8Array(opts.bytes)], { type: DOCX_MIME }), {
      upsert: false,
    });
  if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

  // Rejestr dokumentów — best-effort (nie blokuje wyniku). Tabela nie ma
  // kolumny client_profile_id — powiązania trafiają do form_data (Json).
  try {
    await supabase.from("generated_documents").insert({
      template_name: opts.templateName,
      form_data: opts.formData,
      docx_path: docxPath,
      file_size_bytes: opts.bytes.length,
      created_by: opts.userId,
    });
  } catch {
    /* rejestracja pomocnicza — pomijalna */
  }

  const { data: signed } = await supabase.storage
    .from(CLIENT_FILES_BUCKET)
    .createSignedUrl(docxPath, opts.signedUrlTtlS ?? 3600);
  return { docxPath, signedUrl: signed?.signedUrl ?? null };
}
