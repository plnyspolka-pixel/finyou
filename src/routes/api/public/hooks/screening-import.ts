import { createFileRoute } from "@tanstack/react-router";
import { hasPrivateCronSecret, requireCronSecret } from "@/lib/cron-auth.server";

// Cron (pg_cron): importy warstwy referencyjnej.
//  {"group":"sanctions"}   — codziennie: UE, ONZ, MSWiA, OFAC (jeśli włączony)
//  {"group":"pep_weekly"}  — co tydzień: API Sejmu, KPRM, Wikidata (start)
//  {"group":"pep_monthly"} — co miesiąc: Senat, KRS (obecnie niedostępne — patrz dokumentacja)
//  {"group":"continue"}    — co 10 min: kontynuacja etapowego importu Wikidata
// `force` (pominięcie „bez zmian”) wyłącznie z prywatnym CRON_SECRET.
export const Route = createFileRoute("/api/public/hooks/screening-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            group?: string;
            force?: boolean;
          };
          const group = body.group ?? "sanctions";
          if (!["sanctions", "pep_weekly", "pep_monthly", "continue"].includes(group)) {
            return Response.json({ ok: false, error: "unknown group" }, { status: 400 });
          }
          const { runImportGroup } = await import("@/lib/screening/import.server");
          const results = await runImportGroup(group as never, {
            force: body.force === true && hasPrivateCronSecret(request),
          });
          return Response.json({ ok: true, results });
        } catch (e) {
          console.error("[screening-import] error", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
