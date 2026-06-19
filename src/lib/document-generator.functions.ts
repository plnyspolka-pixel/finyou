import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      .select("id, template_id, template_name, template_slug, lead_id, loan_application_id, docx_path, pdf_path, commission_amount, commission_added_to_costs, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    if (data.loanId) q = q.eq("loan_application_id", data.loanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as GeneratedDoc[];
  });

/** Generuje DOCX z wybranego szablonu — wypełnia placeholdery `[KLUCZ]`. */
export const generateDocxFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    templateId: string;
    formData: Record<string, string>;
    leadId?: string | null;
    loanApplicationId?: string | null;
    investorOfferId?: string | null;
    commissionAmount?: number | null;
    commissionAddedToCosts?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Pobierz szablon
    const { data: tpl, error: tplErr } = await supabase
      .from("document_templates")
      .select("id, slug, name, template_file_path, placeholders")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl?.template_file_path) throw new Error("Wzór nie ma przypisanego pliku.");

    // 2. Pobierz plik z Storage
    const { data: file, error: dlErr } = await supabase.storage
      .from("documents")
      .download(tpl.template_file_path);
    if (dlErr || !file) throw new Error(`Pobranie wzoru: ${dlErr?.message ?? "brak pliku"}`);
    const arrayBuf = await file.arrayBuffer();

    // 3. Wypełnij placeholdery [KLUCZ] (case-insensitive po normalizacji)
    const { default: PizZip } = await import("pizzip");
    const Docxtemplater = (await import("docxtemplater")).default;

    const zip = new PizZip(arrayBuf);

    // Manual replacement na word/document.xml - bezpieczniejsze niż docxtemplater dla [..] z polskimi znakami
    const docXmlPath = "word/document.xml";
    let docXml = zip.file(docXmlPath)?.asText() ?? "";

    // Najpierw spróbujmy zlepić runy żeby placeholdery rozdzielone tagami się odnalazły.
    // Strategia: usuń wszystkie <w:rPr>...</w:rPr> wewnątrz placeholderów -> trudne.
    // Praktyczna heurystyka: globalna podmiana w XML — placeholder zwykle jest w jednym run-u, bo jest pogrubiony jednolicie.
    // Dla niezgodnych przypadków: usuwamy proste wstawki XML między literami klucza.

    const escapeXml = (s: string) =>
      (s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Iteruj placeholdery z szablonu + dodatkowo cokolwiek przyszło w formData
    const allKeys = new Set<string>([
      ...(Array.isArray(tpl.placeholders) ? (tpl.placeholders as string[]) : []),
      ...Object.keys(data.formData ?? {}),
    ]);

    for (const key of allKeys) {
      const raw = `[${key}]`;
      const val = escapeXml((data.formData?.[key] ?? "").toString());
      // 1) prosta zamiana — jednolity run
      while (docXml.includes(raw)) {
        docXml = docXml.replace(raw, val);
      }
      // 2) zamiana gdy placeholder rozdzielony przez tagi — buduj regex łamiący tagi
      // Tworzymy wzorzec: dla każdej litery może być pomiędzy </w:t>...<w:t>
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const splitPattern = new RegExp(
        "\\[" + escapedKey.split("").join("(?:<[^>]+>)*") + "\\]",
        "g",
      );
      docXml = docXml.replace(splitPattern, val);
    }

    zip.file(docXmlPath, docXml);
    const outBuf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

    // 4. Walidacja (opcjonalna) - docxtemplater nie jest tu używany, ale upewnijmy się że zip jest valid
    void Docxtemplater; // suppress unused

    // 5. Upload do Storage
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = tpl.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60);
    const outPath = `generated/${userId}/${ts}_${safeName}.docx`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(outPath, new Blob([new Uint8Array(outBuf)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }), { upsert: false });
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
        form_data: data.formData ?? {},
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
      .from("documents")
      .createSignedUrl(data.path, data.expiresInSec ?? 300);
    if (error || !signed) throw new Error(error?.message ?? "Brak URL");
    return { url: signed.signedUrl };
  });

/** Podgląd treści wzoru — zwraca plain-text z placeholderami `[KLUCZ]`. */
export const getDocxTemplatePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: tpl, error: tplErr } = await context.supabase
      .from("document_templates")
      .select("template_file_path, placeholders")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl?.template_file_path) throw new Error("Wzór nie ma przypisanego pliku.");

    const { data: file, error: dlErr } = await context.supabase.storage
      .from("documents")
      .download(tpl.template_file_path);
    if (dlErr || !file) throw new Error(`Pobranie wzoru: ${dlErr?.message ?? "brak pliku"}`);

    const arrayBuf = await file.arrayBuffer();
    const { default: PizZip } = await import("pizzip");
    const zip = new PizZip(arrayBuf);
    let xml = zip.file("word/document.xml")?.asText() ?? "";

    // Zlepiamy rozbite runy placeholderów [KLUCZ]
    const keys = (Array.isArray(tpl.placeholders) ? (tpl.placeholders as string[]) : []);
    for (const key of keys) {
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp("\\[" + esc.split("").join("(?:<[^>]+>)*") + "\\]", "g");
      xml = xml.replace(pattern, `[${key}]`);
    }

    // Zamiana XML na plain text z zachowaniem struktury
    const text = xml
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, " | ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { text, placeholders: keys };
  });
