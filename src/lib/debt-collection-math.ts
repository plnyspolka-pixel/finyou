// ════════════════════════════════════════════════════════════════════
// OBLICZENIA WINDYKACYJNE — czyste, deterministyczne funkcje.
//
// STRUKTURA NALEŻNOŚCI (model inwestora):
//   kwota teoretyczna = kwota na rękę (klient) + prowizja Finance You +
//                       prowizja inwestora.
//   Całą kwotę teoretyczną klient oddaje (to jest „kapitał").
//   ALE odsetki (kapitałowe i za opóźnienie) naliczamy WYŁĄCZNIE od części
//   oprocentowanej = kwota na rękę + prowizja Finance You. Prowizja inwestora
//   jest spłacana razem z kapitałem, lecz NIE jest oprocentowana.
//
// OD JAKIEJ KWOTY NALICZAMY ODSETKI ZA OPÓŹNIENIE:
//   • UMOWA NIEWYPOWIEDZIANA — wymagalne są tylko zapadłe raty. Odsetki za
//     opóźnienie naliczamy WYŁĄCZNIE od zaległych rat (w części oprocentowanej),
//     nie od całego kapitału.
//   • UMOWA WYPOWIEDZIANA — z chwilą skutecznego wypowiedzenia cała pozostała
//     należność jest wymagalna. Odsetki za opóźnienie naliczamy od całości
//     oprocentowanej części (kapitał oprocentowany + zaległe odsetki + dopłaty),
//     wciąż z pominięciem prowizji inwestora.
//
// Reżimy w czasie:
//   1. Od daty wypłaty do terminu spłaty — odsetki kapitałowe (umowne) od
//      oprocentowanej, niespłaconej części kapitału.
//   2. Po terminie / po wypowiedzeniu — odsetki za opóźnienie, ograniczone do
//      odsetek MAKSYMALNYCH (art. 481 §2¹ KC): efektywna stopa =
//      min(stopa umowna, stopa maks.).
//   3. Wpłaty klienta zaliczane są wg art. 451 KC: koszty → odsetki → kapitał.
//
// Symulacja dzienna gwarantuje poprawne traktowanie częściowych wpłat
// i zmiany reżimu odsetkowego po wymagalności/wypowiedzeniu.
// ════════════════════════════════════════════════════════════════════

/**
 * Odsetki maksymalne za opóźnienie (art. 481 §2¹ KC):
 * 2 × (stopa referencyjna NBP + 5,5 p.p.).
 */
export function maxDelayInterestRate(nbpReferenceRatePercent: number): number {
  return round2((Number(nbpReferenceRatePercent) + 5.5) * 2);
}

/**
 * Domyślna stopa referencyjna NBP używana jako podpowiedź przy zakładaniu
 * sprawy. Inwestor może ją nadpisać własną, aktualną wartością.
 */
export const DEFAULT_NBP_REFERENCE_RATE = 5.75;

/** Domyślne odsetki maksymalne za opóźnienie wynikające z podpowiedzi NBP. */
export const DEFAULT_MAX_DELAY_RATE = maxDelayInterestRate(DEFAULT_NBP_REFERENCE_RATE);

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type DcPayment = { paid_on: string; amount: number };
export type DcActionFee = { action_date: string; fee: number };

/**
 * Rozbija kwoty pożyczki na część oprocentowaną i prowizję inwestora.
 *
 *   kwota teoretyczna (kwota_calkowita) = kwota na rękę (kwota_pozyczki)
 *       + prowizja Finance You (prowizja) + prowizja inwestora.
 *
 * Część oprocentowana = kwota na rękę + prowizja Finance You.
 * Prowizja inwestora  = reszta kwoty teoretycznej (spłacana z kapitałem,
 *                       bez odsetek).
 */
export function splitInvestorPrincipal(loan: {
  kwota_pozyczki?: number | null;
  prowizja?: number | null;
  kwota_calkowita?: number | null;
}): { bearing: number; investorCommission: number } {
  const naReke = Math.max(0, Number(loan.kwota_pozyczki) || 0);
  const prowFY = Math.max(0, Number(loan.prowizja) || 0);
  const calkowita = Math.max(0, Number(loan.kwota_calkowita) || 0);
  const bearing = naReke + prowFY;
  if (bearing <= 0) {
    // Brak rozbicia (np. tylko kwota całkowita) — traktujemy całość jako oprocentowaną.
    return { bearing: calkowita, investorCommission: 0 };
  }
  return { bearing, investorCommission: Math.max(0, calkowita - bearing) };
}

/** Na jakiej podstawie naliczane są odsetki za opóźnienie na dzień `asOf`. */
export type DelayInterestRegime =
  | "brak" // brak opóźnienia / brak podstawy
  | "zalegle_raty" // umowa niewypowiedziana — tylko zaległe raty
  | "calosc_po_terminie" // po terminie spłaty (bez wypowiedzenia) — cała należność
  | "calosc_po_wypowiedzeniu"; // umowa wypowiedziana — cała należność

export interface DebtCalcInput {
  /**
   * Oprocentowana część kapitału = kwota na rękę + prowizja Finance You.
   * Od tej kwoty naliczane są wszystkie odsetki.
   */
  principalAmount: number;
  /**
   * Prowizja inwestora — część kapitału spłacana razem z kapitałem, ale
   * NIEoprocentowana (nie wchodzi do podstawy odsetek).
   */
  interestExemptPrincipal?: number;

  payoutDate?: string | null;
  dueDate?: string | null;
  contractualAnnualRate: number; // odsetki kapitałowe (do terminu spłaty)
  penaltyAnnualRate: number; // odsetki za opóźnienie wg umowy
  maxStatutoryRate: number; // górny limit (odsetki maksymalne)

  /** Czy umowa została skutecznie wypowiedziana (cała kwota wymagalna). */
  terminated?: boolean;
  /** Data skutecznego wypowiedzenia (ISO yyyy-mm-dd) — od niej całość. */
  terminationDate?: string | null;
  /**
   * Kwota zaległych (zapadłych) rat — podstawa odsetek za opóźnienie, gdy
   * umowa NIE jest wypowiedziana. Jeśli pominięta, przyjmujemy 0 (brak
   * wymagalnej raty = brak odsetek za opóźnienie).
   */
  overdueInstallmentsAmount?: number | null;
  /** Pozostałe dopłaty/koszty umowne — doliczane do całości po wypowiedzeniu. */
  surcharges?: number;

  payments: DcPayment[];
  actionFees: DcActionFee[];
  asOf: string; // dzień, na który liczymy (ISO yyyy-mm-dd)
}

export interface DebtCalcResult {
  asOf: string;
  /** Efektywna roczna stopa odsetek za opóźnienie po uwzględnieniu limitu. */
  effectiveDelayRate: number;
  /** Czy umowna stopa odsetek za opóźnienie została obcięta do maksymalnej. */
  penaltyCapped: boolean;
  daysOverdue: number;

  terminated: boolean;
  /** Reżim naliczania odsetek za opóźnienie na dzień asOf. */
  delayRegime: DelayInterestRegime;
  /** Podstawa, od której naliczane są odsetki za opóźnienie na dzień asOf. */
  delayInterestBase: number;

  principalOutstanding: number; // niespłacona oprocentowana część kapitału
  investorCommissionOutstanding: number; // niespłacona prowizja inwestora (bez odsetek)
  contractualInterest: number; // pozostałe odsetki kapitałowe
  delayInterest: number; // pozostałe odsetki za opóźnienie
  surchargesOutstanding: number; // niespłacone dopłaty
  costsOutstanding: number; // pozostałe koszty (opłaty windykacyjne)

  totalPaid: number;
  totalFeesCharged: number;
  totalDue: number; // łączne zadłużenie na dzień asOf

  // Wartości skumulowane (dla przejrzystości rozliczenia)
  contractualInterestAccrued: number;
  delayInterestAccrued: number;
}

function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Wylicza zadłużenie na dany dzień. Iteruje dzień po dniu od daty wypłaty
 * (lub pierwszej wpłaty) do dnia `asOf`, naliczając odsetki i zaliczając
 * wpłaty/opłaty. Liczba dni jest ograniczona dla bezpieczeństwa.
 */
export function calculateDebt(input: DebtCalcInput): DebtCalcResult {
  const principal = Math.max(0, Number(input.principalAmount) || 0);
  const exempt = Math.max(0, Number(input.interestExemptPrincipal) || 0);
  const contractualRate = Math.max(0, Number(input.contractualAnnualRate) || 0);
  const penaltyRate = Math.max(0, Number(input.penaltyAnnualRate) || 0);
  const maxRate = Math.max(0, Number(input.maxStatutoryRate) || 0);
  const surcharges = Math.max(0, Number(input.surcharges) || 0);
  const overdueInstallments = Math.max(0, Number(input.overdueInstallmentsAmount) || 0);

  // Efektywna stopa odsetek za opóźnienie: nie wyższa niż maksymalna.
  const effectiveDelayRate = maxRate > 0 ? Math.min(penaltyRate, maxRate) : penaltyRate;
  const penaltyCapped = maxRate > 0 && penaltyRate > maxRate;

  const asOf = toDate(input.asOf) ?? new Date();
  const payout = toDate(input.payoutDate);
  const due = toDate(input.dueDate);
  const termDate = input.terminated ? (toDate(input.terminationDate) ?? due) : null;

  const payments = [...input.payments]
    .filter((p) => toDate(p.paid_on))
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  const fees = [...input.actionFees]
    .filter((f) => toDate(f.action_date))
    .sort((a, b) => a.action_date.localeCompare(b.action_date));

  const totalPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalFeesCharged = round2(fees.reduce((s, f) => s + (Number(f.fee) || 0), 0));

  // Początek symulacji: data wypłaty, a jeśli jej brak — pierwsza wpłata/dziś.
  const start = payout ?? toDate(payments[0]?.paid_on) ?? toDate(fees[0]?.action_date) ?? asOf;

  // Salda
  let principalBal = principal; // oprocentowana część kapitału
  let exemptBal = exempt; // prowizja inwestora (bez odsetek)
  let interestBal = 0; // odsetki kapitałowe niespłacone
  let delayBal = 0; // odsetki za opóźnienie niespłacone
  let surchargesBal = surcharges; // dopłaty niespłacone
  let costsBal = 0; // koszty (opłaty) niespłacone

  let contractualAccrued = 0;
  let delayAccrued = 0;

  // Reżim/podstawa odsetek za opóźnienie obowiązujące na ostatni liczony dzień.
  let lastRegime: DelayInterestRegime = "brak";
  let lastBase = 0;

  // Indeksy zdarzeń (posortowane rosnąco po dacie)
  const paymentsByDay = new Map<string, number>();
  for (const p of payments) {
    paymentsByDay.set(
      p.paid_on,
      round2((paymentsByDay.get(p.paid_on) ?? 0) + (Number(p.amount) || 0)),
    );
  }
  const feesByDay = new Map<string, number>();
  for (const f of fees) {
    feesByDay.set(
      f.action_date,
      round2((feesByDay.get(f.action_date) ?? 0) + (Number(f.fee) || 0)),
    );
  }

  const totalDays = Math.max(0, daysBetween(start, asOf));
  const MAX_DAYS = 366 * 60; // zabezpieczenie (60 lat)
  const iterDays = Math.min(totalDays, MAX_DAYS);

  for (let i = 0; i <= iterDays; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const key = isoDay(day);

    // 1. Naliczenie odsetek za miniony dzień (od i>=1, czyli za pełne dni).
    if (i >= 1) {
      const afterDue = due ? day.getTime() > due.getTime() : false;
      const afterTermination = termDate ? day.getTime() > termDate.getTime() : false;
      // Wymagalność przyspieszona: po terminie raty ALBO po wypowiedzeniu.
      const accelerated = afterDue || afterTermination;

      if (!accelerated) {
        // Reżim kapitałowy — odsetki umowne od oprocentowanej części kapitału.
        if (contractualRate > 0 && principalBal > 0) {
          const inc = (principalBal * contractualRate) / 100 / 365;
          interestBal += inc;
          contractualAccrued += inc;
        }
        lastRegime = "brak";
        lastBase = 0;
      } else {
        // Reżim odsetek za opóźnienie — podstawa zależy od wypowiedzenia.
        // Prowizja inwestora (exemptBal) NIGDY nie wchodzi do podstawy odsetek.
        let base: number;
        let regime: DelayInterestRegime;
        if (afterTermination) {
          // Cała oprocentowana należność wymagalna: kapitał + odsetki + dopłaty + koszty.
          base = principalBal + interestBal + surchargesBal + costsBal;
          regime = "calosc_po_wypowiedzeniu";
        } else {
          // Po terminie spłaty cała oprocentowana należność jest wymagalna.
          // Gdy operator podał kwotę zaległych rat (> 0), używamy jej jako podstawy
          // (umowa niewypowiedziana, częściowa zaległość); gdy jej nie podał,
          // podstawą jest całe saldo — inaczej dług zamarzałby po terminie.
          const fullDue = principalBal + interestBal;
          if (overdueInstallments > 0) {
            base = Math.min(overdueInstallments, fullDue);
            regime = base > 0 ? "zalegle_raty" : "brak";
          } else {
            base = fullDue;
            regime = base > 0 ? "calosc_po_terminie" : "brak";
          }
        }
        if (effectiveDelayRate > 0 && base > 0) {
          const inc = (base * effectiveDelayRate) / 100 / 365;
          delayBal += inc;
          delayAccrued += inc;
        }
        lastRegime = regime;
        lastBase = round2(base);
      }
    }

    // 2. Opłaty windykacyjne naliczone tego dnia → koszty.
    const feeToday = feesByDay.get(key);
    if (feeToday) costsBal += feeToday;

    // 3. Wpłaty klienta tego dnia → zaliczenie wg art. 451 KC:
    //    koszty → dopłaty → odsetki za opóźnienie → odsetki kapitałowe →
    //    kapitał oprocentowany → prowizja inwestora.
    let pay = paymentsByDay.get(key) ?? 0;
    if (pay > 0) {
      const toCosts = Math.min(pay, costsBal);
      costsBal -= toCosts;
      pay -= toCosts;

      const toSurcharges = Math.min(pay, surchargesBal);
      surchargesBal -= toSurcharges;
      pay -= toSurcharges;

      const toDelay = Math.min(pay, delayBal);
      delayBal -= toDelay;
      pay -= toDelay;

      const toInterest = Math.min(pay, interestBal);
      interestBal -= toInterest;
      pay -= toInterest;

      const toPrincipal = Math.min(pay, principalBal);
      principalBal -= toPrincipal;
      pay -= toPrincipal;

      const toExempt = Math.min(pay, exemptBal);
      exemptBal -= toExempt;
      pay -= toExempt;
      // Nadpłata (pay > 0) pozostaje nierozliczona — pomijamy (saldo = 0).
    }
  }

  const daysOverdue = due ? Math.max(0, daysBetween(due, asOf)) : 0;

  const principalOutstanding = round2(Math.max(0, principalBal));
  const investorCommissionOutstanding = round2(Math.max(0, exemptBal));
  const contractualInterest = round2(Math.max(0, interestBal));
  const delayInterest = round2(Math.max(0, delayBal));
  const surchargesOutstanding = round2(Math.max(0, surchargesBal));
  const costsOutstanding = round2(Math.max(0, costsBal));
  const totalDue = round2(
    principalOutstanding +
      investorCommissionOutstanding +
      contractualInterest +
      delayInterest +
      surchargesOutstanding +
      costsOutstanding,
  );

  return {
    asOf: input.asOf,
    effectiveDelayRate: round2(effectiveDelayRate),
    penaltyCapped,
    daysOverdue,
    terminated: Boolean(input.terminated),
    delayRegime: lastRegime,
    delayInterestBase: lastBase,
    principalOutstanding,
    investorCommissionOutstanding,
    contractualInterest,
    delayInterest,
    surchargesOutstanding,
    costsOutstanding,
    totalPaid,
    totalFeesCharged,
    totalDue,
    contractualInterestAccrued: round2(contractualAccrued),
    delayInterestAccrued: round2(delayAccrued),
  };
}
