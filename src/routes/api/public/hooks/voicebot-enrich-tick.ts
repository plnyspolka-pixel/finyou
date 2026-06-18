// Cron tick — co 2 minuty zaciąga niegotowe rozmowy voicebota z ElevenLabs.
// Endpoint /api/public/* — chroniony przez Lovable na poziomie ścieżki.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/voicebot-enrich-tick")({
  server: {
    handlers: {
      POST: async () => {
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
      GET: async () => new Response("ok"),
    },
  },
});
