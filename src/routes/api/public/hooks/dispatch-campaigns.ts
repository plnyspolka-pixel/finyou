import { createFileRoute } from "@tanstack/react-router";
import { dispatchScheduledCampaigns } from "@/lib/mailing.functions";

export const Route = createFileRoute("/api/public/hooks/dispatch-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (apikey !== process.env.SUPABASE_ANON_KEY && apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
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
