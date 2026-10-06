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
// z awatara na pełnoekranową grafikę z banku b-rolli (`studio-broll.server.ts`,
// z dossypką ze stocku).
//
// DWA TRYBY MONTAŻU:
//   * „przebitki AI" (applyScenePlan) — AI wskazuje, KTÓRE segmenty
//     zilustrować; reszta zostaje na awatarze,
//   * „struktura rolki" (planReelStructure) — stały rytm
//     ujęcie → przebitka → a-roll KOLEJNEGO domyślnego awatara.
//     Tu AI nie decyduje już gdzie ciąć, tylko czym zilustrować.
//
// ZASADA: tekst mówiony dzielimy DETERMINISTYCZNIE (zdaniami). AI dostaje
// gotowe segmenty i decyduje wyłącznie, które z nich zilustrować i czym —
// nigdy nie przepisuje scenariusza, więc lektor mówi dokładnie to, co
// zatwierdzono w panelu.

/** Maksymalna liczba scen w rolce — więcej cięć męczy przy 30–60 s. */
export const MAX_SCENES = 6;
/** Minimalna liczba scen, żeby w ogóle było co urozmaicać. */
export const MIN_SCENES_FOR_BROLL = 3;
/**
 * Ile twarzy domyślnie w jednej rolce: prowadzący + jeden partner z zestawu
 * domyślnych (dobierany rotacyjnie). Dwie twarze dają zmianę rozmówcy bez
 * chaosu w 30–60 s; resztę zestawu obsługują kolejne rolki.
 */
export const AVATARS_PER_REEL = 2;
/** Górny limit twarzy w rolce — tyle, ile mieści zestaw domyślnych. */
export const MAX_AVATARS_PER_REEL = 6;

export type SceneKind = "avatar" | "broll";

export type ScenePlanItem = {
  kind: SceneKind;
  /** Fragment tekstu mówionego przypisany do tej sceny. */
  text: string;
  /** Angielska fraza do banku/stocku — tylko dla `broll`. */
  query: string | null;
  /**
   * Awatar, który mówi tę scenę. Dla `broll` trzymamy tu awatara,
   * na którego scena spadnie, gdy grafiki zabraknie — dzięki temu awaria
   * przebitki nie wybija rotacji a-rolli z rytmu.
   */
  avatarId?: string | null;
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
export function applyScenePlan(
  segments: string[],
  decisions: SceneDecision[],
  avatarIds: string[] = [],
): ScenePlanItem[] {
  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const rotation = avatarIds.filter(Boolean);
  let speaker = 0;
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
    // Każde ujęcie z awatarem bierze kolejnego z rotacji; przebitka dziedziczy
    // aktualnego mówcę (to on wróci na ekran, gdy grafiki nie będzie).
    const avatarId = rotation.length ? rotation[speaker % rotation.length] : null;
    if (!broll) speaker++;
    items.push({
      kind: broll ? "broll" : "avatar",
      text,
      query: broll ? query : null,
      avatarId,
    });
  });

  return items;
}

/**
 * Stały rytm rolki po pierwszym ujęciu: przebitka → a-roll innego awatara.
 * (Wizual hooki — pełnoekranowe „efekty" po pierwszym zdaniu — wyleciały:
 * obraz przechodzi wyłącznie na b-rolle ilustrujące treść.)
 */
export const REEL_CYCLE: SceneKind[] = ["broll", "avatar"];

/**
 * STRUKTURA ROLKI (tryb „struktura", w odróżnieniu od trybu, w którym miejsca
 * przebitek wskazuje AI):
 *
 *   0. ujęcie z pierwszym domyślnym awatarem — hook mówi twarz,
 *   1. przebitka (b-roll) ilustrująca treść,
 *   2. a-roll KOLEJNEGO domyślnego awatara — zmiana twarzy resetuje uwagę,
 *   … i tak w kółko, a ostatnia scena (CTA) zawsze wraca na awatara.
 *
 * Rytm jest deterministyczny — AI nie decyduje już GDZIE ciąć, tylko CZYM
 * zilustrować przebitkę (frazę dokleja render). Dzięki temu każda rolka ma
 * ten sam, rozpoznawalny montaż.
 */
export function planReelStructure(
  segments: string[],
  opts: { avatarIds: string[] },
): ScenePlanItem[] {
  const rotation = opts.avatarIds.filter(Boolean);
  const avatarAt = (turn: number): string | null =>
    rotation.length ? rotation[turn % rotation.length] : null;

  const lastIndex = segments.length - 1;
  let speaker = 0;

  // Za krótki materiał zostaje gadającą głową — cięcia co jedno zdanie męczą.
  if (segments.length < MIN_SCENES_FOR_BROLL) {
    return segments.map((text) => {
      const avatarId = avatarAt(speaker);
      speaker++;
      return { kind: "avatar" as const, text, query: null, avatarId };
    });
  }

  const items: ScenePlanItem[] = [];
  let cycle = 0;
  segments.forEach((text, i) => {
    const isEdge = i === 0 || i === lastIndex;
    const role: SceneKind = isEdge ? "avatar" : REEL_CYCLE[cycle++ % REEL_CYCLE.length];
    const avatarId = avatarAt(speaker);
    if (role === "avatar") speaker++;
    items.push({ kind: role, text, query: null, avatarId });
  });
  return items;
}

/**
 * Ile scen planu czeka na grafikę. Liczymy wszystko poza awatarem — stare
 * joby w bazie mogą jeszcze mieć sceny `hook` sprzed usunięcia wizual hooków.
 */
export function visualSceneCount(items: ScenePlanItem[]): number {
  return items.filter((i) => i.kind !== "avatar").length;
}

/** Awatary faktycznie użyte w planie, w kolejności wejścia na ekran. */
export function avatarsInPlan(items: ScenePlanItem[]): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (i.kind === "avatar" && i.avatarId && !out.includes(i.avatarId)) out.push(i.avatarId);
  }
  return out;
}

/** Czy plan w ogóle coś zmienia względem jednego ujęcia gadającej głowy. */
export function planHasBroll(items: ScenePlanItem[]): boolean {
  return items.some((i) => i.kind !== "avatar");
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
        /** Avatar V dla looków, które go obsługują; brak = domyślny silnik HeyGena. */
        engine?: { type: "avatar_v" };
      };
    }
  | { type: "image"; source: { type: "url"; url: string }; audio_asset_id: string };

/**
 * Buduje listę scen dla HeyGena. Przebitka bez grafiki (pusty wynik
 * wyszukiwania) wraca na awatara — nigdy nie zostawiamy dziury w obrazie.
 */
export function buildStudioScenes(
  resolved: ResolvedScene[],
  opts: {
    avatarId: string;
    backgroundColor?: string;
    /** Silnik per awatar (id → `avatar_v`); awatara spoza mapy renderuje domyślny silnik. */
    engines?: Record<string, "avatar_v" | null>;
  },
): HeygenStudioScene[] {
  return resolved.map(({ item, audioAssetId, imageUrl }) => {
    if (item.kind !== "avatar" && imageUrl) {
      return {
        type: "image" as const,
        source: { type: "url" as const, url: imageUrl },
        audio_asset_id: audioAssetId,
      };
    }
    // Scena niesie własnego awatara (rotacja a-rolli); `opts.avatarId`
    // to zapasowy mówca, gdy plan nie wskazał nikogo.
    const avatarId = item.avatarId || opts.avatarId;
    const engine = opts.engines?.[avatarId] ?? null;
    return {
      type: "avatar_video" as const,
      input: {
        type: "avatar" as const,
        avatar_id: avatarId,
        audio_asset_id: audioAssetId,
        ...(opts.backgroundColor
          ? { background: { type: "color" as const, color: opts.backgroundColor } }
          : {}),
        ...(engine ? { engine: { type: engine } } : {}),
      },
    };
  });
}

/** Krótkie podsumowanie planu do panelu („3 ujęcia + 2 przebitki"). */
export function describeScenePlan(items: ScenePlanItem[]): string {
  const broll = items.filter((i) => i.kind !== "avatar").length;
  const avatar = items.length - broll;
  const parts = [`${avatar} ${avatar === 1 ? "ujęcie" : "ujęcia"} z awatarem`];
  if (broll) parts.push(`${broll} ${broll === 1 ? "przebitka" : "przebitki"}`);
  const faces = avatarsInPlan(items).length;
  const summary = parts.join(" + ");
  return faces > 1 ? `${summary} (${faces} awatary)` : summary;
}
