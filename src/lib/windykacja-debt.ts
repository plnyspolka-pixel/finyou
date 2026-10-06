// ════════════════════════════════════════════════════════════════════
// STAN ZADŁUŻENIA SPRAWY — jedno źródło dla karty sprawy, dashboardu,
// raportu, SMS-a i telefonu AI (izomorficzne, bez I/O).
//
// Dwa pojęcia, których nie wolno mylić:
//   • „do zapłaty teraz" — zaległe raty + odsetki za opóźnienie + koszty
//     windykacyjne. To komunikujemy pożyczkobiorcy (SMS, telefon), dopóki
//     umowa nie jest wypowiedziana.
//   • „całe zadłużenie" — wszystko, co pozostało do spłaty (także raty
//     przyszłe). Wymagalne w całości dopiero po wypowiedzeniu.
//
// Pożyczka z harmonogramem (wind_loans.harmonogram) → zaległość liczona
// z rat (windykacja-harmonogram.ts). Bez harmonogramu → dotychczasowy
// model z jednym terminem (debt-collection-math.ts), gdzie kwota zaległa
// sprawy jest podstawą odsetek za opóźnienie.
// ════════════════════════════════════════════════════════════════════

import {
  calculateDebt,
  splitInvestorPrincipal,
  type DebtCalcResult,
} from "@/lib/debt-collection-math";
import { maxDelayRate } from "@/lib/contract-engine/fees";
import {
  computeZaleglosc,
  normalizeHarmonogram,
  type ZalegloscWynik,
} from "@/lib/windykacja-harmonogram";

export interface WindDebtLoan {
  kwota_pozyczki?: number | null;
  kwota_calkowita?: number | null;
  prowizja?: number | null;
  data_umowy?: string | null;
  termin_splaty?: string | null;
  oprocentowanie_roczne?: number | null;
  stopa_odsetek_max?: number | null;
  data_wypowiedzenia?: string | null;
  status?: string | null;
  kwota_doplat?: number | null;
  harmonogram?: unknown;
}

export interface WindDebtEvent {
  typ: string;
  data_zdarzenia: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB z bazy
  metadata?: Record<string, any> | null;
  oplata?: number | null;
}

export interface WindDebtSnapshot {
  /** Skąd liczona zaległość: z harmonogramu rat czy z jednego terminu spłaty. */
  zrodlo: "harmonogram" | "termin";
  wypowiedziana: boolean;
  /** Zaległe raty (bez odsetek i kosztów). */
  zaleglosc: number;
  odsetkiZaOpoznienie: number;
  koszty: number;
  /** Zaległość + odsetki za opóźnienie + koszty (po wypowiedzeniu: całe zadłużenie). */
  doZaplatyTeraz: number;
  /** Wszystko, co pozostało do spłaty, łącznie z ratami przyszłymi. */
  calosc: number;
  dniOpoznienia: number;
  /** Najstarsza niezapłacona rata (harmonogram) albo termin spłaty (model jednoterminowy). */
  najstarszaZalegla: string | null;
  najblizszaRata: string | null;
  /** Wynik z harmonogramu (raty, stan każdej raty) — tylko dla `zrodlo = harmonogram`. */
  raty: ZalegloscWynik | null;
  /** Wynik modelu jednoterminowego — tylko dla `zrodlo = termin`. */
  debt: DebtCalcResult | null;
}

/**
 * Czy cała należność jest wymagalna: wypowiedzenie albo sprawa już na
 * etapie egzekucji komorniczej / karnym (tak samo jak w agencie AI —
 * windLoanTerminated w windykacja-agent-prompt.ts).
 */
export function windLoanIsTerminated(loan: WindDebtLoan): boolean {
  return (
    Boolean(loan.data_wypowiedzenia) ||
    ["wypowiedziana", "windykacja_komornicza", "windykacja_karna"].includes(
      String(loan.status ?? ""),
    )
  );
}

/** Wpłaty i opłaty windykacyjne z osi zdarzeń sprawy. */
export function windPaymentsAndFees(events: WindDebtEvent[]): {
  payments: Array<{ paid_on: string; amount: number }>;
  fees: Array<{ action_date: string; fee: number }>;
} {
  return {
    payments: events
      .filter((e) => e.typ === "wplata")
      .map((e) => ({
        paid_on: e.data_zdarzenia.slice(0, 10),
        amount: Number(e.metadata?.kwota ?? 0),
      }))
      .filter((p) => p.amount > 0),
    fees: events
      .filter((e) => Number(e.oplata) > 0)
      .map((e) => ({ action_date: e.data_zdarzenia.slice(0, 10), fee: Number(e.oplata) })),
  };
}

/**
 * Domyślna stopa odsetek za opóźnienie dla nowej sprawy: odsetki
 * maksymalne za opóźnienie z dnia zawarcia umowy (wzorzec Finance You:
 * dwukrotność odsetek ustawowych za opóźnienie = odsetki maksymalne).
 */
export function defaultDelayRate(dataUmowy?: string | null): number {
  return maxDelayRate(dataUmowy && /^\d{4}-\d{2}-\d{2}/.test(dataUmowy) ? dataUmowy : new Date());
}

export function windDebtSnapshot(input: {
  loan: WindDebtLoan;
  /** Kwota zaległa sprawy — podstawa modelu jednoterminowego. */
  kwotaZalegla?: number | null;
  events: WindDebtEvent[];
  asOf: string;
}): WindDebtSnapshot {
  const { loan, asOf } = input;
  const terminated = windLoanIsTerminated(loan);
  const { payments, fees } = windPaymentsAndFees(input.events);
  const harmonogram = normalizeHarmonogram(loan.harmonogram);

  if (harmonogram) {
    const raty = computeZaleglosc({
      harmonogram,
      payments,
      fees,
      asOf,
      stopaUmowna: Number(loan.stopa_odsetek_max) || null,
      dataWypowiedzenia: terminated ? (loan.data_wypowiedzenia ?? asOf) : null,
    });
    return {
      zrodlo: "harmonogram",
      wypowiedziana: terminated,
      zaleglosc: raty.zaleglosc,
      odsetkiZaOpoznienie: raty.odsetkiZaOpoznienie,
      koszty: raty.koszty,
      doZaplatyTeraz: raty.doZaplatyTeraz,
      calosc: round2(raty.doZaplatyTeraz + raty.pozostaleRatyPrzyszle),
      dniOpoznienia: raty.dniOpoznienia,
      najstarszaZalegla: raty.najstarszaZalegla,
      najblizszaRata: raty.najblizszaRata,
      raty,
      debt: null,
    };
  }

  const { bearing, investorCommission } = splitInvestorPrincipal(loan);
  const debt = calculateDebt({
    principalAmount: bearing,
    interestExemptPrincipal: investorCommission,
    payoutDate: loan.data_umowy,
    dueDate: loan.termin_splaty,
    contractualAnnualRate: Number(loan.oprocentowanie_roczne || 0),
    penaltyAnnualRate: Number(loan.stopa_odsetek_max || 0),
    // Limit: odsetki maksymalne za opóźnienie z dnia wyliczenia (art. 481
    // § 2¹ k.c.) — stara domyślna stopa 22,5% nie przejdzie ponad limit.
    maxStatutoryRate: maxDelayRate(asOf),
    terminated,
    terminationDate: loan.data_wypowiedzenia,
    overdueInstallmentsAmount: Number(input.kwotaZalegla || 0),
    surcharges: Number(loan.kwota_doplat || 0),
    payments,
    actionFees: fees,
    asOf,
  });
  // Przed wypowiedzeniem wymagalna jest zaległość (kwota zaległa sprawy,
  // nie więcej niż saldo), a nie całe saldo pożyczki.
  const zaleglosc = terminated
    ? debt.principalOutstanding + debt.investorCommissionOutstanding + debt.contractualInterest
    : Math.min(Number(input.kwotaZalegla || 0), debt.totalDue);
  const doZaplatyTeraz = terminated
    ? debt.totalDue
    : Math.min(debt.totalDue, zaleglosc + debt.delayInterest + debt.costsOutstanding);
  return {
    zrodlo: "termin",
    wypowiedziana: terminated,
    zaleglosc: round2(zaleglosc),
    odsetkiZaOpoznienie: debt.delayInterest,
    koszty: debt.costsOutstanding,
    doZaplatyTeraz: round2(doZaplatyTeraz),
    calosc: debt.totalDue,
    dniOpoznienia: debt.daysOverdue,
    najstarszaZalegla: loan.termin_splaty ?? null,
    najblizszaRata: null,
    raty: null,
    debt,
  };
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
