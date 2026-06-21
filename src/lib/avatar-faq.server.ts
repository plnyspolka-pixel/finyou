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
  const res = await fetch(`${HEYGEN_BASE}/v1/asset`, {
    method: "POST",
    headers: {
      "X-Api-Key": HEYGEN_API_KEY(),
      "Content-Type": "audio/mpeg",
    },
    body: audio,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HeyGen upload failed: ${res.status} ${t}`);
  }
  const json = (await res.json()) as { data?: { id?: string; url?: string } };
  const id = json?.data?.id;
  if (!id) throw new Error(`HeyGen upload: no asset id ${JSON.stringify(json)}`);
  return id;
}

export async function createHeygenVideoFromAudio(opts: {
  avatarId: string;
  audioAssetId: string;
}): Promise<string> {
  const payload = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: opts.avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "audio",
          audio_asset_id: opts.audioAssetId,
        },
        background: { type: "color", value: "#101728" },
      },
    ],
    dimension: { width: 720, height: 1280 },
  };
  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
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
  const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
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
      error?: unknown;
    };
  };
  return {
    status: json?.data?.status ?? "unknown",
    video_url: json?.data?.video_url ?? null,
    thumbnail_url: json?.data?.thumbnail_url ?? null,
    error: json?.data?.error,
  };
}
