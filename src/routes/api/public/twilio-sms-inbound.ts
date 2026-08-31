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

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/** STOP w pierwszym słowie wiadomości = wypis z SMS-ów. */
const OPT_OUT_RE = /^\s*(stop|wypisz|wypisuje|wypisuję|rezygnuje|rezygnuję|koniec)\b/i;

const EMPTY_TWIML = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
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
        const phone = normalizePhone(from);
        if (!phone || !body) return EMPTY_TWIML;

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
          }
        } catch (e: any) {
          console.error("[twilio-sms-inbound] error", e?.message);
        }
        // Pusty TwiML — bez automatycznej odpowiedzi Twilio.
        return EMPTY_TWIML;
      },
    },
  },
});
