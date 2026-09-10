// Cron: co godzinę odświeżenie kont reklamowych i kampanii Meta
// (statusy, budżety, wydatki, CPL). Bez tego panel /admin/meta pokazywał
// dane z ostatniego ręcznego kliknięcia.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/meta-ads-sync-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        try {
          const { runMetaAdsSync } = await import("@/lib/meta-ads.server");
          const summary = await runMetaAdsSync();
          return Response.json({ ok: true, ...summary });
        } catch (e: any) {
          console.error("[meta-ads-sync-tick] error", e?.message);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
