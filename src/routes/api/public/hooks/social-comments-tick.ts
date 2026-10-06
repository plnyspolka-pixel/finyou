// Cron tick automatycznych odpowiedzi na komentarze (FB / IG / YouTube):
// nowe komentarze → decyzja modelu (odpowiedź / pominięcie / eskalacja) →
// odpowiedź publiczna albo mail do zespołu. Szczegóły i limity:
// src/lib/social-auto-reply.server.ts. Wyłącznik: SOCIAL_AUTO_REPLY=off
// (`dry` — tylko zapis propozycji bez publikacji).
// Harmonogram: pg_cron co 15 minut (migracja 20261006120000_social_autoodpowiedzi_raport).
import { createFileRoute } from "@tanstack/react-router";
import { runSocialAutoReplyTick } from "@/lib/social-auto-reply.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(): Promise<Response> {
  try {
    const result = await runSocialAutoReplyTick();
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

export const Route = createFileRoute("/api/public/hooks/social-comments-tick")({
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
