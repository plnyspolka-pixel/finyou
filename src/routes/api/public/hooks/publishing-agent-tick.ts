// Cron agenta publikującego (pg_cron co godzinę, migracja
// 20261019190000_agent_publikujacy_fundament): bezpieczniki i automatyczna
// pauza przy anomaliach, import metryk publikacji, raport dzienny i tygodniowy
// do właściciela. Nie publikuje — publikują ticki kolejek przez bramkę agenta.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";
import { runPublishingAgentTick } from "@/lib/publishing-agent/agent-tick.server";

async function run(forceReport?: "daily" | "weekly"): Promise<Response> {
  try {
    const result = await runPublishingAgentTick({ forceReport });
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

export const Route = createFileRoute("/api/public/hooks/publishing-agent-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return run();
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
        const report = url.searchParams.get("report");
        return run(report === "daily" || report === "weekly" ? report : undefined);
      },
    },
  },
});
