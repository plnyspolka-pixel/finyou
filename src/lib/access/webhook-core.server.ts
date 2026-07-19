// Rdzeń obsługi webhooka Tpay dla płatności za dostęp.
//
// Zasady:
//  - nie ufamy danym z powiadomienia — transakcję pobieramy z API Tpay,
//  - crc/hiddenDescription zawiera wewnętrzny UUID access_payments (nowy
//    przepływ) albo legacy "userId|plan" (rozpoczęte wcześniej transakcje),
//  - przyznanie dostępu wykonuje atomowa, idempotentna funkcja SQL
//    `process_access_payment_paid` (blokada rekordu płatności i uprawnienia),
//  - faktura / zdarzenie afiliacyjne / e-maile są best-effort: ich awaria
//    nie cofa przyznanego dostępu (błąd trafia do access_payments).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { plnToGrosz } from "./core";

const db = supabaseAdmin as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function logWebhook(entry: {
  transactionId?: string | null;
  paymentId?: string | null;
  payload?: unknown;
  result: string;
  error?: string | null;
}): Promise<void> {
  try {
    await db.from("access_webhook_logs").insert({
      provider: "tpay",
      provider_transaction_id: entry.transactionId ?? null,
      payment_id: entry.paymentId ?? null,
      payload: entry.payload ?? null,
      result: entry.result,
      error: entry.error ?? null,
    });
  } catch (e) {
    console.error("[tpay-webhook] log failed", (e as Error).message);
  }
}

/** Post-processing po przyznaniu dostępu: faktura + afiliacja + e-maile.
 *  Każdy krok niezależnie best-effort; wywoływane też przez akcje admina. */
export async function runPaidPostProcessing(paymentId: string): Promise<void> {
  const { data: payment } = await db
    .from("access_payments")
    .select(
      "id,user_id,audience,buyer_email,buyer_type,paid_amount_grosz,expected_amount_grosz,granted_until,product_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return;

  const { data: product } = await db
    .from("access_products")
    .select("label")
    .eq("id", payment.product_id)
    .maybeSingle();
  const productLabel = product?.label ?? "Dostęp do platformy Finance You";
  const amountGrosz = Number(payment.paid_amount_grosz ?? payment.expected_amount_grosz);

  // 1) Potwierdzenie płatności e-mailem.
  if (payment.buyer_email) {
    try {
      const { sendPaymentConfirmedEmail } = await import("./emails.server");
      await sendPaymentConfirmedEmail({
        to: payment.buyer_email,
        productLabel,
        amountGrosz,
        grantedUntil: payment.granted_until,
        audience: payment.audience,
      });
    } catch (e) {
      console.error("[tpay-webhook] confirmation email failed", (e as Error).message);
    }
  }

  // 2) Automatyczna faktura (firma i osoba prywatna) + e-mail z fakturą.
  try {
    const { ensureInvoiceForAccessPayment, sendAccessInvoiceEmail } =
      await import("./invoice.server");
    const inv = await ensureInvoiceForAccessPayment(paymentId);
    if (inv.ok && inv.invoiceId && !inv.deduped) {
      try {
        await sendAccessInvoiceEmail(paymentId);
      } catch (e) {
        console.error("[tpay-webhook] invoice email failed", (e as Error).message);
      }
    }
  } catch (e) {
    console.error("[tpay-webhook] invoice failed", (e as Error).message);
  }

  // 3) Zdarzenie programu partnerskiego (unikalne po external_ref).
  try {
    const { createAffiliateEventForAccessPayment } = await import("./affiliate.server");
    await createAffiliateEventForAccessPayment(paymentId);
  } catch (e) {
    console.error("[tpay-webhook] affiliate event failed", (e as Error).message);
  }
}

/** Nowy przepływ: płatność z rejestru access_payments. */
async function handleAccessPayment(
  paymentId: string,
  tx: { transactionId: string; status: string; amount: number },
  payload: unknown,
): Promise<void> {
  const { data: payment } = await db
    .from("access_payments")
    .select("id,status,processed_at")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) {
    await logWebhook({ transactionId: tx.transactionId, payload, result: "payment_not_found" });
    return;
  }

  if (tx.status === "correct") {
    const paidGrosz = plnToGrosz(tx.amount);
    const { data: result, error } = await db.rpc("process_access_payment_paid", {
      _payment_id: paymentId,
      _paid_amount_grosz: paidGrosz,
      _provider_transaction_id: String(tx.transactionId),
    });
    if (error) {
      await logWebhook({
        transactionId: tx.transactionId,
        paymentId,
        payload,
        result: "rpc_error",
        error: error.message,
      });
      throw new Error(`process_access_payment_paid: ${error.message}`);
    }
    const res = (result ?? {}) as { ok?: boolean; alreadyProcessed?: boolean; reason?: string };
    if (!res.ok) {
      await logWebhook({
        transactionId: tx.transactionId,
        paymentId,
        payload,
        result: `rejected:${res.reason ?? "unknown"}`,
      });
      return;
    }
    if (res.alreadyProcessed) {
      await logWebhook({
        transactionId: tx.transactionId,
        paymentId,
        payload,
        result: "already_processed",
      });
      return;
    }
    await logWebhook({ transactionId: tx.transactionId, paymentId, payload, result: "paid" });
    await runPaidPostProcessing(paymentId);
    return;
  }

  // Zwrot / chargeback opłaconej płatności → korekta prowizji, bez
  // automatycznego cofania dostępu (decyzja administratora).
  if ((tx.status === "refund" || tx.status === "chargeback") && payment.status === "paid") {
    const newStatus = tx.status === "refund" ? "refunded" : "chargeback";
    await db
      .from("access_payments")
      .update({ status: newStatus, needs_review: true, failure_reason: `tpay_${tx.status}` })
      .eq("id", paymentId);
    try {
      const { clawbackAffiliateEventForAccessPayment } = await import("./affiliate.server");
      await clawbackAffiliateEventForAccessPayment(paymentId, newStatus, `Tpay ${tx.status}`);
    } catch (e) {
      console.error("[tpay-webhook] clawback failed", (e as Error).message);
    }
    await logWebhook({ transactionId: tx.transactionId, paymentId, payload, result: newStatus });
    return;
  }

  // Płatność nieukończona/odrzucona — oznacz, jeżeli nadal oczekuje.
  if (
    ["created", "pending"].includes(payment.status) &&
    ["error", "declined", "cancelled"].includes(tx.status)
  ) {
    await db
      .from("access_payments")
      .update({ status: "cancelled", failure_reason: `tpay_status:${tx.status}` })
      .eq("id", paymentId);
  }
  await logWebhook({
    transactionId: tx.transactionId,
    paymentId,
    payload,
    result: `status:${tx.status}`,
  });
}

/** Legacy: transakcje rozpoczęte przed wdrożeniem katalogu produktów
 *  (crc = "userId|planId"). Obsługiwane wyłącznie tu — nowych płatności dla
 *  starych planów nie można już tworzyć. */
async function handleLegacyPlanPayment(
  userId: string,
  planId: string,
  tx: { transactionId: string; status: string; amount: number },
  payload: unknown,
): Promise<void> {
  const { TPAY_PLANS } = await import("@/lib/payments.functions");
  const planCfg = (TPAY_PLANS as Record<string, { amount: number; days: number; label: string }>)[
    planId
  ];
  if (!planCfg) {
    await logWebhook({ transactionId: tx.transactionId, payload, result: "legacy_unknown_plan" });
    return;
  }
  if (tx.status !== "correct") {
    await logWebhook({
      transactionId: tx.transactionId,
      payload,
      result: `legacy_status:${tx.status}`,
    });
    return;
  }

  // Idempotencja legacy: jeżeli ta transakcja została już rozliczona w
  // access_payments (wpis backfill), nie przedłużaj ponownie.
  const { data: alreadyProcessed } = await db
    .from("access_payments")
    .select("id")
    .eq("provider", "tpay")
    .eq("provider_transaction_id", String(tx.transactionId))
    .eq("status", "paid")
    .maybeSingle();
  if (alreadyProcessed) {
    await logWebhook({
      transactionId: tx.transactionId,
      paymentId: alreadyProcessed.id,
      payload,
      result: "legacy_already_processed",
    });
    return;
  }

  // Rozliczenie legacy przechodzi przez ten sam atomowy mechanizm co nowe
  // płatności: tworzymy wpis w rejestrze i wywołujemy RPC.
  const { data: buyer } = await db
    .from("tpay_transaction_buyers")
    .select("*")
    .eq("transaction_id", String(tx.transactionId))
    .maybeSingle();

  // Legacy nie ma produktu w katalogu — wybieramy najbliższy aktywny produkt
  // inwestora o tej samej liczbie dni albo tworzymy wpis nieaktywnego produktu.
  let { data: product } = await db
    .from("access_products")
    .select("id")
    .eq("audience", "investor")
    .eq("duration_days", planCfg.days)
    .order("active", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!product) {
    const { data: createdProduct } = await db
      .from("access_products")
      .insert({
        code: `legacy_${planId}`,
        audience: "investor",
        label: planCfg.label,
        duration_days: planCfg.days,
        amount_grosz: Math.round(planCfg.amount * 100),
        active: false,
        sort_order: 999,
      })
      .select("id")
      .maybeSingle();
    product = createdProduct;
  }
  if (!product) {
    await logWebhook({ transactionId: tx.transactionId, payload, result: "legacy_no_product" });
    return;
  }

  const expectedGrosz = Math.round(planCfg.amount * 100);
  const { data: inserted, error: insErr } = await db
    .from("access_payments")
    .insert({
      provider: "tpay",
      provider_transaction_id: String(tx.transactionId),
      user_id: userId,
      product_id: product.id,
      audience: "investor",
      status: "pending",
      expected_amount_grosz: expectedGrosz,
      currency: "PLN",
      buyer_type: buyer?.buyer_type === "company" ? "company" : "person",
      buyer_name: buyer?.buyer_name ?? null,
      buyer_email: buyer?.buyer_email ?? null,
      buyer_nip: buyer?.buyer_nip ?? null,
      buyer_street: buyer?.buyer_address ?? null,
      buyer_postal_code: buyer?.buyer_postal_code ?? null,
      buyer_city: buyer?.buyer_city ?? null,
      buyer_country: buyer?.buyer_country ?? "PL",
      consents: { legacy: true },
    })
    .select("id")
    .maybeSingle();

  if (insErr || !inserted) {
    // Wyścig dwóch webhooków — drugi insert odbija się o unikalny indeks.
    const { data: existing } = await db
      .from("access_payments")
      .select("id")
      .eq("provider", "tpay")
      .eq("provider_transaction_id", String(tx.transactionId))
      .maybeSingle();
    if (!existing) {
      await logWebhook({
        transactionId: tx.transactionId,
        payload,
        result: "legacy_insert_failed",
        error: insErr?.message,
      });
      return;
    }
    await handleAccessPayment(existing.id, tx, payload);
    return;
  }

  await handleAccessPayment(inserted.id, tx, payload);
}

/** Główne wejście webhooka. Zwraca treść odpowiedzi dla Tpay. */
export async function handleTpayNotification(
  body: Record<string, string>,
): Promise<"TRUE" | "FALSE"> {
  const trId = body.tr_id || body.transactionId || body.id;
  if (!trId) {
    console.error("[tpay-webhook] missing transaction id", body);
    await logWebhook({ payload: body, result: "missing_transaction_id" });
    return "TRUE";
  }

  // Weryfikacja source-of-truth: pobieramy transakcję bezpośrednio z API Tpay.
  const { getTpayTransaction } = await import("@/lib/tpay.server");
  const tx = await getTpayTransaction(String(trId));

  const crc = String(tx.hiddenDescription ?? body.tr_crc ?? "").trim();

  if (UUID_RE.test(crc)) {
    await handleAccessPayment(
      crc,
      { transactionId: String(trId), status: tx.status, amount: Number(tx.amount) },
      body,
    );
    return "TRUE";
  }

  if (crc.includes("|")) {
    const [userId, planId] = crc.split("|");
    if (userId && planId) {
      await handleLegacyPlanPayment(
        userId,
        planId,
        { transactionId: String(trId), status: tx.status, amount: Number(tx.amount) },
        body,
      );
      return "TRUE";
    }
  }

  // Fallback: spróbuj dopasować po identyfikatorze transakcji.
  const { data: byTx } = await db
    .from("access_payments")
    .select("id")
    .eq("provider", "tpay")
    .eq("provider_transaction_id", String(trId))
    .maybeSingle();
  if (byTx) {
    await handleAccessPayment(
      byTx.id,
      { transactionId: String(trId), status: tx.status, amount: Number(tx.amount) },
      body,
    );
    return "TRUE";
  }

  console.error("[tpay-webhook] unrecognized crc", crc);
  await logWebhook({ transactionId: String(trId), payload: body, result: "unrecognized_crc" });
  return "TRUE";
}
