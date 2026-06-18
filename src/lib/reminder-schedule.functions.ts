// Server functions do zarządzania harmonogramem autopilota maili.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CronExpressionParser } from "cron-parser";
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
    let nextRuns: string[] = [];
    if (data?.cron_expression) {
      try {
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
        CronExpressionParser.parse(data.cron_expression, {
          tz: data.timezone || "Europe/Warsaw",
        });
      } catch (e: any) {
        throw new Error(`Niepoprawny cron: ${e?.message ?? "parse error"}`);
      }
    }

    const patch: Record<string, any> = {};
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
