// Modele ElevenLabs dla lektora rolek — czysta logika (bez I/O, testowalna).
//
// Lista odpowiada temu, co konto zwraca z `GET /v1/models` (październik 2026):
// v4 to najnowsza, najbardziej naturalna generacja; v3 poprzednia; Multilingual
// v2 to „stary stabilny" lektor; Flash v2.5 jest tani i szybki (do testów).
// Modele v3 / v4 / Flash nie przyjmują `style` ani `use_speaker_boost`
// (API oddaje `can_use_style: false`), a stabilność w v3 / v4 to trzy tryby:
// 0 (kreatywny), 0.5 (naturalny), 1 (stabilny) — inne wartości zaokrąglamy
// do najbliższego trybu, żeby nie dostać 422.
//
// Wybór obowiązuje całe Studio (ustawienie w panelu, tabela `studio_settings`),
// a pojedyncze zadanie może go nadpisać (`studio_video_jobs.tts_model_id`).

export const TTS_MODEL_IDS = [
  "eleven_v4",
  "eleven_v4_turbo",
  "eleven_v3",
  "eleven_multilingual_v2",
  "eleven_flash_v2_5",
] as const;
export type TtsModelId = (typeof TTS_MODEL_IDS)[number];

/** Najlepsza jakość lektora — domyślny wybór Studia, dopóki panel nie ustawi innego. */
export const DEFAULT_TTS_MODEL_ID: TtsModelId = "eleven_v4";

export type TtsModelInfo = {
  id: TtsModelId;
  label: string;
  description: string;
  /** Pozycja jakościowa do czatu i panelu. */
  quality: "najwyższa" | "wysoka" | "dobra";
  /** Limit znaków w jednym zleceniu (scenariusz rolki to ~500–900 znaków). */
  maxChars: number;
  /** Mnożnik kosztu znaków względem Multilingual v2 (1 = ta sama cena). */
  costFactor: number;
  /** Stabilność tylko w trzech trybach (0 / 0.5 / 1) — v3 i v4. */
  presetStability: boolean;
  /** Czy model przyjmuje `style` i `use_speaker_boost` w voice_settings. */
  styleSettings: boolean;
};

export const TTS_MODELS: Record<TtsModelId, TtsModelInfo> = {
  eleven_v4: {
    id: "eleven_v4",
    label: "Eleven v4 — najwyższa jakość (zalecany)",
    description:
      "Najnowszy model ElevenLabs: najbardziej naturalna intonacja i emocje, 90+ języków z polskim. Najlepszy lektor do rolek.",
    quality: "najwyższa",
    maxChars: 10_000,
    costFactor: 1,
    presetStability: true,
    styleSettings: false,
  },
  eleven_v4_turbo: {
    id: "eleven_v4_turbo",
    label: "Eleven v4 Turbo — ta sama generacja, szybciej i o połowę taniej",
    description:
      "v4 zoptymalizowane na niskie opóźnienie: minimalnie mniej niuansu niż pełne v4, połowa ceny znaków.",
    quality: "wysoka",
    maxChars: 10_000,
    costFactor: 0.5,
    presetStability: true,
    styleSettings: false,
  },
  eleven_v3: {
    id: "eleven_v3",
    label: "Eleven v3 — poprzednia generacja ekspresyjna",
    description:
      "Bardzo ekspresyjny, ale wymaga więcej dopracowania tekstu niż v4 i ma limit 5 000 znaków.",
    quality: "wysoka",
    maxChars: 5_000,
    costFactor: 1,
    presetStability: true,
    styleSettings: false,
  },
  eleven_multilingual_v2: {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2 — klasyczny, najbardziej przewidywalny",
    description:
      "Dotychczasowy lektor Studia: równy, stabilny na długim tekście, 29 języków. Mniej naturalny niż v4.",
    quality: "dobra",
    maxChars: 10_000,
    costFactor: 1,
    presetStability: false,
    styleSettings: true,
  },
  eleven_flash_v2_5: {
    id: "eleven_flash_v2_5",
    label: "Flash v2.5 — szybki i tani (do testów)",
    description:
      "Najniższe opóźnienie i połowa ceny, kosztem naturalności. Do szkiców, nie do publikacji.",
    quality: "dobra",
    maxChars: 40_000,
    costFactor: 0.5,
    presetStability: false,
    styleSettings: false,
  },
};

/** Lista do selecta w panelu i do opisu w MCP — kolejność od najlepszego. */
export const TTS_MODEL_OPTIONS: TtsModelInfo[] = TTS_MODEL_IDS.map((id) => TTS_MODELS[id]);

export function isTtsModelId(v: unknown): v is TtsModelId {
  return typeof v === "string" && (TTS_MODEL_IDS as readonly string[]).includes(v);
}

/** Nieznana / pusta wartość = podany zapas (domyślnie najlepszy model). */
export function parseTtsModelId(
  v: unknown,
  fallback: TtsModelId = DEFAULT_TTS_MODEL_ID,
): TtsModelId {
  return isTtsModelId(v) ? v : fallback;
}

export function ttsModelLabel(id: unknown): string {
  return isTtsModelId(id) ? TTS_MODELS[id].label : String(id ?? "");
}

export type VoiceSettings = {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
};

/** Stabilność v3 / v4: najbliższy z trzech trybów. */
export function snapStability(v: number): 0 | 0.5 | 1 {
  if (!Number.isFinite(v)) return 0.5;
  if (v < 0.25) return 0;
  if (v < 0.75) return 0.5;
  return 1;
}

/**
 * Ustawienia głosu dopasowane do modelu: to, co model rozumie, w zakresie,
 * który przyjmuje. Nieznany model dostaje ustawienia bez zmian.
 */
export function voiceSettingsForModel(
  modelId: string,
  base: VoiceSettings,
): Record<string, number | boolean> {
  const info = isTtsModelId(modelId) ? TTS_MODELS[modelId] : null;
  if (!info) return { ...base };
  const out: Record<string, number | boolean> = {
    stability: info.presetStability ? snapStability(base.stability) : base.stability,
    similarity_boost: base.similarity_boost,
  };
  if (base.speed != null) out.speed = base.speed;
  if (info.styleSettings) {
    if (base.style != null) out.style = base.style;
    if (base.use_speaker_boost != null) out.use_speaker_boost = base.use_speaker_boost;
  }
  return out;
}
