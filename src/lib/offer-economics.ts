// ════════════════════════════════════════════════════════════════════
// EKONOMIA ZAPISANEJ OFERTY INWESTORA (wiersz `investor_offers`) — dla listy
// „Moje oferty": odsetki, prowizja inwestora, prowizja Finance You, zysk.
//
// Matematyka pochodzi z tego samego miejsca co PDF oferty
// (`buildOfferPdfPayload` → silnik umów): harmonogram zapisany przy
// składaniu oferty, a gdy go brak — odtworzony silnikiem z parametrów
// oferty. Składnik „prowizja" w harmonogramie to prowizja inwestora
// + prowizja Finance You (tak liczy kalkulator inwestora), więc prowizję
// Finance You odczytujemy jako nadwyżkę ponad prowizję inwestora. Starsze
// oferty bez tego składnika dostają szacunek ze skali Finance You
// (`financeYouFeeEstimated = true`).
// ════════════════════════════════════════════════════════════════════

import { buildOfferPdfPayload, type OfferForPdf } from "@/lib/offer-pdf";
import { financeYouFeePlnFor } from "@/lib/finance-you-fee";

export interface OfferEconomics {
  /** Kwota pożyczki (pełna wypłata dla klienta). */
  amount: number;
  months: number;
  /** Oprocentowanie roczne w %. */
  annualRate: number;
  /** Rata regularna (z pułapem, jeśli oferta go ma). */
  monthlyPayment: number;
  /** Rata balonowa (0 = brak). */
  balloon: number;
  /** Suma odsetek z harmonogramu. */
  interest: number;
  /** Prowizja inwestora w zł (`investor_offers.commission`). */
  investorCommission: number;
  investorCommissionPct: number;
  /** Prowizja Finance You w zł — koszt klienta, dla inwestora przelotowa. */
  financeYouFee: number;
  financeYouFeePct: number;
  /** `true`, gdy harmonogram nie zawiera składnika Finance You i kwota to szacunek ze skali. */
  financeYouFeeEstimated: boolean;
  /** Zysk inwestora = odsetki + prowizja inwestora (bez przelotowej prowizji Finance You). */
  investorProfit: number;
  /** Łączna kwota do spłaty przez klienta (suma rat). */
  totalToRepay: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tolerancja zaokrągleń groszowych harmonogramu (72 raty × 0,5 gr). */
const SCHEDULE_ROUNDING_TOLERANCE_PLN = 1;

/**
 * Liczy ekonomię oferty. Zwraca `null`, gdy oferta nie ma kwoty albo okresu —
 * wtedy nie ma czego liczyć (tak samo jak PDF oferty).
 */
export function computeOfferEconomics(offer: OfferForPdf): OfferEconomics | null {
  const payload = buildOfferPdfPayload(offer);
  if (!payload) return null;

  const amount = num(offer.proposed_amount);
  const investorCommission = r2(num(offer.commission));

  // Składnik prowizji w harmonogramie = prowizja inwestora + prowizja Finance You.
  const scheduleCommission = r2(payload.schedule.reduce((acc, row) => acc + num(row.prow), 0));
  const fromSchedule = r2(scheduleCommission - investorCommission);
  const financeYouFeeEstimated = fromSchedule <= SCHEDULE_ROUNDING_TOLERANCE_PLN;
  // Wiersze harmonogramu są zaokrąglone do grosza, więc nadwyżka bywa o kilka
  // groszy obok kwoty z kalkulatora (ten zapisuje prowizję FY w pełnych złotych).
  const financeYouFee = financeYouFeeEstimated
    ? financeYouFeePlnFor(amount)
    : Math.round(fromSchedule);

  return {
    amount,
    months: payload.months,
    annualRate: payload.annualRate,
    monthlyPayment: payload.monthlyPayment,
    balloon: payload.balloon,
    interest: payload.totalInterest,
    investorCommission,
    investorCommissionPct: amount > 0 ? r2((investorCommission / amount) * 100) : 0,
    financeYouFee,
    financeYouFeePct: amount > 0 ? r2((financeYouFee / amount) * 100) : 0,
    financeYouFeeEstimated,
    investorProfit: r2(payload.totalInterest + investorCommission),
    totalToRepay: payload.totalToRepay,
  };
}
