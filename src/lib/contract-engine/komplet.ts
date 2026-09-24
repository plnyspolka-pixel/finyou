/**
 * Jedno wejście do generacji kompletu dokumentów pożyczki — wspólne dla
 * kreatora (/admin/kreator-pozyczki), agenta umowy (/inwestor) i MCP
 * (`generate_contract_docx`). Te same klauzule, ten sam renderer, ten sam plik.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import biblioteka from "./clauses.json";
import { BladPola, renderuj, type Dokument } from "./renderer";
import { bledyOdeslanKompletu } from "./odeslania";
import { bibliotekaBez } from "./clause-select";
import {
  buildKompletDocumentXml,
  spakujDocx,
  tekstZDocumentXml,
  type KompletOpcje,
} from "./umowa-docx";

/** Wersja biblioteki klauzul — trafia do audytu każdej generacji. */
export const WERSJA_BIBLIOTEKI: string = (biblioteka as any).wersja;

/** Części kompletu w kolejności w pliku (opis narzędzi, rejestr dokumentów). */
export const CZESCI_KOMPLETU = [
  "Wniosek o udzielenie pożyczki pieniężnej",
  "Umowa pożyczki",
  "Załącznik nr 1 — Harmonogram spłat",
  "Załącznik nr 2 — Protokół z negocjacji indywidualnych",
  "Załącznik nr 3 — Tabela opłat windykacyjnych",
] as const;

/** Slug rejestru generated_documents dla dokumentów z silnika. */
export const SLUG_KOMPLETU = "silnik-umow-komplet";

export interface KompletWynik {
  bytes: Uint8Array;
  doc: Dokument;
  documentXml: string;
  /** Tekst dokumentu (akapity + tabele) — podstawa hasha treści. */
  tekst: string;
  /** SHA-256 (hex) tekstu dokumentu. */
  sha256: string;
  wersjaBiblioteki: string;
}

async function sha256Hex(tekst: string): Promise<string> {
  const dane = new TextEncoder().encode(tekst);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", dane);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Renderuje umowę z biblioteki klauzul i składa cały komplet .docx.
 * Rzuca `BladPola` (renderer), gdy klauzuli brakuje wartości pola albo
 * odesłanie wskazuje klauzulę wyłączoną — wywołujący traktuje to jak brak.
 */
export async function generujKomplet(
  umowa: any,
  opts: KompletOpcje & { excludedClauses?: string[] } = {},
): Promise<KompletWynik> {
  const doc = renderuj(umowa, bibliotekaBez(opts.excludedClauses ?? []));
  const documentXml = buildKompletDocumentXml(umowa, doc, opts);
  const tekst = tekstZDocumentXml(documentXml);
  // Odesłania z wniosku i załączników do Umowy (np. „§ 4 ust. 5 Umowy”).
  const bledy = bledyOdeslanKompletu(doc, tekst);
  if (bledy.length) throw new BladPola(`Błędne odesłania: ${bledy.join("; ")}`);
  const [bytes, sha256] = await Promise.all([spakujDocx(documentXml), sha256Hex(tekst)]);
  return { bytes, doc, documentXml, tekst, sha256, wersjaBiblioteki: WERSJA_BIBLIOTEKI };
}
