import { createFileRoute } from "@tanstack/react-router";
import { runDailyReminderEmailsBatch } from "@/lib/loan-reminder-emails.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/loan-reminder-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const force = url.searchParams.get("force") === "1";
        const onlyLoanId = url.searchParams.get("loan_id") || undefined;
        const result = await runDailyReminderEmailsBatch({ force, onlyLoanId });
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
