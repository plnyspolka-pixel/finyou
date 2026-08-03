// Cron tick publikacji podstron lokalizacyjnych: raz w tygodniu publikuje
// partię (~10) najstarszych draftów z seo_location_pages i pinguje sitemapę.
// Harmonogram: pg_cron poniedziałek 06:00 UTC
// (migracja 20260803150000_seo_location_pages).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const batchParam = Number(url.searchParams.get("batch") ?? "");
    const batch = Number.isFinite(batchParam) && batchParam > 0 ? Math.min(batchParam, 50) : 10;
    const { publishLocationPagesBatch } = await import("@/lib/seo-location/server");
    const result = await publishLocationPagesBatch(batch);
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

export const Route = createFileRoute("/api/public/hooks/seo-location-publish-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return runTick(request);
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
        return runTick(request);
      },
    },
  },
});
