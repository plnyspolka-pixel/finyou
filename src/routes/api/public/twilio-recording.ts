// Twilio Recording status callback — po zakończeniu nagrania wiadomości.
// Pobiera nagranie przez gateway Twilio, transkrybuje przez Lovable AI STT (pl)
// i dopina URL nagrania + transkrypcję do istniejącego wpisu lead_communications
// zalogowanego przez /api/public/twilio-voice.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

async function transcribeAudio(audio: Blob, filename: string): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const fd = new FormData();
  fd.append("model", "openai/gpt-4o-transcribe");
  fd.append("file", audio, filename);
  fd.append("language", "pl");
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
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
          const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
          const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
          if (LOVABLE_API_KEY && TWILIO_API_KEY) {
            try {
              const audioResp = await fetch(
                `https://connector-gateway.lovable.dev/twilio/Recordings/${recordingSid}.mp3`,
                {
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "X-Connection-Api-Key": TWILIO_API_KEY,
                  },
                },
              );
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
