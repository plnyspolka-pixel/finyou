import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron, codziennie): stan źródeł i kolejki screeningu; alert e-mail do
// osoby odpowiedzialnej za AML, gdy import nie powiódł się dłużej niż przez N cykli.
export const Route = createFileRoute("/api/public/hooks/screening-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const { runHealthCheck } = await import("@/lib/screening/health.server");
          return Response.json({ ok: true, ...(await runHealthCheck()) });
        } catch (e) {
          console.error("[screening-health] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
