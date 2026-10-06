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

/** Dzisiejsza data w Polsce (RRRR-MM-DD). */
function warsawTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Czy umowa jest skutecznie wypowiedziana na dzień `asOf`: data
 * wypowiedzenia już minęła (data z przyszłości = wypowiedzenia jeszcze
 * nie ma) albo status „wypowiedziana" bez daty. Egzekucja komornicza
 * albo zawiadomienie karne same w sobie nie są wypowiedzeniem — komornik
 * może egzekwować z aktu 777 tylko zaległe raty (ścieżka standardowa).
 */
export function windLoanIsTerminated(loan: WindDebtLoan, asOf: string = warsawTodayISO()): boolean {
  const data = (loan.data_wypowiedzenia ?? "").slice(0, 10);
  if (data) return data <= asOf.slice(0, 10);
  return loan.status === "wypowiedziana";
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
  const terminated = windLoanIsTerminated(loan, asOf);
  const doplaty = Math.max(0, Number(loan.kwota_doplat || 0));
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
    // Całe zadłużenie: raty przyszłe bez odsetek umownych za okres przyszły
    // (przy spłacie całości odsetki należą się tylko za faktyczny okres —
    // KWO_04) oraz dopłaty umowne. Po wypowiedzeniu całość jest do zapłaty.
    const calosc = round2(raty.doZaplatyTeraz + raty.ratyPrzyszleBezOdsetek + doplaty);
    return {
      zrodlo: "harmonogram",
      wypowiedziana: terminated,
      zaleglosc: raty.zaleglosc,
      odsetkiZaOpoznienie: raty.odsetkiZaOpoznienie,
      koszty: raty.koszty,
      doZaplatyTeraz: terminated ? calosc : raty.doZaplatyTeraz,
      calosc,
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
    terminationDate: terminated ? (loan.data_wypowiedzenia ?? asOf) : null,
    overdueInstallmentsAmount: Number(input.kwotaZalegla || 0),
    surcharges: Number(loan.kwota_doplat || 0),
    payments,
    actionFees: fees,
    asOf,
  });
  const maKwoty = bearing + investorCommission > 0;
  // Całość jest wymagalna po wypowiedzeniu. Termin spłaty w modelu
  // jednoterminowym bywa wpisywany jako termin najstarszej zaległej raty,
  // więc jego upływ sam nie oznacza wymagalności całej pożyczki.
  const calosciWymagalna = maKwoty && terminated;
  // Inaczej — zaległość sprawy. Kwota zaległa jest już pomniejszona o wpłaty
  // (przy zakładaniu sprawy i przy każdej wpłacie), więc odsetki za opóźnienie
  // i koszty bierzemy narastająco, bez ponownego odejmowania tych samych wpłat.
  const kwotaZalegla = Math.max(0, Number(input.kwotaZalegla || 0));
  const zaleglosc = calosciWymagalna
    ? debt.principalOutstanding + debt.investorCommissionOutstanding + debt.contractualInterest
    : maKwoty
      ? Math.min(kwotaZalegla, debt.totalDue)
      : kwotaZalegla;
  const doZaplatyBrutto = zaleglosc + debt.delayInterestAccrued + debt.totalFeesCharged;
  const doZaplatyTeraz = calosciWymagalna
    ? debt.totalDue
    : maKwoty
      ? Math.min(debt.totalDue, doZaplatyBrutto)
      : doZaplatyBrutto;
  return {
    zrodlo: "termin",
    wypowiedziana: terminated,
    zaleglosc: round2(zaleglosc),
    odsetkiZaOpoznienie: calosciWymagalna ? debt.delayInterest : debt.delayInterestAccrued,
    koszty: calosciWymagalna ? debt.costsOutstanding : debt.totalFeesCharged,
    doZaplatyTeraz: round2(doZaplatyTeraz),
    calosc: maKwoty ? debt.totalDue : round2(doZaplatyTeraz),
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
