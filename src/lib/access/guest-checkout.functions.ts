// Zakup abonamentu inwestora BEZ konta — przycisk „Załóż konto inwestora"
// na stronie publicznej prowadzi do formularza nabywcy, a stąd do Tpay.
// Konto inwestora zakłada webhook Tpay po potwierdzeniu wpłaty, z danych
// podanych w tym formularzu (patrz guest-investor.server.ts).
//
// Cena i produkt pochodzą wyłącznie z katalogu access_products; klient
// przesyła tylko okres abonamentu, dane nabywcy i zgody.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SUBSCRIPTION_OPTIONS } from "@/lib/investor-plan/plans";
import { REGULAMIN_ABONAMENTU_VERSION } from "@/lib/legal/regulamin-abonamentu";
import { validateBuyer } from "./core";
import { PRIVACY_VERSION } from "./checkout.functions";

export const GUEST_CHECKOUT_PATH = "/abonament-inwestora";

/** Ile rozpoczętych płatności bez konta na jeden adres e-mail w ciągu godziny. */
const GUEST_ATTEMPTS_PER_HOUR = 5;

const GuestCheckoutSchema = z.object({
  period: z.enum(["miesiecznie", "rocznie"]),
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

export const createGuestInvestorCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GuestCheckoutSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const buyerErrors = validateBuyer({
        buyerType: data.buyerType,
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        buyerNip: data.buyerNip,
        buyerStreet: data.buyerStreet,
        buyerPostalCode: data.buyerPostalCode,
        buyerCity: data.buyerCity,
        buyerCountry: data.buyerCountry,
      });
      if (buyerErrors.length > 0) return { error: buyerErrors[0] };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as any;
      const email = data.buyerEmail.trim().toLowerCase();

      // Hamulec na zalewanie Tpay/bazy z publicznego formularza.
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from("access_payments")
        .select("id", { count: "exact", head: true })
        .is("user_id", null)
        .ilike("buyer_email", email)
        .gte("created_at", since);
      if ((count ?? 0) >= GUEST_ATTEMPTS_PER_HOUR) {
        return {
          error:
            "Zbyt wiele rozpoczętych płatności dla tego adresu e-mail. Spróbuj ponownie za godzinę.",
        };
      }

      const productCode = SUBSCRIPTION_OPTIONS[data.period].productCode;
      const { data: product } = await db
        .from("access_products")
        .select("*")
        .eq("code", productCode)
        .eq("audience", "investor")
        .eq("active", true)
        .maybeSingle();
      if (!product) return { error: "Wybrany abonament jest chwilowo niedostępny." };

      const { requestClientMeta } = await import("./urls.server");
      const meta = requestClientMeta();
      const consents = {
        termsVersion: REGULAMIN_ABONAMENTU_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAccepted: true,
        privacyAccepted: true,
        digitalServiceConsent: Boolean(data.consents.digitalService),
        acceptedAt: new Date().toISOString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
        // Webhook zakłada konto inwestora z danych nabywcy i wysyła link
        // do logowania (runPaidPostProcessing).
        guestCheckout: true,
      };

      const { startTpayPayment } = await import("./start-payment.server");
      const started = await startTpayPayment({
        db,
        userId: null,
        product,
        audience: "investor",
        buyer: { ...data, buyerEmail: email },
        consents,
        returnPath: GUEST_CHECKOUT_PATH,
      });
      if (!started.ok) return { error: started.error };
      return { paymentUrl: started.paymentUrl, paymentId: started.paymentId };
    } catch (e) {
      console.error("[guest-checkout] error", e);
      return { error: "Błąd tworzenia płatności. Spróbuj ponownie." };
    }
  });

/** Status płatności bez konta — po powrocie z Tpay. Zwraca wyłącznie status
 *  i zamaskowany adres (UUID płatności jest niezgadywalny). */
export const getGuestPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await (supabaseAdmin as any)
      .from("access_payments")
      .select("id,status,buyer_email,granted_until,consents")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment || !payment.consents?.guestCheckout) {
      return { status: "not_found" as const, email: null, grantedUntil: null };
    }
    return {
      status: String(payment.status),
      email: maskEmail(payment.buyer_email ?? ""),
      grantedUntil: payment.granted_until ?? null,
    };
  });

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "";
  const shown = user.length <= 2 ? user.charAt(0) : user.slice(0, 2);
  return `${shown}***@${domain}`;
}
