import { createFileRoute } from "@tanstack/react-router";
import { placeOutboundCallInternal } from "@/lib/voicebot.functions";
import { requireCronSecret } from "@/lib/cron-auth.server";

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
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return handler();
      },
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

    // Pobierz dane klienta + wniosku, żeby przekazać zmienne dynamiczne do agenta.
    let firstName: string | null = null;
    const dynamicVariables: Record<string, string> = {};
    if (row.client_id) {
      const { data: c } = await supabaseAdmin
        .from("clients")
        .select("first_name, last_name, city")
        .eq("id", row.client_id)
        .maybeSingle();
      if (c) {
        firstName = (c.first_name as string | null) ?? null;
        dynamicVariables.first_name = c.first_name ?? "";
        dynamicVariables.last_name = c.last_name ?? "";
        dynamicVariables.full_name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        dynamicVariables.city = c.city ?? "";
      }
    }
    if (row.loan_application_id) {
      const { data: app } = await supabaseAdmin
        .from("loan_applications")
        .select(
          "id, status, loan_amount, completeness_percent, missing_fields, return_link, return_link_token, situation_description",
        )
        .eq("id", row.loan_application_id)
        .maybeSingle();
      if (app) {
        dynamicVariables.loan_application_id = app.id;
        dynamicVariables.status = String(app.status ?? "");
        dynamicVariables.loan_amount = app.loan_amount
          ? String(Math.round(Number(app.loan_amount)))
          : "";
        dynamicVariables.loan_purpose = app.situation_description ?? "";
        dynamicVariables.completion_percent = String(app.completeness_percent ?? 0);
        const missing = Array.isArray(app.missing_fields) ? app.missing_fields : [];
        dynamicVariables.missing_documents =
          missing.length > 0 ? missing.join(", ") : "wszystko skompletowane";
        dynamicVariables.return_link = "https://financeyou.pl";
      }
    }

    try {
      const result = await placeOutboundCallInternal({
        phone: row.phone_normalized,
        source: row.source ?? "scheduled",
        clientId: row.client_id ?? null,
        loanApplicationId: row.loan_application_id ?? null,
        metaLeadId: row.meta_lead_id ?? null,
        firstName,
        dynamicVariables: Object.keys(dynamicVariables).length > 0 ? dynamicVariables : null,
      });
      // placeOutboundCallInternal tworzy własny wpis call_queue, więc nasz „placeholder"
      // zamykamy jako wykonany (skonsumowany).
      await supabaseAdmin
        .from("call_queue")
        .update({
          status: result.ok ? "wykonane" : "blad",
          finished_at: new Date().toISOString(),
          result_summary: result.ok
            ? `dispatched ${result.conversationId ?? ""}`.trim()
            : (result.error ?? "error"),
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
