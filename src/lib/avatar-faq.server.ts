// Server-only helpers for HeyGen avatar FAQ video pipeline.
// ElevenLabs TTS -> upload audio to HeyGen -> create video from avatar -> poll.

import type { CaptionMode } from "./studio-captions";

const HEYGEN_BASE = "https://api.heygen.com";

const HEYGEN_API_KEY = () => {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY missing (dodaj klucz HeyGen w sekretach)");
  return k;
};

const ELEVENLABS_API_KEY = () => {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY missing (podłącz ElevenLabs)");
  return k;
};

export async function ttsElevenLabs(opts: { text: string; voiceId: string }): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: opts.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.25,
          use_speaker_boost: true,
          speed: 1.0,
        },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${t}`);
  }
  return res.arrayBuffer();
}

// Uploads bytes to HeyGen and returns an asset_id usable as audio input.
export async function uploadAudioToHeygen(audio: ArrayBuffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "filip-faq.mp3");

  const res = await fetch(`${HEYGEN_BASE}/v3/assets`, {
    method: "POST",
    headers: {
      "X-Api-Key": HEYGEN_API_KEY(),
    },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HeyGen upload failed: ${res.status} ${t}`);
  }
  const json = (await res.json()) as { data?: { asset_id?: string; id?: string; url?: string } };
  const id = json?.data?.asset_id ?? json?.data?.id;
  if (!id) throw new Error(`HeyGen upload: no asset id ${JSON.stringify(json)}`);
  return id;
}

// Napisy: v3 przyjmuje OBIEKT `caption` (boolean `caption: true` z API v2
// wywala walidację: „Extra inputs are not permitted"):
//   { file_format: "srt" }                  → sam plik SRT obok wideo,
//   { file_format: "srt", style: "default" } → DODATKOWO napisy wypalone
//                                              w obrazie (osobny plik wynikowy,
//                                              patrz captioned_video_url niżej).
// Styl da się nadpisać sekretem HEYGEN_CAPTION_STYLE, gdyby konto miało własny
// preset — publiczna specyfikacja zna tylko "default".
export const HEYGEN_CAPTION_FORMAT = "srt";
const captionStyle = () => process.env.HEYGEN_CAPTION_STYLE || "default";

const captionPayload = (mode: CaptionMode): Record<string, unknown> | null => {
  if (mode === "off") return null;
  if (mode === "sidecar") return { file_format: HEYGEN_CAPTION_FORMAT };
  return { file_format: HEYGEN_CAPTION_FORMAT, style: captionStyle() };
};

export type HeygenVideoResult = {
  videoId: string;
  /**
   * Tryb, w którym render faktycznie ruszył — bywa niższy od zamówionego, gdy
   * HeyGen odrzuci konfigurację (np. konto bez napisów w planie).
   */
  captionMode: CaptionMode;
};

export async function createHeygenVideoFromAudio(opts: {
  avatarId: string;
  audioAssetId: string;
  /**
   * Domyślnie napisy wypalone w obrazie — shorty i rolki ogląda się bez
   * dźwięku, a IG/FB Reels nie przyjmują osobnej ścieżki napisów.
   */
  captions?: CaptionMode;
}): Promise<HeygenVideoResult> {
  // Uwaga: API v3 przyjmuje wyłącznie type 'avatar' / 'image' /
  // 'cinematic_avatar' / 'studio' — awatary "foto" (talking photo) też idą
  // jako 'avatar' z avatar_id (tak działała dotychczasowa sztywna lista).
  const base = {
    type: "avatar",
    avatar_id: opts.avatarId,
    audio_asset_id: opts.audioAssetId,
    aspect_ratio: "9:16",
    resolution: "720p",
    background: { type: "color", value: "#101728" },
  };
  const want: CaptionMode = opts.captions ?? "burned";

  const send = async (payload: Record<string, unknown>) => {
    const res = await fetch(`${HEYGEN_BASE}/v3/videos`, {
      method: "POST",
      headers: {
        "X-Api-Key": HEYGEN_API_KEY(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  };

  // Drabina: schodzimy o szczebel tylko wtedy, gdy HeyGen odrzucił konfigurację
  // napisów. Odrzucony styl nie może od razu kasować napisów w ogóle —
  // wcześniej jeden 422 na `style` gasił je całkowicie.
  const ladder: CaptionMode[] =
    want === "burned"
      ? ["burned", "sidecar", "off"]
      : want === "sidecar"
        ? ["sidecar", "off"]
        : ["off"];

  let out: Awaited<ReturnType<typeof send>> | null = null;
  let captionMode: CaptionMode = want;
  for (const mode of ladder) {
    const caption = captionPayload(mode);
    captionMode = mode;
    out = await send(caption ? { ...base, caption } : base);
    if (out.ok) break;
    if (!/caption|style|invalid_parameter|not permitted/i.test(out.body)) break;
    if (mode !== "off") {
      console.warn(
        `[HeyGen] napisy w trybie "${mode}" odrzucone (${out.status}) — schodzę niżej: ${out.body}`,
      );
    }
  }
  if (!out?.ok) throw new Error(`HeyGen generate failed: ${out?.status} ${out?.body}`);

  const json = JSON.parse(out.body || "{}") as { data?: { video_id?: string } };
  const videoId = json?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen generate: missing video_id ${out.body}`);
  return { videoId, captionMode };
}

export async function getHeygenVideoStatus(videoId: string): Promise<{
  status: string;
  /** Czysty master — HeyGen NIE wgrywa tu wersji z napisami. */
  video_url?: string | null;
  /** Ten sam render z napisami wypalonymi w obrazie (gdy zamówiono `style`). */
  captioned_video_url?: string | null;
  thumbnail_url?: string | null;
  /** Plik napisów (SRT) obok wideo — nazwa pola bywa różna w odpowiedziach. */
  subtitle_url?: string | null;
  error?: unknown;
}> {
  const res = await fetch(`${HEYGEN_BASE}/v3/videos/${encodeURIComponent(videoId)}`, {
    headers: { "X-Api-Key": HEYGEN_API_KEY() },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HeyGen status failed: ${res.status} ${t}`);
  }
  const json = (await res.json()) as {
    data?: {
      status?: string;
      video_url?: string | null;
      captioned_video_url?: string | null;
      thumbnail_url?: string | null;
      caption_url?: string | null;
      subtitle_url?: string | null;
      srt_url?: string | null;
      caption?: { url?: string | null } | null;
      failure_code?: string | null;
      failure_message?: string | null;
    };
  };
  const d = json?.data;
  return {
    status: d?.status ?? "unknown",
    video_url: d?.video_url ?? null,
    captioned_video_url: d?.captioned_video_url ?? null,
    thumbnail_url: d?.thumbnail_url ?? null,
    subtitle_url: d?.caption_url ?? d?.subtitle_url ?? d?.srt_url ?? d?.caption?.url ?? null,
    error: d?.failure_message ?? d?.failure_code,
  };
}
