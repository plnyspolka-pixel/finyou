// Cron tick kadencji z `lead_follow_up_schedule` (mail / SMS / telefon, 365 dni).
//
// Osobny endpoint, bo wcześniej ta wysyłka jechała doczepiona do
// `follow-up-tick`, który najpierw robi synchronizację Messengera/Instagrama.
// pg_net zrywa połączenie po 5 sekundach, a Messenger potrafi zjeść cały ten
// budżet — wtedy kadencja nigdy nie dochodziła do głosu i zaległe pozycje
// wisiały godzinami ze statusem `pending` i `attempts = 0`.
//
// Tu nie ma nic poza `processDueFollowUps`, który sam pilnuje okien godzinowych,
// statusów terminalnych i hamulców (1 SMS / 1 telefon na numer na dobę).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/follow-up-plan-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { processDueFollowUps } = await import("@/lib/follow-up-plan.server");
        const plan = await processDueFollowUps();
        if (plan.processed || plan.sent || plan.skipped) {
          console.log("[follow-up-plan-tick]", JSON.stringify(plan));
        }
        return Response.json({ ok: true, ...plan });
      },
    },
  },
});
