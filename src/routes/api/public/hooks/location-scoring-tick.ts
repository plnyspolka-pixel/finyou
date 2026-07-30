import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron, co 5 min): automatyczne wyznaczanie potencjału lokalizacyjnego
// dla wniosków oczekujących (status location_scoring_status NULL/PENDING) z
// numerem KW. Idempotentny — po przetworzeniu status jest terminalny, więc
// kolejne ticki nie przeliczają w kółko. Nowe/zmienione numery KW oznaczane są
// jako PENDING przez trigger na tabeli properties (migracja location_scoring_auto).
export const Route = createFileRoute("/api/public/hooks/location-scoring-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runLocationScoringTick } = await import("@/lib/location-scoring.functions");
          const result = await runLocationScoringTick(supabaseAdmin as unknown as SupabaseClient);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[location-scoring-tick] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
