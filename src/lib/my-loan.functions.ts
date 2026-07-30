// Server functions dla panelu klienta: jeden punkt prawdy o postępie wniosku
// oraz „claim" osieroconego leada (np. z Mety) na podstawie return_link_token.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeLoanProgress } from "./loan-progress";
import { enrichLoanProgress, type EnrichedProgress } from "./my-loan-progress";

/**
 * Zwraca wzbogacony postęp aktywnego wniosku zalogowanego klienta.
 * Jedno źródło prawdy używane na pulpicie, w mailach przypomnieniowych
 * i przez voicebota — tak, żeby komunikat „czego brakuje" był spójny.
 */
export const getMyLoanProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EnrichedProgress | null> => {
    const { supabase, userId } = context;

    const { data: client } = await supabase
      .from("clients")
      .select("id, first_name, last_name, email, phone, phone_normalized")
      .eq("user_id", userId)
      .maybeSingle();

    if (!client) return null;

    const { data: loan } = await supabase
      .from("loan_applications")
      .select(
        "id, status, current_form_step, loan_amount, preferred_period_months, max_monthly_payment, annual_investor_rate, investor_description",
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!loan) {
      // Brak wniosku — zwracamy „pusty" enrich z odpowiednim next_step
      const empty = computeLoanProgress({
        loan: {
          id: "",
          current_form_step: 0,
          status: "",
          loan_amount: null,
          preferred_period_months: null,
        },
        client,
        property: null,
        documents: [],
      });
      return enrichLoanProgress(empty, {
        hasLoan: false,
        hasContact: Boolean(client.first_name && client.phone),
        hasPropertyType: false,
        hasInvestorDescription: false,
        hasLoanTerms: false,
      });
    }

    const [{ data: property }, { data: documents }] = await Promise.all([
      supabase
        .from("properties")
        .select(
          "property_type, city, voivodeship, land_register_number, area_sqm, photos, mpzp_info, land_registry_extract",
        )
        .eq("loan_application_id", loan.id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id, document_type, file_name")
        .eq("loan_application_id", loan.id),
    ]);

    const base = computeLoanProgress({
      loan: {
        id: loan.id,
        current_form_step: loan.current_form_step,
        status: loan.status,
        loan_amount: loan.loan_amount,
        preferred_period_months: loan.preferred_period_months,
      },
      client,
      property,
      documents: documents ?? [],
    });

    return enrichLoanProgress(base, {
      hasLoan: true,
      hasContact: Boolean(client.first_name && client.phone),
      hasPropertyType: Boolean(property?.property_type),
      hasInvestorDescription: Boolean(loan.investor_description),
      hasLoanTerms: Boolean(loan.loan_amount && loan.preferred_period_months),
    });
  });

/**
 * Łączy webhookowy wniosek (np. z Mety) z aktualnie zalogowanym kontem.
 * Idempotentne — jeśli wniosek już ma `client_id` z user_id, zwraca ok.
 * Używa admin clienta, bo musi nadpisać `clients.user_id` na rekordach,
 * które jeszcze nikomu nie należą (RLS blokuje update jako klient).
 */
export const claimLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().uuid("Nieprawidłowy token") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Znajdź wniosek po tokenie
    const { data: loan, error: le } = await supabaseAdmin
      .from("loan_applications")
      .select("id, client_id")
      .eq("return_link_token", data.token)
      .maybeSingle();

    if (le) throw new Error(le.message);
    if (!loan) return { ok: false, reason: "not_found" as const };

    // 2) Znajdź klienta zalogowanego
    const { data: myClient } = await supabaseAdmin
      .from("clients")
      .select("id, user_id")
      .eq("user_id", userId)
      .maybeSingle();

    // 3) Aktualny client_id wniosku
    const { data: leadClient } = await supabaseAdmin
      .from("clients")
      .select("id, user_id, first_name, last_name, email, phone, phone_normalized")
      .eq("id", loan.client_id)
      .maybeSingle();

    if (!leadClient) return { ok: false, reason: "lead_client_missing" as const };

    // Klient wchodzi do panelu po linku powrotnym = rozpoczęty wniosek —
    // powiązany lead znika z puli sprzedażowej pośredników.
    const markStarted = async () => {
      const { markLeadApplicationStartedByLoan } = await import("./leads-split.server");
      await markLeadApplicationStartedByLoan(loan.id, "panel_klienta");
    };

    // 3a) Już zclaimowany przez tego użytkownika — nic do roboty
    if (leadClient.user_id === userId) {
      await markStarted();
      return { ok: true, alreadyClaimed: true, loanId: loan.id };
    }

    // 3b) Lead jeszcze osierocony — przypinamy do tego usera
    if (!leadClient.user_id) {
      if (myClient) {
        // Mam już swojego klienta — przepinamy wniosek na mojego klienta
        const { error: ue } = await supabaseAdmin
          .from("loan_applications")
          .update({ client_id: myClient.id })
          .eq("id", loan.id);
        if (ue) throw new Error(ue.message);

        // Dolewamy dane z leada jeśli mojego klienta nie mają
        await supabaseAdmin
          .from("clients")
          .update({
            email: leadClient.email ?? undefined,
            phone: leadClient.phone ?? undefined,
            phone_normalized: leadClient.phone_normalized ?? undefined,
          })
          .eq("id", myClient.id)
          .is("email", null);

        await markStarted();
        return { ok: true, claimed: true, loanId: loan.id };
      }

      // Nie mam jeszcze klienta — przejmuję rekord leada
      const { error: ce } = await supabaseAdmin
        .from("clients")
        .update({ user_id: userId })
        .eq("id", leadClient.id);
      if (ce) throw new Error(ce.message);
      await markStarted();
      return { ok: true, claimed: true, loanId: loan.id };
    }

    // 3c) Lead przypisany do INNEGO usera — nie ruszamy (anti-hijack)
    return { ok: false, reason: "owned_by_other" as const };
  });
