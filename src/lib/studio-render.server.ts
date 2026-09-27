// Studio publikacji — uruchomienie renderu wideo (jedno miejsce dla panelu
// i dla kolejki wsadowej).
//
// Trzy ścieżki:
//   * pojedyncze ujęcie — awatar czyta cały scenariusz (dotychczasowe działanie),
//   * przebitki AI — sklejka scen, w której AI wskazuje, co zilustrować,
//   * struktura rolki — stały rytm: ujęcie → wizual hook → przebitka →
//     a-roll KOLEJNEGO domyślnego awatara (patrz src/lib/studio-scenes.ts).
//
// Materiał na przebitki i hooki bierzemy z BANKU B-ROLLI
// (src/lib/studio-broll.server.ts): najpierw własna biblioteka, a czego w niej
// nie ma, bank dociąga ze stocku i od razu u siebie zapisuje.
//
// ZASADA: urozmaicenie nigdy nie blokuje generacji. Każdy krok, który może się
// nie udać (planowanie AI, dobór grafik, render wieloscenowy), ma zejście na
// pojedyncze ujęcie i zapisuje powód, zamiast wywalać joba.

import type { CaptionMode } from "./studio-captions";
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
  /** Stały rytm rolki zamiast decyzji AI o miejscach cięć. */
  reelStructure?: boolean;
  /** Domyślne awatary — rotacja a-rolli („a-roll z innego awatara"). */
  avatarIds?: string[];
};

const AVATAR_BACKGROUND = "#101728";

/**
 * Rotacja twarzy: prowadzi awatar wybrany w panelu, za nim reszta stałego
 * zestawu domyślnych. Dzięki temu wybór z formularza nie znika, a struktura
 * i tak ma z czego brać „innego awatara".
 */
function avatarRotation(args: RenderArgs): string[] {
  return [...new Set([args.avatarId, ...(args.avatarIds ?? [])])].filter(Boolean);
}

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
  const captionMode: CaptionMode = args.captions ? "burned" : "off";
  const structured = args.reelStructure === true;
  if (!args.dynamicScenes && !structured) return renderSingleShot(args, captionMode, null);

  const segments = splitScriptIntoSegments(args.script);
  if (segments.length < MIN_SCENES_FOR_BROLL) {
    return renderSingleShot(
      args,
      captionMode,
      "Urozmaicenie pominięte: scenariusz za krótki na cięcia.",
    );
  }

  let plan: ScenePlanItem[];
  try {
    plan = structured ? await planStructured(args, segments) : await planByAi(args, segments);
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

  // Grafiki dla przebitek i wizual hooków. Pusty wynik nie psuje planu — taka
  // scena wraca na awatara (buildStudioScenes), a gdy nie zostanie ani jedna
  // grafika, nie ma po co płacić za render wieloscenowy.
  const { resolveBrollImage, pickHookFromBank, markBrollUsed } =
    await import("./studio-broll.server");
  const usedAssets = new Set<string>();
  const images: (string | null)[] = [];
  for (const item of plan) {
    if (item.kind === "avatar") {
      images.push(null);
      continue;
    }
    try {
      if (item.kind === "hook") {
        const hook = await pickHookFromBank(usedAssets);
        if (hook) usedAssets.add(hook.id);
        images.push(hook?.media_url ?? null);
        continue;
      }
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
      captionMode,
      "Urozmaicenie pominięte: brak materiałów w banku b-rolli i w stocku.",
    );
  }

  // Lektor per scena — długość sceny HeyGen wylicza z jej audio.
  const { ttsElevenLabs, uploadAudioToHeygen, createHeygenStudioVideo } =
    await import("./avatar-faq.server");
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
    return { ...created, scenePlan: effective, note: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[Studio] render wieloscenowy nieudany, schodzę na jedno ujęcie: ${msg}`);
    return renderSingleShot(args, captionMode, `Urozmaicenie pominięte: render scen odrzucony.`);
  }
}
