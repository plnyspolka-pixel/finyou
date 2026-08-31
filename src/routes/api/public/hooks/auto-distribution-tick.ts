// Cron tick auto-dystrybucji: kwalifikuje kompletne wnioski i tworzy
// PROPOZYCJE wysyłki (auto_distribution_proposals). Wysyłka wyłącznie po
// zatwierdzeniu w /admin/auto-dystrybucja (rozruch z zatwierdzaniem).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/auto-distribution-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { syncAutoDistributionProposals } = await import(
          "@/lib/auto-distribution/engine.server"
        );
        try {
          const result = await syncAutoDistributionProposals();
          if (!("disabled" in result) && (result.proposed || result.refreshed)) {
            console.log("[auto-distribution-tick]", JSON.stringify(result));
          }
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("[auto-distribution-tick] error", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
    },
  },
});
