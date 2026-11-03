// Podsumowanie KRZ/MSiG dla oceny ryzyka — czysta logika (testowalna).
import type { OwnerIntelligenceReport } from "@/lib/coowners/owner-intelligence.types";
import type { CourtRegistryCheck } from "./types";

export function summarizeCourtRegistry(
  report: OwnerIntelligenceReport | null,
  opts: { noClientReason?: string } = {},
): CourtRegistryCheck {
  if (!report || report.subjects.length === 0) {
    return {
      available: false,
      clientChecked: false,
      clientFullyChecked: false,
      checkedAt: report?.checkedAt ?? null,
      subjectsChecked: 0,
      confirmedHits: 0,
      unconfirmedHits: 0,
      clientHits: 0,
      findings: [],
      summary:
        opts.noClientReason ??
        "KRZ/MSiG nie zostały sprawdzone — sprawdź pożyczkobiorcę ręcznie w KRZ (krz.ms.gov.pl) i MSiG.",
      report,
    };
  }
  const client = report.subjects.find((s) => s.role === "client") ?? null;
  const findings: string[] = [];
  let confirmedHits = 0;
  let unconfirmedHits = 0;
  let clientHits = 0;
  for (const s of report.subjects) {
    const who = s.role === "client" ? `Pożyczkobiorca ${s.name}` : `Właściciel ${s.name}`;
    for (const h of s.hits) {
      if (h.category !== "court_notice") continue;
      if (h.match === "identifier") confirmedHits += 1;
      else unconfirmedHits += 1;
      if (s.role === "client") clientHits += 1;
      findings.push(
        `${who}: ${h.title}${h.caseSignature ? ` (sygn. ${h.caseSignature})` : ""}${h.publicationDate ? `, ${h.publicationDate}` : ""} — ${
          h.match === "identifier"
            ? "identyfikator zgodny"
            : "zgodność tylko po nazwisku, do weryfikacji"
        }.`,
      );
    }
  }
  const clientFullyChecked = client?.courtStatus === "checked";
  const scope = client
    ? clientFullyChecked
      ? "pożyczkobiorca sprawdzony w KRZ/MSiG (API)"
      : client.courtNote.startsWith("Oficjalny MSiG")
        ? "pożyczkobiorca sprawdzony w oficjalnym MSiG; KRZ (krz.ms.gov.pl) nie jest automatycznie dostępny — sprawdź ręcznie"
        : "pożyczkobiorca sprawdzony CZĘŚCIOWO — oficjalny MSiG nie odpowiedział; sprawdź ręcznie w MSiG i KRZ (krz.ms.gov.pl)"
    : "pożyczkobiorca NIE sprawdzony";
  const summary =
    `KRZ/MSiG: ${scope}; podmiotów: ${report.subjects.length}. ` +
    (confirmedHits + unconfirmedHits === 0
      ? "Nie znaleziono ogłoszeń sądowych (brak trafienia nie wyklucza postępowań)."
      : `Ogłoszenia sądowe: ${confirmedHits} ze zgodnym identyfikatorem, ${unconfirmedHits} tylko po nazwisku.`);
  return {
    available: true,
    clientChecked: Boolean(client),
    clientFullyChecked,
    checkedAt: report.checkedAt,
    subjectsChecked: report.subjects.length,
    confirmedHits,
    unconfirmedHits,
    clientHits,
    findings,
    summary,
    report,
  };
}
