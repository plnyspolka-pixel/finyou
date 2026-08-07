// Cron (co godzinę): sync insights ad-level + uzupełnienie hierarchii ad→adset→kampania.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function run() {
  const out: any = {};
  try {
    const { syncAdLevelInsights } = await import("@/lib/meta-ads-insights.server");
    out.insights = await syncAdLevelInsights();
  } catch (e: any) {
    out.insightsError = String(e?.message ?? e);
  }
  try {
    const { backfillAdHierarchy } = await import("@/lib/messenger-attribution.server");
    out.hierarchy = await backfillAdHierarchy();
  } catch (e: any) {
    out.hierarchyError = String(e?.message ?? e);
  }
  return out;
}

export const Route = createFileRoute("/api/public/hooks/meta-insights-sync-tick")({
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
