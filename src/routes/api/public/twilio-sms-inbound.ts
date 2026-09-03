// Twilio SMS webhook — odpowiedzi klientów na SMS-y z numeru +48732059898.
// (Wersja scalona z implementacją z sandboxa Lovable — „Dodano SMS w systemie".)
//
// Co robi:
//   - zapisuje wiadomość (i załączniki MMS) w lead_communications — skrzynka
//     panelu, karta leada (wątek SMS) i asystent admina widzą całość, a
//     silniki follow-up pauzują na 24 h po każdym inboundzie,
//   - zakłada leada, gdy numer jest nieznany,
//   - STOP/WYPISZ ustawia clients.do_not_sms (dotąd ręcznie — znany brak),
//   - odpowiada jako agent A1 (runAgentTurn → tura ElevenLabs z fallbackiem)
//     — SMS-y przychodzące szły wcześniej bezpośrednio do ElevenLabs w Twilio;
//     po przepięciu na ten webhook odpowiedź generuje ta sama ścieżka co
//     Messenger/e-mail, z pełnym śladem w systemie,
//   - loguje zdarzenie w automation_events.
//
// Konfiguracja w Twilio Console → Phone Numbers → +48732059898:
//   Messaging Configuration → A MESSAGE COMES IN → Webhook
//     URL: https://app.financeyou.pl/api/public/twilio-sms-inbound?token=<TWILIO_WEBHOOK_TOKEN>
//     HTTP: POST  (ustawione automatycznie przez API 31.08.2026)
import { createFileRoute } from "@tanstack/react-router";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";
import { normalizePolishPhone } from "@/lib/phone";

/** STOP w pierwszym słowie wiadomości = wypis z SMS-ów. */
const OPT_OUT_RE = /^\s*(stop|wypisz|wypisuje|wypisuję|rezygnuje|rezygnuję|koniec)\b/i;

// Świeży Response na każde żądanie — body strumienia da się wysłać tylko raz.
const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });

export const Route = createFileRoute("/api/public/twilio-sms-inbound")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env.TWILIO_WEBHOOK_TOKEN;
        if (!expected || url.searchParams.get("token") !== expected) {
          return new Response("Forbidden", { status: 403 });
        }

        const form = await request.formData();
        const messageSid = String(form.get("MessageSid") ?? form.get("SmsMessageSid") ?? "");
        const from = String(form.get("From") ?? "");
        const to = String(form.get("To") ?? "");
        const body = String(form.get("Body") ?? "")
          .trim()
          .slice(0, 4000);
        const numMedia = Number(form.get("NumMedia") ?? "0") || 0;
        const media: Array<{ url: string; content_type: string | null; source: string }> = [];
        for (let i = 0; i < numMedia; i++) {
          const mediaUrl = form.get(`MediaUrl${i}`);
          if (mediaUrl) {
            media.push({
              url: String(mediaUrl),
              content_type: (form.get(`MediaContentType${i}`) as string | null) ?? null,
              source: "twilio_mms",
            });
          }
        }

        const { normalized: phone } = normalizePolishPhone(from);
        if (!phone || (!body && media.length === 0)) return emptyTwiml();

        try {
          const leadId = await upsertLeadFromSource({
            type: "pozyczkowy",
            source: "sms_inbound",
            phoneRaw: from || null,
            phoneNormalized: phone,
            applicationData: {},
          });
          if (leadId) {
            await logLeadCommunication({
              leadId,
              phoneNormalized: phone,
              channel: "sms",
              direction: "inbound",
              content: body,
              status: "received",
              externalId: messageSid || null,
              metadata: { from, to, provider: "twilio", media_count: numMedia },
              attachments: media,
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("automation_events").insert({
            automation_type: "twilio_sms_inbound",
            status: "received",
            sent_payload: { from, to, sid: messageSid },
            response_payload: { body, media_count: numMedia, lead_id: leadId },
          });

          if (OPT_OUT_RE.test(body)) {
            await supabaseAdmin
              .from("clients")
              .update({ do_not_sms: true })
              .eq("phone_normalized", phone);
            console.log("[twilio-sms-inbound] opt-out", phone);
          } else if (leadId && body) {
            // SMS jako kanał agenta A1 (dotąd SMS-y przychodzące obsługiwał
            // bezpośrednio routing ElevenLabs w Twilio — po przepięciu na ten
            // webhook odpowiedź generuje ta sama ścieżka co Messenger/e-mail:
            // runAgentTurn → tura ElevenLabs z fallbackiem). Odpowiedź krótka,
            // jak przystało na SMS.
            try {
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
                  // sendSmsInternal sam loguje wysyłkę w lead_communications.
                  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
                  await sendSmsInternal({ phone, body: reply, source: "sms_agent_reply" });
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
