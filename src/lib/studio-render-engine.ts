// Silnik wykończenia rolki Studia — czym kładziemy na czysty master HeyGena
// napisy, znaczek „AI" i nakładki dynamiczne. Zapis w
// `studio_video_jobs.render_engine`:
//   * `auto` (domyślne z bazy) — ustawienie środowiska `STUDIO_RENDER_ENGINE`,
//     a bez niego Remotion (gdy skonfigurowany — hook wizualny), inaczej
//     caption-burner;
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

/** Czy w środowisku są sekrety Remotion Lambda (bez importu klienta). */
export function remotionEnvPresent(
  env: Record<string, string | undefined> | undefined = typeof process !== "undefined"
    ? process.env
    : undefined,
): boolean {
  if (!env) return false;
  return [
    "REMOTION_AWS_ACCESS_KEY_ID",
    "REMOTION_AWS_SECRET_ACCESS_KEY",
    "REMOTION_FUNCTION_NAME",
    "REMOTION_SERVE_URL",
  ].every((k) => Boolean((env[k] ?? "").trim()));
}

/**
 * `auto` → `STUDIO_RENDER_ENGINE`, gdy ustawione; bez niego Remotion, jeśli
 * jest skonfigurowany (tylko on rysuje hook wizualny i kadruje poziome
 * awatary), a w ostateczności caption-burner.
 */
export function resolveRenderEngine(
  v: unknown,
  envDefault: string | undefined = typeof process !== "undefined"
    ? process.env.STUDIO_RENDER_ENGINE
    : undefined,
  remotionConfigured: boolean = remotionEnvPresent(),
): ResolvedRenderEngine {
  const engine = parseRenderEngine(v);
  if (engine !== "auto") return engine;
  const fromEnv = envDefault?.trim();
  if (fromEnv) return parseRenderEngine(fromEnv) === "remotion" ? "remotion" : "caption_burner";
  return remotionConfigured ? "remotion" : "caption_burner";
}

export const RENDER_ENGINE_LABELS: Record<RenderEngine, string> = {
  auto: "Automatycznie (ustawienie Studia; bez niego Remotion, gdy skonfigurowany)",
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
