// Server functions panelu /admin/auto-dystrybucja: kolejka propozycji
// (zatwierdź/odrzuć), kryteria instytucji i ustawienia globalne.
// Autoryzacja: administrator lub operator (jak ręczna dystrybucja).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseLike = { from: (t: string) => any };

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

/** Kolejka propozycji + ostatnie decyzje, z danymi wniosku. */
export const listAutoDistributionQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: proposals, error } = await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .select("id, loan_application_id, status, eligibility, matches, proposed_at, decided_at, sent_result, error")
      .order("proposed_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const loanIds = [...new Set((proposals ?? []).map((p: any) => p.loan_application_id))];
    const { data: loans } = loanIds.length
      ? await supabaseAdmin
          .from("loan_applications")
          .select(
            "id, status, loan_amount, location_potential_score, client:clients(first_name,last_name), properties(city, land_register_number)",
          )
          .in("id", loanIds as string[])
      : { data: [] };
    const loanById = new Map((loans ?? []).map((l: any) => [l.id, l]));

    return (proposals ?? []).map((p: any) => ({ ...p, loan: loanById.get(p.loan_application_id) ?? null }));
  });

export const decideAutoDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ proposalId: z.string().uuid(), decision: z.enum(["approve", "reject"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);

    if (data.decision === "approve") {
      const { approveProposal } = await import("./engine.server");
      return approveProposal(data.proposalId, context.userId);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("auto_distribution_proposals")
      .update({
        status: "rejected",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.proposalId)
      .eq("status", "proposed");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Instytucje z kryteriami (lista do edycji). */
export const listDistributionCriteria = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: investors }, { data: criteria }] = await Promise.all([
      supabaseAdmin
        .from("investors")
        .select("id, company_name, first_name, last_name, email")
        .eq("investor_type", "instytucjonalny")
        .eq("is_active", true)
        .order("company_name", { ascending: true }),
      (supabaseAdmin as any)
        .from("investor_distribution_criteria")
        .select("investor_id, min_amount, max_amount, auto_send_enabled, accepting_applications, paused_until, notes, updated_at"),
    ]);
    const byInvestor = new Map(((criteria ?? []) as any[]).map((c) => [c.investor_id, c]));
    return (investors ?? []).map((i: any) => ({
      investor_id: i.id,
      name: i.company_name || [i.first_name, i.last_name].filter(Boolean).join(" ") || i.id,
      email: i.email,
      criteria: byInvestor.get(i.id) ?? null,
    }));
  });

export const upsertDistributionCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        investorId: z.string().uuid(),
        minAmount: z.number().nonnegative().nullable(),
        maxAmount: z.number().nonnegative().nullable(),
        autoSendEnabled: z.boolean(),
        acceptingApplications: z.boolean(),
        pausedUntil: z.string().datetime({ offset: true }).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .refine((v) => v.minAmount == null || v.maxAmount == null || v.minAmount <= v.maxAmount, {
        message: "Dolna granica kwoty nie może przekraczać górnej",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("investor_distribution_criteria")
      .upsert({
        investor_id: data.investorId,
        min_amount: data.minAmount,
        max_amount: data.maxAmount,
        auto_send_enabled: data.autoSendEnabled,
        accepting_applications: data.acceptingApplications,
        paused_until: data.pausedUntil ?? null,
        notes: data.notes ?? null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAutoDistributionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { loadAutoDistributionSettings } = await import("./engine.server");
    return loadAutoDistributionSettings();
  });

export const updateAutoDistributionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enabled: z.boolean(),
        minLocationScore: z.number().min(0).max(100),
        dailySendLimit: z.number().int().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("auto_distribution_settings")
      .update({
        enabled: data.enabled,
        min_location_score: data.minLocationScore,
        daily_send_limit: data.dailySendLimit,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ręczne odpalenie przebiegu silnika (poza cronem) — do testów w panelu. */
export const runAutoDistributionSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { syncAutoDistributionProposals } = await import("./engine.server");
    return syncAutoDistributionProposals();
  });
