// Cron: co minutę pull leadów z Meta (backup webhooka).
import { createFileRoute } from "@tanstack/react-router";
import { runMetaLeadsSync } from "@/lib/meta-leads-sync.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/meta-leads-pull")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        try {
          const summary = await runMetaLeadsSync();
          return Response.json({ ok: true, ...summary });
        } catch (e: any) {
          console.error("[meta-leads-pull] error", e?.message);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
          });
        }
      },
    },
  },
});
