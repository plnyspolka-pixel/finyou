// Kalkulacje pożyczki + wskaźnik zainteresowania inwestora.

import { buildEngineSchedule } from "./contract-engine/loan-schedule";

export type SecurityType =
  | "mieszkanie"
  | "dom"
  | "grunt_rolny"
  | "dzialka_budowlana"
  | "lokal_uslugowy"
  | "inna";

export function monthlyPayment(amount: number, annualRatePercent: number, months: number): number {
  if (!amount || !months) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return amount / months;
  const pow = Math.pow(1 + r, months);
  return (amount * r * pow) / (pow - 1);
}

export function totalRepayment(monthly: number, months: number): number {
  return monthly * months;
}

export function investorTotalCompensation(monthly: number, months: number, amount: number): number {
  return Math.max(0, monthly * months - amount);
}

/** Komplet wyliczeń raty/balonu/kosztu — JEDNO źródło prawdy dla obu formularzy wniosku. */
export type LoanFigures = {
  /** Rata nominalna (bez ograniczenia maksymalną ratą). */
  nominal: number;
  /** Rata po ograniczeniu pułapem `maxPayment` (jeśli podany). */
  monthly: number;
  /** Dopłata balonowa doliczana do ostatniej raty. */
  balloon: number;
  /** Łączna spłata (raty + balon). */
  total: number;
  /** Koszt finansowania = wynagrodzenie inwestora. */
  investorCompensation: number;
};

export function computeLoanFigures(input: {
  amount: number;
  annualRatePercent: number;
  months: number;
  maxPayment?: number;
  /** Prowizja (rozłożona na raty). Domyślnie 0 — ten kalkulator nie zawsze ją modeluje. */
  commission?: number;
}): LoanFigures {
  const nominal = monthlyPayment(input.amount, input.annualRatePercent, input.months);
  const cap = input.maxPayment && input.maxPayment > 0 ? input.maxPayment : nominal;
  // Jedno źródło prawdy: model silnika (pełna wypłata, odsetki od salda,
  // prowizja w ratach, balon = ostatnia z rat).
  const eng = buildEngineSchedule({
    kwotaPozyczki: input.amount,
    prowizja: Math.max(0, input.commission ?? 0),
    annualRatePercent: input.annualRatePercent,
    months: input.months,
    maxMonthlyPayment: cap,
  });
  // Rata regularna także z silnika — inaczej przy prowizji > 0 `monthly` (annuitet
  // bez prowizji) rozjeżdżał się z `total`/`balloon` (model z prowizją w ratach).
  const monthly = eng.regularPayment;
  return {
    nominal,
    monthly,
    balloon: eng.balloon,
    total: eng.totalToRepay,
    investorCompensation: Math.max(0, eng.totalToRepay - input.amount),
  };
}

// Wartości bazowe i skalowanie według rocznego wynagrodzenia.
// Liniowa interpolacja między 15% (base) a 36% (max).
const baseAt15: Record<SecurityType, number> = {
  mieszkanie: 95,
  dom: 85,
  grunt_rolny: 75,
  dzialka_budowlana: 60,
  lokal_uslugowy: 55,
  inna: 50,
};
const maxAt36: Record<SecurityType, number> = {
  mieszkanie: 100,
  dom: 98,
  grunt_rolny: 95,
  dzialka_budowlana: 88,
  lokal_uslugowy: 85,
  inna: 82,
};

export function interestScore(type: SecurityType, annualRatePercent: number): number {
  const base = baseAt15[type];
  const top = maxAt36[type];
  const r = Math.max(15, Math.min(36, annualRatePercent));
  const t = (r - 15) / (36 - 15);
  const v = base + (top - base) * t;
  // Jeżeli powyżej 36% — bonus do 100.
  const bonus = annualRatePercent > 36 ? Math.min(100 - v, (annualRatePercent - 36) * 0.5) : 0;
  return Math.round(Math.min(100, v + bonus));
}

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
