// Cron auto-dystrybucji instytucjonalnej: wysyła automatycznie do wszystkich
// aktywnych instytucji wnioski B2B z oceną lokalizacji ściśle > 50 pkt.
// Nie dotyczy indywidualnego Tindera / zleceń prywatnych inwestorów.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/auto-distribution-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { syncAutoDistributionProposals } =
          await import("@/lib/auto-distribution/engine.server");
        try {
          const result = await syncAutoDistributionProposals();
          if (!("disabled" in result) && (result.sent_cases || result.failed)) {
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
