// Prezentacja pogłębionego raportu postępowania (UI i PDF) — bez zależności serwerowych.
import type { CourtProceedingReport, CourtProceedingStatus } from "./owner-intelligence.types";

export const proceedingStatusLabel: Record<CourtProceedingStatus, string> = {
  in_progress: "w toku",
  repayment_plan: "plan spłaty wierzycieli",
  closed: "zakończone",
  discontinued: "umorzone / uchylone",
  unknown: "stan bieżący nieustalony",
};

/** Wiersze klucz–wartość raportu postępowania. */
export function proceedingRows(p: CourtProceedingReport): Array<[string, string]> {
  const rows: Array<[string, string | null]> = [
    ["Rodzaj postępowania", p.kind],
    ["Status", `${proceedingStatusLabel[p.status]} — ${p.statusNote}`],
    ["Sąd", p.court],
    ["Sygnatury", p.signatures.join(", ") || null],
    ["Postanowienie otwierające", p.decisionDate ? `z dnia ${p.decisionDate}` : null],
    ["Ostatni etap", p.stage],
    ["Ogłoszenia w MSiG", `${p.noticesCount} (${p.firstPublication} – ${p.lastPublication})`],
    ["Organy postępowania", p.officials.join("; ") || null],
    ["Miejscowość z ogłoszenia", p.residence],
    ["Potwierdzenie tożsamości", p.identityBasis],
  ];
  if (p.incomplete)
    rows.push([
      "Kompletność",
      "raport niepełny — część ogłoszeń nie została pobrana (limit zapytań lub błąd portalu)",
    ]);
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}
