// Tygodniowy raport social media mailem (obserwujący z różnicą tydzień do
// tygodnia, publikacje i najlepsze materiały, kliknięcia w linki śledzące,
// statystyki autoodpowiedzi z listą eskalacji, wnioski). Adresat:
// SOCIAL_REPORT_EMAIL → TEAM_NOTIFY_EMAIL → kontakt@financeyou.pl.
// Drugi raport w ciągu 6 dni wychodzi tylko z `?force=1` i prywatnym
// CRON_SECRET (publiczny klucz pg_cron nie odblokowuje ponownej wysyłki).
// Harmonogram: pg_cron w poniedziałki 06:00 UTC (migracja 20261006120000_social_autoodpowiedzi_raport).
import { createFileRoute } from "@tanstack/react-router";
import { runSocialWeeklyReport } from "@/lib/social-weekly-report.server";
import { hasPrivateCronSecret, requireCronSecret } from "@/lib/cron-auth.server";

async function runReport(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1" && hasPrivateCronSecret(request);
    const result = await runSocialWeeklyReport({ force });
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

export const Route = createFileRoute("/api/public/hooks/social-weekly-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        return runReport(request);
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
        return runReport(request);
      },
    },
  },
});
