// Cron tick: nalicza prowizje sieciowe dla zdarzeń utworzonych przez triggery DB
// (np. client_funds_disbursed po wypłacie pożyczki). Zdarzenia tworzone inline
// (webhook/admin) mają już processed_at i są pomijane. Naliczanie jest idempotentne
// (unikalny indeks na (event, partner, poziom)).
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calculateNetworkCommissions } from "@/lib/affiliate/engine";

async function run() {
  const db = supabaseAdmin as unknown as SupabaseClient;
  const { data: events } = await db
    .from("affiliate_commission_events")
    .select("id")
    .is("processed_at", null)
    .in("event_status", ["confirmed", "eligible"])
    .order("occurred_at", { ascending: true })
    .limit(200);

  let processed = 0;
  let created = 0;
  for (const e of events ?? []) {
    const id = (e as { id: string }).id;
    try {
      const res = await calculateNetworkCommissions(db, id);
      created += res.created;
      await db.from("affiliate_commission_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
      processed += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[affiliate-events-tick] calc failed", id, (err as Error)?.message);
    }
  }
  return { ok: true, processed, created };
}

export const Route = createFileRoute("/api/public/hooks/affiliate-events-tick")({
  server: {
    handlers: {
      POST: async () => Response.json(await run()),
      GET: async () => Response.json(await run()),
    },
  },
});
