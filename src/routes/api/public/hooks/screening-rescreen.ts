import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron, co tydzień po imporcie źródeł PEP): rescreening aktywnego
// portfela pod kątem PEP. Rescreening sankcyjny uruchamia sam import listy,
// gdy jej treść się zmieniła. Elementy trafiają do kolejki (screening-queue-tick).
export const Route = createFileRoute("/api/public/hooks/screening-rescreen")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const body = (await request.json().catch(() => ({}))) as { scope?: string };
          const scope =
            body.scope === "sanctions" ? "sanctions" : body.scope === "all" ? "all" : "pep";
          const { enqueuePortfolio } = await import("@/lib/screening/queue.server");
          return Response.json({ ok: true, scope, enqueued: await enqueuePortfolio(scope) });
        } catch (e) {
          console.error("[screening-rescreen] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
