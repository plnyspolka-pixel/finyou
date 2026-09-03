// Server functions podglądu pipeline'u analitycznego (panel admina).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdminOrOperator(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

export const listAnalysisPipelineRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: runs, error } = await (supabaseAdmin as any)
      .from("analysis_pipeline_runs")
      .select("id, loan_application_id, kw_number, status, steps, trigger_reason, error, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const loanIds = [...new Set((runs ?? []).map((r: any) => r.loan_application_id))];
    const { data: loans } = loanIds.length
      ? await supabaseAdmin
          .from("loan_applications")
          .select("id, loan_amount, client:clients(first_name,last_name)")
          .in("id", loanIds as string[])
      : { data: [] };
    const loanById = new Map((loans ?? []).map((l: any) => [l.id, l]));
    return (runs ?? []).map((r: any) => ({ ...r, loan: loanById.get(r.loan_application_id) ?? null }));
  });

/** Ręczne uruchomienie pipeline'u dla wniosku (re-run z panelu). */
export const startAnalysisPipelineRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeKwNumber } = await import("@/lib/kw-fetch.server");

    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("land_register_number")
      .eq("loan_application_id", data.applicationId)
      .maybeSingle();
    const kwNumber = normalizeKwNumber(String(prop?.land_register_number ?? ""));
    if (!kwNumber) throw new Error("Wniosek nie ma poprawnego numeru KW.");

    // Ręczny re-run zamyka ewentualny trwający przebieg i otwiera nowy.
    await (supabaseAdmin as any)
      .from("analysis_pipeline_runs")
      .update({ status: "error", error: "Przerwane ręcznym ponowieniem", finished_at: new Date().toISOString() })
      .eq("loan_application_id", data.applicationId)
      .eq("status", "running");

    const { error } = await (supabaseAdmin as any).from("analysis_pipeline_runs").insert({
      loan_application_id: data.applicationId,
      kw_number: kwNumber,
      status: "running",
      steps: {},
      trigger_reason: "ręcznie z panelu",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
