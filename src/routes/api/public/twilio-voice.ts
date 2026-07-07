// Twilio Voice webhook — przychodzące połączenie na numer +48732059898.
// Zapisuje lead + wpis w lead_communications, prosi dzwoniącego o wiadomość
// i nagrywa ją. Nagranie trafia potem do /api/public/twilio-recording,
// gdzie jest transkrybowane przez Lovable AI STT.
//
// Konfiguracja w Twilio Console → Phone Numbers → +48732059898:
//   Voice Configuration → A CALL COMES IN → Webhook
//     URL: https://app.financeyou.pl/api/public/twilio-voice?token=<TWILIO_WEBHOOK_TOKEN>
//     HTTP: POST
import { createFileRoute } from "@tanstack/react-router";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

export const Route = createFileRoute("/api/public/twilio-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env.TWILIO_WEBHOOK_TOKEN;
        if (!expected || url.searchParams.get("token") !== expected) {
          return new Response("Forbidden", { status: 403 });
        }

        const form = await request.formData();
        const callSid = String(form.get("CallSid") ?? "");
        const from = String(form.get("From") ?? "");
        const to = String(form.get("To") ?? "");
        const callerCity = String(form.get("FromCity") ?? "");
        const callerCountry = String(form.get("FromCountry") ?? "");
        const phone = normalizePhone(from);

        try {
          const leadId = await upsertLeadFromSource({
            source: "call_inbound",
            phoneRaw: from || null,
            phoneNormalized: phone,
            applicationData: {
              inbound_call: {
                call_sid: callSid,
                from,
                to,
                city: callerCity || null,
                country: callerCountry || null,
                received_at: new Date().toISOString(),
              },
            },
          });
          await logLeadCommunication({
            leadId,
            phoneNormalized: phone,
            channel: "voicebot_call",
            direction: "inbound",
            status: "received",
            subject: `Połączenie przychodzące od ${from || "nieznany"}`,
            content: `Klient zadzwonił na numer ${to}. Nagranie i transkrypcja pojawią się po zakończeniu rozmowy.`,
            externalId: callSid || null,
            metadata: {
              provider: "twilio",
              from,
              to,
              from_city: callerCity || null,
              from_country: callerCountry || null,
            },
          });
        } catch (e) {
          console.error("[twilio-voice] log error", e);
        }

        // TwiML: krótki komunikat + nagranie wiadomości (do 3 minut).
        // Nagranie trafi do /api/public/twilio-recording przez recordingStatusCallback.
        const origin = `${url.protocol}//${url.host}`;
        const recCallback = `${origin}/api/public/twilio-recording?token=${encodeURIComponent(expected)}`;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Ewa" language="pl-PL">Dzień dobry, dodzwoniłeś się do Finance You. Zostaw wiadomość po sygnale — oddzwonimy najszybciej jak to możliwe.</Say>
  <Record maxLength="180" playBeep="true" trim="trim-silence" recordingStatusCallback="${recCallback}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" />
  <Say voice="Polly.Ewa" language="pl-PL">Dziękujemy. Do usłyszenia.</Say>
</Response>`;
        return new Response(twiml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      },
    },
  },
});
