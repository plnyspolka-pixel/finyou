// Realny OCR dokumentów wniosku (operaty, wypisy, umowy, zaświadczenia) z użyciem
// Gemini przez Lovable AI Gateway. Wyniki cache'owane w property_document_extractions.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OcrSummary, OcrDocumentResult } from "./types";
import type { SourceStatus } from "@/lib/property-analysis/types";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_DOCS = 6; // limit kosztowo-czasowy na jedną ocenę

const SYSTEM_PROMPT =
  "Jesteś ekspertem OCR i analizy dokumentów nieruchomościowych w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em.";

const USER_PROMPT = `Przeanalizuj dokument nieruchomościowy (operat szacunkowy, wypis z rejestru gruntów, odpis KW, MPZP/WZ, umowa, zaświadczenie). Wyodrębnij dostępne dane.

ODPOWIEDŹ — wyłącznie poprawny JSON:
{
  "docKind": "operat|wypis_rejestr_gruntow|kw|mpzp|umowa|zaswiadczenie|inne",
  "ownerNames": ["..."],
  "address": "... lub null",
  "parcelNumber": "... lub null",
  "areaM2": <liczba lub null>,
  "landAreaHa": <liczba lub null>,
  "appraisedValuePln": <liczba z operatu lub null>,
  "landUse": "... przeznaczenie/klasa gruntu lub null",
  "encumbrances": ["... obciążenia/ograniczenia jeśli są"],
  "keyFindings": ["... 1-5 najważniejszych ustaleń"],
  "rawTextSnippet": "... pierwsze ~300 znaków odczytanego tekstu"
}`;

function inferDocKind(name: string, type?: string | null): string {
  const n = `${name} ${type ?? ""}`.toLowerCase();
  if (n.includes("operat")) return "operat";
  if (n.includes("wypis") || n.includes("rejestr")) return "wypis_rejestr_gruntow";
  if (n.includes("kw") || n.includes("ksieg") || n.includes("wieczyst")) return "kw";
  if (n.includes("mpzp") || n.includes("wz") || n.includes("plan")) return "mpzp";
  if (n.includes("umow")) return "umowa";
  if (n.includes("zaswiadcz") || n.includes("zaświadcz")) return "zaswiadczenie";
  return "inne";
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)($|\?)/i.test(url);
}

async function toDataUrl(url: string): Promise<{ dataUrl: string; isImage: boolean } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 12 * 1024 * 1024) return null; // >12MB — pomiń
    const isImage = ct.startsWith("image/") || isImageUrl(url);
    const mime = ct || (isImage ? "image/jpeg" : "application/pdf");
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, isImage };
  } catch {
    return null;
  }
}

function tryParseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function ocrOne(
  doc: { id: string; url?: string | null; type?: string | null; name?: string | null },
  apiKey: string,
): Promise<OcrDocumentResult> {
  const fileName = doc.name ?? null;
  const fallbackKind = inferDocKind(doc.name ?? "", doc.type);
  if (!doc.url) {
    return {
      documentId: doc.id,
      fileName,
      docKind: fallbackKind,
      status: "no_data",
      fields: {},
      rawTextSnippet: null,
    };
  }
  // Pobierz plik i zbuduj data URL (obraz lub PDF).
  const payload = await toDataUrl(doc.url);
  if (!payload) {
    return {
      documentId: doc.id,
      fileName,
      docKind: fallbackKind,
      status: "error",
      fields: {},
      rawTextSnippet: null,
    };
  }

  const userContent: unknown[] = [{ type: "text", text: USER_PROMPT }];
  if (payload.isImage) userContent.push({ type: "image_url", image_url: { url: payload.dataUrl } });
  else
    userContent.push({
      type: "file",
      file: { filename: fileName ?? "document.pdf", file_data: payload.dataUrl },
    });

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0,
      }),
    });
    if (!resp.ok) {
      return {
        documentId: doc.id,
        fileName,
        docKind: fallbackKind,
        status: "error",
        fields: {},
        rawTextSnippet: null,
      };
    }
    const json: any = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParseJson(content);
    if (!parsed) {
      return {
        documentId: doc.id,
        fileName,
        docKind: fallbackKind,
        status: "partial",
        fields: {},
        rawTextSnippet: content.slice(0, 300),
      };
    }
    const docKind = typeof parsed.docKind === "string" ? parsed.docKind : fallbackKind;
    const rawTextSnippet =
      typeof parsed.rawTextSnippet === "string" ? parsed.rawTextSnippet.slice(0, 300) : null;

    // Zapis do cache.
    await supabaseAdmin
      .from("property_document_extractions")
      .upsert(
        {
          document_id: doc.id,
          doc_kind: docKind,
          extracted_json: parsed,
          raw_text: rawTextSnippet,
          model: MODEL,
        },
        { onConflict: "document_id" },
      )
      .then(
        () => {},
        () => {},
      );

    return {
      documentId: doc.id,
      fileName,
      docKind,
      status: "success",
      fields: parsed,
      rawTextSnippet,
    };
  } catch {
    return {
      documentId: doc.id,
      fileName,
      docKind: fallbackKind,
      status: "error",
      fields: {},
      rawTextSnippet: null,
    };
  }
}

export async function ocrDocuments(args: {
  applicationId: string;
  documents: Array<{ id: string; url?: string | null; type?: string | null; name?: string | null }>;
}): Promise<OcrSummary> {
  const docs = (args.documents ?? []).slice(0, MAX_DOCS);
  if (docs.length === 0) {
    return { status: "no_data", documentsProcessed: 0, documents: [] };
  }

  // Cache: użyj istniejących wyników z realnego modelu (model != "none").
  const ids = docs.map((d) => d.id);
  const { data: cached } = await supabaseAdmin
    .from("property_document_extractions")
    .select("document_id, doc_kind, extracted_json, raw_text, model")
    .in("document_id", ids);
  const cacheMap = new Map((cached ?? []).map((c) => [c.document_id, c]));

  const apiKey = process.env.LOVABLE_API_KEY;
  const results: OcrDocumentResult[] = [];
  for (const doc of docs) {
    const hit = cacheMap.get(doc.id);
    if (hit && hit.model && hit.model !== "none" && hit.extracted_json) {
      results.push({
        documentId: doc.id,
        fileName: doc.name ?? null,
        docKind: hit.doc_kind ?? inferDocKind(doc.name ?? "", doc.type),
        status: "success",
        fields: (hit.extracted_json as Record<string, unknown>) ?? {},
        rawTextSnippet: hit.raw_text ?? null,
      });
      continue;
    }
    if (!apiKey) {
      results.push({
        documentId: doc.id,
        fileName: doc.name ?? null,
        docKind: inferDocKind(doc.name ?? "", doc.type),
        status: "no_data",
        fields: {},
        rawTextSnippet: null,
      });
      continue;
    }
    results.push(await ocrOne(doc, apiKey));
  }

  const anySuccess = results.some((r) => r.status === "success");
  const allNoData = results.every((r) => r.status === "no_data");
  const status: SourceStatus = anySuccess
    ? results.every((r) => r.status === "success")
      ? "success"
      : "partial"
    : allNoData
      ? "no_data"
      : "error";
  return { status, documentsProcessed: results.length, documents: results };
}
