// Generatory szkiców pism windykacyjnych. Czyste funkcje — wynik trafia do
// pola treści działania (action.content), które inwestor może edytować przed
// zapisaniem/wysłaniem. Pełne, sformatowane dokumenty DOCX dostępne są też
// w Kreatorze dokumentów.

import { formatPLN } from "./labels";
import type { DebtCalcResult } from "./debt-collection-math";
import type { DebtCase } from "./debt-collection.functions";

function fmtDate(iso?: string | null): string {
  if (!iso) return "…………";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export type LetterKind = "debtor" | "court" | "bailiff";
export type MessageKind = "sms" | "email";

const moneyParts = (calc: DebtCalcResult) =>
  [
    `- kapitał: ${formatPLN(calc.principalOutstanding)}`,
    calc.contractualInterest > 0
      ? `- odsetki kapitałowe: ${formatPLN(calc.contractualInterest)}`
      : null,
    calc.delayInterest > 0 ? `- odsetki za opóźnienie: ${formatPLN(calc.delayInterest)}` : null,
    calc.costsOutstanding > 0 ? `- koszty windykacji: ${formatPLN(calc.costsOutstanding)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

/** Krótka treść SMS (do ~320 znaków). */
export function buildSmsBody(c: DebtCase, calc: DebtCalcResult): string {
  const name = c.debtor_name ? `${c.debtor_name}, ` : "";
  return `${name}na dzień ${fmtDate(calc.asOf)} zaległość z umowy ${c.contract_number ?? ""} wynosi ${formatPLN(
    calc.totalDue,
  )}. Prosimy o pilną spłatę. W razie braku wpłaty sprawa zostanie skierowana na drogę sądową.`.trim();
}

/** Treść e-mail / wezwania do zapłaty. */
export function buildEmailBody(c: DebtCase, calc: DebtCalcResult): string {
  return [
    c.debtor_name ? `Szanowny Pan/Pani ${c.debtor_name},` : "Szanowni Państwo,",
    "",
    `w związku z umową pożyczki nr ${c.contract_number ?? "…"} z dnia ${fmtDate(
      c.payout_date,
    )} wzywamy do zapłaty zaległości, która na dzień ${fmtDate(calc.asOf)} wynosi:`,
    "",
    moneyParts(calc),
    "",
    `RAZEM DO ZAPŁATY: ${formatPLN(calc.totalDue)}`,
    "",
    c.due_date
      ? `Termin spłaty upłynął ${fmtDate(c.due_date)} (opóźnienie: ${calc.daysOverdue} dni).`
      : "",
    "Należność obejmuje maksymalne odsetki za opóźnienie zgodnie z art. 481 § 2¹ Kodeksu cywilnego.",
    "",
    "Prosimy o uregulowanie należności w terminie 7 dni od otrzymania niniejszego wezwania.",
    "Brak wpłaty spowoduje skierowanie sprawy na drogę postępowania sądowego i egzekucyjnego, co zwiększy koszty.",
    "",
    "Z poważaniem,",
    "Wierzyciel",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Szkic pisma (dłużnik / sąd / komornik). */
export function buildLetter(
  kind: LetterKind,
  c: DebtCase,
  calc: DebtCalcResult,
): { subject: string; body: string } {
  const debtor = c.debtor_name ?? "…………………………";
  const addr = c.debtor_address ?? "…………………………";
  const pesel = c.debtor_pesel ?? "…………………………";

  if (kind === "debtor") {
    return {
      subject: "Ostateczne przedsądowe wezwanie do zapłaty",
      body: [
        `Dłużnik: ${debtor}`,
        `Adres: ${addr}`,
        `PESEL: ${pesel}`,
        "",
        "OSTATECZNE PRZEDSĄDOWE WEZWANIE DO ZAPŁATY",
        "",
        `Działając w imieniu wierzyciela, na podstawie umowy pożyczki nr ${c.contract_number ?? "…"} z dnia ${fmtDate(
          c.payout_date,
        )}, wzywam do zapłaty zaległości, która na dzień ${fmtDate(calc.asOf)} wynosi:`,
        "",
        moneyParts(calc),
        "",
        `RAZEM: ${formatPLN(calc.totalDue)}`,
        "",
        "w terminie 7 dni pod rygorem skierowania sprawy na drogę sądową.",
      ].join("\n"),
    };
  }

  if (kind === "court") {
    return {
      subject: "Pozew o zapłatę",
      body: [
        "POZEW O ZAPŁATĘ (w postępowaniu upominawczym)",
        "",
        `Pozwany: ${debtor}, ${addr}, PESEL: ${pesel}`,
        "",
        `Wnoszę o zasądzenie od pozwanego kwoty ${formatPLN(
          calc.totalDue,
        )} wraz z dalszymi odsetkami maksymalnymi za opóźnienie, na którą składają się:`,
        "",
        moneyParts(calc),
        "",
        `Roszczenie wynika z umowy pożyczki nr ${c.contract_number ?? "…"} z dnia ${fmtDate(
          c.payout_date,
        )}, której termin spłaty (${fmtDate(c.due_date)}) upłynął bezskutecznie.`,
        "Mimo wezwań do zapłaty pozwany nie uregulował należności.",
      ].join("\n"),
    };
  }

  // komornik
  return {
    subject: "Wniosek o wszczęcie egzekucji",
    body: [
      "WNIOSEK O WSZCZĘCIE EGZEKUCJI",
      "",
      `Dłużnik: ${debtor}, ${addr}, PESEL: ${pesel}`,
      "",
      `Na podstawie załączonego tytułu wykonawczego wnoszę o wszczęcie egzekucji należności w kwocie ${formatPLN(
        calc.totalDue,
      )}, na którą składają się:`,
      "",
      moneyParts(calc),
      "",
      "wraz z kosztami procesu, kosztami zastępstwa oraz kosztami egzekucyjnymi.",
      "Wnoszę o prowadzenie egzekucji z wynagrodzenia, rachunków bankowych i nieruchomości dłużnika.",
    ].join("\n"),
  };
}
