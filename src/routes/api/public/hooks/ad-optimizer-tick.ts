// Cron (co 6 h): silnik reguł — pauzy/skalowanie/flagi wg CPQL.
// Uwaga: startuje w dry_run (ad_optimizer_config.dry_run=true) — tylko loguje.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function run() {
  try {
    const { runAdOptimizer } = await import("@/lib/ad-optimizer.server");
    return await runAdOptimizer();
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/ad-optimizer-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return new Response(JSON.stringify({ ok: true, ...(await run()) }), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return new Response(JSON.stringify({ ok: true, ...(await run()) }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
