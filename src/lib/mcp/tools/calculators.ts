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
import { ostrzezeniaKosztowe } from "@/lib/contract-engine/cost-warnings";
import { formatKwotaPL } from "@/lib/contract-engine/schedule";

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
  /** Część prowizji inwestora płatna wraz z ratą końcową (0 = brak). */
  prowizja_w_racie_koncowej: number;
  /** Część prowizji inwestora rozłożona równo na raty. */
  prowizja_ratalna: number;
  amortyzacja_kapitalu: "nadwyzka_raty" | "w_balonie";
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
  /** Część prowizji inwestora (zawarta w investor_commission_pln) płatna z ratą końcową. */
  investor_commission_balloon_pln?: number | null;
  amortyzacja_kapitalu?: "nadwyzka_raty" | "w_balonie";
  include_fy_commission?: boolean;
  /** Data pierwszej raty (DD.MM.RRRR / RRRR-MM-DD) — terminy w harmonogramie. */
  first_payment_date?: string | null;
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
    prowizjaWRacieKoncowej: Math.max(0, input.investor_commission_balloon_pln ?? 0),
    amortyzacjaKapitalu: input.amortyzacja_kapitalu ?? "nadwyzka_raty",
    annualRatePercent: input.yearly_rate_pct,
    months: input.period_months,
    maxMonthlyPayment: cap,
    firstPaymentDate: input.first_payment_date ?? null,
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
      prowizja_w_racie_koncowej: eng.prowizjaWRacieKoncowej,
      prowizja_ratalna: eng.prowizjaRatalna,
      amortyzacja_kapitalu: eng.amortyzacjaKapitalu,
      odsetki_razem: eng.totalInterest,
      do_splaty: eng.totalToRepay,
      koszt_calkowity: eng.calkowityKoszt,
    },
  };
}

/**
 * Tryb „cel zarobku inwestora” (`target_monthly_yield_pct`): cel = kwota × % ×
 * liczba rat. Odsetki liczone od pełnego kapitału (kapitał w balonie) przy
 * podanej stopie (domyślnie odsetki maksymalne); prowizja łączna = cel −
 * odsetki. W pułapie raty mieści się część prowizji ratalnej (pełne złote,
 * tak by rata = odsetki + prowizja/N ≤ pułap), reszta trafia do raty końcowej.
 */
export function prowizjaZCeluZarobku(input: {
  amount: number;
  period_months: number;
  yearly_rate_pct: number;
  target_monthly_yield_pct: number;
  max_payment?: number | null;
}): { prowizja: number; wRacieKoncowej: number; odsetki: number; cel: number } {
  const N = Math.max(1, Math.floor(input.period_months));
  const odsMies = round2((input.amount * input.yearly_rate_pct) / 100 / 12);
  // Odsetki w celu liczone od pełnego kapitału bez zaokrągleń miesięcznych
  // (K × r × N); groszowe różnice z zaokrągleń rat zostają w harmonogramie.
  const odsetki = round2((input.amount * input.yearly_rate_pct * N) / 100 / 12);
  const cel = round2((input.amount * input.target_monthly_yield_pct * N) / 100);
  const prowizja = Math.max(0, round2(cel - odsetki));
  if (!input.max_payment || input.max_payment <= 0) {
    return { prowizja, wRacieKoncowej: 0, odsetki, cel };
  }
  const naProwizje = round2(input.max_payment - odsMies);
  if (naProwizje <= 0) return { prowizja, wRacieKoncowej: prowizja, odsetki, cel };
  // Największa ratalna kwota w pełnych złotych, której rata (zaokrąglona do
  // grosza) mieści się w pułapie.
  let ratalna = Math.min(prowizja, Math.floor((naProwizje + 0.005) * N));
  while (ratalna > 0 && round2(ratalna / N) > naProwizje + 1e-9) ratalna -= 1;
  return { prowizja, wRacieKoncowej: round2(prowizja - ratalna), odsetki, cel };
}

/** Pola gotowe do `draft_contract` (łatka `warunki`). */
export function lataDoUmowy(input: {
  amount: number;
  period_months: number;
  yearly_rate_pct: number;
  max_payment: number;
  prowizja: number;
  w_racie_koncowej: number;
  amortyzacja_kapitalu: "nadwyzka_raty" | "w_balonie";
}) {
  const kw = (n: number) => ({ cyframi: formatKwotaPL(n) });
  return {
    warunki: {
      kwota_pozyczki: kw(input.amount),
      prowizja: {
        kwota: kw(input.prowizja),
        model: "nie_potracana_raty",
        ...(input.w_racie_koncowej > 0 ? { w_racie_koncowej: kw(input.w_racie_koncowej) } : {}),
      },
      oprocentowanie: input.yearly_rate_pct.toFixed(1).replace(".", ","),
      harmonogram: {
        liczba_rat: input.period_months,
        typ: "balonowy",
        kwota_raty: kw(input.max_payment),
        amortyzacja_kapitalu: input.amortyzacja_kapitalu,
      },
    },
  };
}

export const calculateRepaymentSchedule = defineTool({
  name: "calculate_repayment_schedule",
  title: "Calculate repayment schedule",
  description:
    'Harmonogram spłat pożyczki w modelu Finance You (ten sam silnik co umowa — draft_contract liczy identycznie dla tych samych parametrów): odsetki od kapitału pozostającego do spłaty, pułap raty, rata końcowa (balon), stała prowizja inwestora rozłożona równo w ratach — opcjonalnie z częścią płatną wraz z ratą końcową (`investor_commission_balloon_pln`). `amortyzacja_kapitalu`: "nadwyzka_raty" (domyślnie — nadwyżka pułapu spłaca kapitał) albo "w_balonie" (cały kapitał w racie końcowej). Tryb `target_monthly_yield_pct` (np. 3,5): cel zarobku inwestora = kwota × % × liczba rat; silnik liczy odsetki (domyślnie odsetki maksymalne), prowizję łączną = cel − odsetki, część mieszczącą się w pułapie raty, a resztę przenosi do raty końcowej. `scale_from`: przeskalowanie istniejącego wariantu proporcjonalnie do nowej kwoty (rata i prowizje × nowa/stara kwota). Prowizja Finance You (5% Kwoty Udzielonej, min 5 000 zł, bez VAT) jest potrącana z wypłaty i nie wchodzi do rat. Zwraca kwoty, listę rat, ostrzeżenia o kosztach (nieblokujące) i `draft_contract_patch` — gotowe pola `warunki` do draft_contract. Oprocentowanie ponad odsetki maksymalne (art. 359 § 2¹ KC) jest blokowane. Czysta matematyka, bez bazy.',
  inputSchema: {
    amount: z.number().positive().describe("Kwota Udzielona (kwota pożyczki z umowy) w PLN."),
    period_months: z.number().int().min(1).max(120),
    yearly_rate_pct: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Roczne oprocentowanie w % (≤ odsetki maksymalne, dziś 14,5). W trybie target_monthly_yield_pct domyślnie odsetki maksymalne; poza nim wymagane.",
      ),
    max_payment: z
      .number()
      .positive()
      .optional()
      .describe("Pułap raty miesięcznej; brak = rata annuitetowa (pełna amortyzacja)."),
    investor_commission_pln: z
      .number()
      .min(0)
      .optional()
      .describe("Łączna stała prowizja inwestora w PLN (rozkładana równo w ratach)."),
    investor_commission_balloon_pln: z
      .number()
      .min(0)
      .optional()
      .describe(
        "Część prowizji inwestora (zawarta w investor_commission_pln) płatna wraz z ratą końcową (balonową).",
      ),
    amortyzacja_kapitalu: z
      .enum(["nadwyzka_raty", "w_balonie"])
      .optional()
      .describe(
        "Kapitał w ratach regularnych: nadwyżka pułapu (domyślnie) albo w całości w racie końcowej. W trybie target_monthly_yield_pct domyślnie w_balonie.",
      ),
    target_monthly_yield_pct: z
      .number()
      .positive()
      .max(20)
      .optional()
      .describe(
        "Cel zarobku inwestora w % kwoty miesięcznie (np. 3.5). Prowizja łączna i część w racie końcowej liczone automatycznie — nie podawaj wtedy investor_commission_*.",
      ),
    scale_from: z
      .object({
        amount: z.number().positive().describe("Kwota istniejącego wariantu."),
        max_payment: z.number().positive().optional(),
        investor_commission_pln: z.number().min(0).optional(),
        investor_commission_balloon_pln: z.number().min(0).optional(),
      })
      .optional()
      .describe(
        "Przeskalowanie istniejącego wariantu do `amount`: rata i prowizje × amount / scale_from.amount (nadpisuje max_payment i investor_commission_*).",
      ),
    include_fy_commission: z
      .boolean()
      .default(true)
      .describe("Czy doliczyć prowizję Finance You potrącaną z wypłaty (domyślnie tak)."),
    first_payment_date: z
      .string()
      .optional()
      .describe("Data pierwszej raty (DD.MM.RRRR) — terminy w harmonogramie."),
    contract_date: z
      .string()
      .optional()
      .describe("Data umowy (DD.MM.RRRR) — do ostrzeżeń (odsetki maksymalne, świeża JDG)."),
    business_start_date: z
      .string()
      .optional()
      .describe(
        "Data rozpoczęcia działalności pożyczkobiorcy z CEIDG — ostrzeżenie, gdy < 30 dni przed umową.",
      ),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Ile rat zwrócić w liście (domyślnie wszystkie)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args) => {
    const r = obliczHarmonogramKalkulatora(args);
    if (!r.ok) return fail(r.error);
    return ok(r.wynik);
  },
});

export interface KalkulatorWejscie {
  amount: number;
  period_months: number;
  yearly_rate_pct?: number;
  max_payment?: number;
  investor_commission_pln?: number;
  investor_commission_balloon_pln?: number;
  amortyzacja_kapitalu?: "nadwyzka_raty" | "w_balonie";
  target_monthly_yield_pct?: number;
  scale_from?: {
    amount: number;
    max_payment?: number;
    investor_commission_pln?: number;
    investor_commission_balloon_pln?: number;
  };
  include_fy_commission?: boolean;
  first_payment_date?: string;
  contract_date?: string;
  business_start_date?: string;
  max_rows?: number;
}

/** Logika narzędzia `calculate_repayment_schedule` (czysta — testowalna). */
export function obliczHarmonogramKalkulatora(
  args: KalkulatorWejscie,
): { ok: false; error: string } | { ok: true; wynik: Record<string, unknown> } {
  const { amount, period_months } = args;
  const trybCelu = args.target_monthly_yield_pct != null;
  const stopa =
    args.yearly_rate_pct ??
    (trybCelu ? maxCapitalRate(args.contract_date || new Date()) : undefined);
  if (stopa == null)
    return { ok: false, error: "Podaj yearly_rate_pct (oprocentowanie roczne w %)." };

  let maxPayment = args.max_payment;
  let prowizja = args.investor_commission_pln ?? 0;
  let balon = args.investor_commission_balloon_pln ?? 0;
  let amortyzacja = args.amortyzacja_kapitalu;
  const informacje: string[] = [];

  if (args.scale_from) {
    const k = amount / args.scale_from.amount;
    if (args.scale_from.max_payment != null) maxPayment = round2(args.scale_from.max_payment * k);
    if (args.scale_from.investor_commission_pln != null)
      prowizja = round2(args.scale_from.investor_commission_pln * k);
    if (args.scale_from.investor_commission_balloon_pln != null)
      balon = round2(args.scale_from.investor_commission_balloon_pln * k);
    informacje.push(
      `Wariant przeskalowany z ${formatKwotaPL(args.scale_from.amount)} zł do ${formatKwotaPL(amount)} zł (× ${k.toFixed(4).replace(".", ",")}).`,
    );
  }

  let cel: Record<string, number> | null = null;
  if (trybCelu) {
    const c = prowizjaZCeluZarobku({
      amount,
      period_months,
      yearly_rate_pct: stopa,
      target_monthly_yield_pct: args.target_monthly_yield_pct!,
      max_payment: maxPayment,
    });
    prowizja = c.prowizja;
    balon = c.wRacieKoncowej;
    amortyzacja ??= "w_balonie";
    cel = {
      cel_zarobku_pct_miesiecznie: args.target_monthly_yield_pct!,
      cel_zarobku: c.cel,
      odsetki_przy_kapitale_w_balonie: c.odsetki,
    };
  }

  const r = engineSummary({
    amount,
    period_months,
    yearly_rate_pct: stopa,
    max_payment: maxPayment,
    investor_commission_pln: prowizja,
    investor_commission_balloon_pln: balon,
    amortyzacja_kapitalu: amortyzacja,
    include_fy_commission: args.include_fy_commission,
    first_payment_date: args.first_payment_date ?? null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const rows = r.eng.rows.map((x) => ({
    month: x.nr,
    ...(x.termin ? { date: x.termin } : {}),
    payment: x.rata_razem,
    principal: x.kapital,
    interest: x.odsetki,
    investor_commission: x.prowizja,
    balance: x.saldo,
    is_balloon: x.isBalloon,
  }));
  const ostrzezenia = ostrzezeniaKosztowe({
    kwotaPozyczki: amount,
    prowizjaInwestora: r.summary.prowizja_inwestora,
    prowizjaFY: r.summary.prowizja_fy,
    odsetki: r.summary.odsetki_razem,
    liczbaRat: period_months,
    dataUmowy: args.contract_date ?? null,
    dataRozpoczeciaDzialalnosci: args.business_start_date ?? null,
  }).map((p) => p.komunikat);
  const rataReg = r.eng.rows.length > 1 ? r.eng.rows[0].rata_razem : r.eng.regularPayment;
  return {
    ok: true,
    wynik: {
      ...r.summary,
      ...(cel ? { cel } : {}),
      ...(cel
        ? { zarobek_inwestora: round2(r.summary.odsetki_razem + r.summary.prowizja_inwestora) }
        : {}),
      ostrzezenia,
      ...(informacje.length ? { informacje } : {}),
      draft_contract_patch: lataDoUmowy({
        amount,
        period_months,
        yearly_rate_pct: stopa,
        max_payment: maxPayment && maxPayment > 0 ? maxPayment : rataReg,
        prowizja: r.summary.prowizja_inwestora,
        w_racie_koncowej: r.summary.prowizja_w_racie_koncowej,
        amortyzacja_kapitalu: r.summary.amortyzacja_kapitalu,
      }),
      schedule: rows.slice(0, args.max_rows ?? rows.length),
      schedule_truncated: args.max_rows !== undefined && args.max_rows < rows.length,
    },
  };
}

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
