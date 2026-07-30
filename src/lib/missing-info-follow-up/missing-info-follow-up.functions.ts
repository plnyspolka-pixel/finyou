// Server functions panelu „Follow-up braków" (admin/operator).
//
// Lista wpisów z briefami, pauza/wznowienie, podgląd treści per kanał
// i ręczne „wyślij teraz". Realną wysyłkę wykonuje silnik (engine.server.ts,
// service role) — tutaj tylko autoryzacja i cienka warstwa wejścia/wyjścia.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireOperator(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

/** Lista wpisów follow-upu braków z danymi wniosku i klienta. */
export const listMissingInfoFollowUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ status: z.enum(["active", "complete", "stopped", "all"]).optional() })
      .optional()
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseClient;
    await requireOperator(supabase, context.userId);

    let q = (supabase as any)
      .from("missing_info_follow_ups")
      .select(
        "id, loan_application_id, status, paused, brief_json, brief_hash, attempt_count, last_channel, last_sent_at, next_send_at, last_error, created_at, updated_at",
      )
      .order("next_send_at", { ascending: true, nullsFirst: false })
      .limit(500);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const loanIds = ((rows as any[]) ?? []).map((r) => r.loan_application_id);
    const loanById = new Map<string, any>();
    if (loanIds.length > 0) {
      const { data: loans } = await supabase
        .from("loan_applications")
        .select(
          "id, status, loan_amount, client:clients(first_name, last_name, email, phone, do_not_email, do_not_sms)",
        )
        .in("id", loanIds);
      for (const l of (loans as any[]) ?? []) loanById.set(l.id, l);
    }

    return ((rows as any[]) ?? []).map((r) => ({
      ...r,
      loan: loanById.get(r.loan_application_id) ?? null,
    }));
  });

/** Historia wysyłek dla wniosku (dialog szczegółów). */
export const listMissingInfoSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseClient;
    await requireOperator(supabase, context.userId);
    const { data: rows, error } = await (supabase as any)
      .from("missing_info_follow_up_sends")
      .select("id, channel, attempt_number, subject, content, status, error_message, created_at")
      .eq("loan_application_id", data.loanApplicationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Pauza / wznowienie follow-upu dla wniosku. */
export const setMissingInfoPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ loanApplicationId: z.string().uuid(), paused: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseClient;
    await requireOperator(supabase, context.userId);
    const { error } = await (supabase as any)
      .from("missing_info_follow_ups")
      .update({ paused: data.paused, ...(data.paused ? {} : { status: "active" }) })
      .eq("loan_application_id", data.loanApplicationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Podgląd treści wszystkich kanałów dla wniosku (bez wysyłki). */
export const previewMissingInfoMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseClient;
    await requireOperator(supabase, context.userId);

    const { buildBriefBundles } = await import("./engine.server");
    const { composeEmailSubject, composeEmailText, composeSms, composeMessenger } =
      await import("./templates");
    const bundles = await buildBriefBundles([data.loanApplicationId]);
    const bundle = bundles.get(data.loanApplicationId);
    if (!bundle) throw new Error("Nie znaleziono wniosku.");
    const vars = {
      firstName: bundle.loan.client?.first_name ?? null,
      link: `${process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://financeyou.pl"}/wniosek/${bundle.loan.return_link_token ?? "…"}`,
      attempt: 1,
    };
    return {
      brief: bundle.brief,
      email: {
        subject: composeEmailSubject(bundle.brief, vars),
        text: composeEmailText(bundle.brief, vars),
      },
      sms: composeSms(bundle.brief, vars),
      messenger: composeMessenger(bundle.brief, vars),
    };
  });

/** Ręczna wysyłka „teraz" (opcjonalnie wymuszony kanał). */
export const sendMissingInfoNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        loanApplicationId: z.string().uuid(),
        channel: z.enum(["email", "sms", "messenger"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseClient;
    await requireOperator(supabase, context.userId);
    const { processMissingInfoFollowUps } = await import("./engine.server");
    const res = await processMissingInfoFollowUps({
      force: true,
      onlyLoanId: data.loanApplicationId,
      forceChannel: data.channel,
    });
    return (
      res.results[0] ?? {
        loanApplicationId: data.loanApplicationId,
        ok: false,
        skipped: "not_enrolled",
      }
    );
  });
