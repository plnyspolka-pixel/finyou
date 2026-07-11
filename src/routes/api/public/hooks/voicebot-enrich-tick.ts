// Cron tick — co 2 minuty zaciąga niegotowe rozmowy voicebota z ElevenLabs.
// Chroniony prywatnym CRON_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/voicebot-enrich-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await requireCronAuth(request);
        if (unauth) return unauth;
        try {
          const { enrichPendingConversations } = await import("@/lib/voicebot-enrich.server");
          const result = await enrichPendingConversations(30);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "exception" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
