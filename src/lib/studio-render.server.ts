// Studio publikacji — uruchomienie renderu wideo (jedno miejsce dla panelu
// i dla kolejki wsadowej).
//
// Dwie ścieżki:
//   * pojedyncze ujęcie — awatar czyta cały scenariusz (dotychczasowe działanie),
//   * urozmaicenie — sklejka scen: awatar + pełnoekranowe grafiki ze stocku
//     HeyGena, przez które lektor mówi dalej (patrz src/lib/studio-scenes.ts).
//
// ZASADA: urozmaicenie nigdy nie blokuje generacji. Każdy krok, który może się
// nie udać (planowanie AI, wyszukiwanie grafik, render wieloscenowy), ma
// zejście na pojedyncze ujęcie i zapisuje powód, zamiast wywalać joba.

import type { CaptionMode } from "./studio-captions";
import {
  applyScenePlan,
  buildStudioScenes,
  MIN_SCENES_FOR_BROLL,
  planHasBroll,
  splitScriptIntoSegments,
  type ResolvedScene,
  type ScenePlanItem,
} from "./studio-scenes";

export type StudioRenderResult = {
  videoId: string;
  captionMode: CaptionMode;
  /** Plan scen, jeśli render poszedł jako sklejka; null = pojedyncze ujęcie. */
  scenePlan: ScenePlanItem[] | null;
  /** Dlaczego urozmaicenie nie doszło do skutku (do pokazania w panelu). */
  note: string | null;
};

type RenderArgs = {
  script: string;
  /** Temat odcinka — kontekst dla planera scen. */
  topic: string;
  avatarId: string;
  voiceId: string;
  captions: boolean;
  dynamicScenes: boolean;
};

const AVATAR_BACKGROUND = "#101728";

/** Pojedyncze ujęcie: jeden lektor, jeden render awatara. */
async function renderSingleShot(
  args: RenderArgs,
  captionMode: CaptionMode,
  note: string | null,
): Promise<StudioRenderResult> {
  const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
    await import("./avatar-faq.server");
  const audio = await ttsElevenLabs({ text: args.script, voiceId: args.voiceId });
  const assetId = await uploadAudioToHeygen(audio);
  const created = await createHeygenVideoFromAudio({
    avatarId: args.avatarId,
    audioAssetId: assetId,
    captions: captionMode,
  });
  return { ...created, scenePlan: null, note };
}

export async function renderStudioVideo(args: RenderArgs): Promise<StudioRenderResult> {
  const captionMode: CaptionMode = args.captions ? "burned" : "off";
  if (!args.dynamicScenes) return renderSingleShot(args, captionMode, null);

  const segments = splitScriptIntoSegments(args.script);
  if (segments.length < MIN_SCENES_FOR_BROLL) {
    return renderSingleShot(
      args,
      captionMode,
      "Urozmaicenie pominięte: scenariusz za krótki na cięcia.",
    );
  }

  const { planVideoScenes } = await import("./studio-ai.server");
  let plan: ScenePlanItem[];
  try {
    const decisions = await planVideoScenes({ segments, topic: args.topic });
    plan = applyScenePlan(segments, decisions);
  } catch (e) {
    console.warn(`[Studio] planowanie scen nieudane: ${e instanceof Error ? e.message : e}`);
    return renderSingleShot(
      args,
      captionMode,
      "Urozmaicenie pominięte: planer scen nie odpowiedział.",
    );
  }
  if (!planHasBroll(plan)) {
    return renderSingleShot(
      args,
      captionMode,
      "Urozmaicenie pominięte: AI nie wskazało sensownych ilustracji.",
    );
  }

  // Grafiki dla przebitek. Pusty wynik nie psuje planu — taka scena wraca
  // na awatara (buildStudioScenes), a gdy nie zostanie ani jedna grafika,
  // nie ma po co płacić za render wieloscenowy.
  const { searchHeygenStockImage, ttsElevenLabs, uploadAudioToHeygen, createHeygenStudioVideo } =
    await import("./avatar-faq.server");
  const images: (string | null)[] = [];
  for (const item of plan) {
    if (item.kind !== "broll" || !item.query) {
      images.push(null);
      continue;
    }
    try {
      images.push(await searchHeygenStockImage(item.query));
    } catch (e) {
      console.warn(
        `[Studio] stock "${item.query}" nieudany: ${e instanceof Error ? e.message : e}`,
      );
      images.push(null);
    }
  }
  if (!images.some(Boolean)) {
    return renderSingleShot(
      args,
      captionMode,
      "Urozmaicenie pominięte: brak pasujących grafik w bibliotece HeyGen.",
    );
  }

  // Lektor per scena — długość sceny HeyGen wylicza z jej audio.
  const resolved: ResolvedScene[] = [];
  for (const [i, item] of plan.entries()) {
    const audio = await ttsElevenLabs({ text: item.text, voiceId: args.voiceId });
    resolved.push({
      item,
      audioAssetId: await uploadAudioToHeygen(audio),
      imageUrl: images[i],
    });
  }

  const scenes = buildStudioScenes(resolved, {
    avatarId: args.avatarId,
    backgroundColor: AVATAR_BACKGROUND,
  });
  try {
    const created = await createHeygenStudioVideo({ scenes, captions: captionMode });
    // Plan zapisujemy taki, jaki poszedł na render: przebitki bez grafiki
    // zostały scenami awatara.
    const effective = plan.map(
      (item, i): ScenePlanItem =>
        item.kind === "broll" && !images[i]
          ? { kind: "avatar", text: item.text, query: null }
          : item,
    );
    return { ...created, scenePlan: effective, note: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Studio] render wieloscenowy nieudany, schodzę na jedno ujęcie: ${msg}`);
    return renderSingleShot(args, captionMode, `Urozmaicenie pominięte: render scen odrzucony.`);
  }
}
