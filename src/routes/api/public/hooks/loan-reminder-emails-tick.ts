// Cron tick co minutę: sprawdza konfigurację w `reminder_email_schedule`
// i wywołuje batch tylko jeśli aktualna minuta pasuje do wyrażenia cron.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export const Route = createFileRoute("/api/public/hooks/loan-reminder-emails-tick")({
  server: {
    handlers: {
      POST: async () => {
        const s = admin();
        const { data: cfg } = await s
          .from("reminder_email_schedule")
          .select("enabled, cron_expression, timezone, last_tick_at")
          .eq("id", 1)
          .maybeSingle();

        const nowIso = new Date().toISOString();
        // Zawsze odświeżamy last_tick_at — wiadomo, że cron działa.
        await s.from("reminder_email_schedule").update({ last_tick_at: nowIso }).eq("id", 1);

        if (!cfg) {
          return Response.json({ ok: false, skipped: "no_config" });
        }
        if (!cfg.enabled) {
          return Response.json({ ok: true, skipped: "disabled" });
        }

        // Czy zgodnie z cronem powinniśmy odpalić batch w okresie od ostatniego ticka do teraz?
        const tz = cfg.timezone || "Europe/Warsaw";
        const lastTick = cfg.last_tick_at ? new Date(cfg.last_tick_at) : new Date(Date.now() - 90 * 1000);
        let due = false;
        try {
          const { CronExpressionParser } = await import("cron-parser");
          const it = CronExpressionParser.parse(cfg.cron_expression, {
            currentDate: lastTick,
            tz,
          });
          const next = it.next().toDate();
          if (next.getTime() <= Date.now()) due = true;
        } catch (e: any) {
          return Response.json({ ok: false, skipped: "invalid_cron", error: e?.message }, { status: 400 });
        }

        if (!due) {
          return Response.json({ ok: true, skipped: "not_due" });
        }

        const { runDailyReminderEmailsBatch } = await import("@/lib/loan-reminder-emails.server");
        const result = await runDailyReminderEmailsBatch({ force: false });
        await s
          .from("reminder_email_schedule")
          .update({ last_run_at: new Date().toISOString(), last_result: result as any })
          .eq("id", 1);

        return Response.json({ ok: true, ran: true, result });
      },
    },
  },
});
