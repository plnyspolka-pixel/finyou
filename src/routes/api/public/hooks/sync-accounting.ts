// Cron: automatyczne pobieranie faktur z KSeF do accounting_documents.
// Uruchamiany co godzinę przez pg_cron. Bez klikania w UI.
import { createFileRoute } from "@tanstack/react-router";
import { syncAllAccounting } from "@/lib/accounting/sync-core.server";
import { requireCronAuth } from "@/lib/cron-auth.server";

// Wymaga nagłówka `x-cron-secret` = CRON_SECRET (server-only).
async function run({ request }: { request: Request }) {
  const unauth = await requireCronAuth(request);
  if (unauth) return unauth;
  try {
    const out = await syncAllAccounting();
    return new Response(JSON.stringify({ ok: true, ...out }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export const Route = createFileRoute("/api/public/hooks/sync-accounting")({
  server: { handlers: { POST: run, GET: run } },
});
