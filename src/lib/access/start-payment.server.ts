// Wspólny krok obu checkoutów (zalogowany i bez konta): rekord płatności
// w access_payments (status 'created', snapshot nabywcy i zgód) + transakcja
// w Tpay. W crc/hiddenDescription zapisujemy wewnętrzny UUID płatności —
// webhook czyta wszystko z bazy, nie z przeglądarki.
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

export async function startTpayPayment(opts: {
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
}): Promise<StartPaymentResult> {
  const { db, buyer } = opts;
  const { data: payment, error: insErr } = await db
    .from("access_payments")
    .insert({
      provider: "tpay",
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
  const paymentId = payment.id as string;

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
