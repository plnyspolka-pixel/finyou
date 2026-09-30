// Czysta reguła: co zrobić z już rozpoczętą (created/pending) płatnością za
// tę samą okazję, gdy inwestor próbuje zapłacić ponownie.
//
// Powód: wcześniej KAŻDA niedokończona płatność (zamknięta strona Tpay,
// anulowanie, przelew, który nigdy nie doszedł) blokowała okazję na zawsze —
// status 'pending' nigdy nie wygasał, a Tpay nie zawsze przysyła powiadomienie
// o porzuconej transakcji. Teraz blokujemy tylko płatność świeżą albo już
// opłaconą w Tpay; porzucona jest anulowana i można zacząć nową.

/** Po tylu minutach porzucona (nieopłacona) płatność przestaje blokować okazję. */
export const PENDING_UNLOCK_STALE_MINUTES = 15;
/** Rekord bez transakcji Tpay (status 'created') — równoległe żądanie albo awaria. */
export const CREATED_UNLOCK_STALE_MINUTES = 2;

/** Statusy transakcji Tpay oznaczające, że pieniądze wpłynęły. */
const TPAY_PAID_STATUSES = new Set(["correct", "paid"]);
/** Statusy transakcji Tpay oznaczające, że transakcja nie zostanie już opłacona. */
const TPAY_DEAD_STATUSES = new Set(["error", "declined", "cancelled", "canceled", "expired"]);

export type InFlightDecision =
  /** Zapłacona w Tpay (czeka na webhook) — nowa płatność byłaby podwójna. */
  | { action: "block_paid" }
  /** Świeża, wciąż możliwa do dokończenia — blokujemy, podając czas do wygaśnięcia. */
  | { action: "block_fresh"; minutesLeft: number }
  /** Porzucona / odrzucona — anuluj rekord i pozwól rozpocząć nową. */
  | { action: "cancel"; reason: string };

export function decideInFlightUnlockPayment(input: {
  status: string;
  createdAt: string | Date;
  hasProviderTransaction: boolean;
  /** Status transakcji w Tpay; `null`/`undefined`, gdy nie udało się go pobrać. */
  tpayStatus?: string | null;
  now?: Date;
}): InFlightDecision {
  const now = input.now ?? new Date();
  const created = new Date(input.createdAt).getTime();
  const ageMin = Number.isFinite(created) ? (now.getTime() - created) / 60_000 : Infinity;
  const tpay = input.tpayStatus ? String(input.tpayStatus).toLowerCase() : null;

  if (tpay && TPAY_PAID_STATUSES.has(tpay)) return { action: "block_paid" };
  if (tpay && TPAY_DEAD_STATUSES.has(tpay)) return { action: "cancel", reason: `tpay_status:${tpay}` };

  const window =
    input.status === "created" && !input.hasProviderTransaction
      ? CREATED_UNLOCK_STALE_MINUTES
      : PENDING_UNLOCK_STALE_MINUTES;
  if (ageMin >= window) {
    return { action: "cancel", reason: `stale_unpaid_after_${window}min` };
  }
  return { action: "block_fresh", minutesLeft: Math.max(1, Math.ceil(window - ageMin)) };
}
