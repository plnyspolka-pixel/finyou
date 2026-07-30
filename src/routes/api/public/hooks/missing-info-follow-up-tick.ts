// Cron tick modułu „Follow-up braków": celowane dopytywanie klientów
// z niekompletnym wnioskiem / wnioskiem do korekty o KONKRETNE braki
// (dane, dokumenty, pytania z analizy KW) kanałami e-mail / SMS / Messenger.
// Wywoływane przez pg_cron co 30 min; okno 7:00–21:00 pon–sob pilnowane
// w silniku. `?force=1` (tylko z prywatnym CRON_SECRET) omija okno.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret, hasPrivateCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/missing-info-follow-up-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const force =
          new URL(request.url).searchParams.get("force") === "1" && hasPrivateCronSecret(request);

        const { syncMissingInfoEnrollments, processMissingInfoFollowUps } =
          await import("@/lib/missing-info-follow-up/engine.server");

        let enrollment: unknown = null;
        try {
          enrollment = await syncMissingInfoEnrollments();
        } catch (e: any) {
          console.error("[missing-info-follow-up-tick] enrollment error", e?.message);
          enrollment = { error: e?.message };
        }

        const processing = await processMissingInfoFollowUps({ force });
        if (processing.processed || processing.sent) {
          console.log("[missing-info-follow-up-tick]", JSON.stringify({ enrollment, processing }));
        }
        return Response.json({ ok: true, enrollment, processing });
      },
    },
  },
});
