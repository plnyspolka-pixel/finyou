// Cron tick pipeline'u analitycznego (co 5 min): najpierw dokańcza szybkie
// analizy KW inwestorów (wnioski spoza Finance You — investor_kw_checks),
// potem kwalifikuje kompletne wnioski (score > 50, co 15 min) i przesuwa
// trwające przebiegi KW → właściciele → analiza KW → ryzyko. Wyniki lądują
// w istniejących tabelach modułów; karta oferty składa z nich raport na
// żywo. Ocenę ryzyka inwestorów zleca zwykle panel od razu po krokach 1–3 —
// tick jest siatką bezpieczeństwa (kolejność i budżet: analysis-pipeline/tick).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/analysis-pipeline-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { syncAnalysisPipelineRuns, processAnalysisPipelineRuns } =
          await import("@/lib/analysis-pipeline/engine.server");
        const { processInvestorKwChecks } =
          await import("@/lib/investor-analytics/kw-checks.server");
        const { runAnalysisPipelineTick } = await import("@/lib/analysis-pipeline/tick");
        const result = await runAnalysisPipelineTick({
          processInvestorKwChecks,
          syncAnalysisPipelineRuns,
          processAnalysisPipelineRuns,
        });
        const { sync, processing, kwChecks } = result;
        if (sync?.started || processing?.processed || kwChecks.processed || kwChecks.error) {
          console.log("[analysis-pipeline-tick]", JSON.stringify({ sync, processing, kwChecks }));
        }
        if (!result.ok) {
          console.error("[analysis-pipeline-tick] error", result.errors.join("; "));
          return Response.json(result, { status: 500 });
        }
        return Response.json(result);
      },
    },
  },
});
