// Cron tick lead magnetów: YouTube nie ma webhooków komentarzy, więc co 10
// minut czytamy wątki pod powiązanymi filmami i odpowiadamy linkiem na nowe
// komentarze z hasłem. Facebook i Instagram obsługuje webhook Meta na bieżąco.
// Harmonogram: pg_cron (migracja 20261006150000_lead_magnety).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(): Promise<Response> {
  try {
    const { runLeadMagnetYoutubeTick } = await import("@/lib/lead-magnets/lead-magnets.server");
    const result = await runLeadMagnetYoutubeTick();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/hooks/lead-magnet-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return runTick();
      },
      GET: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const url = new URL(request.url);
        if (url.searchParams.get("run") !== "1") {
          return new Response(JSON.stringify({ ok: true, hint: "POST or GET ?run=1 to trigger" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return runTick();
      },
    },
  },
});
