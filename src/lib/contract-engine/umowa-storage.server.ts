// Zapis wygenerowanego kompletu .docx do Storage + trwały wpis do
// generated_documents + wpis audytowy. Wspólne dla kreatora (silnik z
// profilu), agenta umowy i narzędzi MCP.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CZESCI_KOMPLETU, SLUG_KOMPLETU, type KompletWynik } from "./komplet";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function zapiszUmoweDocx(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    komplet: KompletWynik;
    numerUmowy?: string | null;
    templateName: string;
    /** Źródło generacji: kreator / agent / mcp. */
    zrodlo: string;
    loanApplicationId?: string | null;
    leadId?: string | null;
    formData?: Record<string, unknown>;
    signedUrlTtlS?: number;
  },
): Promise<{ docxPath: string; signedUrl: string | null; documentId: string }> {
  const { komplet } = opts;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const nazwa = (opts.numerUmowy || "umowa-pozyczki")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(0, 60);
  const docxPath = `generated/${opts.userId}/${ts}_${nazwa}.docx`;

  const { error: upErr } = await supabase.storage
    .from(CLIENT_FILES_BUCKET)
    .upload(docxPath, new Blob([new Uint8Array(komplet.bytes)], { type: DOCX_MIME }), {
      upsert: false,
    });
  if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

  const audyt = {
    sha256: komplet.sha256,
    wersja_biblioteki_klauzul: komplet.wersjaBiblioteki,
    czesci: [...CZESCI_KOMPLETU],
    zrodlo: opts.zrodlo,
  };

  // Rejestr dokumentów — wpis trwały: bez niego generacja się nie udaje
  // (plik bez wpisu jest usuwany, żeby nie zostawiać sierot w Storage).
  const { data: row, error: insErr } = await supabase
    .from("generated_documents")
    .insert({
      template_name: opts.templateName,
      template_slug: SLUG_KOMPLETU,
      loan_application_id: opts.loanApplicationId ?? null,
      lead_id: opts.leadId ?? null,
      form_data: { ...(opts.formData ?? {}), audyt } as never,
      docx_path: docxPath,
      file_size_bytes: komplet.bytes.length,
      created_by: opts.userId,
    })
    .select("id")
    .single();
  if (insErr || !row) {
    await supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .remove([docxPath])
      .catch(() => undefined);
    throw new Error(`Zapis w rejestrze dokumentów: ${insErr?.message ?? "brak wiersza"}`);
  }

  // Audyt każdej generacji: kto, kiedy (created_at), hash treści, wersja
  // biblioteki klauzul. Zapis kluczem serwisowym — polityka audit_logs
  // dopuszcza INSERT tylko zespołowi, a generują też inwestorzy (/inwestor);
  // RLS pozostaje bez zmian, user_id to faktyczny wykonawca.
  const { error: audErr } = await supabaseAdmin.from("audit_logs").insert({
    user_id: opts.userId,
    action: "contract_generated",
    object_type: "generated_document",
    object_id: row.id,
    new_value: {
      ...audyt,
      docx_path: docxPath,
      loan_application_id: opts.loanApplicationId ?? null,
      numer_umowy: opts.numerUmowy ?? null,
    },
  });
  if (audErr) throw new Error(`Zapis audytu generacji: ${audErr.message}`);

  const { data: signed } = await supabase.storage
    .from(CLIENT_FILES_BUCKET)
    .createSignedUrl(docxPath, opts.signedUrlTtlS ?? 3600);
  return { docxPath, signedUrl: signed?.signedUrl ?? null, documentId: row.id };
}
