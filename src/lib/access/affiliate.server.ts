// Zdarzenia programu partnerskiego po potwierdzonej płatności Tpay —
// wyłącznie abonament inwestora poleconego przez konto partnera.
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
      "id,user_id,audience,status,paid_amount_grosz,expected_amount_grosz,provider,provider_transaction_id,product_id,unlock_match_id,processed_at,created_at,affiliate_event_id,currency",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false, skipped: "payment_not_found" };
  if (payment.status !== "paid") return { ok: false, skipped: "payment_not_paid" };
  if (payment.affiliate_event_id)
    return { ok: true, eventId: payment.affiliate_event_id, skipped: "already_linked" };
  // Partner zarabia wyłącznie na abonamencie inwestora — nie na kontach
  // pośredników ani zakupach pojedynczych okazji.
  if (payment.audience !== "investor") return { ok: true, skipped: "not_investor_subscription" };
  if (payment.unlock_match_id) return { ok: true, skipped: "not_investor_subscription" };

  const { data: profile } = await (db.from("profiles") as any)
    .select("referred_by_partner_id")
    .eq("user_id", payment.user_id)
    .maybeSingle();
  const partnerId = profile?.referred_by_partner_id as string | null | undefined;
  if (!partnerId) return { ok: true, skipped: "no_referring_partner" };

  const { data: partner } = await (db.from("affiliate_partners") as any)
    .select("id,status,partner_kind")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner || partner.status !== "active") return { ok: true, skipped: "partner_not_active" };
  // Za inwestorów płacimy wyłącznie kontom programu partnerskiego — pośrednik
  // zarabia tylko na uruchomionych pożyczkach swoich klientów.
  if ((partner.partner_kind ?? "partner") !== "partner") {
    return { ok: true, skipped: "not_partner_program" };
  }

  // Prowizja za inwestora tylko za NOWEGO inwestora — przy jego pierwszym
  // opłaconym dostępie. Odnowienia i kolejne zakupy nie dają prowizji.
  if (!(await isFirstInvestorPurchase(payment))) {
    return { ok: true, skipped: "not_first_investor_purchase" };
  }

  const gross = groszToPln(Number(payment.paid_amount_grosz ?? payment.expected_amount_grosz));
  const net = round2(gross / 1.23);
  // Tpay: `tpay:<transactionId>` (bez zmian względem historycznych zdarzeń);
  // TubaPay: `tubapay:tubapay-<paymentId>`.
  const externalRef = payment.provider_transaction_id
    ? `${payment.provider ?? "tpay"}:${payment.provider_transaction_id}`
    : `access:${payment.id}`;
  const eventType = "investor_account_paid";

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

async function isFirstInvestorPurchase(payment: {
  id: string;
  user_id: string;
  created_at: string | null;
}): Promise<boolean> {
  // Wcześniejszy opłacony abonament inwestora (zwroty i okazje się nie liczą).
  let earlier = (db.from("access_payments") as any)
    .select("id")
    .eq("user_id", payment.user_id)
    .eq("audience", "investor")
    .eq("status", "paid")
    .is("unlock_match_id", null)
    .neq("id", payment.id);
  if (payment.created_at) earlier = earlier.lt("created_at", payment.created_at);
  const { data: prev } = await earlier.limit(1);
  if ((prev ?? []).length > 0) return false;

  // Prowizja za to konto już naliczona (np. ze starszej ścieżki płatności).
  const { data: events } = await (db.from("affiliate_commission_events") as any)
    .select("id")
    .eq("event_type", "investor_account_paid")
    .eq("paid_account_id", payment.user_id)
    .not("event_status", "in", "(cancelled,refunded,chargeback)")
    .limit(1);
  return (events ?? []).length === 0;
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
