// Cron tick pipeline'u analitycznego: kwalifikuje kompletne wnioski
// (score > 50) i przesuwa trwające przebiegi KW → właściciele → analiza KW
// → ryzyko. Wyniki lądują w istniejących tabelach modułów; karta oferty
// składa z nich raport na żywo.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/analysis-pipeline-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { syncAnalysisPipelineRuns, processAnalysisPipelineRuns } = await import(
          "@/lib/analysis-pipeline/engine.server"
        );
        try {
          const sync = await syncAnalysisPipelineRuns();
          const processing = await processAnalysisPipelineRuns();
          if (sync.started || processing.processed) {
            console.log("[analysis-pipeline-tick]", JSON.stringify({ sync, processing }));
          }
          return Response.json({ ok: true, sync, processing });
        } catch (e: any) {
          console.error("[analysis-pipeline-tick] error", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
    },
  },
});
