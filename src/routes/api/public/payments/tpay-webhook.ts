import { createFileRoute } from "@tanstack/react-router";
import { TPAY_PLANS, type TpayPlanId } from "@/lib/payments.functions";

// Tpay sends notifications as application/x-www-form-urlencoded (classic
// format) for transactions created via Open API. We verify by re-fetching
// the transaction through the Tpay API (server-to-server) instead of
// relying on JWS verification — simpler and more reliable.
export const Route = createFileRoute("/api/public/payments/tpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          let body: Record<string, string> = {};
          if (ct.includes("application/json")) {
            body = (await request.json()) as Record<string, string>;
          } else {
            const text = await request.text();
            const params = new URLSearchParams(text);
            params.forEach((v, k) => { body[k] = v; });
          }

          const trId =
            body.tr_id || body.transactionId || body.id || body["tr_id"];
          if (!trId) {
            console.error("[tpay-webhook] missing transaction id", body);
            return new Response("TRUE", { status: 200 });
          }

          // Verify by fetching transaction status from Tpay
          const { getTpayTransaction } = await import("@/lib/tpay.server");
          const tx = await getTpayTransaction(String(trId));

          if (tx.status !== "correct") {
            console.log("[tpay-webhook] not paid yet", trId, tx.status);
            return new Response("TRUE", { status: 200 });
          }

          const crc = String(tx.hiddenDescription ?? body.tr_crc ?? "");
          const [userId, planRaw] = crc.split("|");
          const plan = planRaw as TpayPlanId;
          if (!userId || !plan || !(plan in TPAY_PLANS)) {
            console.error("[tpay-webhook] invalid CRC", crc);
            return new Response("TRUE", { status: 200 });
          }

          const planCfg = TPAY_PLANS[plan];
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Find investor row
          const { data: existing } = await supabaseAdmin
            .from("investors")
            .select("id, subscription_active_until")
            .eq("user_id", userId)
            .maybeSingle();

          const baseDate =
            existing?.subscription_active_until &&
            new Date(existing.subscription_active_until as string) > new Date()
              ? new Date(existing.subscription_active_until as string)
              : new Date();
          const newUntil = new Date(baseDate);
          newUntil.setDate(newUntil.getDate() + planCfg.days);

          // Map Tpay plan → investors.subscription_plan enum
          const planEnumMap: Record<TpayPlanId, "podstawowy" | "profesjonalny" | "rozszerzony"> = {
            investor_access_1d: "podstawowy",
            investor_access_1m: "profesjonalny",
            investor_access_1y: "rozszerzony",
          };

          const payload = {
            user_id: userId,
            subscription_plan: planEnumMap[plan],
            subscription_status: "aktywny" as const,
            subscription_active_until: newUntil.toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (existing?.id) {
            await supabaseAdmin
              .from("investors")
              .update(payload)
              .eq("id", existing.id as string);
          } else {
            await (supabaseAdmin.from("investors") as any).insert({
              ...payload,
              investor_type: "indywidualny",
            });
          }

          console.log("[tpay-webhook] activated", { userId, plan, trId, amount: tx.amount });

          // Firma → automatyczna faktura VAT. Osoba fizyczna → wpis do
          // rejestru sprzedaży (faktura wystawiana dopiero na żądanie).
          try {
            const { data: buyer } = await (supabaseAdmin
              .from("tpay_transaction_buyers") as any)
              .select("*")
              .eq("transaction_id", String(trId))
              .maybeSingle();

            const grossAmount = Number(tx.amount) || planCfg.amount;
            if (grossAmount > 0) {
              if (buyer?.buyer_type === "company") {
                const { createInvoiceFromPayment } = await import("@/lib/accounting/auto-invoice");
                await createInvoiceFromPayment(supabaseAdmin as any, {
                  paymentId: String(trId),
                  grossAmount,
                  currency: "PLN",
                  description: planCfg.label,
                  buyerName: buyer?.buyer_name ?? null,
                  buyerEmail: buyer?.buyer_email ?? null,
                  buyerNip: buyer?.buyer_nip ?? null,
                  sourceType: "stripe_payment",
                  sourceId: userId,
                });
              } else {
                await (supabaseAdmin.from("individual_sales_register") as any).upsert(
                  {
                    transaction_id: String(trId),
                    user_id: userId,
                    buyer_name: buyer?.buyer_name ?? null,
                    buyer_email: buyer?.buyer_email ?? null,
                    buyer_address: buyer?.buyer_address ?? null,
                    buyer_city: buyer?.buyer_city ?? null,
                    buyer_postal_code: buyer?.buyer_postal_code ?? null,
                    description: planCfg.label,
                    gross_amount: grossAmount,
                    currency: "PLN",
                    paid_at: new Date().toISOString(),
                  },
                  { onConflict: "transaction_id" },
                );
              }
            }
          } catch (e) {
            console.error("[tpay-webhook] sales register/invoice failed", (e as Error)?.message);
          }

          return new Response("TRUE", { status: 200 });
        } catch (e) {
          console.error("[tpay-webhook] error", e);
          return new Response("FALSE", { status: 500 });
        }
      },
    },
  },
});
