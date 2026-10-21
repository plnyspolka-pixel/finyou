// Kalkulatory czyste (bez bazy): harmonogram spłat, LTV.
// JEDEN model matematyczny: silnik `buildEngineSchedule` + opłaty `fees.ts`
// (Kwota Udzielona, prowizja Finance You potrącana z wypłaty, prowizja
// inwestora w ratach, odsetki od salda, balon = ostatnia rata, blokada
// odsetek maksymalnych).
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, ok } from "../_helpers";
import { buildEngineSchedule, type EngineSchedule } from "@/lib/contract-engine/loan-schedule";
import {
  FY_COMMISSION_MIN_PLN,
  FY_COMMISSION_PCT,
  LTV_MAX,
  fyCommission,
  ltvPercent,
  maxCapitalRate,
  maxLoanAtLtv,
  validateAnnualRate,
} from "@/lib/contract-engine/fees";
import { monthlyPayment } from "@/lib/loan-math";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Wspólny opis wyniku — te same pola w każdym kalkulatorze i w create_loan_proposal. */
export interface EngineSummaryFields {
  kwota_udzielona: number;
  prowizja_fy: number;
  prowizja_fy_opis: string;
  kwota_na_reke: number;
  prowizja_inwestora: number;
  oprocentowanie_pct: number;
  odsetki_maksymalne_pct: number;
  liczba_rat: number;
  rata: number;
  rata_nominalna: number;
  balon: number;
  odsetki_razem: number;
  do_splaty: number;
  koszt_calkowity: number;
}

export type EngineSummaryResult =
  | { ok: false; error: string }
  | { ok: true; eng: EngineSchedule; summary: EngineSummaryFields };

export function engineSummary(input: {
  amount: number;
  period_months: number;
  yearly_rate_pct: number;
  max_payment?: number | null;
  investor_commission_pln?: number | null;
  include_fy_commission?: boolean;
}): EngineSummaryResult {
  const rateError = validateAnnualRate(input.yearly_rate_pct);
  if (rateError) return { ok: false, error: rateError };
  const nominal = monthlyPayment(input.amount, input.yearly_rate_pct, input.period_months);
  const cap =
    input.max_payment && input.max_payment > 0 ? input.max_payment : Math.ceil(nominal * 100) / 100;
  const feeFY = input.include_fy_commission === false ? 0 : fyCommission(input.amount);
  const eng = buildEngineSchedule({
    kwotaPozyczki: input.amount,
    prowizja: Math.max(0, input.investor_commission_pln ?? 0),
    prowizjaFY: feeFY,
    annualRatePercent: input.yearly_rate_pct,
    months: input.period_months,
    maxMonthlyPayment: cap,
  });
  if (eng.errors.length > 0) return { ok: false, error: eng.errors.join(" ") };
  return {
    ok: true,
    eng,
    summary: {
      kwota_udzielona: eng.kwotaUdzielona,
      prowizja_fy: eng.prowizjaFY,
      prowizja_fy_opis: `${FY_COMMISSION_PCT}% Kwoty Udzielonej, min ${FY_COMMISSION_MIN_PLN} zł, bez VAT — potrącana z wypłaty`,
      kwota_na_reke: eng.kwotaWyplaconaKlientowi,
      prowizja_inwestora: eng.prowizjaInwestora,
      oprocentowanie_pct: input.yearly_rate_pct,
      odsetki_maksymalne_pct: maxCapitalRate(),
      liczba_rat: eng.months,
      rata: eng.rows.length > 1 ? eng.rows[0].rata_razem : eng.regularPayment,
      rata_nominalna: round2(nominal),
      balon: eng.balloon,
      odsetki_razem: eng.totalInterest,
      do_splaty: eng.totalToRepay,
      koszt_calkowity: eng.calkowityKoszt,
    },
  };
}

export const calculateRepaymentSchedule = defineTool({
  name: "calculate_repayment_schedule",
  title: "Calculate repayment schedule",
  description:
    "Harmonogram spłat pożyczki w modelu Finance You (jeden silnik): odsetki od kapitału pozostającego do spłaty, pułap raty steruje kapitałem, nadwyżka trafia do ostatniej raty (balon), stała prowizja inwestora rozłożona równo w ratach. Prowizja Finance You (7% Kwoty Udzielonej, min 5 000 zł, bez VAT) jest potrącana z wypłaty i nie wchodzi do rat. Zwraca zawsze: kwota udzielona, prowizja FY, na rękę, rata, balon, do spłaty, koszt całkowity + listę rat. Oprocentowanie ponad odsetki maksymalne (art. 359 § 2¹ KC) jest blokowane. Czysta matematyka, bez bazy.",
  inputSchema: {
    amount: z.number().positive().describe("Kwota Udzielona (kwota pożyczki z umowy) w PLN."),
    period_months: z.number().int().min(1).max(120),
    yearly_rate_pct: z
      .number()
      .min(0)
      .max(100)
      .describe("Roczne oprocentowanie w % (≤ odsetki maksymalne, dziś 14,5)."),
    max_payment: z
      .number()
      .positive()
      .optional()
      .describe("Pułap raty miesięcznej; brak = rata annuitetowa (pełna amortyzacja)."),
    investor_commission_pln: z
      .number()
      .min(0)
      .optional()
      .describe("Stała prowizja inwestora w PLN (rozkładana równo w ratach)."),
    include_fy_commission: z
      .boolean()
      .default(true)
      .describe("Czy doliczyć prowizję Finance You potrącaną z wypłaty (domyślnie tak)."),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Ile rat zwrócić w liście (domyślnie wszystkie)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({
    amount,
    period_months,
    yearly_rate_pct,
    max_payment,
    investor_commission_pln,
    include_fy_commission,
    max_rows,
  }) => {
    const r = engineSummary({
      amount,
      period_months,
      yearly_rate_pct,
      max_payment,
      investor_commission_pln,
      include_fy_commission,
    });
    if (!r.ok) return fail(r.error);
    const rows = r.eng.rows.map((x) => ({
      month: x.nr,
      payment: x.rata_razem,
      principal: x.kapital,
      interest: x.odsetki,
      investor_commission: x.prowizja,
      balance: x.saldo,
      is_balloon: x.isBalloon,
    }));
    return ok({
      ...r.summary,
      schedule: rows.slice(0, max_rows ?? rows.length),
      schedule_truncated: max_rows !== undefined && max_rows < rows.length,
    });
  },
});

export const calculateLtv = defineTool({
  name: "calculate_ltv",
  title: "Calculate LTV",
  description:
    "LTV (loan-to-value) dla zabezpieczenia hipotecznego: kwota pożyczki (plus istniejące obciążenia) do wartości nieruchomości. Jeden limit w systemie: 60%. Zwraca LTV w %, czy mieści się w limicie i maksymalną kwotę przy limicie. Czysta matematyka.",
  inputSchema: {
    loan_amount: z.number().positive().describe("Wnioskowana kwota pożyczki (PLN)."),
    property_value: z.number().positive().describe("Wartość nieruchomości (PLN)."),
    existing_encumbrances: z
      .number()
      .min(0)
      .default(0)
      .describe("Istniejące hipoteki / obciążenia (PLN)."),
    max_ltv_pct: z
      .number()
      .min(1)
      .max(LTV_MAX)
      .default(LTV_MAX)
      .describe(`Limit LTV do wyliczenia maks. kwoty (domyślnie i maksymalnie ${LTV_MAX}%).`),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ loan_amount, property_value, existing_encumbrances, max_ltv_pct }) => {
    const ltv = ltvPercent(loan_amount, property_value, existing_encumbrances) ?? 0;
    const band =
      ltv <= 35
        ? "bardzo konserwatywne"
        : ltv <= 50
          ? "akceptowalne"
          : ltv <= LTV_MAX
            ? "podwyższone"
            : "poza limitem";
    const maxLoan = maxLoanAtLtv(property_value, existing_encumbrances, max_ltv_pct);
    return ok({
      ltv_pct: ltv,
      band,
      exposure: loan_amount + existing_encumbrances,
      property_value,
      max_ltv_pct,
      system_ltv_limit_pct: LTV_MAX,
      max_loan_at_limit: maxLoan,
      headroom: round2(maxLoan - loan_amount),
      within_limit: ltv <= max_ltv_pct,
    });
  },
});

export const calculatorTools = [calculateRepaymentSchedule, calculateLtv];
