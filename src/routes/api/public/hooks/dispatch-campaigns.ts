import { createFileRoute } from "@tanstack/react-router";
import { dispatchScheduledCampaigns } from "@/lib/mailing.functions";
import { requireCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/dispatch-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await requireCronAuth(request);
        if (unauth) return unauth;
        try {
          const r = await dispatchScheduledCampaigns(200);
          return Response.json({ ok: true, ...r });
        } catch (e: any) {
          console.error("dispatch-campaigns failed:", e);
          return Response.json({ ok: false, error: String(e.message) }, { status: 500 });
        }
      },
    },
  },
});
