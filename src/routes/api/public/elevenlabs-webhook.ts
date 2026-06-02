import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

// Webhook ElevenLabs — odbiera wynik rozmowy i zapisuje do kolejki.
// Weryfikuje podpis HMAC z nagłówka `ElevenLabs-Signature` (format: t=...,v0=...).
function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = parts["t"];
  const v0 = parts["v0"];
  if (!t || !v0) return false;
  // Tolerancja czasu: 30 minut
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 1800) return false;
  const cleanSecret = secret.startsWith("wsec_") ? secret.slice(5) : secret;
  const expected = createHmac("sha256", cleanSecret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(v0);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/elevenlabs-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        const supabase = createClient(url, key);

        const rawBody = await request.text();
        const sigHeader =
          request.headers.get("elevenlabs-signature") ||
          request.headers.get("ElevenLabs-Signature");

        if (webhookSecret) {
          if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
            return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }
        }

        const body = (() => {
          try {
            return JSON.parse(rawBody);
          } catch {
            return {} as any;
          }
        })();

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
          const r = await supabase
            .from("call_queue")
            .select("*")
            .eq("phone_normalized", phone)
            .eq("status", "w_trakcie")
            .maybeSingle();
          queueRow = r.data;
        }
        if (queueRow) {
          await supabase
            .from("call_queue")
            .update({
              status: "zakonczona",
              finished_at: new Date().toISOString(),
              transcript: transcript || null,
              result_summary: summary || null,
              raw_result: body,
            })
            .eq("id", queueRow.id);
        }

        // Zapis do zunifikowanego logu komunikacji widocznego w panelu admina
        try {
          const { logLeadCommunication } = await import("@/lib/lead-comms.server");
          const durationSec = Number(body?.metadata?.call_duration_secs ?? body?.duration_seconds ?? body?.call_duration_secs) || null;
          const recordingUrl = body?.recording_url || body?.audio_url || body?.metadata?.recording_url || null;
          await logLeadCommunication({
            loanApplicationId: queueRow?.loan_application_id ?? null,
            clientId: queueRow?.client_id ?? null,
            metaLeadId: queueRow?.meta_lead_id ?? null,
            phoneNormalized: queueRow?.phone_normalized ?? phone ?? null,
            channel: "voicebot_call",
            direction: "outbound",
            status: "completed",
            subject: summary ? "Rozmowa voicebota" : null,
            content: summary || transcript || null,
            transcript: body?.transcript_segments || body?.turns || body?.messages || (transcript ? { text: transcript } : null),
            recordingUrl,
            durationSeconds: durationSec,
            externalId: callId ?? null,
            agentId: body?.agent_id ?? queueRow?.agent_id ?? null,
            metadata: { source: "elevenlabs_webhook", raw: body },
          });
        } catch (e) {
          console.error("[elevenlabs-webhook] log lead comm failed", e);
        }

        await supabase.from("automation_events").insert({
          automation_type: "elevenlabs_webhook",
          status: "received",
          sent_payload: {},
          response_payload: body,
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, elevenlabs-signature",
          },
        }),
    },
  },
});
