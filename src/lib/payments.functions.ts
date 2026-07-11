import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TPAY_PLANS = {
  investor_access_1d: { amount: 99, days: 1, label: "Dostęp inwestora — 1 dzień" },
  investor_access_1m: { amount: 399, days: 30, label: "Dostęp inwestora — 1 miesiąc" },
  investor_access_1y: { amount: 2999, days: 365, label: "Dostęp inwestora — 1 rok" },
} as const;

export type TpayPlanId = keyof typeof TPAY_PLANS;

// Jedno źródło prawdy: produkt płatności → investors.subscription_plan (enum DB).
// Tier rośnie razem z ceną i długością dostępu:
//   1 dzień  (99 zł)   → podstawowy
//   1 miesiąc (399 zł) → rozszerzony
//   1 rok  (2999 zł)   → profesjonalny
// Używane przez oba webhooki płatności (Stripe i Tpay) — nie edytuj mapowania
// tylko w jednym miejscu.
export const PLAN_TO_SUBSCRIPTION: Record<
  TpayPlanId,
  "podstawowy" | "rozszerzony" | "profesjonalny"
> = {
  investor_access_1d: "podstawowy",
  investor_access_1m: "rozszerzony",
  investor_access_1y: "profesjonalny",
};

export type BuyerType = "person" | "company";

export interface BuyerInput {
  buyerType: BuyerType;
  buyerName?: string;
  buyerEmail?: string;
  buyerNip?: string;
  buyerAddress?: string;
  buyerCity?: string;
  buyerPostalCode?: string;
  buyerCountry?: string;
}

export const createInvestorAccessCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { priceId: TpayPlanId; returnUrl: string } & BuyerInput) => {
      if (!(data.priceId in TPAY_PLANS)) throw new Error("Invalid priceId");
      if (!/^https?:\/\//.test(data.returnUrl)) throw new Error("Invalid returnUrl");
      if (data.buyerType !== "person" && data.buyerType !== "company") {
        throw new Error("Invalid buyerType");
      }
      if (data.buyerType === "company") {
        if (!data.buyerName?.trim()) throw new Error("Brak nazwy firmy");
        if (!data.buyerNip?.trim()) throw new Error("Brak numeru NIP");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    try {
      const { userId, supabase } = context;
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      const email = data.buyerEmail?.trim() || user?.email || "no-reply@financeyou.pl";
      const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
      const personName =
        [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() ||
        meta.full_name ||
        email;
      const fullName =
        data.buyerType === "company"
          ? (data.buyerName?.trim() || personName)
          : (data.buyerName?.trim() || personName);

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

      // Zapisz dane nabywcy, żeby webhook wystawił właściwą fakturę.
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (supabaseAdmin.from("tpay_transaction_buyers") as any).upsert(
          {
            transaction_id: String(tx.transactionId),
            user_id: userId,
            buyer_type: data.buyerType,
            buyer_name: fullName,
            buyer_email: email,
            buyer_nip: data.buyerType === "company" ? (data.buyerNip ?? null) : null,
            buyer_address: data.buyerAddress ?? null,
            buyer_city: data.buyerCity ?? null,
            buyer_postal_code: data.buyerPostalCode ?? null,
            buyer_country: data.buyerCountry ?? "PL",
          },
          { onConflict: "transaction_id" },
        );
      } catch (e) {
        console.error("[payments] save buyer failed", (e as Error)?.message);
      }

      return { paymentUrl: tx.transactionPaymentUrl, transactionId: tx.transactionId };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Tpay error" };
    }
  });
