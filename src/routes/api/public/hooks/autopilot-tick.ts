// Cron tick autopilota agenta publikującego (docs/agent-publikujacy):
// anomalie i automatyczna pauza, import metryk publikacji, raporty do
// właściciela, a w trybie full_autopilot — publikacja gotowych rolek Studia
// w slotach torów po bramce compliance. Harmonogram: pg_cron co godzinę
// (migracja 20261019180000_agent_publikujacy_autopilot).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(): Promise<Response> {
  try {
    const { runAutopilotTick } = await import("@/lib/autopilot/autopilot.server");
    const result = await runAutopilotTick();
    return new Response(JSON.stringify(result), {
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
