// Server functions do zarządzania harmonogramem autopilota maili.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function ensureAdmin(ctx: any) {
  const { data: ok } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "administrator",
  });
  if (!ok) throw new Error("Forbidden");
}

export const getReminderSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("reminder_email_schedule")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;

    // Policz dzisiejsze wysyłki + następne 3 zaplanowane terminy.
    const nextRuns: string[] = [];
    if (data?.cron_expression) {
      try {
        const { CronExpressionParser } = await import("cron-parser");
        const it = CronExpressionParser.parse(data.cron_expression, {
          tz: data.timezone || "Europe/Warsaw",
        });
        for (let i = 0; i < 3; i++) nextRuns.push(it.next().toDate().toISOString());
      } catch {
        /* invalid cron — UI pokaże komunikat */
      }
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { count: sentToday } = await context.supabase
      .from("loan_reminder_email_sends")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", dayStart.toISOString());

    return { schedule: data, nextRuns, sentToday: sentToday ?? 0 };
  });

/** Ręczne, natychmiastowe odpalenie batcha maili (force — omija okno 8:00/20:00).
 *  Zwraca wynik + diagnostykę (ile aktywnych szablonów jest w bazie), żeby od razu
 *  było widać, czy seed 120 szablonów się zastosował i czy maile wychodzą. */
export const triggerReminderEmailsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);

    // Diagnostyka: liczba aktywnych szablonów w sekwencji.
    const { count: activeVariants } = await context.supabase
      .from("loan_reminder_email_variants")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .not("sequence_index", "is", null);

    const { runDailyReminderEmailsBatch } = await import("@/lib/loan-reminder-emails.server");
    const result = await runDailyReminderEmailsBatch({ force: true });

    // Zapisz też do harmonogramu (żeby „ostatni wynik" w karcie się odświeżył).
    await context.supabase
      .from("reminder_email_schedule")
      .update({ last_run_at: new Date().toISOString(), last_result: result as any })
      .eq("id", 1);

    return { activeVariants: activeVariants ?? 0, result };
  });

/** Wysyła PIERWSZE N szablonów z bazy przypomnień na wskazany adres (podgląd/test).
 *  Renderuje realne treści (temat + HTML + CTA) tak, jak zobaczy je klient. Admin-only. */
export const sendFollowupSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        to: z.string().email(),
        count: z.number().int().min(1).max(20).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    const { EMAIL_FOLLOW_UPS, renderFollowUp, buildFollowUpVars } =
      await import("@/lib/follow-up-templates");
    const { sendResendEmail } = await import("@/lib/resend-send.server");

    const vars = buildFollowUpVars({
      firstName: "Test",
      link: "https://financeyou.pl",
      loanAmount: "150 000 zł",
    });

    const n = Math.min(data.count, EMAIL_FOLLOW_UPS.length);
    const results: Array<{ i: number; subject: string; ok: boolean; error?: string }> = [];
    for (let i = 0; i < n; i++) {
      const tpl = EMAIL_FOLLOW_UPS[i];
      const subject = `[${i + 1}/${n}] ${renderFollowUp(tpl.subject, vars)}`
        .replace(/\{\{[^}]+\}\}/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const html = renderFollowUp(tpl.body, vars);
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const r = await sendResendEmail({
        to: data.to,
        subject,
        text,
        html,
        fromName: "Ania z Finance You",
      });
      results.push({ i: i + 1, subject, ok: r.ok, error: r.error });
    }
    const sent = results.filter((r) => r.ok).length;
    return { to: data.to, sent, total: n, results };
  });

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  cron_expression: z.string().min(5).max(120).optional(),
  timezone: z.string().min(2).max(64).optional(),
});

export const updateReminderSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);

    if (data.cron_expression) {
      try {
        const { CronExpressionParser } = await import("cron-parser");
        CronExpressionParser.parse(data.cron_expression, {
          tz: data.timezone || "Europe/Warsaw",
        });
      } catch (e: any) {
        throw new Error(`Niepoprawny cron: ${e?.message ?? "parse error"}`);
      }
    }

    const patch: { enabled?: boolean; cron_expression?: string; timezone?: string } = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.cron_expression !== undefined) patch.cron_expression = data.cron_expression;
    if (data.timezone !== undefined) patch.timezone = data.timezone;

    const { error } = await context.supabase
      .from("reminder_email_schedule")
      .update(patch)
      .eq("id", 1);
    if (error) throw error;
    return { ok: true };
  });
