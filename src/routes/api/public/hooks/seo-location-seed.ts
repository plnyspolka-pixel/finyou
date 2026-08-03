// Generator podstron lokalizacyjnych (programmatic SEO): tworzy/odświeża
// drafty dla TOP 50 miast wg liczby ludności z danych referencyjnych GUS.
// Uruchamiany ręcznie (jednorazowy seed lub odświeżenie po imporcie nowych
// danych): GET ?run=1 lub POST z nagłówkiem x-cron-secret / apikey.
// Publikacją zajmuje się osobny tick: seo-location-publish-tick.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function run(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? "");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
    const { generateLocationPages } = await import("@/lib/seo-location/server");
    const result = await generateLocationPages(limit);
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

export const Route = createFileRoute("/api/public/hooks/seo-location-seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return run(request);
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
        return run(request);
      },
    },
  },
});
