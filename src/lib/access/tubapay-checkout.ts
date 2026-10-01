// Pola i walidacja wyboru płatności w ratach TubaPay — wspólne dla checkoutu
// zalogowanego (createAccessCheckout) i zakupu bez konta
// (createGuestInvestorCheckout). Bez zależności serwerowych.
import { z } from "zod";

export const PAYMENT_METHODS = ["tpay", "tubapay"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TubapayCheckoutFields = {
  paymentMethod: z.enum(PAYMENT_METHODS).optional().default("tpay"),
  /** Wymagany dla TubaPay (umowa Klienta z TubaPay). */
  buyerPhone: z.string().trim().max(20).optional().nullable(),
  /** Liczba płatności miesięcznych wybrana z oferty TubaPay. */
  installments: z.number().int().min(1).max(60).optional().nullable(),
};

/** Polski numer komórkowy → 9 cyfr (bez +48/0048) albo null. */
export function normalizePlPhone(raw: string | null | undefined): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("48")) d = d.slice(2);
  else if (d.length === 13 && d.startsWith("0048")) d = d.slice(4);
  return /^\d{9}$/.test(d) ? d : null;
}

/**
 * Walidacja pól TubaPay. Zwraca komunikat błędu albo null; przy sukcesie
 * normalizuje `buyerPhone` do 9 cyfr (mutuje obiekt wejściowy).
 */
export function validateTubapayCheckout(data: {
  paymentMethod?: PaymentMethod;
  buyerType: string;
  buyerName: string;
  buyerPhone?: string | null;
  installments?: number | null;
  consents: { tubapay?: boolean };
}): string | null {
  if (data.paymentMethod !== "tubapay") return null;
  if (data.buyerType !== "person") {
    return "Płatność w ratach TubaPay jest dostępna wyłącznie dla osoby prywatnej.";
  }
  if (data.buyerName.trim().split(/\s+/).filter(Boolean).length < 2) {
    return "Do płatności TubaPay podaj imię i nazwisko.";
  }
  const phone = normalizePlPhone(data.buyerPhone);
  if (!phone) return "Podaj numer telefonu komórkowego (9 cyfr) — wymaga go TubaPay.";
  if (!data.installments) return "Wybierz liczbę płatności miesięcznych TubaPay.";
  if (!data.consents.tubapay) {
    return "Wyraź zgodę na przekazanie danych TubaPay, aby zapłacić w ratach.";
  }
  data.buyerPhone = phone;
  return null;
}
