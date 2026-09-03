// Cron tick: e-maile o zmianie statusu wniosku (loan_status_history →
// klient). Wywoływane przez pg_cron co 15 min; logika deduplikacji i
// pomijania przetasowań operacyjnych w status-change-emails.server.ts.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/status-email-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { processStatusChangeEmails } = await import("@/lib/status-change-emails.server");
        try {
          const result = await processStatusChangeEmails();
          if (result.processed > 0) {
            console.log("[status-email-tick]", JSON.stringify(result));
          }
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("[status-email-tick] error", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
    },
  },
});
