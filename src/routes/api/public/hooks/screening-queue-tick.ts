import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron, co 5 min): kolejka screeningu PEP/sankcji — nowi i zmienieni
// klienci / inwestorzy / oświadczenia oraz rescreening portfela.
export const Route = createFileRoute("/api/public/hooks/screening-queue-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const { processQueue } = await import("@/lib/screening/queue.server");
          return Response.json({ ok: true, ...(await processQueue()) });
        } catch (e) {
          console.error("[screening-queue-tick] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
