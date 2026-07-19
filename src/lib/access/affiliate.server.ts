// Zdarzenia programu partnerskiego po potwierdzonej płatności Tpay.
// Powstają wyłącznie, gdy użytkownik ma zapisanego aktywnego partnera
// polecającego (profiles.referred_by_partner_id). Unikalność external_ref
// (`tpay:<transaction_id>`) gwarantuje jednorazowe naliczenie prowizji.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groszToPln } from "./core";

const db = supabaseAdmin as unknown as SupabaseClient;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function createAffiliateEventForAccessPayment(
  paymentId: string,
): Promise<{ ok: boolean; eventId?: string; skipped?: string }> {
  const { data: payment } = await (db.from("access_payments") as any)
    .select(
      "id,user_id,audience,status,paid_amount_grosz,expected_amount_grosz,provider_transaction_id,product_id,processed_at,affiliate_event_id,currency",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false, skipped: "payment_not_found" };
  if (payment.status !== "paid") return { ok: false, skipped: "payment_not_paid" };
  if (payment.affiliate_event_id)
    return { ok: true, eventId: payment.affiliate_event_id, skipped: "already_linked" };

  const { data: profile } = await (db.from("profiles") as any)
    .select("referred_by_partner_id")
    .eq("user_id", payment.user_id)
    .maybeSingle();
  const partnerId = profile?.referred_by_partner_id as string | null | undefined;
  if (!partnerId) return { ok: true, skipped: "no_referring_partner" };

  const { data: partner } = await (db.from("affiliate_partners") as any)
    .select("id,status")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner || partner.status !== "active") return { ok: true, skipped: "partner_not_active" };

  const gross = groszToPln(Number(payment.paid_amount_grosz ?? payment.expected_amount_grosz));
  const net = round2(gross / 1.23);
  const externalRef = payment.provider_transaction_id
    ? `tpay:${payment.provider_transaction_id}`
    : `access:${payment.id}`;
  const eventType =
    payment.audience === "investor" ? "investor_account_paid" : "broker_account_paid";

  try {
    const { createCommissionEvent } = await import("@/lib/affiliate/engine");
    const res = await createCommissionEvent(db, {
      eventType: eventType as any,
      sourceEntityType: "access_payment",
      sourceEntityId: payment.id,
      directPartnerId: partner.id,
      grossPaymentAmount: gross,
      netRevenueAmount: net,
      paymentId: payment.id,
      productId: payment.product_id,
      paidAccountId: payment.user_id,
      externalRef,
      currency: payment.currency ?? "PLN",
      occurredAt: payment.processed_at ?? new Date(),
    });
    await (db.from("access_payments") as any)
      .update({ affiliate_event_id: res.eventId })
      .eq("id", paymentId);
    return { ok: true, eventId: res.eventId };
  } catch (e) {
    // Konflikt unikalności external_ref = zdarzenie już istnieje (idempotencja).
    const msg = (e as Error).message ?? "";
    if (/uq_affiliate_events_external|duplicate key/i.test(msg)) {
      const { data: existing } = await (db.from("affiliate_commission_events") as any)
        .select("id")
        .eq("event_type", eventType)
        .eq("external_ref", externalRef)
        .maybeSingle();
      if (existing?.id) {
        await (db.from("access_payments") as any)
          .update({ affiliate_event_id: existing.id })
          .eq("id", paymentId);
        return { ok: true, eventId: existing.id, skipped: "deduped" };
      }
    }
    console.error("[access-affiliate] event failed", msg);
    return { ok: false, skipped: msg };
  }
}

/** Zwrot / chargeback → istniejący mechanizm korekty (clawback prowizji). */
export async function clawbackAffiliateEventForAccessPayment(
  paymentId: string,
  status: "refunded" | "chargeback",
  reason: string,
): Promise<void> {
  const { data: payment } = await (db.from("access_payments") as any)
    .select("affiliate_event_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment?.affiliate_event_id) return;
  const { setEventStatus } = await import("@/lib/affiliate/engine");
  await setEventStatus(db, {
    eventId: payment.affiliate_event_id,
    status,
    reason,
    actorRole: "system",
  });
}
