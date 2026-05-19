import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Webhook ElevenLabs — odbiera wynik rozmowy i zapisuje do kolejki.
export const Route = createFileRoute("/api/public/elevenlabs-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, key);
        const body = await request.json().catch(() => ({} as any));

        const callId: string | undefined = body.call_id || body.id || body.conversation_id;
        const phone: string | undefined = body.phone_number || body.to_number;
        const transcript: string | undefined = body.transcript || body.summary_transcript;
        const summary: string | undefined = body.summary || body.analysis?.summary;

        let queueRow: any = null;
        if (callId) {
          const r = await supabase.from("call_queue").select("*").eq("agent_id", callId).maybeSingle();
          queueRow = r.data;
        }
        if (!queueRow && phone) {
          const r = await supabase.from("call_queue").select("*").eq("phone_normalized", phone).eq("status","w_trakcie").maybeSingle();
          queueRow = r.data;
        }
        if (queueRow) {
          await supabase.from("call_queue").update({
            status: "zakonczona",
            finished_at: new Date().toISOString(),
            transcript: transcript || null,
            result_summary: summary || null,
            raw_result: body,
          }).eq("id", queueRow.id);
        }
        await supabase.from("automation_events").insert({
          automation_type: "elevenlabs_webhook",
          status: "received",
          sent_payload: {},
          response_payload: body,
        });
        return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" }});
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: {
        "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      }}),
    },
  },
});
