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
import {
  decideInFlightUnlockPayment,
  PENDING_UNLOCK_STALE_MINUTES,
} from "./pending-unlock";

// Wersje dokumentów prawnych akceptowanych na formularzu.
// TODO(prawne): podmień na wersje zatwierdzone przez obsługę prawną.
export const TERMS_VERSION = "regulamin-platformy-v1";
export const PRIVACY_VERSION = "polityka-prywatnosci-v1";

const CheckoutSchema = z.object({
  productCode: z.string().trim().min(1).max(80),
  /** Wymagane dla produktów `kind = "unlock"` — okazja, którą odblokowujemy. */
  matchId: z.string().uuid().optional(),
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

const IN_FLIGHT_UNLOCK_MESSAGE = (minutesLeft: number) =>
  `Płatność za tę okazję jest już rozpoczęta — dokończ ją w oknie Tpay albo spróbuj ponownie za ok. ${minutesLeft} min.`;

/**
 * Przegląd rozpoczętych (created/pending) płatności za okazję przed nową próbą.
 * Porzucone/odrzucone są anulowane; zwraca komunikat błędu, jeśli któraś
 * nadal musi blokować (świeża albo już opłacona w Tpay), inaczej `null`.
 */
async function resolveInFlightUnlockPayments(db: any, matchId: string): Promise<string | null> {
  const { data: rows } = await db
    .from("access_payments")
    .select("id, status, created_at, provider_transaction_id")
    .eq("unlock_match_id", matchId)
    .in("status", ["created", "pending"])
    .order("created_at", { ascending: false })
    .limit(10);
  for (const row of (rows ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    provider_transaction_id: string | null;
  }>) {
    let tpayStatus: string | null = null;
    if (row.provider_transaction_id) {
      try {
        const { getTpayTransaction } = await import("@/lib/tpay.server");
        const tx = await getTpayTransaction(String(row.provider_transaction_id));
        tpayStatus = tx?.status ?? null;
      } catch (e) {
        // Brak odpowiedzi Tpay — decyzja wyłącznie po wieku rekordu.
        console.warn("[access-checkout] tpay status lookup failed", (e as Error).message);
      }
    }
    const decision = decideInFlightUnlockPayment({
      status: row.status,
      createdAt: row.created_at,
      hasProviderTransaction: Boolean(row.provider_transaction_id),
      tpayStatus,
    });
    if (decision.action === "block_paid") {
      return "Płatność za tę okazję została już zaksięgowana — odblokowanie pojawi się w ciągu kilku minut. Odśwież stronę za chwilę.";
    }
    if (decision.action === "block_fresh") {
      return IN_FLIGHT_UNLOCK_MESSAGE(decision.minutesLeft);
    }
    // Guard statusu w WHERE: równoległy webhook 'correct' nie zostanie nadpisany.
    await db
      .from("access_payments")
      .update({ status: "cancelled", failure_reason: `superseded:${decision.reason}` })
      .eq("id", row.id)
      .in("status", ["created", "pending"]);
  }
  return null;
}

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

      // 1b) Zakup jednej okazji: Dopasowanie musi należeć do kupującego,
      //     mieć ujawnione dane i nie być jeszcze odblokowane.
      let unlockMatchId: string | null = null;
      if (product.kind === "unlock") {
        if (!data.matchId) {
          return { error: "Brak wskazanej okazji do odblokowania." };
        }
        const { data: match } = await db
          .from("investor_order_matches")
          .select("id, status, order_id")
          .eq("id", data.matchId)
          .maybeSingle();
        if (!match) {
          return { error: "Nie znaleziono okazji." };
        }
        const { data: order } = await db
          .from("investor_orders")
          .select("user_id")
          .eq("id", match.order_id)
          .maybeSingle();
        if (order?.user_id !== userId) {
          return { error: "Ta okazja nie należy do Twojego Zlecenia." };
        }
        if (["odrzucone", "przekazane", "wygasle"].includes(String(match.status))) {
          return { error: "Ta okazja nie jest już dostępna." };
        }
        const { data: already } = await db
          .from("investor_opportunity_unlocks")
          .select("id")
          .eq("match_id", data.matchId)
          .maybeSingle();
        if (already) {
          return { error: "Ta okazja jest już odblokowana." };
        }
        // Druga rozpoczęta płatność za tę samą okazję mogłaby skończyć się
        // podwójnym obciążeniem (odblokowanie jest unikalne po match_id).
        // Blokujemy ją jednak tylko, gdy poprzednia jest świeża albo już
        // opłacona w Tpay — porzucona (zamknięta strona, anulowanie, przelew,
        // który nie doszedł) wygasa i nie może blokować okazji na zawsze.
        // Webhook ma dodatkowo własne zabezpieczenie (późna wpłata za anulowany
        // rekord trafia do wyjaśnienia/zwrotu), a baza — unikalny indeks
        // na jedną rozpoczętą płatność za okazję.
        const blocked = await resolveInFlightUnlockPayments(db, data.matchId);
        if (blocked) return { error: blocked };
        unlockMatchId = data.matchId;
      }

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
          unlock_match_id: unlockMatchId,
          consents,
        })
        .select("id")
        .single();
      if (insErr && unlockMatchId && (insErr as { code?: string }).code === "23505") {
        // Równoległe żądanie zdążyło rozpocząć płatność za tę okazję.
        return { error: IN_FLIGHT_UNLOCK_MESSAGE(PENDING_UNLOCK_STALE_MINUTES) };
      }
      if (insErr || !payment) {
        console.error("[access-checkout] insert payment failed", insErr?.message);
        return { error: "Nie udało się rozpocząć płatności. Spróbuj ponownie." };
      }
      const paymentId = payment.id as string;

      // 4) Transakcja w Tpay. W crc/hiddenDescription zapisujemy wewnętrzny
      //    UUID płatności — webhook czyta wszystko z bazy, nie z przeglądarki.
      const base = resolveAppBaseUrl();
      const panel =
        product.kind === "unlock"
          ? "/inwestor/umowy"
          : audience === "investor"
            ? "/inwestor/abonament"
            : "/posrednik/abonament";
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
