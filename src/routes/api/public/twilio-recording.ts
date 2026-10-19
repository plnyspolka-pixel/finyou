// Twilio Recording status callback — po zakończeniu nagrania wiadomości.
// Pobiera nagranie przez gateway Twilio, transkrybuje przez Lovable AI STT (pl)
// i dopina URL nagrania + transkrypcję do istniejącego wpisu lead_communications
// zalogowanego przez /api/public/twilio-voice.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { aiFetch } from "@/lib/ai.server";
import { twilioAuth, twilioCredentials } from "@/lib/twilio-api.server";

async function transcribeAudio(audio: Blob, filename: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const fd = new FormData();
  fd.append("model", "openai/gpt-4o-transcribe");
  fd.append("file", audio, filename);
  fd.append("language", "pl");
  try {
    const r = await aiFetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      body: fd,
    });
    if (!r.ok) {
      console.error("[twilio-recording] STT failed", r.status, await r.text().catch(() => ""));
      return null;
    }
    const j = (await r.json()) as { text?: string };
    return j.text ?? null;
  } catch (e) {
    console.error("[twilio-recording] STT error", e);
    return null;
  }
}

export const Route = createFileRoute("/api/public/twilio-recording")({
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
        const recordingSid = String(form.get("RecordingSid") ?? "");
        const recordingUrl = String(form.get("RecordingUrl") ?? ""); // bez rozszerzenia
        const durationStr = String(form.get("RecordingDuration") ?? "");
        const duration = durationStr ? Number(durationStr) : null;

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // 1) Pobierz nagranie przez connector gateway Twilio (auth robi gateway).
        let transcript: string | null = null;
        if (recordingSid) {
          if (twilioCredentials()) {
            try {
              const twilio = twilioAuth();
              const audioResp = await fetch(`${twilio.base}Recordings/${recordingSid}.mp3`, {
                headers: twilio.headers,
              });
              if (audioResp.ok) {
                const buf = await audioResp.arrayBuffer();
                const blob = new Blob([buf], { type: "audio/mpeg" });
                transcript = await transcribeAudio(blob, `${recordingSid}.mp3`);
              } else {
                console.error(
                  "[twilio-recording] fetch audio failed",
                  audioResp.status,
                  await audioResp.text().catch(() => ""),
                );
              }
            } catch (e) {
              console.error("[twilio-recording] fetch audio error", e);
            }
          }
        }

        const publicUrl = recordingUrl ? `${recordingUrl}.mp3` : null;
        const contentSummary = transcript
          ? `Nagranie wiadomości głosowej (${duration ?? "?"}s):\n\n${transcript}`
          : `Nagranie wiadomości głosowej (${duration ?? "?"}s). Transkrypcja niedostępna.`;

        // 2) Aktualizuj istniejący wpis lead_communications po CallSid; jeśli nie ma — insert.
        if (callSid) {
          const { data: existing } = await supabase
            .from("lead_communications")
            .select("id, lead_id, metadata")
            .eq("external_id", callSid)
            .eq("channel", "voicebot_call")
            .maybeSingle();

          if (existing?.id) {
            const meta = {
              ...((existing.metadata as any) ?? {}),
              recording_sid: recordingSid,
              has_transcript: !!transcript,
            };
            await supabase
              .from("lead_communications")
              .update({
                content: contentSummary,
                transcript: transcript ? { text: transcript } : null,
                recording_url: publicUrl,
                duration_seconds: duration,
                status: "completed",
                metadata: meta,
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("lead_communications").insert({
              channel: "voicebot_call",
              direction: "inbound",
              status: "completed",
              subject: "Wiadomość głosowa",
              content: contentSummary,
              transcript: transcript ? { text: transcript } : null,
              recording_url: publicUrl,
              duration_seconds: duration,
              external_id: callSid,
              metadata: { provider: "twilio", recording_sid: recordingSid },
            });
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
