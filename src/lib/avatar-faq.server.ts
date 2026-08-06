// Server-only helpers for HeyGen avatar FAQ video pipeline.
// ElevenLabs TTS -> upload audio to HeyGen -> create video from avatar -> poll.

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

export async function createHeygenVideoFromAudio(opts: {
  avatarId: string;
  audioAssetId: string;
}): Promise<string> {
  // Uwaga: API v3 przyjmuje wyłącznie type 'avatar' / 'image' /
  // 'cinematic_avatar' / 'studio' — awatary "foto" (talking photo) też idą
  // jako 'avatar' z avatar_id (tak działała dotychczasowa sztywna lista).
  const payload = {
    type: "avatar",
    avatar_id: opts.avatarId,
    audio_asset_id: opts.audioAssetId,
    aspect_ratio: "9:16",
    resolution: "720p",
    background: { type: "color", value: "#101728" },
  };
  const res = await fetch(`${HEYGEN_BASE}/v3/videos`, {
    method: "POST",
    headers: {
      "X-Api-Key": HEYGEN_API_KEY(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HeyGen generate failed: ${res.status} ${t}`);
  }
  const json = (await res.json()) as { data?: { video_id?: string } };
  const videoId = json?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen generate: missing video_id ${JSON.stringify(json)}`);
  return videoId;
}

export async function getHeygenVideoStatus(videoId: string): Promise<{
  status: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
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
      thumbnail_url?: string | null;
      failure_code?: string | null;
      failure_message?: string | null;
    };
  };
  return {
    status: json?.data?.status ?? "unknown",
    video_url: json?.data?.video_url ?? null,
    thumbnail_url: json?.data?.thumbnail_url ?? null,
    error: json?.data?.failure_message ?? json?.data?.failure_code,
  };
}
