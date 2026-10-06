// Studio publikacji — jakość obrazu rolki (czysta logika, bez sieci).
//
// SKĄD PASY W ROLCE: HeyGen w trybie `studio` (sklejka scen) NIE przycina
// sceny do kadru — wpasowuje ją w całości i dopełnia tłem. Awatar nagrany
// poziomo (look 16:9, np. 1920×1080) w pionowej rolce 9:16 ląduje w pasku
// przez środek kadru, a nad nim i pod nim zostają pasy w kolorze tła
// (u nas granat #101728). API scen `avatar_video` nie ma pola `fit` — ma je
// tylko pojedyncze ujęcie (`type: "avatar"`), więc:
//   * pojedyncze ujęcie zamawiamy z `fit: "cover"` (wypełnia kadr, przycina
//     boki) — pasów nie ma nigdy,
//   * w sklejce scen jedyny sposób na pełny kadr to look PIONOWY. Look
//     poziomy przy polityce `block` zatrzymuje render, ZANIM pójdą kredyty
//     ElevenLabs i HeyGen, z listą winnych awatarów.
//
// Silnik awatara: HeyGen v3 ma Avatar III / IV (domyślny) / V (najwyższa
// wierność ruchu i ruchu ust, opcjonalny per look). Przy ustawieniu `best`
// bierzemy Avatar V wszędzie, gdzie look go obsługuje (`supported_api_engines`).
//
// Rozdzielczość: HeyGen renderuje awatara natywnie do 1080p — 1080p to
// najwyższa sensowna jakość (4k = ten sam awatar na większym płótnie).

export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "1080p";

export const AVATAR_ENGINE_PREFS = ["best", "avatar_iv"] as const;
/** `best` = Avatar V, gdy look go obsługuje; `avatar_iv` = zawsze domyślny silnik HeyGena. */
export type AvatarEnginePref = (typeof AVATAR_ENGINE_PREFS)[number];
export const DEFAULT_AVATAR_ENGINE: AvatarEnginePref = "best";

export const LANDSCAPE_POLICIES = ["block", "allow"] as const;
/** `block` = rolka ze scenami nie rusza z poziomym lookiem; `allow` = rusza (z pasami). */
export type LandscapePolicy = (typeof LANDSCAPE_POLICIES)[number];
export const DEFAULT_LANDSCAPE_POLICY: LandscapePolicy = "block";

export type StudioQualitySettings = {
  resolution: VideoResolution;
  avatarEngine: AvatarEnginePref;
  landscapePolicy: LandscapePolicy;
};

export const DEFAULT_QUALITY_SETTINGS: StudioQualitySettings = {
  resolution: DEFAULT_VIDEO_RESOLUTION,
  avatarEngine: DEFAULT_AVATAR_ENGINE,
  landscapePolicy: DEFAULT_LANDSCAPE_POLICY,
};

const oneOfOr = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.find((x) => x === v) ?? fallback;

export const parseVideoResolution = (v: unknown) =>
  oneOfOr(VIDEO_RESOLUTIONS, v, DEFAULT_VIDEO_RESOLUTION);
export const parseAvatarEnginePref = (v: unknown) =>
  oneOfOr(AVATAR_ENGINE_PREFS, v, DEFAULT_AVATAR_ENGINE);
export const parseLandscapePolicy = (v: unknown) =>
  oneOfOr(LANDSCAPE_POLICIES, v, DEFAULT_LANDSCAPE_POLICY);

/** Look awatara z HeyGen v3 (`GET /v3/avatars/looks/{id}`) — tylko to, czego potrzebujemy. */
export type AvatarLook = {
  id: string;
  name: string | null;
  avatarType: string | null;
  width: number | null;
  height: number | null;
  preferredOrientation: string | null;
  engines: string[];
  previewImageUrl: string | null;
};

export type Orientation = "portrait" | "landscape" | "square" | "unknown";

/**
 * Orientacja looka: najpierw natywne piksele (to one decydują o pasach),
 * a gdy ich brak — `preferred_orientation` z HeyGena.
 */
export function lookOrientation(
  look: Pick<AvatarLook, "width" | "height" | "preferredOrientation"> | null,
): Orientation {
  if (!look) return "unknown";
  const { width, height } = look;
  if (width && height && width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio < 0.9) return "portrait";
    if (ratio > 1.1) return "landscape";
    return "square";
  }
  const p = (look.preferredOrientation ?? "").toLowerCase();
  return p === "portrait" || p === "landscape" || p === "square" ? p : "unknown";
}

/** Silnik dla looka: Avatar V przy `best`, gdy look go obsługuje; inaczej domyślny HeyGena (IV). */
export function pickAvatarEngine(
  look: Pick<AvatarLook, "engines"> | null,
  pref: AvatarEnginePref,
): "avatar_v" | null {
  if (pref !== "best" || !look) return null;
  return look.engines.includes("avatar_v") ? "avatar_v" : null;
}

export type AvatarQuality = {
  id: string;
  name: string | null;
  orientation: Orientation;
  width: number | null;
  height: number | null;
  /** Silnik, którym pójdzie render (null = domyślny HeyGena, Avatar IV). */
  engine: "avatar_v" | null;
  supported_engines: string[];
  /**
   * Czy w rolce 9:16 ze scenami (b-roll) ten awatar da pasy u góry i u dołu.
   * null = nie wiadomo (HeyGen nie oddał looka) — nie blokujemy.
   */
  letterbox_in_reel: boolean | null;
  verdict: string;
};

export function assessAvatar(
  id: string,
  look: AvatarLook | null,
  pref: AvatarEnginePref,
): AvatarQuality {
  const orientation = lookOrientation(look);
  const letterbox = orientation === "unknown" ? null : orientation !== "portrait";
  const dims = look?.width && look?.height ? ` ${look.width}×${look.height}` : "";
  const verdict =
    orientation === "portrait"
      ? `pionowy${dims} — wypełnia kadr 9:16`
      : orientation === "landscape"
        ? `POZIOMY${dims} — w rolce ze scenami da pasy u góry i u dołu`
        : orientation === "square"
          ? `kwadratowy${dims} — w rolce ze scenami da (mniejsze) pasy`
          : "orientacja nieznana (HeyGen nie oddał looka) — sprawdź podgląd";
  return {
    id,
    name: look?.name ?? null,
    orientation,
    width: look?.width ?? null,
    height: look?.height ?? null,
    engine: pickAvatarEngine(look, pref),
    supported_engines: look?.engines ?? [],
    letterbox_in_reel: letterbox,
    verdict,
  };
}

/** Awatary, które w sklejce scen dadzą pasy (orientacja znana i nie pionowa). */
export function letterboxedAvatars(list: AvatarQuality[]): AvatarQuality[] {
  return list.filter((a) => a.letterbox_in_reel === true);
}

export function letterboxBlockMessage(bad: AvatarQuality[]): string {
  const names = bad.map((a) => `${a.name ?? a.id} (${a.verdict})`).join("; ");
  return (
    `Render wstrzymany przed zużyciem kredytów: ${names}. HeyGen w rolce ze scenami nie przycina ` +
    `awatara, tylko wpasowuje go w kadr 9:16 — poziomy look dałby pasy. Wybierz pionowe looki ` +
    `(MCP: \`check_studio_avatars\` pokazuje orientację i pionowe zamienniki), albo świadomie ` +
    `dopuść pasy: \`allow_letterbox=true\` w zadaniu lub \`update_studio_settings\` → ` +
    `\`landscape_avatars=allow\`.`
  );
}

/**
 * Metryka renderu zapisywana przy zadaniu (`studio_video_jobs.render_meta`) —
 * czarno na białym, czym i jak powstała rolka.
 */
export type RenderMeta = {
  version: 1;
  rendered_at: string;
  /** Kto składał obraz: HeyGen (sklejka scen v3 albo pojedyncze ujęcie v3). Remotion nie bierze udziału. */
  compositor: "heygen_studio_v3" | "heygen_avatar_v3";
  remotion: false;
  tts: { provider: "elevenlabs"; model: string };
  heygen: {
    video_type: "studio" | "avatar";
    aspect_ratio: "9:16";
    resolution: VideoResolution;
    /** Pojedyncze ujęcie: `cover` (wypełnia kadr). Sklejka scen: HeyGen wpasowuje (`contain`). */
    fit: "cover" | "contain";
    engine_fallback: string | null;
  };
  avatars: AvatarQuality[];
  broll_scenes: number;
  settings: StudioQualitySettings;
  allow_letterbox: boolean;
  warnings: string[];
};

/**
 * Czy zadanie świadomie dopuściło pasy: zgoda zapisana przy zakładaniu
 * (`render_meta.requested.allow_letterbox`) albo w metryce poprzedniego renderu.
 */
export function jobAllowsLetterbox(renderMeta: unknown): boolean {
  if (!renderMeta || typeof renderMeta !== "object") return false;
  const m = renderMeta as { requested?: { allow_letterbox?: unknown }; allow_letterbox?: unknown };
  return m.requested?.allow_letterbox === true || m.allow_letterbox === true;
}
