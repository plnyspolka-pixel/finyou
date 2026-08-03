// Cron tick Studia publikacji: publikuje wymagalne wpisy z kolejki
// social_publish_queue (FB post / FB Reels / IG Reels przez Meta Graph API)
// i domyka dwuetapowe publikacje IG (kontener → media_publish).
// Harmonogram: pg_cron co 10 minut (migracja 20260803130000_studio_publikacji).
import { createFileRoute } from "@tanstack/react-router";
import { runSocialPublishTick } from "@/lib/studio-publishing.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(): Promise<Response> {
  try {
    const result = await runSocialPublishTick();
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

export const Route = createFileRoute("/api/public/hooks/social-publish-tick")({
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
