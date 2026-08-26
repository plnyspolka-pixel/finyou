import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (co 2 minuty): dociąga wyniki asynchronicznych zamówień treści KW
// z EasyMKW (zadania kończą się kilka minut po złożeniu zamówienia).
export const Route = createFileRoute("/api/public/hooks/kw-easymkw-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const { pollPendingEasyMkwJobs } = await import("@/lib/kw-easymkw.server");
          const result = await pollPendingEasyMkwJobs();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[kw-easymkw-poll] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
