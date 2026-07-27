// Ekstrakcja danych z dokumentów (KW, operaty, wypisy, MPZP) z użyciem Lovable AI Gateway.
// W tej wersji bazowej: zwraca puste dane dla każdego dokumentu i loguje warning.
// Realna integracja AI może zostać rozszerzona później.
import type { DocumentExtraction } from "./types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function extractDocuments(args: {
  applicationId: string;
  documents: Array<{ id: string; url?: string | null; type?: string | null; name?: string | null }>;
}): Promise<{
  extractions: DocumentExtraction[];
  status: "success" | "partial" | "no_data" | "error";
}> {
  const out: DocumentExtraction[] = [];
  if (!args.documents.length) return { extractions: out, status: "no_data" };

  // Cache: pobierz istniejące ekstrakcje
  const ids = args.documents.map((d) => d.id);
  const { data: existing } = await supabaseAdmin
    .from("property_document_extractions")
    .select("document_id, doc_kind, extracted_json")
    .in("document_id", ids);
  const cache = new Map<string, { doc_kind: string | null; extracted_json: unknown }>(
    (existing ?? []).map((e) => [
      e.document_id,
      { doc_kind: e.doc_kind, extracted_json: e.extracted_json },
    ]),
  );

  for (const doc of args.documents) {
    const hit = cache.get(doc.id);
    if (hit) {
      out.push({
        documentId: doc.id,
        docKind: hit.doc_kind ?? doc.type ?? "inne",
        data: (hit.extracted_json as Record<string, unknown>) ?? {},
      });
      continue;
    }
    // Brak realnej ekstrakcji w tej wersji — zapisujemy pusty rekord aby kolejne uruchomienia były tańsze.
    const docKind = doc.type ?? inferDocKind(doc.name ?? "");
    out.push({ documentId: doc.id, docKind, data: {} });
    try {
      await supabaseAdmin.from("property_document_extractions").upsert(
        {
          document_id: doc.id,
          application_id: args.applicationId,
          doc_kind: docKind,
          extracted_json: {},
          model: "none",
        },
        { onConflict: "document_id" },
      );
    } catch {
      /* ignore */
    }
  }
  return { extractions: out, status: out.length ? "partial" : "no_data" };
}

function inferDocKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("kw") || n.includes("ksiega")) return "kw";
  if (n.includes("operat")) return "operat";
  if (n.includes("mpzp") || n.includes("wz")) return "mpzp";
  if (n.includes("wypis") || n.includes("rejestr")) return "wypis_rejestr_gruntow";
  return "inne";
}
