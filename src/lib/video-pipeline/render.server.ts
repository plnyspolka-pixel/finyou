// Adapter renderowania wideo (moduł 5 promptu SEO). Interfejs pozwala
// podmienić dostawcę (HeyGen/Descript/inny) bez zmian w orkiestracji.
// Implementacja HeyGen reużywa helperów modułu Awatar FAQ:
// ElevenLabs TTS (głos Filipa) → upload audio do HeyGen → wideo awatara.
//
// ZASADA: jeśli adapter nie jest skonfigurowany (brak kluczy env), pipeline
// zatrzymuje się na statusie script_ready — człowiek renderuje ręcznie.
// NIE mockujemy renderowania.

export interface RenderStartResult {
  jobId: string;
  provider: string;
}

export interface RenderStatusResult {
  status: "rendering" | "done" | "failed";
  videoUrl?: string | null;
  error?: string;
}

export interface RenderAdapter {
  readonly name: string;
  isConfigured(): boolean;
  /** Startuje render scenariusza (czysty tekst lektorski). */
  startRender(plainScript: string): Promise<RenderStartResult>;
  checkRender(jobId: string): Promise<RenderStatusResult>;
}

/** Markdown scenariusza → czysty tekst lektorski (bez nagłówków/didaskaliów). */
export function scriptToVoiceText(scriptMd: string): string {
  return scriptMd
    .replace(/^#+\s.*$/gm, "") // nagłówki sekcji
    .replace(/\[[^\]]*\]/g, "") // didaskalia w nawiasach kwadratowych
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

class HeygenAdapter implements RenderAdapter {
  readonly name = "heygen";

  isConfigured(): boolean {
    return Boolean(process.env.HEYGEN_API_KEY && process.env.ELEVENLABS_API_KEY);
  }

  async startRender(plainScript: string): Promise<RenderStartResult> {
    const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
      await import("@/lib/avatar-faq.server");
    const { FILIP_VOICE_ID, HEYGEN_AVATARS } = await import("@/lib/heygen-avatars");
    const avatarId = process.env.VIDEO_PIPELINE_AVATAR_ID ?? HEYGEN_AVATARS[0].id;
    const audio = await ttsElevenLabs({ text: plainScript, voiceId: FILIP_VOICE_ID });
    const audioAssetId = await uploadAudioToHeygen(audio);
    const videoId = await createHeygenVideoFromAudio({ avatarId, audioAssetId });
    return { jobId: videoId, provider: this.name };
  }

  async checkRender(jobId: string): Promise<RenderStatusResult> {
    const { getHeygenVideoStatus } = await import("@/lib/avatar-faq.server");
    const s = await getHeygenVideoStatus(jobId);
    if (s.status === "completed") return { status: "done", videoUrl: s.video_url };
    if (s.status === "failed") {
      return { status: "failed", error: s.error ? String(s.error) : "render failed" };
    }
    return { status: "rendering" };
  }
}

/** Zwraca aktywny adapter renderowania (dziś: HeyGen). */
export function getRenderAdapter(): RenderAdapter {
  return new HeygenAdapter();
}
