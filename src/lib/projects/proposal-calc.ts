// Czyste (testowalne) wyliczenia kalkulatora propozycji finansowania.
// JEDNO źródło prawdy dla frontendu i serwera: buildEngineSchedule
// (istniejący silnik finansowy Finance You — pełna wypłata, odsetki od salda,
// prowizja w ratach, balon = ostatnia rata). Server function przelicza te same
// dane ponownie przed zapisem propozycji.
import { buildEngineSchedule } from "@/lib/contract-engine/loan-schedule";
import { computeLtv } from "./risk";

export interface ProposalParams {
  /** Proponowana kwota pożyczki (kapitał). */
  amount: number;
  /** Kwota wypłacana pożyczkobiorcy (model pełnej wypłaty: zwykle = amount). */
  disbursedAmount?: number;
  periodMonths: number;
  interestRatePercent: number;
  commission: number;
  /** raty równe (annuitet wg pułapu) albo balonowa (niska rata + balon). */
  repaymentMode: "raty" | "balon";
  /** Pułap raty miesięcznej — steruje balonem (tylko tryb balonowy). */
  maxMonthlyPayment?: number;
  /** Proponowany termin uruchomienia (ISO date). */
  disbursementDate?: string;
  requiredSecurities: string[];
  requiredDocuments: string[];
  additionalConditions?: string;
  /** Termin ważności propozycji (ISO date). */
  validUntil?: string;
}

export interface ProposalComputed {
  monthlyPayment: number;
  finalPayment: number;
  totalToRepay: number;
  totalInterest: number;
  totalCommission: number;
  periodMonths: number;
  ltvPercent: number | null;
  /** Różnica: proponowana − oczekiwana kwota. */
  amountDifference: number;
  /** Orientacyjna prosta roczna stopa zwrotu inwestora (%). */
  investorAnnualReturnPercent: number;
  investorTotalCompensation: number;
  schedule: {
    nr: number;
    termin: string;
    kapital: number;
    odsetki: number;
    prowizja: number;
    rata_razem: number;
    saldo: number;
    isBalloon: boolean;
  }[];
  warnings: string[];
}

/**
 * Wylicza komplet wyników propozycji. `expectedAmount` — kwota oczekiwana
 * przez pożyczkobiorcę; `propertyValue` — do LTV proponowanej kwoty.
 */
export function computeProposal(
  params: ProposalParams,
  expectedAmount: number,
  propertyValue: number | null,
): ProposalComputed {
  const warnings: string[] = [];
  const amount = params.amount;

  // Rata nominalna (annuitet) jako pułap w trybie rat równych.
  const r = params.interestRatePercent / 100 / 12;
  const pow = Math.pow(1 + r, params.periodMonths);
  const annuity = r === 0 ? amount / params.periodMonths : (amount * r * pow) / (pow - 1);

  // Pułap raty w trybie rat równych musi zawierać miesięczną część prowizji —
  // silnik odejmuje prowizję od pułapu i bez niej kapitał nie amortyzuje się w N rat.
  const monthlyCommission = Math.max(0, params.commission) / params.periodMonths;
  const cap =
    params.repaymentMode === "balon" && params.maxMonthlyPayment && params.maxMonthlyPayment > 0
      ? params.maxMonthlyPayment
      : Math.ceil((annuity + monthlyCommission) * 100) / 100;

  const schedule = buildEngineSchedule({
    kwotaPozyczki: amount,
    prowizja: Math.max(0, params.commission),
    annualRatePercent: params.interestRatePercent,
    months: params.periodMonths,
    maxMonthlyPayment: cap,
    firstPaymentDate: params.disbursementDate ?? null,
  });

  const last = schedule.rows[schedule.rows.length - 1];
  const compensation = Math.max(0, schedule.totalToRepay - amount);
  const years = params.periodMonths / 12;
  const annualReturn = amount > 0 && years > 0 ? (compensation / amount / years) * 100 : 0;

  if (amount < expectedAmount) {
    warnings.push(
      "Proponujesz finansowanie niższe niż kwota oczekiwana przez pożyczkobiorcę. " +
        "Projekt może wymagać zmiany warunków lub dodatkowego źródła finansowania.",
    );
  }
  for (const w of schedule.warnings ?? []) warnings.push(w);

  return {
    monthlyPayment: schedule.regularPayment,
    finalPayment: last ? last.rata_razem : 0,
    totalToRepay: schedule.totalToRepay,
    totalInterest: schedule.totalInterest,
    totalCommission: Math.max(0, params.commission),
    periodMonths: params.periodMonths,
    ltvPercent: computeLtv(amount, propertyValue),
    amountDifference: amount - expectedAmount,
    investorAnnualReturnPercent: Math.round(annualReturn * 100) / 100,
    investorTotalCompensation: compensation,
    schedule: schedule.rows,
    warnings,
  };
}
