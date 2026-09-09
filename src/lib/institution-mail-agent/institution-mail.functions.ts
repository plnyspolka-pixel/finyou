// Server functions panelu: propozycje zmian kryteriów (z maili instytucji)
// i wątki pytań instytucja ↔ klient.
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

export const listCriteriaChangeProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: proposals, error } = await (supabaseAdmin as any)
      .from("criteria_change_proposals")
      .select("id, investor_id, proposed_patch, summary, status, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const invIds = [...new Set((proposals ?? []).map((p: any) => p.investor_id))];
    const { data: investors } = invIds.length
      ? await supabaseAdmin
          .from("investors")
          .select("id, company_name, first_name, last_name")
          .in("id", invIds as string[])
      : { data: [] };
    const byId = new Map(
      (investors ?? []).map((i: any) => [
        i.id,
        i.company_name || [i.first_name, i.last_name].filter(Boolean).join(" ") || i.id,
      ]),
    );
    return (proposals ?? []).map((p: any) => ({
      ...p,
      investor_name: byId.get(p.investor_id) ?? p.investor_id,
    }));
  });

export const decideCriteriaChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ proposalId: z.string().uuid(), decision: z.enum(["apply", "reject"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: proposal } = await (supabaseAdmin as any)
      .from("criteria_change_proposals")
      .select("id, investor_id, proposed_patch, summary, status")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (!proposal) throw new Error("Nie znaleziono propozycji");
    if (proposal.status !== "proposed") throw new Error(`Propozycja ma status ${proposal.status}`);

    if (data.decision === "apply") {
      const patch = proposal.proposed_patch ?? {};
      const { data: existing } = await (supabaseAdmin as any)
        .from("investor_distribution_criteria")
        .select("investor_id, notes")
        .eq("investor_id", proposal.investor_id)
        .maybeSingle();
      const notes = [existing?.notes, proposal.summary ? `Z maila: ${proposal.summary}` : null]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1900);
      const { error: upErr } = await (supabaseAdmin as any)
        .from("investor_distribution_criteria")
        .upsert({
          investor_id: proposal.investor_id,
          ...patch,
          notes: notes || null,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        });
      if (upErr) throw new Error(upErr.message);
    }

    const { error } = await (supabaseAdmin as any)
      .from("criteria_change_proposals")
      .update({
        status: data.decision === "apply" ? "applied" : "rejected",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", proposal.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInstitutionQaThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deriveQaThreadState } = await import("./qa-questions");
    const { data: threads, error } = await (supabaseAdmin as any)
      .from("institution_qa_threads")
      .select(
        "id, loan_application_id, questions, office_questions, status, client_channel, " +
          "client_lead_id, client_answer, blocked_reason, last_attempt_at, attempt_count, " +
          "last_sent_to_client_at, last_reminder_at, reminder_count, answers_read_until, " +
          "forwarded_at, closed_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const loanIds = [...new Set((threads ?? []).map((t: any) => t.loan_application_id))];
    const { data: loans } = loanIds.length
      ? await supabaseAdmin
          .from("loan_applications")
          .select(
            "id, loan_amount, client:clients(id,first_name,last_name,email,phone), properties(photos)",
          )
          .in("id", loanIds as string[])
      : { data: [] };
    const byId = new Map((loans ?? []).map((l: any) => [l.id, l]));
    return (threads ?? []).map((t: any) => ({
      ...t,
      loan: byId.get(t.loan_application_id) ?? null,
      state: deriveQaThreadState(t),
    }));
  });

/** „Wyślij teraz" — pomija limit 1/dobę i zwraca powód, gdy się nie udało. */
export const sendQaThreadNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { sendPendingQuestionsToClients } = await import("./engine.server");
    const res = await sendPendingQuestionsToClients({ threadId: data.threadId, force: true });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: thread } = await (supabaseAdmin as any)
      .from("institution_qa_threads")
      .select("blocked_reason, client_channel")
      .eq("id", data.threadId)
      .maybeSingle();
    if (res.sent || res.reminders)
      return {
        ok: true,
        reminder: res.reminders > 0,
        channel: thread?.client_channel ?? null,
      };
    return {
      ok: false,
      error:
        thread?.blocked_reason ??
        "Nie było czego wysłać (brak nowych pytań i nic nie czeka na odpowiedź).",
    };
  });

/** Ręczne domknięcie wątku — np. gdy sprawę załatwiono telefonicznie. */
export const closeQaThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await (supabaseAdmin as any)
      .from("institution_qa_threads")
      .update({
        status: "zamkniete",
        closed_at: now,
        closed_by: context.userId,
        blocked_reason: null,
        updated_at: now,
      })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Odhaczenie pytania, na które odpowiada biuro (dane z KW / status wniosku). */
export const setOfficeQuestionHandled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ threadId: z.string().uuid(), key: z.string().min(1), handled: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: thread } = await (supabaseAdmin as any)
      .from("institution_qa_threads")
      .select("id, office_questions")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread) throw new Error("Nie znaleziono wątku");
    const now = new Date().toISOString();
    const next = ((thread.office_questions ?? []) as any[]).map((q) =>
      q?.key === data.key ? { ...q, handled_at: data.handled ? now : null } : q,
    );
    const { error } = await (supabaseAdmin as any)
      .from("institution_qa_threads")
      .update({ office_questions: next, updated_at: now })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ręczne uruchomienie pełnego przebiegu agenta (przycisk w panelu). */
export const runInstitutionMailAgentNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { runInstitutionMailAgent } = await import("./engine.server");
    return await runInstitutionMailAgent();
  });

export const getInstitutionMailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { loadInstitutionMailSettings } = await import("./engine.server");
    return loadInstitutionMailSettings();
  });

/** Stop-klatka wysyłek: agent zbiera i przygotowuje, wysyła operator. */
export const setInstitutionMailOutboundPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paused: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("institution_mail_agent_settings").upsert({
      id: 1,
      outbound_paused: data.paused,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true, paused: data.paused };
  });
