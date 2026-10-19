// Tick autopilota (co godzinę, pg_cron – migracja 20261019181000):
//   • strażnik anomalii → automatyczna pauza + SMS alarmowy,
//   • raport dzienny o 20:xx (Warszawa), tygodniowy w poniedziałek o 8:xx.
// Sam tick niczego nie publikuje – produkcja i publikacja jadą istniejącymi
// tickami Studia i kolejek, które respektują wyłącznik (withOriginFilter).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(force?: string | null): Promise<Response> {
  try {
    const { runAutopilotWatchdog } = await import("@/lib/autopilot/state.server");
    const { runScheduledReport } = await import("@/lib/autopilot/report.server");
    const { warsawDateParts } = await import("@/lib/autopilot/date-context");
    const now = new Date();
    const watchdog = await runAutopilotWatchdog(now);
    const p = warsawDateParts(now);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
    const reports: Record<string, unknown> = {};
    // Tryb full_autopilot: narzędzia-lead-magnety otwarte (raz na dobę wystarczy).
    const { loadAutopilotConfig } = await import("@/lib/autopilot/state.server");
    const cfg = await loadAutopilotConfig();
    if (cfg.state.mode === "full_autopilot" && !cfg.state.paused && hour === 6) {
      const { ensureToolMagnets } = await import("@/lib/autopilot/tools.server");
      reports.tools = await ensureToolMagnets({ publish: true });
    }
    if (hour === 20 || force === "daily")
      reports.daily = (await runScheduledReport("daily", now)).sms;
    if ((p.weekday === 1 && hour === 8) || force === "weekly")
      reports.weekly = (await runScheduledReport("weekly", now)).sms;
    return new Response(JSON.stringify({ ok: true, watchdog, reports }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/hooks/autopilot-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return runTick(null);
      },
      GET: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const url = new URL(request.url);
        if (url.searchParams.get("run") !== "1") {
          return new Response(
            JSON.stringify({ ok: true, hint: "POST or GET ?run=1[&report=daily|weekly]" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return runTick(url.searchParams.get("report"));
      },
    },
  },
});
