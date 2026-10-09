// Silnik wykończenia rolki Studia — czym kładziemy na czysty master HeyGena
// napisy, znaczek „AI" i nakładki dynamiczne. Zapis w
// `studio_video_jobs.render_engine`:
//   * `auto` (domyślne z bazy) — ustawienie środowiska `STUDIO_RENDER_ENGINE`,
//     a bez niego caption-burner;
//   * `caption_burner` — usługa FFmpeg (services/caption-burner, plik ASS);
//   * `remotion` — kompozycja `StudioReel` na AWS Lambda (services/remotion).
// Inne wartości w starych wierszach (np. `avatar_iv`) traktujemy jak `auto`.
// HeyGen i ElevenLabs działają tak samo przy obu silnikach — silnik dotyczy
// tylko etapu po renderze.

export const RENDER_ENGINES = ["auto", "caption_burner", "remotion"] as const;
export type RenderEngine = (typeof RENDER_ENGINES)[number];
export type ResolvedRenderEngine = Exclude<RenderEngine, "auto">;

export function parseRenderEngine(v: unknown): RenderEngine {
  return RENDER_ENGINES.find((e) => e === v) ?? "auto";
}

/** `auto` → ustawienie środowiska (`STUDIO_RENDER_ENGINE`), domyślnie caption-burner. */
export function resolveRenderEngine(
  v: unknown,
  envDefault: string | undefined = typeof process !== "undefined"
    ? process.env.STUDIO_RENDER_ENGINE
    : undefined,
): ResolvedRenderEngine {
  const engine = parseRenderEngine(v);
  if (engine !== "auto") return engine;
  return parseRenderEngine(envDefault?.trim()) === "remotion" ? "remotion" : "caption_burner";
}

export const RENDER_ENGINE_LABELS: Record<RenderEngine, string> = {
  auto: "Automatycznie (ustawienie Studia)",
  caption_burner: "caption-burner (FFmpeg)",
  remotion: "Remotion (AWS Lambda)",
};

/** Id zadania wykończenia w `caption_burn_id` — Remotion ma prefiks z bucketem. */
const REMOTION_ID_PREFIX = "remotion:";

export function remotionJobId(bucketName: string, renderId: string): string {
  return `${REMOTION_ID_PREFIX}${bucketName}:${renderId}`;
}

export function parseRemotionJobId(id: string): { bucketName: string; renderId: string } | null {
  if (!id.startsWith(REMOTION_ID_PREFIX)) return null;
  const rest = id.slice(REMOTION_ID_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { bucketName: rest.slice(0, sep), renderId: rest.slice(sep + 1) };
}
