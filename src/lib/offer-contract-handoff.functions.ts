// „Stwórz umowę" z listy „Moje oferty": komplet danych do kreatora umowy —
// pełne dane klienta (pożyczkobiorcy), nieruchomości z numerami KW i
// parametry złożonej oferty (harmonogram liczy front tym samym silnikiem co PDF).
// Tylko właściciel oferty, po Ujawnieniu danych kontaktowych albo akceptacji klienta. Każde odsłonięcie
// danych klienta logujemy w automation_events.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OfferContractContext {
  offer: {
    id: string;
    proposed_amount: number | null;
    period_months: number | null;
    expected_yearly_yield: number | null;
    commission: number | null;
    estimated_monthly_payment: number | null;
    estimated_total_cost: number | null;
    balloon_amount: number | null;
    schedule: Array<Record<string, number | string>> | null;
    created_at: string;
    submitted_at: string | null;
  };
  client: {
    fullName: string;
    pesel: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    companyName: string | null;
    nip: string | null;
    regon: string | null;
    krs: string | null;
    bankAccount: string | null;
  };
  property: {
    type: string | null;
    address: string | null;
    areaSqm: number | null;
    estimatedValue: number | null;
    landRegisterNumbers: string[];
    hasMortgage: boolean | null;
    hasCoOwners: boolean | null;
  } | null;
}

const join = (...parts: Array<string | null | undefined>) =>
  parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ") || null;

export const getOfferContractContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OfferContractContext> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: offer } = await db
      .from("investor_offers")
      .select(
        "id, offer_status, proposed_amount, period_months, expected_yearly_yield, commission, estimated_monthly_payment, estimated_total_cost, balloon_amount, schedule, created_at, submitted_at, investor:investors(user_id), loan:loan_applications(id, nip, client:clients(*), properties(*))",
      )
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer || offer.investor?.user_id !== context.userId) {
      throw new Error("Nie znaleziono oferty.");
    }
    // Dane identyfikujące klienta dopiero po odsłonięciu danych kontaktowych
    // (rezerwacja w „Moich zleceniach") albo po akceptacji oferty przez klienta.
    const { contractUnlocked, disclosedApplicationIds } =
      await import("@/lib/investor-agreements/order-projects.functions");
    const disclosed = await disclosedApplicationIds(supabaseAdmin, context.userId);
    if (!contractUnlocked(offer.offer_status, disclosed.has(offer.loan?.id))) {
      throw new Error(
        "Umowę można stworzyć po odsłonięciu danych kontaktowych klienta albo po akceptacji oferty.",
      );
    }
    const app = offer.loan ?? {};
    const c = app.client ?? {};
    const props: any[] = Array.isArray(app.properties) ? app.properties : [];
    const p = [...props].sort((a, b) =>
      String(a?.created_at ?? "").localeCompare(String(b?.created_at ?? "")),
    )[0];

    await db.from("automation_events").insert({
      automation_type: "investor_contract_data_access",
      loan_application_id: app.id ?? null,
      status: "sent",
      sent_payload: { offer_id: offer.id, investor_user_id: context.userId },
    });

    const kw = p
      ? [p.land_register_number, ...((p.additional_land_register_numbers as string[] | null) ?? [])]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
      : [];
    return {
      offer: {
        id: offer.id,
        proposed_amount: offer.proposed_amount,
        period_months: offer.period_months,
        expected_yearly_yield: offer.expected_yearly_yield,
        commission: offer.commission,
        estimated_monthly_payment: offer.estimated_monthly_payment,
        estimated_total_cost: offer.estimated_total_cost,
        balloon_amount: offer.balloon_amount,
        schedule: offer.schedule ?? null,
        created_at: offer.created_at,
        submitted_at: offer.submitted_at ?? null,
      },
      client: {
        fullName: [c.first_name, c.last_name].filter(Boolean).join(" "),
        pesel: c.pesel ?? null,
        email: c.email ?? null,
        phone: c.phone_normalized ?? c.phone ?? null,
        address: join(c.street ?? c.address, [c.postal_code, c.city].filter(Boolean).join(" ")),
        companyName: c.company_name ?? null,
        nip: c.nip ?? app.nip ?? null,
        regon: c.regon ?? null,
        krs: c.krs ?? null,
        bankAccount: c.bank_account ?? null,
      },
      property: p
        ? {
            type: p.property_type ?? null,
            address: join(p.street ?? p.address, p.city, p.voivodeship),
            areaSqm: p.area_sqm != null ? Number(p.area_sqm) : null,
            estimatedValue: p.estimated_value != null ? Number(p.estimated_value) : null,
            landRegisterNumbers: kw,
            hasMortgage: p.has_mortgage ?? null,
            hasCoOwners: p.has_co_owners ?? null,
          }
        : null,
    };
  });
