// Cron tick pipeline'u analitycznego: kwalifikuje kompletne wnioski
// (score > 50) i przesuwa trwające przebiegi KW → właściciele → analiza KW
// → ryzyko. Wyniki lądują w istniejących tabelach modułów; karta oferty
// składa z nich raport na żywo. Przy okazji dokańcza szybkie analizy KW
// inwestorów (wnioski spoza Finance You — investor_kw_checks).
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
        try {
          const sync = await syncAnalysisPipelineRuns();
          const processing = await processAnalysisPipelineRuns();
          // Błąd sprawdzeń inwestorów nie może zatrzymać pipeline'u wniosków.
          const kwChecks = await processInvestorKwChecks().catch((e: any) => ({
            processed: 0,
            error: String(e?.message ?? e),
          }));
          if (sync.started || processing.processed || kwChecks.processed) {
            console.log("[analysis-pipeline-tick]", JSON.stringify({ sync, processing, kwChecks }));
          }
          return Response.json({ ok: true, sync, processing, kwChecks });
        } catch (e: any) {
          console.error("[analysis-pipeline-tick] error", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
    },
  },
});
