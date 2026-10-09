import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LEGACY_KOMUNIKAT, LEGACY_USE_CASE } from "@/lib/legacy-templates";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  normalizePlaceholders,
  xmlToPlainText,
  replaceByOccurrence,
  stripTrailingSectionXml,
} from "@/lib/document-fields";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { injectScheduleTable, type ScheduleRow } from "@/lib/schedule-table-docx";
import { bundledTemplateBytes } from "@/lib/document-templates/bundled";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Plik wzoru: Storage (z fallbackiem do starego bucketa „documents"), a gdy go
 * tam nie ma — wzór dołączony do kodu, wgrywany przy okazji do Storage
 * (best effort), żeby działały też podpisane linki do pobrania.
 */
async function downloadTemplateFile(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<{ file: Blob | null; bucket: string | null; error: string | null }> {
  let dlErr: string | null = null;
  for (const bucket of [CLIENT_FILES_BUCKET, "documents"]) {
    const res = await supabase.storage.from(bucket).download(path);
    if (!res.error && res.data) return { file: res.data, bucket, error: null };
    dlErr = res.error?.message ?? "brak pliku";
  }
  const bundled = bundledTemplateBytes(path);
  if (!bundled) return { file: null, bucket: null, error: dlErr };
  const file = new Blob([bundled], { type: DOCX_MIME });
  const { error: upErr } = await supabase.storage
    .from(CLIENT_FILES_BUCKET)
    .upload(path, file, { upsert: true, contentType: DOCX_MIME });
  return { file, bucket: upErr ? null : CLIENT_FILES_BUCKET, error: null };
}

export type DocTemplate = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  template_file_path: string | null;
  placeholders: string[];
  sort_order: number | null;
};

export type GeneratedDoc = {
  id: string;
  template_id: string | null;
  template_name: string | null;
  template_slug: string | null;
  lead_id: string | null;
  loan_application_id: string | null;
  docx_path: string | null;
  pdf_path: string | null;
  commission_amount: number | null;
  commission_added_to_costs: boolean | null;
  created_at: string;
  created_by: string | null;
};

/** Lista dostępnych wzorów (RLS filtruje po roli/audience). */
export const listDocxTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("document_templates")
      .select("id, slug, name, category, template_file_path, placeholders, sort_order")
      .not("template_file_path", "is", null)
      // Wzory legacy (np. u01-04 — umowa pożyczki) zastąpił silnik umów.
      .neq("use_case", LEGACY_USE_CASE)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as DocTemplate[];
  });

/** Historia wygenerowanych dokumentów - opcjonalnie po lead/loan. */
export const listGeneratedDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId?: string; loanId?: string; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("generated_documents")
      .select(
        "id, template_id, template_name, template_slug, lead_id, loan_application_id, docx_path, pdf_path, commission_amount, commission_added_to_costs, created_at, created_by",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    if (data.loanId) q = q.eq("loan_application_id", data.loanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as GeneratedDoc[];
  });

/**
 * Generuje DOCX z wybranego szablonu.
 *
 * Wartości przekazujemy POZYCYJNIE: `values` mapuje indeks wystąpienia
 * placeholdera (w kolejności dokumentu, jako string) → wartość. Dzięki temu
 * powtarzające się klucze (np. `[KWOTA]`, `[ADRES]` dla różnych stron) można
 * uzupełnić niezależnie. Puste wartości są pomijane — odpowiadające im tokeny
 * `[KLUCZ]` zostają w dokumencie nietknięte (nie zmieniamy treści wzoru).
 */
export const generateDocxFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      templateId: string;
      /** indeks wystąpienia (string) → wartość */
      values: Record<string, string>;
      leadId?: string | null;
      loanApplicationId?: string | null;
      investorOfferId?: string | null;
      commissionAmount?: number | null;
      commissionAddedToCosts?: boolean;
      /** Harmonogram spłat — wstawiany jako tabela w miejsce placeholdera [HARMONOGRAM]. */
      schedule?: ScheduleRow[] | null;
      /**
       * Gdy podane: usuń z wygenerowanego pliku sekcję końcową zaczynającą się
       * tym nagłówkiem (np. „Uwagi praktyczne") — treść nie trafia do dokumentu.
       */
      stripSectionFromHeading?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Pobierz szablon
    const { data: tpl, error: tplErr } = await supabase
      .from("document_templates")
      .select("id, slug, name, template_file_path, use_case")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (tpl?.use_case === LEGACY_USE_CASE) throw new Error(LEGACY_KOMUNIKAT);
    if (!tpl?.template_file_path) throw new Error("Wzór nie ma przypisanego pliku.");

    // 2. Pobierz plik z Storage (fallback: stary bucket „documents", wzór w kodzie)
    const { file, error: dlErr } = await downloadTemplateFile(supabase, tpl.template_file_path);
    if (!file) throw new Error(`Pobranie wzoru: ${dlErr ?? "brak pliku"}`);
    const arrayBuf = await file.arrayBuffer();

    // 3. Podstaw wartości pozycyjnie w word/document.xml
    const { default: PizZip } = await import("pizzip");
    const zip = new PizZip(arrayBuf);
    const docXmlPath = "word/document.xml";
    const rawXml = zip.file(docXmlPath)?.asText() ?? "";

    // Najpierw sklejamy placeholdery rozbite przez tagi w ciągłe tokeny `[KLUCZ]`,
    // następnie podstawiamy po indeksie wystąpienia (ten sam porządek co podgląd).
    let normalizedXml = normalizePlaceholders(rawXml);
    // Opcjonalnie wytnij sekcję końcową (np. „Uwagi praktyczne") — zanim
    // podstawimy wartości, żeby numeracja wystąpień pozostała spójna (sekcja
    // jest na końcu, więc usuwane są wyłącznie końcowe tokeny).
    if (data.stripSectionFromHeading) {
      normalizedXml = stripTrailingSectionXml(normalizedXml, data.stripSectionFromHeading);
    }
    let filledXml = replaceByOccurrence(normalizedXml, data.values ?? {});
    // Placeholder [HARMONOGRAM] → prawdziwa tabela Worda z harmonogramem spłat.
    filledXml = injectScheduleTable(filledXml, data.schedule ?? null);

    zip.file(docXmlPath, filledXml);
    const outBuf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

    // 5. Upload do Storage
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = tpl.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60);
    const outPath = `generated/${userId}/${ts}_${safeName}.docx`;
    const { error: upErr } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(
      outPath,
      new Blob([new Uint8Array(outBuf)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      { upsert: false },
    );
    if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

    // 6. Wpis do bazy
    const { data: row, error: insErr } = await supabase
      .from("generated_documents")
      .insert({
        template_id: tpl.id,
        template_slug: tpl.slug,
        template_name: tpl.name,
        lead_id: data.leadId ?? null,
        loan_application_id: data.loanApplicationId ?? null,
        investor_offer_id: data.investorOfferId ?? null,
        form_data: data.values ?? {},
        commission_amount: data.commissionAmount ?? null,
        commission_added_to_costs: data.commissionAddedToCosts ?? false,
        docx_path: outPath,
        file_size_bytes: outBuf.length,
        created_by: userId,
      })
      .select()
      .single();
    if (insErr) throw new Error(`Zapis dokumentu: ${insErr.message}`);

    return { id: row.id, docxPath: outPath };
  });

/** Krótkotrwały signed URL do pobrania pliku. */
export const getGeneratedDocSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string; expiresInSec?: number }) => d)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .createSignedUrl(data.path, data.expiresInSec ?? 300);
    if (error || !signed) throw new Error(error?.message ?? "Brak URL");
    return { url: signed.signedUrl };
  });

/** Signed URL pliku .docx wzoru + info czy fizycznie istnieje. */
export const getDocxTemplateDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: tpl, error: tplErr } = await context.supabase
      .from("document_templates")
      .select("name, template_file_path")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl?.template_file_path)
      return {
        url: null,
        exists: false,
        name: tpl?.name ?? null,
        reason: "Brak przypisanego pliku.",
      };

    const { bucket } = await downloadTemplateFile(context.supabase, tpl.template_file_path);
    if (bucket) {
      const { data: signed } = await context.supabase.storage
        .from(bucket)
        .createSignedUrl(tpl.template_file_path, 300);
      if (signed?.signedUrl)
        return { url: signed.signedUrl, exists: true, name: tpl.name, reason: null };
    }
    return {
      url: null,
      exists: false,
      name: tpl.name,
      reason: "Plik nie istnieje w Storage — wgraj ponownie.",
    };
  });

/** Upload / zamiana pliku .docx wzoru (staff). Zapisuje template_file_path. */
export const uploadDocxTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string; fileName: string; base64: string }) => d)
  .handler(async ({ data, context }) => {
    if (!/\.docx$/i.test(data.fileName)) throw new Error("Wymagany plik .docx");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safe = data.fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_");
    const path = `templates/${safe}`;
    const { error: upErr } = await context.supabase.storage.from(CLIENT_FILES_BUCKET).upload(
      path,
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      {
        upsert: true,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    );
    if (upErr) throw new Error(`Upload: ${upErr.message}`);
    const { error: updErr } = await context.supabase
      .from("document_templates")
      .update({ template_file_path: path })
      .eq("id", data.templateId);
    if (updErr) throw new Error(`Zapis ścieżki: ${updErr.message}`);
    return { ok: true, path };
  });

/**
 * Podgląd treści wzoru — zwraca plain-text z placeholderami `[KLUCZ]`.
 *
 * ŹRÓDŁO PRAWDY: wyłącznie plik .docx ze Storage. Kolumna `placeholders` w bazie
 * nie jest używana (bywała nieaktualna względem pliku) — wszystkie pola wyliczamy
 * z treści dokumentu, w tej samej kolejności, której używa generator.
 */
export const getDocxTemplatePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: tpl, error: tplErr } = await context.supabase
      .from("document_templates")
      .select("template_file_path")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl?.template_file_path) throw new Error("Wzór nie ma przypisanego pliku.");

    const { file, error: dlErr } = await downloadTemplateFile(
      context.supabase,
      tpl.template_file_path,
    );
    if (!file) throw new Error(`Pobranie wzoru: ${dlErr ?? "brak pliku"}`);

    const arrayBuf = await file.arrayBuffer();
    const { default: PizZip } = await import("pizzip");
    const zip = new PizZip(arrayBuf);
    const rawXml = zip.file("word/document.xml")?.asText() ?? "";

    // Sklejamy rozbite runy placeholderów [KLUCZ], a następnie zamieniamy na tekst.
    const text = xmlToPlainText(normalizePlaceholders(rawXml));
    return { text };
  });
