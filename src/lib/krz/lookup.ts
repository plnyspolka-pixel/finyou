// Dopasowanie podmiotu z analizy (pożyczkobiorca / właściciel z KW) do
// lokalnej kopii tablicy obwieszczeń KRZ (`krz_obwieszczenia`). Czysta
// logika — zapytanie do bazy jest w lookup.server.ts.
//
// Zasady: NIP/KRS = zgodny identyfikator; sama nazwa / imię i nazwisko =
// wynik tylko do weryfikacji (kopia nie ma PESEL, więc osoby fizycznej nie da
// się potwierdzić identyfikatorem).
import type { OwnerIntelligenceHit } from "@/lib/coowners/owner-intelligence.types";
import type { KrzAiAnalysis } from "./types";

export const KRZ_PORTAL_URL =
  "https://krz.ms.gov.pl/#!/application/KRZPortalPUB/1.9/KrzRejPubGui.TablicaObwieszczen?params=JTdCJTdE&seq=1";

/** Wiersz tabeli `krz_obwieszczenia` w zakresie potrzebnym do dopasowania. */
export type KrzRow = {
  id_zewnetrzny: string;
  numer_obwieszczenia: string;
  data_obwieszczenia: string;
  rodzaj_sprawy: string;
  kategoria: string;
  podkategoria: string;
  sygnatura: string | null;
  sad: string | null;
  podmiot_rodzaj: string;
  podmiot_nazwa: string | null;
  podmiot_krs: string | null;
  podmiot_nip: string | null;
  podmiot_miejscowosc: string | null;
  analiza: KrzAiAnalysis | null;
};

export type KrzLookupInput = {
  kind: "person" | "company";
  name: string;
  nip?: string | null;
  krs?: string | null;
};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const normalizeName = (s: string) =>
  s
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Czy wiersz pasuje do podmiotu i jak pewnie. */
export function matchKrzRow(
  input: KrzLookupInput,
  row: KrzRow,
): OwnerIntelligenceHit["match"] | null {
  const nip = digits(input.nip);
  const krs = digits(input.krs);
  if (nip.length === 10 && digits(row.podmiot_nip) === nip) return "identifier";
  if (krs.length === 10 && digits(row.podmiot_krs) === krs) return "identifier";
  const sought = normalizeName(input.name);
  const have = normalizeName(row.podmiot_nazwa ?? "");
  if (!sought || !have) return null;
  if (have === sought) return "name_only";
  if (input.kind === "person") {
    const parts = sought.split(" ");
    if (parts.length === 2 && have === parts.reverse().join(" ")) return "name_only";
  }
  return null;
}

const ETAP_LABEL: Record<KrzAiAnalysis["etap"], string> = {
  wniosek: "wniosek",
  zabezpieczenie: "zabezpieczenie majątku",
  otwarcie: "otwarcie postępowania",
  ogloszenie_upadlosci: "ogłoszenie upadłości",
  oddalenie: "oddalenie wniosku",
  uklad: "układ",
  plan_splaty: "plan spłaty",
  umorzenie: "umorzenie",
  zakonczenie: "zakończenie",
  inne: "inne",
};

export function krzRowToHit(
  row: KrzRow,
  match: OwnerIntelligenceHit["match"],
): OwnerIntelligenceHit {
  const a = row.analiza;
  const detailParts = [
    `${row.rodzaj_sprawy === "R" ? "Restrukturyzacja" : row.rodzaj_sprawy === "U" ? "Upadłość" : "Inne"}: ${row.kategoria}`,
    row.sad ? `sąd: ${row.sad}` : null,
    a ? `AI: ${ETAP_LABEL[a.etap] ?? a.etap}, ryzyko ${a.sygnalRyzyka} — ${a.streszczenie}` : null,
    `nr obwieszczenia ${row.numer_obwieszczenia}`,
  ].filter(Boolean);
  return {
    source: "KRZ — tablica obwieszczeń (kopia lokalna)",
    category: "court_notice",
    title: row.podkategoria.slice(0, 160),
    detail: detailParts.join("; ").slice(0, 400),
    publicationDate: row.data_obwieszczenia,
    caseSignature: row.sygnatura,
    url: KRZ_PORTAL_URL,
    match,
  };
}

/** Wybiera pasujące wiersze i buduje trafienia, najnowsze pierwsze. */
export function matchKrzRows(
  input: KrzLookupInput,
  rows: KrzRow[],
  limit = 8,
): OwnerIntelligenceHit[] {
  const hits: Array<{ row: KrzRow; match: OwnerIntelligenceHit["match"] }> = [];
  for (const row of rows) {
    const m = matchKrzRow(input, row);
    if (m) hits.push({ row, match: m });
  }
  hits.sort(
    (x, y) =>
      Number(y.match === "identifier") - Number(x.match === "identifier") ||
      y.row.data_obwieszczenia.localeCompare(x.row.data_obwieszczenia),
  );
  return hits.slice(0, limit).map((h) => krzRowToHit(h.row, h.match));
}

/** Notatka o zakresie kopii: bez niej „brak trafień” byłby mylący. */
export function krzCoverageNote(
  coverage: { from: string; to: string; rows: number } | null,
  hits: number,
): string {
  if (!coverage)
    return "KRZ (kopia lokalna): brak danych — tablica obwieszczeń nie była jeszcze pobrana.";
  const range = `KRZ (kopia lokalna ${coverage.from}…${coverage.to}, ${coverage.rows} obw.)`;
  return hits
    ? `${range}: ${hits} obwieszcz. — sprawdź w krz.ms.gov.pl.`
    : `${range}: brak obwieszczeń w tym zakresie; starsze sprawy wymagają sprawdzenia w portalu.`;
}
