// Tick autopilota (co godzinę, pg_cron – migracja 20261019181000):
//   • strażnik anomalii → automatyczna pauza + SMS alarmowy,
//   • raport dzienny o 20:xx (Warszawa), tygodniowy w poniedziałek o 8:xx.
// W full_autopilot tick produkuje rolki z lead magnetów (gdy zapas toru jest
// poniżej bufora) i planuje gotowe rolki Studia w slotach torów (po bramce
// compliance); samą wysyłkę robią istniejące ticki kolejek, które respektują
// wyłącznik (withOriginFilter) i mają kontrolę końcową compliance.
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
    // Import metryk publikacji raz na dobę (tylko odczyt z platform).
    if (hour === 5 || force === "metrics") {
      const { importPublicationMetrics } = await import("@/lib/autopilot/metrics-import.server");
      reports.metrics = await importPublicationMetrics();
    }
    // Sekwencje powitalne – tylko w ciągu dnia (8–20), tylko full_autopilot.
    if (hour >= 8 && hour <= 20) {
      const { runWelcomeSequences } = await import("@/lib/autopilot/sequences.server");
      reports.sequences = await runWelcomeSequences(now);
    }
    // Tryb full_autopilot: narzędzia-lead-magnety otwarte (raz na dobę wystarczy).
    const { loadAutopilotConfig } = await import("@/lib/autopilot/state.server");
    const cfg = await loadAutopilotConfig();
    if (cfg.state.mode === "full_autopilot" && !cfg.state.paused && hour === 6) {
      const { ensureToolMagnets } = await import("@/lib/autopilot/tools.server");
      reports.tools = await ensureToolMagnets({ publish: true });
      // Katalog startowy PDF (START, KSIĘGA, BŁĘDY, ODMOWA, DOKUMENTY, PROCES):
      // brakujące rekordy + publikacja po kontroli jakości; bez nadpisywania copy.
      const { ensureCatalogMagnets } = await import("@/lib/lead-magnets/catalog.server");
      reports.catalog = await ensureCatalogMagnets({ publish: true }).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      }));
    }
    // Produkcja rolek z lead magnetów (Etap 1): gdy zapas toru spada poniżej
    // bufora, autopilot pisze scenariusz (seria + hasło), przepuszcza go przez
    // bramkę i zakłada job w Studiu; render robi tick Studia.
    if (cfg.state.mode === "full_autopilot" && !cfg.state.paused) {
      const { produceReels } = await import("@/lib/autopilot/production.server");
      reports.production = await produceReels({ now }).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      }));
    }
    // Gotowe rolki Studia → bramka compliance → sloty torów (tylko
    // full_autopilot bez wyłącznika; funkcja sama sprawdza tryb).
    if (cfg.state.mode === "full_autopilot" && !cfg.state.paused) {
      const { scheduleReadyReels } = await import("@/lib/autopilot/ready-reels.server");
      reports.readyReels = await scheduleReadyReels(now).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      }));
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
            JSON.stringify({ ok: true, hint: "POST or GET ?run=1[&report=daily|weekly|metrics]" }),
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
