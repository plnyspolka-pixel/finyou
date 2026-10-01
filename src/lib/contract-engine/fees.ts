/**
 * OPŁATY I LIMITY — jedno źródło prawdy dla całego systemu (decyzje nadrzędne
 * 2, 5 i 6 sprzątania spójności 2026-09).
 *
 *  • Prowizja od Pożyczkobiorcy: 5 % Kwoty Udzielonej (kwota pożyczki
 *    z umowy), nie mniej niż 5 000 zł, bez VAT (zwolnienie potwierdzone przez
 *    właściciela 2026-09-29; w tekstach NIE piszemy „netto"/„brutto", piszemy
 *    „bez VAT"). POTRĄCANA z wypłaty: inwestor przelewa prowizję na jedyny
 *    rachunek FY (ten sam co do spłat — src/lib/company.ts), resztę
 *    Klientowi. Przykład: 100 000 zł → 5 000 zł do FY, 95 000 zł na rękę.
 *    To osobne pole od prowizji INWESTORA (KWO_02 — stała kwota z umowy,
 *    rozłożona równo w ratach).
 *  • Odsetki maksymalne (art. 359 § 2¹ KC): 2 × (stopa referencyjna NBP +
 *    3,5 p.p.); odsetki maksymalne za opóźnienie (art. 481 § 2¹ KC):
 *    2 × (stopa referencyjna NBP + 5,5 p.p.). Tabela z datą obowiązywania —
 *    JEDYNE miejsce do aktualizacji po decyzji RPP.
 *  • LTV: jeden limit 60 % w całym systemie.
 *
 * Czyste funkcje, bez I/O. Import po obu stronach (klient + serwer + MCP).
 */

export const FY_COMMISSION_PCT = 5;
export const FY_COMMISSION_MIN_PLN = 5000;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Prowizja od Pożyczkobiorcy od Kwoty Udzielonej: max(5 %, 5 000 zł); 0 gdy brak kwoty. */
export function fyCommission(kwotaUdzielona: number): number {
  const k = Number(kwotaUdzielona);
  if (!Number.isFinite(k) || k <= 0) return 0;
  return Math.max(round2((k * FY_COMMISSION_PCT) / 100), FY_COMMISSION_MIN_PLN);
}

/** Kwota wypłacana Klientowi „na rękę" = Kwota Udzielona − prowizja FY (nie mniej niż 0). */
export function kwotaNaReke(kwotaUdzielona: number): number {
  const k = Number(kwotaUdzielona);
  if (!Number.isFinite(k) || k <= 0) return 0;
  return round2(Math.max(0, k - fyCommission(k)));
}

/** Rozbicie wypłaty na dwie części przelewu (Zał. 6): do FY i do Klienta. */
export function splitPayout(kwotaUdzielona: number): {
  kwotaUdzielona: number;
  prowizjaFY: number;
  kwotaWyplaconaKlientowi: number;
} {
  const k = round2(Math.max(0, Number(kwotaUdzielona) || 0));
  const fee = fyCommission(k);
  return {
    kwotaUdzielona: k,
    prowizjaFY: fee,
    kwotaWyplaconaKlientowi: round2(Math.max(0, k - fee)),
  };
}

export const FY_COMMISSION_LABEL = `Prowizja Finance You (${FY_COMMISSION_PCT} %, min ${FY_COMMISSION_MIN_PLN.toLocaleString("pl-PL")} zł, bez VAT)`;

// ── Odsetki maksymalne ─────────────────────────────────────────────────────

export interface MaxInterestEntry {
  /** Data obowiązywania (od), ISO YYYY-MM-DD — dzień po decyzji RPP. */
  from: string;
  /** Odsetki maksymalne kapitałowe, % rocznie (art. 359 § 2¹ KC). */
  capital: number;
  /** Odsetki maksymalne za opóźnienie, % rocznie (art. 481 § 2¹ KC). */
  delay: number;
}

/**
 * Tabela stóp od najnowszej. Wartość = 2 × (stopa ref. NBP + 3,5 / 5,5 p.p.).
 * Aktualizacja: dopisać wpis na górze po decyzji RPP.
 */
export const MAX_INTEREST_TABLE: readonly MaxInterestEntry[] = [
  { from: "2026-03-05", capital: 14.5, delay: 18.5 }, // ref. 3,75 %
  { from: "2025-12-04", capital: 15, delay: 19 }, // ref. 4,00 %
  { from: "2025-11-06", capital: 15.5, delay: 19.5 }, // ref. 4,25 %
  { from: "2025-10-09", capital: 16, delay: 20 }, // ref. 4,50 %
  { from: "2025-09-04", capital: 16.5, delay: 20.5 }, // ref. 4,75 %
  { from: "2025-07-03", capital: 17, delay: 21 }, // ref. 5,00 %
  { from: "2025-05-08", capital: 17.5, delay: 21.5 }, // ref. 5,25 %
  { from: "2023-10-05", capital: 18.5, delay: 22.5 }, // ref. 5,75 %
  { from: "2023-09-07", capital: 19, delay: 23 }, // ref. 6,00 %
  { from: "2022-09-08", capital: 20.5, delay: 24.5 }, // ref. 6,75 %
] as const;

function toIsoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Wpis tabeli obowiązujący w danym dniu (domyślnie dziś). */
export function maxInterestAt(date: Date | string = new Date()): MaxInterestEntry {
  const iso = toIsoDate(date);
  for (const e of MAX_INTEREST_TABLE) if (e.from <= iso) return e;
  return MAX_INTEREST_TABLE[MAX_INTEREST_TABLE.length - 1];
}

/** Odsetki maksymalne kapitałowe (% rocznie) w danym dniu — dziś 14,5 %. */
export function maxCapitalRate(date: Date | string = new Date()): number {
  return maxInterestAt(date).capital;
}

/** Odsetki maksymalne za opóźnienie (% rocznie) w danym dniu — dziś 18,5 %. */
export function maxDelayRate(date: Date | string = new Date()): number {
  return maxInterestAt(date).delay;
}

/** Czy stopa roczna (%) przekracza odsetki maksymalne kapitałowe. Tolerancja 1e-9. */
export function rateExceedsMax(
  annualRatePercent: number,
  date: Date | string = new Date(),
): boolean {
  const r = Number(annualRatePercent);
  if (!Number.isFinite(r)) return false;
  return r > maxCapitalRate(date) + 1e-9;
}

export function formatRatePl(rate: number): string {
  return rate.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/** Komunikat blokujący — jedno brzmienie we wszystkich kalkulatorach. */
export function maxRateMessage(date: Date | string = new Date()): string {
  return `Oprocentowanie przekracza odsetki maksymalne (${formatRatePl(maxCapitalRate(date))}%)`;
}

/** Waliduje stopę; zwraca komunikat błędu albo null. */
export function validateAnnualRate(
  annualRatePercent: number,
  date: Date | string = new Date(),
): string | null {
  return rateExceedsMax(annualRatePercent, date) ? maxRateMessage(date) : null;
}

// ── LTV ────────────────────────────────────────────────────────────────────

/** Jeden limit LTV w całym systemie. */
export const LTV_MAX = 60;

/** LTV w % = (kwota + istniejące obciążenia) / wartość × 100; null gdy brak wartości. */
export function ltvPercent(
  loanAmount: number,
  propertyValue: number,
  existingEncumbrances = 0,
): number | null {
  const v = Number(propertyValue);
  const a = Number(loanAmount) + (Number(existingEncumbrances) || 0);
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(a)) return null;
  return round2((a / v) * 100);
}

export function ltvWithinLimit(ltv: number | null, limit: number = LTV_MAX): boolean {
  return ltv != null && ltv <= limit + 1e-9;
}

/** Maksymalna kwota pożyczki przy limicie LTV i istniejących obciążeniach. */
export function maxLoanAtLtv(
  propertyValue: number,
  existingEncumbrances = 0,
  limit: number = LTV_MAX,
): number {
  const v = Number(propertyValue);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return round2(Math.max(0, (v * limit) / 100 - (Number(existingEncumbrances) || 0)));
}
