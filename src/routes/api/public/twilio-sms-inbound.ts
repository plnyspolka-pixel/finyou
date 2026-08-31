// Twilio SMS webhook — odpowiedzi klientów na SMS-y z numeru +48732059898.
// Zapisuje wiadomość w lead_communications (kanał "sms", inbound) — dzięki
// temu: skrzynka panelu i asystent admina widzą odpowiedź, silniki follow-up
// pauzują na 24 h (pauza działa po każdym inboundzie), a STOP/WYPISZ ustawia
// clients.do_not_sms automatycznie (dotąd ręcznie — znany brak).
//
// Konfiguracja w Twilio Console → Phone Numbers → +48732059898:
//   Messaging Configuration → A MESSAGE COMES IN → Webhook
//     URL: https://app.financeyou.pl/api/public/twilio-sms-inbound?token=<TWILIO_WEBHOOK_TOKEN>
//     HTTP: POST
import { createFileRoute } from "@tanstack/react-router";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";
import { normalizePolishPhone } from "@/lib/phone";

/** STOP w pierwszym słowie wiadomości = wypis z SMS-ów. */
const OPT_OUT_RE = /^\s*(stop|wypisz|wypisuje|wypisuję|rezygnuje|rezygnuję|koniec)\b/i;

// Świeży Response na każde żądanie — body strumienia da się wysłać tylko raz.
const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });

export const Route = createFileRoute("/api/public/twilio-sms-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env.TWILIO_WEBHOOK_TOKEN;
        if (!expected || url.searchParams.get("token") !== expected) {
          return new Response("Forbidden", { status: 403 });
        }

        const form = await request.formData();
        const messageSid = String(form.get("MessageSid") ?? "");
        const from = String(form.get("From") ?? "");
        const to = String(form.get("To") ?? "");
        const body = String(form.get("Body") ?? "").trim();
        const { normalized: phone } = normalizePolishPhone(from);
        if (!phone || !body) return emptyTwiml();

        try {
          const leadId = await upsertLeadFromSource({
            source: "sms_inbound",
            phoneRaw: from || null,
            phoneNormalized: phone,
            applicationData: {},
          });
          if (leadId) {
            await logLeadCommunication({
              leadId,
              channel: "sms",
              direction: "inbound",
              content: body,
              status: "received",
              metadata: { message_sid: messageSid, to },
            });
          }

          if (OPT_OUT_RE.test(body)) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin
              .from("clients")
              .update({ do_not_sms: true })
              .eq("phone_normalized", phone);
            console.log("[twilio-sms-inbound] opt-out", phone);
          } else if (leadId) {
            // SMS jako kanał agenta A1 (dotąd SMS-y przychodzące obsługiwał
            // bezpośrednio routing ElevenLabs w Twilio — po przepięciu na ten
            // webhook odpowiedź generuje ta sama ścieżka co Messenger/e-mail:
            // runAgentTurn → tura ElevenLabs z fallbackiem). Odpowiedź krótka,
            // jak przystało na SMS.
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: client } = await supabaseAdmin
                .from("clients")
                .select("do_not_sms")
                .eq("phone_normalized", phone)
                .maybeSingle();
              if (!client?.do_not_sms) {
                const { runAgentTurn } = await import("@/lib/elevenlabs-text-agent.server");
                const agent = await runAgentTurn({ leadId, channel: "sms", userMessage: body });
                const reply = agent.reply.trim().slice(0, 450);
                if (reply) {
                  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
                  const sent = await sendSmsInternal({
                    phone,
                    body: reply,
                    source: "sms_agent_reply",
                  });
                  if (sent.ok) {
                    await logLeadCommunication({
                      leadId,
                      channel: "sms",
                      direction: "outbound",
                      content: reply,
                      status: "sent",
                      metadata: { source: "sms_agent_reply", in_reply_to: messageSid },
                    });
                  }
                }
              }
            } catch (e: any) {
              console.error("[twilio-sms-inbound] agent reply error", e?.message);
            }
          }
        } catch (e: any) {
          console.error("[twilio-sms-inbound] error", e?.message);
        }
        // Pusty TwiML — bez automatycznej odpowiedzi Twilio.
        return emptyTwiml();
      },
    },
  },
});
