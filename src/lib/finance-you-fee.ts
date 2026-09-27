// ════════════════════════════════════════════════════════════════════
// PROWIZJA FINANCE YOU od pożyczki — jedno źródło prawdy dla kalkulatora
// inwestora i widoków, które odtwarzają ją dla zapisanych ofert.
//
// Skala liniowa od 10% (przy 20 000 zł) do 4% (przy 1 000 000 zł) kwoty
// pożyczki, krok 0,1 p.p. To koszt POŻYCZKOBIORCY (dostaje na nią fakturę
// VAT od Finance You), rozłożony na raty razem z prowizją inwestora —
// dla inwestora jest przelotowa (wykłada ją na starcie, wraca w ratach).
// ════════════════════════════════════════════════════════════════════

export const FINANCE_YOU_FEE_MIN_AMOUNT_PLN = 20_000;
export const FINANCE_YOU_FEE_MAX_AMOUNT_PLN = 1_000_000;
export const FINANCE_YOU_FEE_MAX_PCT = 10;
export const FINANCE_YOU_FEE_MIN_PCT = 4;

/** Procent prowizji Finance You dla kwoty pożyczki (zaokrąglony do 0,1 p.p.). */
export function financeYouFeePctFor(amountPln: number): number {
  const amt = Number(amountPln);
  if (!Number.isFinite(amt)) return FINANCE_YOU_FEE_MAX_PCT;
  const span = FINANCE_YOU_FEE_MAX_AMOUNT_PLN - FINANCE_YOU_FEE_MIN_AMOUNT_PLN;
  const t = Math.min(1, Math.max(0, (amt - FINANCE_YOU_FEE_MIN_AMOUNT_PLN) / span));
  const pct = FINANCE_YOU_FEE_MAX_PCT - t * (FINANCE_YOU_FEE_MAX_PCT - FINANCE_YOU_FEE_MIN_PCT);
  return Math.round(pct * 10) / 10;
}

/** Prowizja Finance You w złotych dla kwoty pożyczki (pełne złote). */
export function financeYouFeePlnFor(amountPln: number): number {
  const amt = Number(amountPln);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  return Math.round((amt * financeYouFeePctFor(amt)) / 100);
}
