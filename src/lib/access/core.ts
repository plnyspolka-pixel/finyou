// Czysta logika systemu płatnego dostępu (bez zależności od bazy) —
// współdzielona przez klienta, serwer i testy.

export type AccessAudience = "investor" | "broker";
export type BuyerType = "person" | "company";

export type AccessPaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "chargeback";

export interface AccessProduct {
  id: string;
  code: string;
  audience: AccessAudience;
  label: string;
  duration_days: number;
  amount_grosz: number;
  currency: string;
  active: boolean;
  sort_order: number;
}

/** Stare identyfikatory planów — obsługiwane wyłącznie przez webhook dla
 *  rozpoczętych wcześniej transakcji. Nowe płatności są zablokowane. */
export const LEGACY_PLAN_IDS = [
  "investor_access_1d",
  "investor_access_1m",
  "investor_access_1y",
] as const;

export function isLegacyPlanId(code: string): boolean {
  return (LEGACY_PLAN_IDS as readonly string[]).includes(code);
}

/** Kwota w groszach → tekst "999 zł" / "5 999 zł" (brutto, PLN). */
export function formatGroszPln(amountGrosz: number): string {
  const zl = Math.floor(amountGrosz / 100);
  const gr = Math.round(amountGrosz % 100);
  // Grupowanie tysięcy ręcznie (zwykła spacja) — niezależnie od ICU w runtime.
  const zlText = String(zl).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return gr === 0 ? `${zlText} zł` : `${zlText},${String(gr).padStart(2, "0")} zł`;
}

/** Kwota w groszach → liczba PLN dla API Tpay (np. 99900 → 999.00). */
export function groszToPln(amountGrosz: number): number {
  return Math.round(amountGrosz) / 100;
}

/** Kwota PLN raportowana przez Tpay → grosze (bez błędów zmiennoprzecinkowych). */
export function plnToGrosz(amountPln: number): number {
  return Math.round(Number(amountPln) * 100);
}

/** Walidacja NIP (10 cyfr + suma kontrolna). Akceptuje separatory i prefiks PL. */
export function isValidNip(raw: string): boolean {
  const nip = String(raw ?? "")
    .replace(/^PL/i, "")
    .replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  const control = sum % 11;
  if (control === 10) return false;
  return control === Number(nip[9]);
}

export function normalizeNip(raw: string): string {
  return String(raw ?? "")
    .replace(/^PL/i, "")
    .replace(/[\s-]/g, "");
}

/** Walidacja kodu pocztowego PL (00-000). */
export function isValidPostalCode(raw: string): boolean {
  return /^\d{2}-\d{3}$/.test(String(raw ?? "").trim());
}

/**
 * Wyliczenie okresu przyznanego dostępu (wszystko w UTC):
 *  - dostęp aktywny → liczymy od bieżącego `activeUntil`,
 *  - brak/wygasły → liczymy od `now`.
 * Odpowiednik logiki w SQL `process_access_payment_paid` — używany w testach
 * i w UI do podglądu.
 */
export function computeGrantWindow(
  now: Date,
  currentActiveUntil: Date | null | undefined,
  durationDays: number,
): { grantedFrom: Date; grantedUntil: Date } {
  const base =
    currentActiveUntil && currentActiveUntil.getTime() > now.getTime() ? currentActiveUntil : now;
  const grantedFrom = new Date(base.getTime());
  const grantedUntil = new Date(grantedFrom.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return { grantedFrom, grantedUntil };
}

/** Ile pełnych dni dostępu pozostało (zaokrąglenie w górę, min 0). */
export function daysLeft(now: Date, activeUntil: Date | null | undefined): number {
  if (!activeUntil) return 0;
  const ms = activeUntil.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Data w strefie Europe/Warsaw do prezentacji użytkownikowi. */
export function formatWarsawDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

/** Oszczędność pakietu rocznego względem 12 zakupów miesięcznych (w groszach). */
export function yearlySavingsGrosz(monthlyGrosz: number, yearlyGrosz: number): number {
  return Math.max(0, monthlyGrosz * 12 - yearlyGrosz);
}

export interface BuyerInputFields {
  buyerType: BuyerType;
  buyerName: string;
  buyerEmail: string;
  buyerNip?: string | null;
  buyerStreet: string;
  buyerPostalCode: string;
  buyerCity: string;
  buyerCountry?: string | null;
}

/** Walidacja danych nabywcy — wspólna dla klienta i serwera.
 *  Zwraca listę błędów (pusta = OK). */
export function validateBuyer(input: BuyerInputFields): string[] {
  const errors: string[] = [];
  const req = (v: string | null | undefined, label: string) => {
    if (!v || !String(v).trim()) errors.push(label);
  };
  if (input.buyerType !== "person" && input.buyerType !== "company") {
    errors.push("Nieprawidłowy typ nabywcy");
    return errors;
  }
  req(
    input.buyerName,
    input.buyerType === "company" ? "Podaj pełną nazwę firmy" : "Podaj imię i nazwisko",
  );
  req(input.buyerEmail, "Podaj adres e-mail");
  if (input.buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.buyerEmail.trim())) {
    errors.push("Nieprawidłowy adres e-mail");
  }
  req(input.buyerStreet, "Podaj ulicę i numer");
  req(input.buyerPostalCode, "Podaj kod pocztowy");
  if (input.buyerPostalCode && !isValidPostalCode(input.buyerPostalCode)) {
    errors.push("Nieprawidłowy kod pocztowy (format 00-000)");
  }
  req(input.buyerCity, "Podaj miejscowość");
  if (input.buyerType === "company") {
    if (!input.buyerNip || !String(input.buyerNip).trim()) {
      errors.push("Podaj NIP");
    } else if (!isValidNip(input.buyerNip)) {
      errors.push("Nieprawidłowy NIP");
    }
  }
  return errors;
}
