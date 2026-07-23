import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron, co 5 minut): wygaszanie przypisań projektów inwestycyjnych
// po terminie (24 h / 36 h po przedłużeniu / 48 h na propozycję) oraz
// przypomnienia 12h/3h/30m. Endpoint idempotentny — wygaszanie robi atomowa
// funkcja SQL (SKIP LOCKED), przypomnienia dedupuje unikalny indeks
// project_assignment_notifications; wielokrotne równoległe uruchomienie nie
// zamknie dwa razy tego samego przypisania.
export const Route = createFileRoute("/api/public/hooks/project-assignments-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const { runAssignmentsTick } = await import("@/lib/projects/lifecycle.server");
          const result = await runAssignmentsTick();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[project-assignments-tick] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
