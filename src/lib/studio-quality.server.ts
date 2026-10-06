// Studio publikacji — jakość obrazu: looki awatarów z HeyGen v3 (orientacja,
// natywne piksele, obsługiwane silniki) i ustawienia jakości Studia.
// Logika decyzji siedzi w src/lib/studio-quality.ts (czysta, z testami).

import {
  assessAvatar,
  DEFAULT_QUALITY_SETTINGS,
  lookOrientation,
  parseAvatarEnginePref,
  parseLandscapePolicy,
  parseVideoResolution,
  type AvatarLook,
  type AvatarQuality,
  type StudioQualitySettings,
} from "./studio-quality";
import { getStudioSetting, setStudioSetting } from "./studio-settings.server";

const HEYGEN_BASE = "https://api.heygen.com";

export const STUDIO_SETTING_VIDEO_RESOLUTION = "video_resolution";
export const STUDIO_SETTING_AVATAR_ENGINE = "avatar_engine";
export const STUDIO_SETTING_LANDSCAPE_AVATARS = "landscape_avatars";

export async function getStudioQualitySettings(): Promise<StudioQualitySettings> {
  const [resolution, engine, landscape] = await Promise.all([
    getStudioSetting(STUDIO_SETTING_VIDEO_RESOLUTION),
    getStudioSetting(STUDIO_SETTING_AVATAR_ENGINE),
    getStudioSetting(STUDIO_SETTING_LANDSCAPE_AVATARS),
  ]);
  return {
    resolution: parseVideoResolution(resolution ?? DEFAULT_QUALITY_SETTINGS.resolution),
    avatarEngine: parseAvatarEnginePref(engine ?? DEFAULT_QUALITY_SETTINGS.avatarEngine),
    landscapePolicy: parseLandscapePolicy(landscape ?? DEFAULT_QUALITY_SETTINGS.landscapePolicy),
  };
}

export async function setStudioQualitySettings(
  patch: Partial<StudioQualitySettings>,
  updatedBy?: string | null,
): Promise<StudioQualitySettings> {
  if (patch.resolution)
    await setStudioSetting(STUDIO_SETTING_VIDEO_RESOLUTION, patch.resolution, updatedBy);
  if (patch.avatarEngine)
    await setStudioSetting(STUDIO_SETTING_AVATAR_ENGINE, patch.avatarEngine, updatedBy);
  if (patch.landscapePolicy)
    await setStudioSetting(STUDIO_SETTING_LANDSCAPE_AVATARS, patch.landscapePolicy, updatedBy);
  return getStudioQualitySettings();
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

function toLook(raw: Record<string, unknown>, fallbackId: string): AvatarLook {
  return {
    id: str(raw.id) ?? fallbackId,
    name: str(raw.name),
    avatarType: str(raw.avatar_type),
    width: int(raw.image_width),
    height: int(raw.image_height),
    preferredOrientation: str(raw.preferred_orientation),
    engines: Array.isArray(raw.supported_api_engines)
      ? raw.supported_api_engines.filter((e): e is string => typeof e === "string")
      : [],
    previewImageUrl: str(raw.preview_image_url),
  };
}

const lookCache = new Map<string, { at: number; look: AvatarLook | null }>();
const LOOK_TTL_MS = 10 * 60_000;

/**
 * Look z HeyGen v3 (`GET /v3/avatars/looks/{id}`); null = HeyGen go nie zna
 * (np. stary identyfikator v2) albo API nie odpowiada — wtedy orientacja jest
 * nieznana i niczego nie blokujemy.
 */
export async function getHeygenLook(id: string): Promise<AvatarLook | null> {
  const hit = lookCache.get(id);
  if (hit && Date.now() - hit.at < LOOK_TTL_MS) return hit.look;
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return null;
  let look: AvatarLook | null = null;
  try {
    const res = await fetch(`${HEYGEN_BASE}/v3/avatars/looks/${encodeURIComponent(id)}`, {
      headers: { "X-Api-Key": key, Accept: "application/json" },
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
      const data = (json?.data ?? null) as Record<string, unknown> | null;
      // Odpowiedź bywa `{ data: look }` albo `{ data: { look } }`.
      const raw = (data && typeof data.look === "object" ? data.look : data) as Record<
        string,
        unknown
      > | null;
      if (raw) look = toLook(raw, id);
    } else if (res.status !== 404) {
      console.warn(`[Studio] look ${id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null; // bez cache — chwilowy błąd
    }
  } catch (e) {
    console.warn(`[Studio] look ${id}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  lookCache.set(id, { at: Date.now(), look });
  return look;
}

/** Ocena listy awatarów dla rolki 9:16 (kolejność zachowana, bez duplikatów). */
export async function assessAvatars(
  ids: string[],
  settings?: StudioQualitySettings,
): Promise<AvatarQuality[]> {
  const s = settings ?? (await getStudioQualitySettings());
  const unique = [...new Set(ids.filter(Boolean))];
  const looks = await Promise.all(unique.map((id) => getHeygenLook(id)));
  return unique.map((id, i) => assessAvatar(id, looks[i], s.avatarEngine));
}

/**
 * Pionowe looki z konta (własne, a przy `includePublic` też publiczne) —
 * zamienniki dla poziomych awatarów. Lista HeyGena jest stronicowana po 50.
 */
export async function listPortraitLooks(opts: {
  includePublic?: boolean;
  limit?: number;
}): Promise<AvatarLook[]> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return [];
  const out: AvatarLook[] = [];
  const max = opts.limit ?? 20;
  const ownerships = opts.includePublic ? ["private", "public"] : ["private"];
  for (const ownership of ownerships) {
    let token: string | null = null;
    for (let page = 0; page < 6 && out.length < max; page++) {
      const url = new URL(`${HEYGEN_BASE}/v3/avatars/looks`);
      url.searchParams.set("ownership", ownership);
      url.searchParams.set("limit", "50");
      if (token) url.searchParams.set("token", token);
      const res = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" } });
      if (!res.ok) break;
      const json = (await res.json().catch(() => null)) as {
        data?: unknown;
        next_token?: string | null;
        token?: string | null;
      } | null;
      const data = json?.data as Record<string, unknown> | unknown[] | undefined;
      const items = (
        Array.isArray(data)
          ? data
          : Array.isArray((data as Record<string, unknown> | undefined)?.looks)
            ? ((data as Record<string, unknown>).looks as unknown[])
            : []
      ) as Record<string, unknown>[];
      for (const raw of items) {
        const look = toLook(raw, str(raw.id) ?? "");
        if (!look.id) continue;
        lookCache.set(look.id, { at: Date.now(), look });
        if (lookOrientation(look) === "portrait") out.push(look);
        if (out.length >= max) break;
      }
      token =
        json?.next_token ??
        str((data as Record<string, unknown> | undefined)?.next_token) ??
        str((data as Record<string, unknown> | undefined)?.token) ??
        null;
      if (!token || !items.length) break;
    }
  }
  return out.slice(0, max);
}
