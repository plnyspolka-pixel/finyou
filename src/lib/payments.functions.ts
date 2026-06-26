import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TPAY_PLANS = {
  investor_access_1d: { amount: 99, days: 1, label: "Dostęp inwestora — 1 dzień" },
  investor_access_1m: { amount: 399, days: 30, label: "Dostęp inwestora — 1 miesiąc" },
  investor_access_1y: { amount: 2999, days: 365, label: "Dostęp inwestora — 1 rok" },
} as const;

export type TpayPlanId = keyof typeof TPAY_PLANS;

export const createInvestorAccessCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: TpayPlanId; returnUrl: string }) => {
    if (!(data.priceId in TPAY_PLANS)) throw new Error("Invalid priceId");
    if (!/^https?:\/\//.test(data.returnUrl)) throw new Error("Invalid returnUrl");
    return data;
  })
  .handler(async ({ data, context }) => {
    try {
      const { userId, supabase } = context;
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      const email = user?.email ?? "no-reply@financeyou.pl";
      const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
      const fullName =
        [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() ||
        meta.full_name ||
        email;

      const plan = TPAY_PLANS[data.priceId];
      const origin = new URL(data.returnUrl).origin;
      const successUrl = `${origin}/inwestor/abonament?tpay=success`;
      const errorUrl = `${origin}/inwestor/abonament?tpay=error`;
      const notifyUrl = `${origin}/api/public/payments/tpay-webhook`;

      const { createTpayTransaction } = await import("@/lib/tpay.server");
      const tx = await createTpayTransaction({
        amount: plan.amount,
        description: plan.label,
        email,
        name: fullName,
        crc: `${userId}|${data.priceId}`,
        notifyUrl,
        successUrl,
        errorUrl,
      });

      return { paymentUrl: tx.transactionPaymentUrl, transactionId: tx.transactionId };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Tpay error" };
    }
  });
