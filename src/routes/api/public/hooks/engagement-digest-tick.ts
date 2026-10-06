// Poranny digest zaangażowania i link buildingu: źródła (YouTube, Instagram,
// fora / Google Alerts, Digital PR, outreach, katalogi firm) → ~10 gotowych
// akcji w JEDNYM mailu („Otwórz → skopiuj → wklej → Zrobione"). Nic nie jest
// publikowane automatycznie. Szczegóły: src/lib/engagement/digest.server.ts.
// Adresat: DAILY_DIGEST_EMAIL → TEAM_NOTIFY_EMAIL → kontakt@financeyou.pl.
// Wyłącznik: ENGAGEMENT_DIGEST=off. Drugi mail w ciągu 20 h tylko z
// `?force=1` i prywatnym CRON_SECRET.
// Harmonogram: pg_cron codziennie 05:30 UTC (migracja 20261006150000_zaangazowanie_dzienny_digest).
import { createFileRoute } from "@tanstack/react-router";
import { hasPrivateCronSecret, requireCronSecret } from "@/lib/cron-auth.server";

async function runTick(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1" && hasPrivateCronSecret(request);
    const { runEngagementDigestTick } = await import("@/lib/engagement/digest.server");
    const result = await runEngagementDigestTick({ force });
    return new Response(JSON.stringify(result), {
      status: result.ok === false ? 500 : 200,
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

export const Route = createFileRoute("/api/public/hooks/engagement-digest-tick")({
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
