// Wspólny krok obu checkoutów (zalogowany i bez konta): rekord płatności
// w access_payments (status 'created', snapshot nabywcy i zgód) + transakcja
// w Tpay albo umowa płatności podzielonej w TubaPay. Bramka dostaje
// wewnętrzny UUID płatności (Tpay: crc/hiddenDescription, TubaPay:
// externalRef) — webhook czyta wszystko z bazy, nie z przeglądarki.
import { groszToPln, normalizeNip, type AccessAudience, type BuyerType } from "./core";

export interface StartPaymentBuyer {
  buyerType: BuyerType;
  buyerName: string;
  buyerEmail: string;
  buyerNip?: string | null;
  buyerStreet: string;
  buyerPostalCode: string;
  buyerCity: string;
  buyerCountry?: string;
}

export type StartPaymentResult =
  | { ok: true; paymentUrl: string; paymentId: string; transactionId: string }
  | { ok: false; error: string; code?: string };

export interface StartPaymentOptions {
  db: any;
  /** null — zakup bez konta (konto zakłada webhook po wpłacie). */
  userId: string | null;
  product: { id: string; label: string; amount_grosz: number; currency?: string | null };
  audience: AccessAudience;
  buyer: StartPaymentBuyer;
  consents: Record<string, unknown>;
  unlockMatchId?: string | null;
  /** Ścieżka powrotu (bez domeny); dopinamy ?tpay=success|error&payment=<id>. */
  returnPath: string;
}

async function insertPaymentRecord(
  opts: StartPaymentOptions,
  provider: "tpay" | "tubapay",
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string; code?: string }> {
  const { db, buyer } = opts;
  const { data: payment, error: insErr } = await db
    .from("access_payments")
    .insert({
      provider,
      user_id: opts.userId,
      product_id: opts.product.id,
      audience: opts.audience,
      status: "created",
      expected_amount_grosz: opts.product.amount_grosz,
      currency: opts.product.currency ?? "PLN",
      buyer_type: buyer.buyerType,
      buyer_name: buyer.buyerName.trim(),
      buyer_email: buyer.buyerEmail.trim(),
      buyer_nip: buyer.buyerType === "company" ? normalizeNip(buyer.buyerNip ?? "") : null,
      buyer_street: buyer.buyerStreet.trim(),
      buyer_postal_code: buyer.buyerPostalCode.trim(),
      buyer_city: buyer.buyerCity.trim(),
      buyer_country: (buyer.buyerCountry || "PL").toUpperCase(),
      unlock_match_id: opts.unlockMatchId ?? null,
      consents: opts.consents,
    })
    .select("id")
    .single();
  if (insErr || !payment) {
    console.error("[access-checkout] insert payment failed", insErr?.message);
    return {
      ok: false,
      code: (insErr as { code?: string } | null)?.code,
      error: "Nie udało się rozpocząć płatności. Spróbuj ponownie.",
    };
  }
  return { ok: true, paymentId: payment.id as string };
}

export async function startTpayPayment(opts: StartPaymentOptions): Promise<StartPaymentResult> {
  const { db, buyer } = opts;
  const inserted = await insertPaymentRecord(opts, "tpay");
  if (!inserted.ok) return inserted;
  const paymentId = inserted.paymentId;

  const { resolveAppBaseUrl } = await import("./urls.server");
  const base = resolveAppBaseUrl();
  const sep = opts.returnPath.includes("?") ? "&" : "?";
  const successUrl = `${base}${opts.returnPath}${sep}tpay=success&payment=${paymentId}`;
  const errorUrl = `${base}${opts.returnPath}${sep}tpay=error&payment=${paymentId}`;
  const notifyUrl = `${base}/api/public/payments/tpay-webhook`;

  const { createTpayTransaction } = await import("@/lib/tpay.server");
  let tx;
  try {
    tx = await createTpayTransaction({
      amount: groszToPln(opts.product.amount_grosz),
      description: opts.product.label,
      email: buyer.buyerEmail.trim(),
      name: buyer.buyerName.trim(),
      crc: paymentId,
      notifyUrl,
      successUrl,
      errorUrl,
    });
  } catch (e) {
    await db
      .from("access_payments")
      .update({
        status: "failed",
        failure_reason: `tpay_create_failed: ${(e as Error).message}`,
      })
      .eq("id", paymentId);
    console.error("[access-checkout] tpay create failed", (e as Error).message);
    return {
      ok: false,
      error: "Nie udało się połączyć z bramką płatności Tpay. Spróbuj ponownie za chwilę.",
    };
  }

  await db
    .from("access_payments")
    .update({ provider_transaction_id: String(tx.transactionId), status: "pending" })
    .eq("id", paymentId);

  return {
    ok: true,
    paymentUrl: tx.transactionPaymentUrl,
    paymentId,
    transactionId: String(tx.transactionId),
  };
}

/** Dane, których TubaPay wymaga do umowy Klienta (poza danymi nabywcy). */
export interface TubapayPaymentExtras {
  /** 9 cyfr, znormalizowany. */
  phone: string;
  installments: number;
}

/** Identyfikator transakcji TubaPay w access_payments — znany od razu,
 *  unikalny (UUID płatności); numer umowy TubaPay trafia do logu webhooka. */
export function tubapayTransactionId(paymentId: string): string {
  return `tubapay-${paymentId}`;
}

export async function startTubapayPayment(
  opts: StartPaymentOptions & { tubapay: TubapayPaymentExtras },
): Promise<StartPaymentResult> {
  const { db, buyer } = opts;
  if (buyer.buyerType !== "person") {
    return {
      ok: false,
      error: "Płatność w ratach TubaPay jest dostępna wyłącznie dla osoby prywatnej.",
    };
  }
  const tp = await import("@/lib/tubapay.server");
  const { firstName, lastName } = tp.splitFullName(buyer.buyerName);
  if (!firstName || !lastName) {
    return { ok: false, error: "Do płatności TubaPay podaj imię i nazwisko." };
  }

  const inserted = await insertPaymentRecord(opts, "tubapay");
  if (!inserted.ok) return inserted;
  const paymentId = inserted.paymentId;
  const transactionId = tubapayTransactionId(paymentId);

  const { resolveAppBaseUrl } = await import("./urls.server");
  const base = resolveAppBaseUrl();
  const sep = opts.returnPath.includes("?") ? "&" : "?";
  const returnUrl = `${base}${opts.returnPath}${sep}tpay=success&payment=${paymentId}`;
  const sig = await tp.signTubapayCallback(paymentId);
  const callbackUrl = `${base}/api/public/payments/tubapay-webhook?payment=${paymentId}&sig=${sig}`;

  try {
    const tx = await tp.createTubapayTransaction({
      customer: {
        firstName,
        lastName,
        street: buyer.buyerStreet.trim(),
        zipCode: buyer.buyerPostalCode.trim(),
        town: buyer.buyerCity.trim(),
        phone: opts.tubapay.phone,
        email: buyer.buyerEmail.trim(),
      },
      itemName: opts.product.label,
      brand: "Finance You",
      amountPln: groszToPln(opts.product.amount_grosz),
      installments: opts.tubapay.installments,
      externalRef: paymentId,
      callbackUrl,
      returnUrl,
      rodoConsent: true,
    });
    await db
      .from("access_payments")
      .update({ provider_transaction_id: transactionId, status: "pending" })
      .eq("id", paymentId);
    return { ok: true, paymentUrl: tx.transactionLink, paymentId, transactionId };
  } catch (e) {
    await db
      .from("access_payments")
      .update({
        status: "failed",
        failure_reason: `tubapay_create_failed: ${(e as Error).message}`.slice(0, 1000),
      })
      .eq("id", paymentId);
    console.error("[access-checkout] tubapay create failed", (e as Error).message);
    return {
      ok: false,
      error: "Nie udało się połączyć z TubaPay. Spróbuj ponownie za chwilę albo zapłać przez Tpay.",
    };
  }
}
