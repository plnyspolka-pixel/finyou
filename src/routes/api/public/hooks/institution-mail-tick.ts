// Cron tick agenta korespondencji z instytucjami: klasyfikacja nowych maili,
// zbiorcze pytania do klientów (max 1/dobę per wniosek), przekazywanie
// odpowiedzi klientów do pytających instytucji.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/institution-mail-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        const { runInstitutionMailAgent } = await import(
          "@/lib/institution-mail-agent/engine.server"
        );
        try {
          const result = await runInstitutionMailAgent();
          if (
            result.inbox.classified ||
            result.outreach.sent ||
            result.forwarding.forwarded
          ) {
            console.log("[institution-mail-tick]", JSON.stringify(result));
          }
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("[institution-mail-tick] error", e?.message);
          return Response.json({ ok: false, error: e?.message }, { status: 500 });
        }
      },
    },
  },
});
