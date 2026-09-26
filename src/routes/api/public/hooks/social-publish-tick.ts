// Cron tick Studia publikacji: publikuje wymagalne wpisy z kolejki
// social_publish_queue (FB post / FB Reels / IG Reels przez Meta Graph API,
// TikTok przez Content Posting API), domyka dwuetapowe publikacje IG
// (kontener → media_publish) i TikToka (upload → polling statusu), odświeża
// token TikToka oraz obsługuje kolejkę wsadową wideo HeyGen (joby 'queued'
// i polling renderów z auto-publikacją) — dzięki temu batch i auto-publikacja
// działają także przy zamkniętej przeglądarce.
// Harmonogram: pg_cron co 10 minut (migracja 20260803130000_studio_publikacji).
import { createFileRoute } from "@tanstack/react-router";
import { runSocialPublishTick } from "@/lib/studio-publishing.server";
import { runStudioVideoTick } from "@/lib/studio-video-queue.server";
import { runTiktokPublishTick } from "@/lib/tiktok.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(): Promise<Response> {
  try {
    // Najpierw wideo (może dostawić wpisy auto-publikacji), potem publikacja.
    const video = await runStudioVideoTick().catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }));
    const social = await runSocialPublishTick();
    // TikTok osobno: własne API, własny token i limit ~15 postów/dobę
    // (jedna publikacja na przebieg). Błąd TikToka nie może wywalić ticka Meta.
    const tiktok = await runTiktokPublishTick().catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }));
    const result = { ...social, video, tiktok };
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
