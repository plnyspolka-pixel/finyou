// Cron tick — co 2 minuty zaciąga niegotowe rozmowy voicebota z ElevenLabs.
// Endpoint publiczny — chroniony przez Lovable na podstawie ścieżki /api/public/*.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const ADVISORY_LOCK_KEY = 728193462;

export const Route = createFileRoute("/api/public/hooks/voicebot-enrich-tick")({
  server: {
    handlers: {
      POST: async () => {
        const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

        // Prosty advisory lock — nakładające się ticki nie szkodzą,
        // ale ograniczamy równoległe rate-limity ElevenLabs.
        const { data: lockData } = await s.rpc("pg_try_advisory_lock", { key: ADVISORY_LOCK_KEY }).single().then(
          (r) => r,
          () => ({ data: true } as any),
        );
        if (lockData === false) {
          return new Response(JSON.stringify({ ok: false, skipped: "locked" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

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
        } finally {
          try { await s.rpc("pg_advisory_unlock", { key: ADVISORY_LOCK_KEY }); } catch {}
        }
      },
      GET: async () => new Response("ok"),
    },
  },
});
