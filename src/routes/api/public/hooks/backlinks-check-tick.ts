// Tygodniowy monitoring backlinków: dla najwyżej 50 wierszy ai_backlinks
// ze statusem 'live' / 'pending' (najdawniej sprawdzane najpierw) pobiera
// stronę źródłową i sprawdza, czy nadal linkuje do financeyou.pl —
// 'live' (+ dofollow) / 'lost'; błąd sieci zostawia status bez zmian.
// Szczegóły: src/lib/backlinks-monitor.server.ts. Wyniki trafiają do
// sekcji „Backlinki" poniedziałkowego raportu social media.
// Harmonogram: pg_cron w niedziele 04:00 UTC (migracja 20261006170000_monitoring_backlinkow).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(): Promise<Response> {
  try {
    const { runBacklinksCheckTick } = await import("@/lib/backlinks-monitor.server");
    const result = await runBacklinksCheckTick();
    return new Response(JSON.stringify(result), {
      status: result.ok === false ? 500 : 200,
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

export const Route = createFileRoute("/api/public/hooks/backlinks-check-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return runTick();
      },
      GET: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const url = new URL(request.url);
        if (url.searchParams.get("run") !== "1") {
          return new Response(JSON.stringify({ ok: true, hint: "POST or GET ?run=1 to trigger" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return runTick();
      },
    },
  },
});
