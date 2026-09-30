// Tworzenie jednorazowej płatności Tpay za czasowy dostęp do platformy.
// Zastępuje dawną funkcję `createInvestorAccessCheckout` (ograniczoną do
// inwestora). Cena, waluta, czas dostępu i nazwa produktu są ZAWSZE pobierane
// z zaufanego katalogu `access_products` po stronie serwera — klient przesyła
// wyłącznie kod produktu, typ nabywcy, dane nabywcy i zgody.
import { createServerFn } from "@tanstack/react-start";
import { SUBSCRIPTION_OPTIONS } from "@/lib/investor-plan/plans";
import { REGULAMIN_ABONAMENTU_VERSION } from "@/lib/legal/regulamin-abonamentu";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLegacyPlanId, validateBuyer, type AccessAudience, type BuyerType } from "./core";
import { decideInFlightUnlockPayment, PENDING_UNLOCK_STALE_MINUTES } from "./pending-unlock";

// Wersje dokumentów prawnych akceptowanych na formularzu (consent_documents,
// wersja 2 z 29 września 2026 r. — migracja 20260929156000_etap5_zgody_v2).
export const TERMS_VERSION = "regulamin-platformy-v3";
export const PRIVACY_VERSION = "polityka-prywatnosci-v2";

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

/** Jedyne produkty inwestora w sprzedaży — abonament 30 i 365 dni. */
const INVESTOR_SUBSCRIPTION_CODES = new Set<string>(
  Object.values(SUBSCRIPTION_OPTIONS).map((o) => o.productCode),
);

export const createAccessCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    try {
      if (
        isLegacyPlanId(data.productCode) ||
        (data.productCode.startsWith("investor_") &&
          !INVESTOR_SUBSCRIPTION_CODES.has(data.productCode))
      ) {
        // Inwestor kupuje wyłącznie abonament (30 albo 365 dni — Umowa ramowa v7
        // § 7). Pakiet PRO, odblokowanie pojedynczej okazji i stare plany nie
        // są już w sprzedaży.
        return {
          error:
            "Ten pakiet nie jest już dostępny w sprzedaży. Inwestor wybiera abonament na 30 albo 365 dni; pośrednik — pakiet 30 lub 365 dni.",
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
      // Kolejność inwestora (decyzje właściciela 2026-09-30): płacąc, inwestor
      // akceptuje Regulamin Abonamentu Inwestora (sprzedawca: Fundacja); umowy
      // o dostęp do Klientów (Umowa ramowa, NDA, RODO) akceptuje później —
      // otwierają moduł ofert (RLS: investor_can_view_application).
      if (audience === "broker" && !roles.includes("posrednik") && !partner && !staff) {
        return { error: "Pakiet pośrednika może kupić wyłącznie konto pośrednika." };
      }

      // 3) Snapshot zgód nabywcy.
      const { requestClientMeta } = await import("./urls.server");
      const meta = requestClientMeta();
      const nowIso = new Date().toISOString();
      const consents = {
        termsVersion: audience === "investor" ? REGULAMIN_ABONAMENTU_VERSION : TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAccepted: true,
        privacyAccepted: true,
        digitalServiceConsent: Boolean(data.consents.digitalService),
        acceptedAt: nowIso,
        ip: meta.ip,
        userAgent: meta.userAgent,
      };

      // 4) Rekord płatności + transakcja w Tpay.
      const panel =
        product.kind === "unlock"
          ? "/inwestor/umowy"
          : audience === "investor"
            ? "/inwestor/abonament"
            : "/posrednik/abonament";
      const { startTpayPayment } = await import("./start-payment.server");
      const started = await startTpayPayment({
        db,
        userId,
        product,
        audience,
        buyer: data,
        consents,
        unlockMatchId,
        returnPath: panel,
      });
      if (!started.ok) {
        if (unlockMatchId && started.code === "23505") {
          // Równoległe żądanie zdążyło rozpocząć płatność za tę okazję.
          return { error: IN_FLIGHT_UNLOCK_MESSAGE(PENDING_UNLOCK_STALE_MINUTES) };
        }
        return { error: started.error };
      }
      return {
        paymentUrl: started.paymentUrl,
        paymentId: started.paymentId,
        transactionId: started.transactionId,
      };
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
