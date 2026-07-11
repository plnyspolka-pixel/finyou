// Kalkulacje pożyczki + wskaźnik zainteresowania inwestora.

export type SecurityType =
  | "mieszkanie"
  | "dom"
  | "grunt_rolny"
  | "dzialka_budowlana"
  | "lokal_uslugowy"
  | "inna";

export function monthlyPayment(amount: number, annualRatePercent: number, months: number): number {
  // Odrzucamy wartości ujemne (i zerowe) — brak sensownej raty.
  if (!amount || !months || amount < 0 || months < 0 || annualRatePercent < 0) return 0;
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
  /** Rata (po ograniczeniu) nie pokrywa nawet odsetek — saldo rośnie w czasie umowy. */
  negativeAmortization: boolean;
};

export type LoanScheduleRow = {
  idx: number;
  /** Rata płacona w danym miesiącu (ostatnia zawiera balon). */
  rata: number;
  /** Część kapitałowa raty (ujemna przy ujemnej amortyzacji). */
  kap: number;
  /** Część odsetkowa raty. */
  ods: number;
  /** Saldo kapitału po zapłacie raty. */
  saldo: number;
};

export type LoanSchedule = {
  rows: LoanScheduleRow[];
  nominalRata: number;
  cappedRata: number;
  /**
   * Balon = FAKTYCZNE saldo pozostałe po spłacie wszystkich rat ograniczonych
   * pułapem (symulacja harmonogramu), doliczane do ostatniej raty — a nie
   * liniowe przybliżenie (nominal − capped) × liczba miesięcy.
   */
  balloon: number;
  totalRata: number;
  totalOds: number;
  totalKap: number;
  /** Rata nie pokrywa odsetek — saldo rośnie (ujemna amortyzacja). */
  negativeAmortization: boolean;
};

/**
 * Pełny harmonogram annuitetowy z ograniczeniem raty pułapem `maxPayment`.
 * Balon wyliczany jest jako rzeczywiste saldo końcowe po symulacji spłat
 * ograniczoną ratą, dzięki czemu harmonogram ZAWSZE amortyzuje się do zera.
 */
export function computeLoanSchedule(input: {
  principal: number;
  annualRatePercent: number;
  months: number;
  maxPayment?: number;
}): LoanSchedule {
  const empty: LoanSchedule = {
    rows: [],
    nominalRata: 0,
    cappedRata: 0,
    balloon: 0,
    totalRata: 0,
    totalOds: 0,
    totalKap: 0,
    negativeAmortization: false,
  };
  const { principal, annualRatePercent, months } = input;
  if (!principal || !months || principal < 0 || months < 0 || annualRatePercent < 0) return empty;

  const monthlyRate = annualRatePercent / 100 / 12;
  const nominalRata = monthlyPayment(principal, annualRatePercent, months);
  const cappedRata =
    input.maxPayment && input.maxPayment > 0 ? Math.min(nominalRata, input.maxPayment) : nominalRata;

  // Ujemna amortyzacja: rata nie pokrywa odsetek już w pierwszym miesiącu
  // (saldo tylko rośnie, więc każdy kolejny miesiąc jest jeszcze gorszy).
  const negativeAmortization = monthlyRate > 0 && cappedRata < principal * monthlyRate - 1e-9;

  const rows: LoanScheduleRow[] = [];
  let saldo = principal;
  let balloon = 0;
  for (let i = 1; i <= months; i++) {
    const ods = saldo * monthlyRate;
    const last = i === months;
    let rata = cappedRata;
    let kap = rata - ods; // może być ujemne — saldo wtedy rośnie
    if (last) {
      // Balon = saldo, które pozostałoby po ostatniej ograniczonej racie.
      balloon = Math.max(0, Math.round((saldo - kap) * 100) / 100);
      rata = cappedRata + balloon;
      kap = rata - ods;
    }
    saldo = saldo - kap;
    if (last) saldo = Math.max(0, Math.round(saldo * 100) / 100); // domknięcie do zera
    rows.push({ idx: i, rata, kap, ods, saldo });
  }

  return {
    rows,
    nominalRata,
    cappedRata,
    balloon,
    totalRata: rows.reduce((s, r) => s + r.rata, 0),
    totalOds: rows.reduce((s, r) => s + r.ods, 0),
    totalKap: rows.reduce((s, r) => s + r.kap, 0),
    negativeAmortization,
  };
}

export function computeLoanFigures(input: {
  amount: number;
  annualRatePercent: number;
  months: number;
  maxPayment?: number;
}): LoanFigures {
  const schedule = computeLoanSchedule({
    principal: input.amount,
    annualRatePercent: input.annualRatePercent,
    months: input.months,
    maxPayment: input.maxPayment,
  });
  const total = schedule.totalRata;
  return {
    nominal: schedule.nominalRata,
    monthly: schedule.cappedRata,
    balloon: schedule.balloon,
    total,
    investorCompensation: Math.max(0, total - input.amount),
    negativeAmortization: schedule.negativeAmortization,
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
