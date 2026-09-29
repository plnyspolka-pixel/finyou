// Teasery Projektów dla inwestora — WYŁĄCZNIE z dopasowań do PRZYJĘTYCH
// Zleceń (§ 5 Umowy ramowej, decyzja nadrzędna nr 7). Bez Zlecenia lista
// jest pusta — UI pokazuje CTA „Złóż Zlecenie". Dane budujemy po stronie
// serwera z tych samych bezpiecznych pól co funkcja SQL
// `investor_offer_teasers()` (bez opisu, bez zdjęć) — pełne rekordy
// loan_applications/clients/properties/documents nie trafiają do przeglądarki.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACTIVE_MATCH_STATUSES,
  teasersForAcceptedOrders,
} from "@/lib/investor-agreements/order-cycle-core";

export interface InvestorOfferTeaser {
  /** Identyfikator wniosku (Projektu). */
  id: string;
  matchId: string;
  orderId: string;
  projectRef: string | null;
  matchStatus: string;
  createdAt: string;
  loanAmount: number | null;
  periodMonths: number | null;
  annualRate: number | null;
  ltv: number | null;
  propertyType: string | null;
  city: string | null;
  voivodeship: string | null;
  estimatedValue: number | null;
  areaSqm: number | null;
}

export const listInvestorTeasers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorOfferTeaser[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: rolesRows } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((rolesRows ?? []) as { role: string }[]).map((r) => r.role);
    if (!roles.includes("inwestor")) return [];

    // Zlecenia wywołującego + ich dopasowania (jedno zapytanie, join po FK).
    const { data: orders, error } = await db
      .from("investor_orders")
      .select(
        "id, status, investor_order_matches(id, application_id, project_ref, status, created_at, teaser)",
      )
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const selected = teasersForAcceptedOrders(
      (orders ?? []) as Array<{
        id: string;
        status: string;
        investor_order_matches?: Array<{
          id: string;
          application_id: string;
          project_ref: string | null;
          status: string;
          created_at: string;
        }> | null;
      }>,
    );
    if (selected.length === 0) return [];

    const appIds = [...new Set(selected.map((s) => s.applicationId))];
    const { data: apps } = await db
      .from("loan_applications")
      .select(
        "id, created_at, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, deleted_at",
      )
      .in("id", appIds);
    const { data: props } = await db
      .from("properties")
      .select(
        "loan_application_id, property_type, city, voivodeship, estimated_value, area_sqm, created_at",
      )
      .in("loan_application_id", appIds)
      .order("created_at", { ascending: true });

    const appById = new Map<string, any>();
    for (const a of (apps ?? []) as any[]) if (!a.deleted_at) appById.set(a.id, a);
    const propByApp = new Map<string, any>();
    for (const p of (props ?? []) as any[]) {
      if (!propByApp.has(p.loan_application_id)) propByApp.set(p.loan_application_id, p);
    }

    const num = (v: unknown) => (v == null ? null : Number(v));
    return selected.flatMap((s) => {
      const la = appById.get(s.applicationId);
      if (!la) return [];
      const p = propByApp.get(s.applicationId);
      return [
        {
          id: la.id,
          matchId: s.matchId,
          orderId: s.orderId,
          projectRef: s.projectRef,
          matchStatus: s.matchStatus,
          createdAt: s.createdAt,
          loanAmount: num(la.loan_amount),
          periodMonths: num(la.preferred_period_months),
          annualRate: num(la.annual_investor_rate),
          ltv: num(la.estimated_ltv),
          propertyType: p?.property_type ?? null,
          city: p?.city ?? null,
          voivodeship: p?.voivodeship ?? null,
          estimatedValue: num(p?.estimated_value),
          areaSqm: num(p?.area_sqm),
        },
      ];
    });
  });

export { ACTIVE_MATCH_STATUSES };
