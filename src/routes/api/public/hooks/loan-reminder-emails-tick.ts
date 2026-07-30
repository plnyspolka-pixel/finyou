// Cron tick co minutę: sprawdza konfigurację w `reminder_email_schedule`
// i wywołuje batch tylko jeśli aktualna minuta pasuje do wyrażenia cron.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { requireCronSecret } from "@/lib/cron-auth.server";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export const Route = createFileRoute("/api/public/hooks/loan-reminder-emails-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const s = admin();
        const { data: cfg } = await s
          .from("reminder_email_schedule")
          .select("enabled, cron_expression, timezone, last_tick_at, sample_sent_at")
          .eq("id", 1)
          .maybeSingle();

        const nowIso = new Date().toISOString();
        // Zawsze odświeżamy last_tick_at — wiadomo, że cron działa.
        await s.from("reminder_email_schedule").update({ last_tick_at: nowIso }).eq("id", 1);

        // JEDNORAZOWO po deployu: wyślij próbkę pierwszych 10 szablonów na adres testowy,
        // żeby od razu potwierdzić, że cała ścieżka cron→endpoint→poczta działa.
        // Flagę ustawiamy PRZED wysyłką (anty-duplikat przy równoległych tickach).
        if (cfg && !(cfg as any).sample_sent_at) {
          await s.from("reminder_email_schedule").update({ sample_sent_at: nowIso }).eq("id", 1);
          try {
            const { EMAIL_FOLLOW_UPS, renderFollowUp, buildFollowUpVars } =
              await import("@/lib/follow-up-templates");
            const { sendResendEmail } = await import("@/lib/resend-send.server");
            const to = process.env.FOLLOWUP_SAMPLE_RECIPIENT || "plnyspolka@gmail.com";
            const vars = buildFollowUpVars({
              firstName: "Test",
              link: "https://financeyou.pl",
              loanAmount: "150 000 zł",
            });
            const n = Math.min(10, EMAIL_FOLLOW_UPS.length);
            const sample: Array<{ i: number; ok: boolean; error?: string }> = [];
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
                to,
                subject,
                text,
                html,
                fromName: "Ania z Finance You",
              });
              sample.push({ i: i + 1, ok: r.ok, error: r.error });
            }
            await s
              .from("reminder_email_schedule")
              .update({
                last_result: {
                  deploy_sample: { to, sent: sample.filter((x) => x.ok).length, sample },
                } as any,
              })
              .eq("id", 1);
          } catch (e: any) {
            console.error("[loan-reminder-emails-tick] deploy sample error", e?.message);
          }
        }

        if (!cfg) {
          return Response.json({ ok: false, skipped: "no_config" });
        }
        if (!cfg.enabled) {
          return Response.json({ ok: true, skipped: "disabled" });
        }

        // Czy zgodnie z cronem powinniśmy odpalić batch w okresie od ostatniego ticka do teraz?
        const tz = cfg.timezone || "Europe/Warsaw";
        const lastTick = cfg.last_tick_at
          ? new Date(cfg.last_tick_at)
          : new Date(Date.now() - 90 * 1000);
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
          return Response.json(
            { ok: false, skipped: "invalid_cron", error: e?.message },
            { status: 400 },
          );
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
