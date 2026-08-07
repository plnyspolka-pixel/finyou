// Cron (raz dziennie w nocy): sędzia LLM ocenia rozmowy z ostatniej doby.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function run() {
  try {
    const { runBotJudge } = await import("@/lib/bot-judge.server");
    return await runBotJudge();
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/bot-judge-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return new Response(JSON.stringify({ ok: true, ...(await run()) }), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return new Response(JSON.stringify({ ok: true, ...(await run()) }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
