import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron, co godzinę): przypomnienia o końcu płatnego dostępu
// (7/3/1 dni przed oraz po wygaśnięciu). Endpoint idempotentny — dedup po
// unikalnym indeksie access_expiry_notifications.
export const Route = createFileRoute("/api/public/hooks/access-expiry-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const { runAccessExpiryReminders } = await import("@/lib/access/reminders.server");
          const result = await runAccessExpiryReminders();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[access-expiry-tick] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
