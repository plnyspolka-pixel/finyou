// Studio publikacji — uruchomienie renderu wideo (jedno miejsce dla panelu
// i dla kolejki wsadowej).
//
// Trzy ścieżki:
//   * pojedyncze ujęcie — awatar czyta cały scenariusz (dotychczasowe działanie),
//   * przebitki AI — sklejka scen, w której AI wskazuje, co zilustrować,
//   * struktura rolki — stały rytm: ujęcie → przebitka →
//     a-roll KOLEJNEGO domyślnego awatara (patrz src/lib/studio-scenes.ts).
//
// LEKTOR I NAPISY: głos powstaje w ElevenLabs (model z ustawień Studia,
// src/lib/studio-tts-models.ts) wywołaniem `/with-timestamps`, które oddaje
// czas każdego znaku. Z tych czasów i TEKSTU SCENARIUSZA budujemy własny plik
// SRT (src/lib/studio-subtitles.ts), zapisujemy go w buckecie `studio-media`
// i oddajemy jako `subtitleUrl` — po renderze HeyGena wypala go nasza usługa
// (caption-burner). HeyGen dostaje gotowe audio i NIE zamawiamy u niego
// napisów (ich rozpoznawanie mowy przekręcało nazwę firmy).
//
// Materiał na przebitki bierzemy z BANKU B-ROLLI
// (src/lib/studio-broll.server.ts): najpierw własna biblioteka, a czego w niej
// nie ma, bank dociąga ze stocku i od razu u siebie zapisuje.
//
// ZASADA: urozmaicenie nigdy nie blokuje generacji. Każdy krok, który może się
// nie udać (planowanie AI, dobór grafik, render wieloscenowy), ma zejście na
// pojedyncze ujęcie i zapisuje powód, zamiast wywalać joba. Wyjątek: napisy —
// gdy są zamówione, a nie da się zbudować SRT (ElevenLabs bez czasów znaków,
// Storage niedostępny), render nie rusza i zadanie pada z powodem, zamiast
// wypuścić rolkę bez napisów.

import type { CaptionMode } from "./studio-captions";
import type { SrtCue } from "./caption-style";
import {
  applyScenePlan,
  buildStudioScenes,
  MIN_SCENES_FOR_BROLL,
  planHasBroll,
  planReelStructure,
  splitScriptIntoSegments,
  type ResolvedScene,
  type ScenePlanItem,
} from "./studio-scenes";
import {
  joinNarration,
  mp3DurationSeconds,
  NARRATION_VOICE_SETTINGS,
  narrationCutTimes,
  splitMp3AtTimes,
} from "./studio-narration";
import { cuesFromAlignment, cuesToSrt, shiftCues } from "./studio-subtitles";
import { DEFAULT_TTS_MODEL_ID, parseTtsModelId, type TtsModelId } from "./studio-tts-models";
import {
  letterboxBlockMessage,
  letterboxedAvatars,
  type AvatarQuality,
  type RenderMeta,
  type StudioQualitySettings,
} from "./studio-quality";

export type StudioRenderResult = {
  videoId: string;
  /** Plan scen, jeśli render poszedł jako sklejka; null = pojedyncze ujęcie. */
  scenePlan: ScenePlanItem[] | null;
  /** Nasz plik SRT (tekst scenariusza + czasy ElevenLabs) — do wypalenia po renderze. */
  subtitleUrl: string | null;
  /** Model ElevenLabs, którym faktycznie nagrano lektora. */
  ttsModelId: TtsModelId;
  /** Dlaczego urozmaicenie nie doszło do skutku (do pokazania w panelu). */
  note: string | null;
  /** Czym i jak powstał obraz — zapisywane w `studio_video_jobs.render_meta`. */
  renderMeta: RenderMeta;
};

type RenderArgs = {
  script: string;
  /** Temat odcinka — kontekst dla planera scen. */
  topic: string;
  avatarId: string;
  voiceId: string;
  /** Model ElevenLabs lektora; brak = najlepszy (`DEFAULT_TTS_MODEL_ID`). */
  ttsModelId?: string | null;
  captions: boolean;
  dynamicScenes: boolean;
  /** Stały rytm rolki zamiast decyzji AI o miejscach cięć. */
  reelStructure?: boolean;
  /** Domyślne awatary — rotacja a-rolli („a-roll z innego awatara"). */
  avatarIds?: string[];
  /** Czytelna nazwa do pliku SRT w Storage (tytuł publikacji / temat). */
  name?: string;
  /** Świadome dopuszczenie poziomych looków w sklejce scen (pasy w kadrze). */
  allowLetterbox?: boolean;
  /** Ustawienia jakości; brak = z `studio_settings` (rozdzielczość, silnik, polityka). */
  quality?: StudioQualitySettings;
};

type Ctx = {
  modelId: TtsModelId;
  quality: StudioQualitySettings;
};

function buildMeta(
  args: RenderArgs,
  ctx: Ctx,
  m: {
    videoType: "studio" | "avatar";
    avatars: AvatarQuality[];
    brollScenes: number;
    engineFallback: string | null;
  },
): RenderMeta {
  const warnings: string[] = [];
  if (m.videoType === "studio") {
    for (const a of letterboxedAvatars(m.avatars)) {
      warnings.push(`Pasy w kadrze: ${a.name ?? a.id} — ${a.verdict}.`);
    }
  } else if (m.avatars[0]?.orientation === "landscape") {
    warnings.push(
      `Pojedyncze ujęcie z poziomego looka (${m.avatars[0].name ?? m.avatars[0].id}) — kadr wypełniony (cover), boki przycięte.`,
    );
  }
  for (const a of m.avatars) {
    if (a.orientation === "unknown") warnings.push(`Nieznana orientacja: ${a.name ?? a.id}.`);
  }
  if (m.engineFallback) warnings.push(m.engineFallback);
  if (ctx.quality.resolution !== "1080p")
    warnings.push(`Rozdzielczość ${ctx.quality.resolution} (nie 1080p).`);
  return {
    version: 1,
    rendered_at: new Date().toISOString(),
    compositor: m.videoType === "studio" ? "heygen_studio_v3" : "heygen_avatar_v3",
    remotion: false,
    tts: { provider: "elevenlabs", model: ctx.modelId },
    heygen: {
      video_type: m.videoType,
      aspect_ratio: "9:16",
      resolution: ctx.quality.resolution,
      fit: m.videoType === "studio" ? "contain" : "cover",
      engine_fallback: m.engineFallback,
    },
    avatars: m.engineFallback ? m.avatars.map((a) => ({ ...a, engine: null })) : m.avatars,
    broll_scenes: m.brollScenes,
    settings: ctx.quality,
    allow_letterbox: args.allowLetterbox === true,
    warnings,
  };
}

/**
 * Zapis metryki renderu przy zadaniu — osobnym, niekrytycznym update'em:
 * brak kolumny (migracja jeszcze nie weszła) nie może zgubić `heygen_video_id`.
 */
export async function saveRenderMeta(jobId: string, meta: RenderMeta): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("studio_video_jobs")
      .update({ render_meta: meta as never })
      .eq("id", jobId);
    if (error) console.warn(`[Studio] render_meta (${jobId}): ${error.message}`);
  } catch (e) {
    console.warn(`[Studio] render_meta (${jobId}): ${e instanceof Error ? e.message : e}`);
  }
}

const AVATAR_BACKGROUND = "#101728";
/** HeyGen nie dostaje zlecenia na napisy — wypalamy je sami z własnego SRT. */
const HEYGEN_CAPTIONS: CaptionMode = "off";

type Narration = {
  /** Audio dla kolejnych scen (jedna scena = cały scenariusz). */
  pieces: Array<ArrayBuffer | Uint8Array<ArrayBuffer>>;
  /** Kwestie napisów na osi czasu gotowego filmu. */
  cues: SrtCue[];
  note: string | null;
};

/**
 * Rotacja twarzy: prowadzi awatar wybrany w panelu, za nim reszta stałego
 * zestawu domyślnych. Dzięki temu wybór z formularza nie znika, a struktura
 * i tak ma z czego brać „innego awatara".
 */
function avatarRotation(args: RenderArgs): string[] {
  return [...new Set([args.avatarId, ...(args.avatarIds ?? [])])].filter(Boolean);
}

/**
 * Jedno wywołanie ElevenLabs na cały scenariusz (z czasami znaków), pocięte
 * w pauzach między scenami — każda scena dostaje kawałek tego samego
 * nagrania, a napisy mają czasy prosto z syntezy. Osobna synteza per scena
 * dawała skoki tempa i intonacji na złączeniach.
 */
async function narrateAsOne(
  voiceId: string,
  modelId: TtsModelId,
  segments: string[],
): Promise<Narration> {
  const { ttsElevenLabsWithTimestamps } = await import("./avatar-faq.server");
  const { audio, alignment } = await ttsElevenLabsWithTimestamps({
    text: joinNarration(segments),
    voiceId,
    modelId,
    voiceSettings: NARRATION_VOICE_SETTINGS,
  });
  const cues = cuesFromAlignment(alignment);
  if (segments.length === 1)
    return { pieces: [audio as Uint8Array<ArrayBuffer>], cues, note: null };
  const pieces = splitMp3AtTimes(audio, narrationCutTimes(segments, alignment));
  if (pieces.length !== segments.length) throw new Error("Lektor: liczba kawałków ≠ liczba scen.");
  return { pieces, cues, note: null };
}

/**
 * Zapas: synteza per scena (też z czasami znaków), z sąsiednim tekstem jako
 * kontekstem (previous_text / next_text). Napisy każdej sceny przesuwamy
 * o łączną długość poprzednich kawałków — HeyGen skleja sceny jedna za drugą.
 */
async function narratePerScene(
  voiceId: string,
  modelId: TtsModelId,
  segments: string[],
): Promise<Narration> {
  const { ttsElevenLabsWithTimestamps } = await import("./avatar-faq.server");
  const pieces: Uint8Array<ArrayBuffer>[] = [];
  const cues: SrtCue[] = [];
  let offset = 0;
  for (const [i, text] of segments.entries()) {
    const { audio, alignment } = await ttsElevenLabsWithTimestamps({
      text,
      voiceId,
      modelId,
      voiceSettings: NARRATION_VOICE_SETTINGS,
      previousText: segments.slice(0, i).join(" ") || undefined,
      nextText: segments.slice(i + 1).join(" ") || undefined,
    });
    pieces.push(audio as Uint8Array<ArrayBuffer>);
    cues.push(...shiftCues(cuesFromAlignment(alignment), offset));
    offset += mp3DurationSeconds(audio);
  }
  return {
    pieces,
    cues,
    note: "Lektor syntezowany per scena (jednym ciągiem się nie udało).",
  };
}

async function narrate(
  args: RenderArgs,
  modelId: TtsModelId,
  segments: string[],
): Promise<Narration> {
  try {
    return await narrateAsOne(args.voiceId, modelId, segments);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Studio] lektor jednym ciągiem nieudany, syntezuję per scena: ${msg}`);
    return narratePerScene(args.voiceId, modelId, segments);
  }
}

/**
 * Plik SRT z kwestii → bucket `studio-media` (trwały publiczny link; usługa
 * wypalania pobiera go po renderze HeyGena, także z innego ticka).
 */
async function storeSubtitles(cues: SrtCue[], name: string): Promise<string> {
  if (!cues.length) throw new Error("Napisy: ElevenLabs nie oddał czasów ani jednego słowa.");
  const { storeMedia } = await import("./media-storage.server");
  const stored = await storeMedia(new TextEncoder().encode(cuesToSrt(cues)), {
    contentType: "text/plain; charset=utf-8",
    visibility: "public",
    prefix: "studio-napisy",
    name,
    ext: "srt",
  });
  return stored.url;
}

/**
 * Lektor + napisy dla scen: nagranie i (gdy napisy włączone) zapisany SRT.
 * Bez napisów SRT i tak zapisujemy, jeśli się da (plik „tylko SRT" do
 * pobrania w panelu) — ale jego brak nie blokuje rolki.
 */
async function narrateWithSubtitles(
  args: RenderArgs,
  modelId: TtsModelId,
  segments: string[],
): Promise<Narration & { subtitleUrl: string | null }> {
  const narration = await narrate(args, modelId, segments);
  const name = (args.name ?? args.topic).trim() || "rolka";
  try {
    return { ...narration, subtitleUrl: await storeSubtitles(narration.cues, name) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (args.captions) throw new Error(`Napisy z czasów ElevenLabs nie powstały: ${msg}`);
    console.warn(`[Studio] plik SRT pominięty (rolka bez napisów): ${msg}`);
    return { ...narration, subtitleUrl: null };
  }
}

/**
 * Pojedyncze ujęcie: jeden lektor, jeden render awatara. `fit: cover` —
 * kadr 9:16 zawsze pełny, także z poziomego looka (przycięte boki, bez pasów).
 */
async function renderSingleShot(
  args: RenderArgs,
  ctx: Ctx,
  note: string | null,
): Promise<StudioRenderResult> {
  const { uploadAudioToHeygen, createHeygenVideoFromAudio } = await import("./avatar-faq.server");
  const { assessAvatars } = await import("./studio-quality.server");
  const [lead] = await assessAvatars([args.avatarId], ctx.quality);
  const narration = await narrateWithSubtitles(args, ctx.modelId, [args.script]);
  const assetId = await uploadAudioToHeygen(narration.pieces[0]);
  const created = await createHeygenVideoFromAudio({
    avatarId: args.avatarId,
    audioAssetId: assetId,
    captions: HEYGEN_CAPTIONS,
    resolution: ctx.quality.resolution,
    fit: "cover",
    engine: lead?.engine ?? null,
  });
  return {
    videoId: created.videoId,
    scenePlan: null,
    subtitleUrl: narration.subtitleUrl,
    ttsModelId: ctx.modelId,
    note: [note, narration.note, created.engineFallback].filter(Boolean).join(" ") || null,
    renderMeta: buildMeta(args, ctx, {
      videoType: "avatar",
      avatars: lead ? [lead] : [],
      brollScenes: 0,
      engineFallback: created.engineFallback,
    }),
  };
}

/** Plan scen dla trybu „struktura rolki" — rytm stały, frazy od AI. */
async function planStructured(args: RenderArgs, segments: string[]): Promise<ScenePlanItem[]> {
  const plan = planReelStructure(segments, { avatarIds: avatarRotation(args) });
  const indices = plan.flatMap((item, i) => (item.kind === "broll" ? [i] : []));
  if (!indices.length) return plan;

  let queries = new Map<number, string>();
  try {
    const { planBrollQueries } = await import("./studio-ai.server");
    queries = await planBrollQueries({ segments, indices, topic: args.topic });
  } catch (e) {
    // Bez fraz struktura stoi dalej — bank odda wtedy materiał najdawniej
    // użyty, zamiast zwijać montaż do gadającej głowy.
    console.warn(`[Studio] frazy przebitek nieudane: ${e instanceof Error ? e.message : e}`);
  }
  return plan.map((item, i) =>
    item.kind === "broll" ? { ...item, query: queries.get(i) ?? null } : item,
  );
}

/** Plan scen dla trybu „przebitki AI" — to AI wskazuje miejsca cięć. */
async function planByAi(args: RenderArgs, segments: string[]): Promise<ScenePlanItem[]> {
  const { planVideoScenes } = await import("./studio-ai.server");
  const decisions = await planVideoScenes({ segments, topic: args.topic });
  return applyScenePlan(segments, decisions, avatarRotation(args));
}

export async function renderStudioVideo(args: RenderArgs): Promise<StudioRenderResult> {
  const modelId = parseTtsModelId(args.ttsModelId, DEFAULT_TTS_MODEL_ID);
  const { getStudioQualitySettings, assessAvatars } = await import("./studio-quality.server");
  const ctx: Ctx = { modelId, quality: args.quality ?? (await getStudioQualitySettings()) };
  const structured = args.reelStructure === true;
  if (!args.dynamicScenes && !structured) return renderSingleShot(args, ctx, null);

  const segments = splitScriptIntoSegments(args.script);
  if (segments.length < MIN_SCENES_FOR_BROLL) {
    return renderSingleShot(args, ctx, "Urozmaicenie pominięte: scenariusz za krótki na cięcia.");
  }

  // Sklejka scen nie przycina awatara — poziomy look = pasy w kadrze 9:16.
  // Sprawdzamy, ZANIM pójdą kredyty ElevenLabs i HeyGen.
  const avatars = await assessAvatars(avatarRotation(args), ctx.quality);
  const letterboxed = letterboxedAvatars(avatars);
  if (letterboxed.length && ctx.quality.landscapePolicy === "block" && !args.allowLetterbox) {
    throw new Error(letterboxBlockMessage(letterboxed));
  }
  const engines = Object.fromEntries(avatars.map((a) => [a.id, a.engine]));

  let plan: ScenePlanItem[];
  try {
    plan = structured ? await planStructured(args, segments) : await planByAi(args, segments);
  } catch (e) {
    console.warn(`[Studio] planowanie scen nieudane: ${e instanceof Error ? e.message : e}`);
    return renderSingleShot(args, ctx, "Urozmaicenie pominięte: planer scen nie odpowiedział.");
  }
  if (!planHasBroll(plan)) {
    return renderSingleShot(
      args,
      ctx,
      "Urozmaicenie pominięte: AI nie wskazało sensownych ilustracji.",
    );
  }

  // Grafiki dla przebitek. Pusty wynik nie psuje planu — taka
  // scena wraca na awatara (buildStudioScenes), a gdy nie zostanie ani jedna
  // grafika, nie ma po co płacić za render wieloscenowy.
  const { resolveBrollImage, markBrollUsed } = await import("./studio-broll.server");
  const usedAssets = new Set<string>();
  const images: (string | null)[] = [];
  for (const item of plan) {
    if (item.kind === "avatar") {
      images.push(null);
      continue;
    }
    try {
      const broll = await resolveBrollImage(item.query, usedAssets);
      if (broll?.assetId) usedAssets.add(broll.assetId);
      images.push(broll?.url ?? null);
    } catch (e) {
      console.warn(
        `[Studio] materiał dla sceny "${item.query ?? item.kind}" nieudany: ${
          e instanceof Error ? e.message : e
        }`,
      );
      images.push(null);
    }
  }
  if (!images.some(Boolean)) {
    return renderSingleShot(
      args,
      ctx,
      "Urozmaicenie pominięte: brak materiałów w banku b-rolli i w stocku.",
    );
  }

  // Lektor: cały scenariusz jednym ciągiem, pocięty na sceny (długość sceny
  // HeyGen wylicza z jej audio); napisy z tych samych czasów.
  const { uploadAudioToHeygen, createHeygenStudioVideo } = await import("./avatar-faq.server");
  const sceneTexts = plan.map((item) => item.text);
  const narration = await narrateWithSubtitles(args, modelId, sceneTexts);
  const resolved: ResolvedScene[] = [];
  for (const [i, item] of plan.entries()) {
    resolved.push({
      item,
      audioAssetId: await uploadAudioToHeygen(narration.pieces[i]),
      imageUrl: images[i],
    });
  }

  const { withEngineFallback } = await import("./avatar-faq.server");
  try {
    // Avatar V per look; gdy HeyGen go odrzuci — cała sklejka raz jeszcze na
    // domyślnym silniku, zamiast schodzić na pojedyncze ujęcie.
    const wantsV = Object.values(engines).some(Boolean) ? ("avatar_v" as const) : null;
    const created = await withEngineFallback(wantsV, (engine) =>
      createHeygenStudioVideo({
        scenes: buildStudioScenes(resolved, {
          avatarId: args.avatarId,
          backgroundColor: AVATAR_BACKGROUND,
          engines: engine ? engines : undefined,
        }),
        captions: HEYGEN_CAPTIONS,
        resolution: ctx.quality.resolution,
      }),
    );
    // Zużycie odnotowujemy dopiero, gdy render faktycznie ruszył — inaczej
    // nieudana próba przesuwałaby rotację banku.
    await markBrollUsed([...usedAssets]).catch((e) =>
      console.warn(`[Studio] licznik banku: ${e instanceof Error ? e.message : e}`),
    );
    // Plan zapisujemy taki, jaki poszedł na render: sceny bez grafiki
    // zostały scenami awatara.
    const effective = plan.map(
      (item, i): ScenePlanItem =>
        item.kind !== "avatar" && !images[i]
          ? { kind: "avatar", text: item.text, query: null, avatarId: item.avatarId ?? null }
          : item,
    );
    const used = new Set(
      effective.filter((i) => i.kind === "avatar").map((i) => i.avatarId || args.avatarId),
    );
    return {
      videoId: created.videoId,
      scenePlan: effective,
      subtitleUrl: narration.subtitleUrl,
      ttsModelId: modelId,
      note: [narration.note, created.engineFallback].filter(Boolean).join(" ") || null,
      renderMeta: buildMeta(args, ctx, {
        videoType: "studio",
        avatars: avatars.filter((a) => used.has(a.id)),
        brollScenes: effective.filter((i) => i.kind !== "avatar").length,
        engineFallback: created.engineFallback,
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Studio] render wieloscenowy nieudany, schodzę na jedno ujęcie: ${msg}`);
    return renderSingleShot(args, ctx, `Urozmaicenie pominięte: render scen odrzucony.`);
  }
}
