import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import {
  loadLoanLeadData,
  ELIGIBLE_STATUSES_FOR_REMINDERS,
  computeNextReminder,
  loadHourAnswerScores,
} from "./loan-progress.server";
import { placeOutboundCallInternal } from "./voicebot.functions";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

async function requireStaff(userId: string) {
  const s = admin();
  const { data } = await s.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień (administrator/operator).");
  }
}

/** Szczegóły jednego leada pożyczkowego — używane w panelu admina. */
export const getLoanLeadProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const full = await loadLoanLeadData(data.loanApplicationId);
    if (!full) throw new Error("Wniosek nie znaleziony");
    return full;
  });

/** Lista leadów do dashboardu przypomnień. */
export const listReminderDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        onlyActive: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const s = admin();
    let q = s
      .from("loan_applications")
      .select(
        "id,status,current_form_step,loan_amount,reminder_attempts,next_reminder_at,first_reminder_at,last_reminder_at,reminder_paused,missing_documents_snapshot,created_at,client_id",
      )
      .order("next_reminder_at", { ascending: true, nullsFirst: false })
      .limit(data.limit);
    if (data.onlyActive) q = q.in("status", ELIGIBLE_STATUSES_FOR_REMINDERS);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const clientIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.client_id).filter(Boolean)),
    );
    const propsMap: Record<string, any> = {};
    const clientsMap: Record<string, any> = {};
    if (clientIds.length) {
      const { data: cl } = await s
        .from("clients")
        .select("id,first_name,last_name,phone_normalized,phone")
        .in("id", clientIds);
      for (const c of cl ?? []) clientsMap[c.id] = c;
    }
    const loanIds = (rows ?? []).map((r: any) => r.id);
    if (loanIds.length) {
      const { data: pr } = await s
        .from("properties")
        .select("loan_application_id,property_type,city")
        .in("loan_application_id", loanIds);
      for (const p of pr ?? []) propsMap[p.loan_application_id] = p;
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      client: r.client_id ? (clientsMap[r.client_id] ?? null) : null,
      property: propsMap[r.id] ?? null,
    }));
  });

/** Ręczne uruchomienie przypomnienia — przycisk „Zadzwoń teraz". */
export const triggerReminderCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    return await placeReminderCall(data.loanApplicationId, "admin_manual");
  });

/** Pauza / wznowienie przypomnień. */
export const setReminderPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ loanApplicationId: z.string().uuid(), paused: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const s = admin();
    const { error } = await s
      .from("loan_applications")
      .update({ reminder_paused: data.paused })
      .eq("id", data.loanApplicationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Wewnętrzny worker — używany przez cron i ręczny trigger. */
export async function placeReminderCall(
  loanApplicationId: string,
  source: string,
): Promise<{ ok: boolean; error?: string; skipped?: string; conversationId?: string }> {
  const full = await loadLoanLeadData(loanApplicationId);
  if (!full) return { ok: false, error: "Wniosek nie znaleziony" };
  if (full.progress.is_complete) {
    // nic do przypominania — wniosek kompletny
    return { ok: true, skipped: "complete" };
  }
  // Klient poprosił o usunięcie / nie dzwonić — zatrzymaj.
  if ((full.client as any)?.do_not_call === true) {
    const s = admin();
    await s
      .from("loan_applications")
      .update({ reminder_paused: true, next_reminder_at: null })
      .eq("id", loanApplicationId);
    return { ok: true, skipped: "do_not_call" };
  }
  const phone = full.client?.phone_normalized ?? full.client?.phone;
  if (!phone) return { ok: false, error: "Brak numeru telefonu klienta" };

  const result = await placeOutboundCallInternal({
    phone,
    source,
    clientId: full.client?.id ?? full.loan.client_id ?? null,
    loanApplicationId,
    firstName: full.client?.first_name ?? null,
    dynamicVariables: full.variables,
  });

  // Zaktualizuj liczniki przypomnień (niezależnie od sukcesu telefonowania)
  const s = admin();
  const now = new Date();
  const attempts = (full.loan.reminder_attempts ?? 0) + 1;
  const firstAt = full.loan.first_reminder_at ? new Date(full.loan.first_reminder_at) : now;
  const hourScores = await loadHourAnswerScores().catch(() => ({}));
  const next = computeNextReminder({ attempts, firstReminderAt: firstAt, now, hourScores });
  await s
    .from("loan_applications")
    .update({
      reminder_attempts: attempts,
      last_reminder_at: now.toISOString(),
      first_reminder_at: full.loan.first_reminder_at ?? now.toISOString(),
      next_reminder_at: next.nextAt ? next.nextAt.toISOString() : null,
      missing_documents_snapshot: full.progress.missing_documents as any,
    })
    .eq("id", loanApplicationId);

  return result;
}
