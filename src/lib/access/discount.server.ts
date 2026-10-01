// Kody rabatowe po stronie serwera: sekret podpisu, data ważności i sprawdzenie, czy kod
// nie został już wykorzystany w zaksięgowanej płatności.
//
// Sekret: DISCOUNT_CODE_SECRET (zalecany). Bez niego używamy klucza
// SUPABASE_SERVICE_ROLE_KEY — wtedy rotacja tego klucza unieważnia
// wszystkie wcześniej wysłane kody.
import { formatValidUntil, isDiscountCodeActive, verifyDiscountCode } from "./discount-code";

export function getDiscountSecret(): string {
  return process.env.DISCOUNT_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export type DiscountResolution =
  | { ok: true; code: string; pct: number; validUntil: string }
  | { ok: false; error: string };

/** Weryfikuje kod (podpis + data ważności + jednorazowość).
 *  Pusty kod → null (bez rabatu). */
export async function resolveDiscountCode(
  db: any,
  raw: string | null | undefined,
): Promise<DiscountResolution | null> {
  if (!raw || !raw.trim()) return null;
  const parsed = await verifyDiscountCode(raw, getDiscountSecret());
  if (!parsed) return { ok: false, error: "Nieprawidłowy kod rabatowy." };
  if (!isDiscountCodeActive(parsed)) {
    return {
      ok: false,
      error: `Kod rabatowy wygasł — był ważny do ${formatValidUntil(parsed.validUntil)}.`,
    };
  }
  const { count } = await db
    .from("access_payments")
    .select("id", { count: "exact", head: true })
    .eq("discount_code", parsed.code)
    .eq("status", "paid");
  if ((count ?? 0) > 0) return { ok: false, error: "Ten kod rabatowy został już wykorzystany." };
  return { ok: true, code: parsed.code, pct: parsed.pct, validUntil: parsed.validUntil };
}
