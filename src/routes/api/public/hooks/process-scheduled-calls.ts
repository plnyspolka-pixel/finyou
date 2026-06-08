import { createFileRoute } from "@tanstack/react-router";
import { placeOutboundCallInternal } from "@/lib/voicebot.functions";

/**
 * Cron tick (co 1 min). Pobiera zaplanowane wpisy z call_queue (status='oczekuje',
 * scheduled_at <= now()) i odpala wychodzące połączenie ElevenLabs.
 *
 * Wpis jest natychmiast przejmowany (UPDATE → 'w_trakcie') żeby uniknąć duplikatów
 * przy równoległych odpaleniach.
 */
export const Route = createFileRoute("/api/public/hooks/process-scheduled-calls")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("call_queue")
    .select("id, phone_normalized, client_id, loan_application_id, meta_lead_id, source")
    .eq("status", "oczekuje")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return Response.json({ ok: true, processed: 0 });
  }

  let processed = 0;
  for (const row of rows) {
    // Atomowe przejęcie: tylko jeśli wciąż 'oczekuje'
    const { data: claim } = await supabaseAdmin
      .from("call_queue")
      .update({ status: "w_trakcie", started_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "oczekuje")
      .select("id")
      .maybeSingle();
    if (!claim) continue;

    // Pobierz imię z clients (best effort) dla SMS przed-call
    let firstName: string | null = null;
    if (row.client_id) {
      const { data: c } = await supabaseAdmin
        .from("clients")
        .select("first_name")
        .eq("id", row.client_id)
        .maybeSingle();
      firstName = (c?.first_name as string | null) ?? null;
    }

    try {
      const result = await placeOutboundCallInternal({
        phone: row.phone_normalized,
        source: row.source ?? "scheduled",
        clientId: row.client_id ?? null,
        loanApplicationId: row.loan_application_id ?? null,
        metaLeadId: row.meta_lead_id ?? null,
        firstName,
      });
      // placeOutboundCallInternal tworzy własny wpis call_queue, więc nasz „placeholder"
      // zamykamy jako wykonany (skonsumowany).
      await supabaseAdmin
        .from("call_queue")
        .update({
          status: result.ok ? "wykonane" : "blad",
          finished_at: new Date().toISOString(),
          result_summary: result.ok ? `dispatched ${result.conversationId ?? ""}`.trim() : (result.error ?? "error"),
          conversation_id: result.conversationId ?? null,
        })
        .eq("id", row.id);
      processed++;
    } catch (e) {
      await supabaseAdmin
        .from("call_queue")
        .update({
          status: "blad",
          finished_at: new Date().toISOString(),
          result_summary: e instanceof Error ? e.message : String(e),
        })
        .eq("id", row.id);
    }
  }

  return Response.json({ ok: true, processed });
}
