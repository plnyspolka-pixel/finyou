// Kalkulacje pożyczki — cienka warstwa nad silnikiem (`buildEngineSchedule`)
// i opłatami (`fees.ts`). JEDNO źródło prawdy dla formularzy wniosku i landingu.

import { buildEngineSchedule } from "./contract-engine/loan-schedule";
import { fyCommission, maxCapitalRate, validateAnnualRate } from "./contract-engine/fees";

export type SecurityType =
  | "mieszkanie"
  | "dom"
  | "grunt_rolny"
  | "dzialka_budowlana"
  | "lokal_uslugowy"
  | "inna";

/** Rata annuitetowa (nominalna, bez pułapu) — do wyznaczenia domyślnego pułapu raty. */
export function monthlyPayment(amount: number, annualRatePercent: number, months: number): number {
  if (!amount || !months) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return amount / months;
  const pow = Math.pow(1 + r, months);
  return (amount * r * pow) / (pow - 1);
}

/** Komplet wyliczeń raty/balonu/kosztu — JEDNO źródło prawdy dla obu formularzy wniosku. */
export type LoanFigures = {
  /** Kwota Udzielona (kwota pożyczki z umowy). */
  amount: number;
  /** Prowizja Finance You (7 %, min 5 000 zł, bez VAT) — potrącana z wypłaty. */
  feeFY: number;
  /** Otrzymasz na rękę = kwota − prowizja FY. */
  netToClient: number;
  /** Rata nominalna (bez ograniczenia maksymalną ratą). */
  nominal: number;
  /** Rata po ograniczeniu pułapem `maxPayment` (jeśli podany). */
  monthly: number;
  /** Rata balonowa (ostatnia z N rat), 0 gdy brak balonu. */
  balloon: number;
  /** Łączna spłata (suma rat) — do spłaty. */
  total: number;
  /** Suma odsetek. */
  totalInterest: number;
  /** Koszt całkowity = odsetki + prowizja inwestora + prowizja FY. */
  totalCost: number;
  /** Koszt finansowania po stronie inwestora (odsetki + prowizja inwestora). */
  investorCompensation: number;
  /** Błędy blokujące silnika (stopa > max, pułap raty za niski). */
  errors: string[];
};

export function computeLoanFigures(input: {
  amount: number;
  annualRatePercent: number;
  months: number;
  maxPayment?: number;
  /** Prowizja INWESTORA (rozłożona na raty). Domyślnie 0. */
  commission?: number;
  /** Prowizja Finance You — domyślnie włączona (7 %, min 5 000 zł); podaj 0, by wyłączyć. */
  commissionFY?: number;
  /** Dzień oceny odsetek maksymalnych (domyślnie dziś). */
  asOf?: Date | string;
}): LoanFigures {
  const nominal = monthlyPayment(input.amount, input.annualRatePercent, input.months);
  const cap = input.maxPayment && input.maxPayment > 0 ? input.maxPayment : nominal;
  const monthly = Math.min(nominal || 0, cap || 0);
  const feeFY = input.commissionFY ?? fyCommission(input.amount);
  // Jedno źródło prawdy: model silnika (Kwota Udzielona, odsetki od salda,
  // prowizja inwestora w ratach, prowizja FY potrącana, balon = ostatnia z rat).
  const eng = buildEngineSchedule({
    kwotaPozyczki: input.amount,
    prowizja: Math.max(0, input.commission ?? 0),
    prowizjaFY: feeFY,
    annualRatePercent: input.annualRatePercent,
    months: input.months,
    maxMonthlyPayment: cap,
    asOf: input.asOf,
  });
  return {
    amount: eng.kwotaUdzielona,
    feeFY: eng.prowizjaFY,
    netToClient: eng.kwotaWyplaconaKlientowi,
    nominal,
    monthly,
    balloon: eng.balloon,
    total: eng.totalToRepay,
    totalInterest: eng.totalInterest,
    totalCost: eng.calkowityKoszt,
    investorCompensation: Math.max(0, eng.totalToRepay - input.amount),
    errors: eng.errors,
  };
}

/** Domyślna stopa dla kalkulatorów klienta = odsetki maksymalne (dziś 14,5 %). */
export function defaultAnnualRate(asOf: Date | string = new Date()): number {
  return maxCapitalRate(asOf);
}

/** Przycina stopę do odsetek maksymalnych (suwaki). */
export function clampAnnualRate(rate: number, asOf: Date | string = new Date()): number {
  const max = maxCapitalRate(asOf);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, max);
}

export { fyCommission, maxCapitalRate, validateAnnualRate };

// formatPLN — jedno źródło prawdy w labels.ts; tu tylko re-eksport, by import
// z "@/lib/loan-math" dalej działał w istniejących miejscach.
export { formatPLN } from "./labels";

export const securityTypeLabels: Record<SecurityType, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom / budynek",
  grunt_rolny: "Działka rolna / grunt rolny",
  dzialka_budowlana: "Działka budowlana",
  lokal_uslugowy: "Lokal usługowy",
  inna: "Inna nieruchomość",
};
