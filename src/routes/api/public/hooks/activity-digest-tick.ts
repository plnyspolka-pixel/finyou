// Cron tick digestu „co nowego": co 30 min zbiera nowe leady, wnioski,
// wiadomości przychodzące, oferty inwestorów, odpowiedzi instytucji i
// płatności od końca poprzedniego biegu i — tylko gdy coś jest — wysyła
// push + e-mail do zespołu. Stan biegów: tabela `activity_digest_runs`.
// Wywoływane przez pg_cron (migracja 20260921150000_activity_digest.sql).
// `?force=1` (tylko z prywatnym CRON_SECRET) omija ciszę nocną.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret, hasPrivateCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/activity-digest-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const force =
          new URL(request.url).searchParams.get("force") === "1" && hasPrivateCronSecret(request);

        const { runActivityDigest } = await import("@/lib/activity-digest-run.server");
        try {
          const result = await runActivityDigest({ force });
          if (!result.skipped || result.skipped === "disabled") {
            console.log("[activity-digest-tick]", JSON.stringify(result));
          }
          return Response.json(result);
        } catch (e) {
          const message = (e as Error)?.message ?? String(e);
          console.error("[activity-digest-tick] error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
