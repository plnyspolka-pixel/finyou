import { createFileRoute } from "@tanstack/react-router";
import { runDailyReminderEmailsBatch } from "@/lib/loan-reminder-emails.server";

export const Route = createFileRoute("/api/public/hooks/loan-reminder-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        if (expected && apiKey && apiKey !== expected) {
          return new Response(JSON.stringify({ error: "invalid apikey" }), { status: 401 });
        }
        const result = await runDailyReminderEmailsBatch();
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      },
      GET: async () => new Response(JSON.stringify({ ok: true, hint: "POST to trigger" })),
    },
  },
});
