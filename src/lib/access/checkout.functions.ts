// Tworzenie jednorazowej płatności Tpay za czasowy dostęp do platformy.
// Zastępuje dawną funkcję `createInvestorAccessCheckout` (ograniczoną do
// inwestora). Cena, waluta, czas dostępu i nazwa produktu są ZAWSZE pobierane
// z zaufanego katalogu `access_products` po stronie serwera — klient przesyła
// wyłącznie kod produktu, typ nabywcy, dane nabywcy i zgody.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  groszToPln,
  isLegacyPlanId,
  normalizeNip,
  validateBuyer,
  type AccessAudience,
  type BuyerType,
} from "./core";

// Wersje dokumentów prawnych akceptowanych na formularzu.
// TODO(prawne): podmień na wersje zatwierdzone przez obsługę prawną.
export const TERMS_VERSION = "regulamin-platformy-v1";
export const PRIVACY_VERSION = "polityka-prywatnosci-v1";

const CheckoutSchema = z.object({
  productCode: z.string().trim().min(1).max(80),
  buyerType: z.enum(["person", "company"]),
  buyerName: z.string().trim().min(1).max(300),
  buyerEmail: z.string().trim().email().max(255),
  buyerNip: z.string().trim().max(20).optional().nullable(),
  buyerStreet: z.string().trim().min(1).max(300),
  buyerPostalCode: z.string().trim().min(1).max(12),
  buyerCity: z.string().trim().min(1).max(120),
  buyerCountry: z.string().trim().max(2).optional().default("PL"),
  consents: z.object({
    terms: z.literal(true),
    privacy: z.literal(true),
    digitalService: z.boolean().optional().default(false),
  }),
});

export type CreateAccessCheckoutInput = z.infer<typeof CheckoutSchema>;

export const createAccessCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      if (isLegacyPlanId(data.productCode)) {
        return {
          error:
            "Ten pakiet nie jest już dostępny w sprzedaży. Wybierz aktualny pakiet 30 lub 365 dni.",
        };
      }

      const buyerErrors = validateBuyer({
        buyerType: data.buyerType as BuyerType,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        buyerNip: data.buyerNip,
        buyerStreet: data.buyerStreet,
        buyerPostalCode: data.buyerPostalCode,
        buyerCity: data.buyerCity,
        buyerCountry: data.buyerCountry,
      });
      if (buyerErrors.length > 0) {
        return { error: buyerErrors[0] };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as any;

      // 1) Produkt z zaufanego katalogu.
      const { data: product } = await db
        .from("access_products")
        .select("*")
        .eq("code", data.productCode)
        .eq("active", true)
        .maybeSingle();
      if (!product) {
        return { error: "Wybrany pakiet jest niedostępny." };
      }
      const audience = product.audience as AccessAudience;

      // 2) Zgodność produktu z rolą kupującego.
      const { getUserRoles, isExternalPartner, isInternalStaff } = await import("./guards.server");
      const [roles, partner, staff] = await Promise.all([
        getUserRoles(userId),
        isExternalPartner(userId),
        isInternalStaff(userId),
      ]);
      if (audience === "investor" && !roles.includes("inwestor") && !staff) {
        return { error: "Pakiet inwestora może kupić wyłącznie konto inwestora." };
      }
      if (audience === "broker" && !roles.includes("posrednik") && !partner && !staff) {
        return { error: "Pakiet pośrednika może kupić wyłącznie konto pośrednika." };
      }

      // 3) Rekord płatności (status 'created') ze snapshotem nabywcy i zgód.
      const { requestClientMeta, resolveAppBaseUrl } = await import("./urls.server");
      const meta = requestClientMeta();
      const nowIso = new Date().toISOString();
      const consents = {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAccepted: true,
        privacyAccepted: true,
        digitalServiceConsent: Boolean(data.consents.digitalService),
        acceptedAt: nowIso,
        ip: meta.ip,
        userAgent: meta.userAgent,
      };

      const { data: payment, error: insErr } = await db
        .from("access_payments")
        .insert({
          provider: "tpay",
          user_id: userId,
          product_id: product.id,
          audience,
          status: "created",
          expected_amount_grosz: product.amount_grosz,
          currency: product.currency ?? "PLN",
          buyer_type: data.buyerType,
          buyer_name: data.buyerName.trim(),
          buyer_email: data.buyerEmail.trim(),
          buyer_nip: data.buyerType === "company" ? normalizeNip(data.buyerNip ?? "") : null,
          buyer_street: data.buyerStreet.trim(),
          buyer_postal_code: data.buyerPostalCode.trim(),
          buyer_city: data.buyerCity.trim(),
          buyer_country: (data.buyerCountry || "PL").toUpperCase(),
          consents,
        })
        .select("id")
        .single();
      if (insErr || !payment) {
        console.error("[access-checkout] insert payment failed", insErr?.message);
        return { error: "Nie udało się rozpocząć płatności. Spróbuj ponownie." };
      }
      const paymentId = payment.id as string;

      // 4) Transakcja w Tpay. W crc/hiddenDescription zapisujemy wewnętrzny
      //    UUID płatności — webhook czyta wszystko z bazy, nie z przeglądarki.
      const base = resolveAppBaseUrl();
      const panel = audience === "investor" ? "/inwestor/abonament" : "/posrednik/abonament";
      const successUrl = `${base}${panel}?tpay=success&payment=${paymentId}`;
      const errorUrl = `${base}${panel}?tpay=error&payment=${paymentId}`;
      const notifyUrl = `${base}/api/public/payments/tpay-webhook`;

      const { createTpayTransaction } = await import("@/lib/tpay.server");
      let tx;
      try {
        tx = await createTpayTransaction({
          amount: groszToPln(product.amount_grosz),
          description: product.label,
          email: data.buyerEmail.trim(),
          name: data.buyerName.trim(),
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
          error: "Nie udało się połączyć z bramką płatności Tpay. Spróbuj ponownie za chwilę.",
        };
      }

      await db
        .from("access_payments")
        .update({ provider_transaction_id: String(tx.transactionId), status: "pending" })
        .eq("id", paymentId);

      return { paymentUrl: tx.transactionPaymentUrl, paymentId, transactionId: tx.transactionId };
    } catch (e) {
      console.error("[access-checkout] error", e);
      return { error: e instanceof Error ? e.message : "Błąd tworzenia płatności" };
    }
  });

// Status własnej płatności — do odpytywania po powrocie z Tpay.
// Nie ufamy parametrowi `?tpay=success`; dostęp jest aktywny dopiero, gdy
// webhook potwierdzi transakcję i rekord przejdzie w status 'paid'.
export const getAccessPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: payment } = await db
      .from("access_payments")
      .select(
        "id,user_id,status,granted_from,granted_until,buyer_email,invoice_id,invoice_error,failure_reason,product_id",
      )
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment || payment.user_id !== context.userId) {
      throw new Error("Nie znaleziono płatności");
    }
    let invoice: {
      id: string;
      invoice_number: string | null;
      status: string;
      ksef_status: string | null;
    } | null = null;
    if (payment.invoice_id) {
      const { data: inv } = await db
        .from("sales_invoices")
        .select("id,invoice_number,status,ksef_status")
        .eq("id", payment.invoice_id)
        .maybeSingle();
      invoice = inv ?? null;
    }
    return {
      id: payment.id,
      status: payment.status,
      grantedFrom: payment.granted_from,
      grantedUntil: payment.granted_until,
      buyerEmail: payment.buyer_email,
      invoice,
      invoicePending: payment.status === "paid" && !payment.invoice_id,
      invoiceError: payment.invoice_error ?? null,
      failureReason: payment.failure_reason ?? null,
    };
  });
