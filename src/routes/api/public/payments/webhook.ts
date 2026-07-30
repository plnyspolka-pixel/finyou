import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { createInvoiceFromPayment } from "@/lib/accounting/auto-invoice";
import { createCommissionEvent } from "@/lib/affiliate/engine";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _supabase;
}

const PLAN_DURATION_DAYS: Record<string, number> = {
  investor_access_1d: 1,
  investor_access_1m: 30,
  investor_access_1y: 365,
};

const PLAN_TO_DB: Record<string, string> = {
  investor_access_1d: "podstawowy",
  investor_access_1m: "rozszerzony",
  investor_access_1y: "profesjonalny",
};

async function handleCheckoutCompleted(session: any) {
  const userId: string | undefined = session.metadata?.userId;
  const plan: string | undefined = session.metadata?.plan;
  const stripeCustomerId: string | undefined =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!userId || !plan || !PLAN_DURATION_DAYS[plan]) {
    console.error("Webhook: missing metadata", { userId, plan });
    return;
  }

  const days = PLAN_DURATION_DAYS[plan];
  const supabase = getSupabase() as any;

  const { data: existing } = await supabase
    .from("investors")
    .select("id, subscription_active_until")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const currentEnd = existing?.subscription_active_until
    ? new Date(existing.subscription_active_until as string)
    : null;
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const payload = {
    subscription_plan: PLAN_TO_DB[plan],
    subscription_status: "aktywny",
    subscription_source: "stripe",
    subscription_active_until: newEnd.toISOString(),
    stripe_customer_id: stripeCustomerId ?? null,
    is_active: true,
    updated_at: now.toISOString(),
  };

  if (existing?.id) {
    await supabase.from("investors").update(payload).eq("id", existing.id);
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("user_id", userId)
      .maybeSingle();
    await supabase.from("investors").insert({
      user_id: userId,
      investor_type: "indywidualny",
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      ...payload,
    });
  }

  await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: "inwestor" }, { onConflict: "user_id,role" });

  await supabase.from("audit_logs").insert({
    user_id: userId,
    object_type: "investor_subscription",
    action: "stripe_payment_succeeded",
    new_value: { plan, days, valid_until: newEnd.toISOString(), session_id: session.id },
  });

  // Automatyczne wystawienie faktury sprzedaży po zaksięgowanej wpłacie.
  // Wybiera domyślny podmiot gospodarczy i wystawia fakturę zgodnie z jego
  // konfiguracją (manual / KSeF). Nie blokuje obsługi subskrypcji.
  try {
    const grossAmount = typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
    if (grossAmount > 0) {
      const planLabel = PLAN_TO_DB[plan]
        ? `Dostęp inwestora Finance You — ${PLAN_TO_DB[plan]}`
        : "Dostęp inwestora Finance You";
      await createInvoiceFromPayment(supabase as any, {
        paymentId: session.id,
        grossAmount,
        currency: String(session.currency ?? "pln").toUpperCase(),
        description: planLabel,
        buyerName: session.customer_details?.name ?? null,
        buyerEmail: session.customer_details?.email ?? null,
        sourceType: "stripe_payment",
        sourceId: userId,
      });
    }
  } catch (e) {
    console.error("Auto-invoice failed:", (e as Error)?.message);
  }

  // Zdarzenie prowizyjne „opłacone konto inwestora" — jeśli płatnik został
  // polecony przez aktywnego partnera (first-touch zapisany na profilu).
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("referred_by_partner_id")
      .eq("user_id", userId)
      .maybeSingle();
    const partnerId = prof?.referred_by_partner_id as string | null | undefined;
    if (partnerId) {
      const { data: partner } = await supabase
        .from("affiliate_partners")
        .select("status")
        .eq("id", partnerId)
        .maybeSingle();
      if (partner?.status === "active") {
        const { data: existingEv } = await supabase
          .from("affiliate_commission_events")
          .select("id")
          .eq("event_type", "investor_account_paid")
          .eq("external_ref", session.id)
          .maybeSingle();
        if (!existingEv) {
          const grossAmount =
            typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
          await createCommissionEvent(supabase as any, {
            eventType: "investor_account_paid",
            directPartnerId: partnerId,
            sourceEntityType: "stripe_session",
            externalRef: session.id,
            grossPaymentAmount: grossAmount,
            netRevenueAmount: grossAmount,
            financeYouFeeAmount: grossAmount,
            customerId: userId,
          });
        }
      }
    }
  } catch (e) {
    console.error("Investor commission event failed:", (e as Error)?.message);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Invalid env query parameter:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
