// Studio publikacji — rolka jako KOMPOZYCJA SCEN zamiast jednego ujęcia
// gadającej głowy (HeyGen `POST /v3/videos` z `type: "studio"`).
//
// CO HEYGEN POTRAFI, A CZEGO NIE (v3, sprawdzone w specyfikacji API):
//   * `studio` skleja 1–50 scen pełnoekranowych, każda docinana do wspólnego
//     kadru; NIE ma warstw, więc nakładek na awatara (ikonka w rogu, napis na
//     środku, PiP) API nie zrobi — jedyny tekst na obrazie to wypalane napisy,
//   * scena `avatar_video` = awatar + audio (nasze ElevenLabs),
//   * scena `image` = pełnoekranowa grafika, która MOŻE być narratorowana
//     (audio leci dalej) — to jest nasz materiał ilustracyjny,
//   * scena `video` = klip, ale BEZ narracji i BEZ przycinania, więc wstawiony
//     w środek rolki ucina lektora i robi ciszę — dlatego z niej nie korzystamy.
//
// Stąd projekt: lektor gra bez przerwy, a obraz co jakiś czas przechodzi
// z awatara na pełnoekranową grafikę ze stocku HeyGena (`/v3/assets/search`).
//
// ZASADA: tekst mówiony dzielimy DETERMINISTYCZNIE (zdaniami). AI dostaje
// gotowe segmenty i decyduje wyłącznie, które z nich zilustrować i czym —
// nigdy nie przepisuje scenariusza, więc lektor mówi dokładnie to, co
// zatwierdzono w panelu.

/** Maksymalna liczba scen w rolce — więcej cięć męczy przy 30–60 s. */
export const MAX_SCENES = 6;
/** Minimalna liczba scen, żeby w ogóle było co urozmaicać. */
export const MIN_SCENES_FOR_BROLL = 3;

export type SceneKind = "avatar" | "broll";

export type ScenePlanItem = {
  kind: SceneKind;
  /** Fragment tekstu mówionego przypisany do tej sceny. */
  text: string;
  /** Angielska fraza do biblioteki stocku HeyGena — tylko dla `broll`. */
  query: string | null;
};

/** Decyzja AI dla jednego segmentu (indeks zgodny z listą segmentów). */
export type SceneDecision = {
  index: number;
  broll: boolean;
  query: string | null;
};

const SENTENCE_SPLIT = /(?<=[.!?…])\s+/;

/**
 * Dzieli tekst lektora na segmenty po zdaniach i grupuje je do `max` scen.
 * Deterministycznie — ten sam scenariusz zawsze daje ten sam podział.
 */
export function splitScriptIntoSegments(script: string, max = MAX_SCENES): string[] {
  const clean = script.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return [clean];

  const target = Math.min(max, sentences.length);
  // Rozkładamy zdania możliwie równo: pierwsze grupy dostają resztę z dzielenia.
  const perScene = Math.floor(sentences.length / target);
  const remainder = sentences.length % target;

  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < target; i++) {
    const take = perScene + (i < remainder ? 1 : 0);
    out.push(sentences.slice(cursor, cursor + take).join(" "));
    cursor += take;
  }
  return out.filter(Boolean);
}

/**
 * Nakłada decyzje AI na segmenty i pilnuje reguł montażowych:
 *  - pierwsza i ostatnia scena zawsze z awatarem (hook i CTA mówi twarz),
 *  - żadnych dwóch przebitek pod rząd (widz musi wracać do człowieka),
 *  - przebitka bez frazy wyszukiwania to zwykła scena z awatarem,
 *  - przy krótkim materiale (< MIN_SCENES_FOR_BROLL scen) nie tniemy wcale.
 */
export function applyScenePlan(segments: string[], decisions: SceneDecision[]): ScenePlanItem[] {
  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const lastIndex = segments.length - 1;
  const allowBroll = segments.length >= MIN_SCENES_FOR_BROLL;

  const items: ScenePlanItem[] = [];
  let previousWasBroll = false;

  segments.forEach((text, i) => {
    const decision = byIndex.get(i);
    const query = decision?.query?.trim() || null;
    const wantsBroll =
      allowBroll && decision?.broll === true && Boolean(query) && i !== 0 && i !== lastIndex;
    const broll = wantsBroll && !previousWasBroll;
    previousWasBroll = broll;
    items.push({ kind: broll ? "broll" : "avatar", text, query: broll ? query : null });
  });

  return items;
}

/** Czy plan w ogóle coś zmienia względem jednego ujęcia gadającej głowy. */
export function planHasBroll(items: ScenePlanItem[]): boolean {
  return items.some((i) => i.kind === "broll");
}

/** Scena gotowa do wysłania — z podpiętym audio i (dla przebitki) grafiką. */
export type ResolvedScene = {
  item: ScenePlanItem;
  audioAssetId: string;
  /** URL grafiki ze stocku; brak = przebitka schodzi z powrotem na awatara. */
  imageUrl: string | null;
};

export type HeygenStudioScene =
  | {
      type: "avatar_video";
      input: {
        type: "avatar";
        avatar_id: string;
        audio_asset_id: string;
        background?: { type: "color"; color: string };
      };
    }
  | { type: "image"; source: { type: "url"; url: string }; audio_asset_id: string };

/**
 * Buduje listę scen dla HeyGena. Przebitka bez grafiki (pusty wynik
 * wyszukiwania) wraca na awatara — nigdy nie zostawiamy dziury w obrazie.
 */
export function buildStudioScenes(
  resolved: ResolvedScene[],
  opts: { avatarId: string; backgroundColor?: string },
): HeygenStudioScene[] {
  return resolved.map(({ item, audioAssetId, imageUrl }) => {
    if (item.kind === "broll" && imageUrl) {
      return {
        type: "image" as const,
        source: { type: "url" as const, url: imageUrl },
        audio_asset_id: audioAssetId,
      };
    }
    return {
      type: "avatar_video" as const,
      input: {
        type: "avatar" as const,
        avatar_id: opts.avatarId,
        audio_asset_id: audioAssetId,
        ...(opts.backgroundColor
          ? { background: { type: "color" as const, color: opts.backgroundColor } }
          : {}),
      },
    };
  });
}

/** Krótkie podsumowanie planu do panelu („3 ujęcia + 2 przebitki"). */
export function describeScenePlan(items: ScenePlanItem[]): string {
  const broll = items.filter((i) => i.kind === "broll").length;
  const avatar = items.length - broll;
  const parts = [`${avatar} ${avatar === 1 ? "ujęcie" : "ujęcia"} z awatarem`];
  if (broll) parts.push(`${broll} ${broll === 1 ? "przebitka" : "przebitki"}`);
  return parts.join(" + ");
}
