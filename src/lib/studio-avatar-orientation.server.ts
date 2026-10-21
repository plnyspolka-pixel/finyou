// Orientacja zdjęć awatarów HeyGen (pion / poziom / kwadrat) — cache w
// `studio_avatar_orientations`. Wymiary bierzemy z nagłówka podglądu
// awatara (katalog HeyGen albo zapis panelu). Używają jej: wybór
// prowadzącego (poziomy nie prowadzi rolki), oznaczenia w panelu / MCP
// i kadrowanie ujęć w Remotion (studio-avatar-framing.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  classifyOrientation,
  imageSizeFromBytes,
  type AvatarFrameInfo,
  type AvatarOrientation,
} from "./studio-avatar-framing";

const db = supabaseAdmin as unknown as { from: (t: string) => any };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const DEFAULT_FOCUS = { x: 0.5, y: 0.35 } as const;

type Row = {
  avatar_id: string;
  orientation: AvatarOrientation;
  width: number | null;
  height: number | null;
  focus_x: number | string | null;
  focus_y: number | string | null;
};

function toInfo(r: Row): AvatarFrameInfo | undefined {
  if (!r.width || !r.height) return undefined;
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : d;
  };
  return {
    orientation: r.orientation,
    width: r.width,
    height: r.height,
    focusX: num(r.focus_x, DEFAULT_FOCUS.x),
    focusY: num(r.focus_y, DEFAULT_FOCUS.y),
  };
}

export async function loadAvatarOrientations(ids: string[]): Promise<Map<string, AvatarFrameInfo>> {
  const out = new Map<string, AvatarFrameInfo>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  try {
    const { data } = await db
      .from("studio_avatar_orientations")
      .select("avatar_id, orientation, width, height, focus_x, focus_y")
      .in("avatar_id", unique);
    for (const r of (data ?? []) as Row[]) {
      const info = toInfo(r);
      if (info) out.set(r.avatar_id, info);
    }
  } catch (e) {
    console.warn(`[Studio] orientacje awatarów: ${errMsg(e)}`);
  }
  return out;
}

/** Wykrywa orientację z podglądu (nagłówek obrazu) i zapisuje w cache. */
export async function detectAvatarOrientation(
  avatarId: string,
  previewUrl: string,
  source = "preview",
): Promise<AvatarFrameInfo | null> {
  const { fetchBytes } = await import("./media-storage.server");
  const file = await fetchBytes(previewUrl, 15 * 1024 * 1024);
  const size = imageSizeFromBytes(file.bytes);
  if (!size?.width || !size.height) return null;
  const orientation = classifyOrientation(size.width, size.height);
  await db.from("studio_avatar_orientations").upsert(
    {
      avatar_id: avatarId,
      orientation,
      width: size.width,
      height: size.height,
      source,
      checked_at: new Date().toISOString(),
    },
    { onConflict: "avatar_id", ignoreDuplicates: false },
  );
  const saved = await loadAvatarOrientations([avatarId]);
  return saved.get(avatarId) ?? null;
}

/**
 * Orientacje dla podanych awatarów: z cache, a brakujące wykrywa z podglądu
 * (panel → katalog HeyGen). Porażka = brak wpisu (awatar traktowany jak pion,
 * rolka nie staje).
 */
export async function ensureAvatarOrientations(
  ids: string[],
): Promise<Map<string, AvatarFrameInfo>> {
  const known = await loadAvatarOrientations(ids);
  const missing = [...new Set(ids.filter((id) => id && !known.has(id)))];
  if (!missing.length) return known;
  const previews = new Map<string, string>();
  try {
    const { data } = await db
      .from("studio_default_avatars")
      .select("avatar_id, preview")
      .in("avatar_id", missing);
    for (const r of (data ?? []) as { avatar_id: string; preview: string | null }[]) {
      if (r.preview) previews.set(r.avatar_id, r.preview);
    }
  } catch {
    // bez zapisu panelu — zostaje katalog
  }
  try {
    const { listHeygenCatalog } = await import("./heygen-catalog.server");
    // Katalog ma świeże (niewygasłe) linki — ma pierwszeństwo przed zapisem panelu.
    for (const item of await listHeygenCatalog()) {
      if (missing.includes(item.id) && item.preview) previews.set(item.id, item.preview);
    }
  } catch (e) {
    console.warn(`[Studio] katalog HeyGen do orientacji: ${errMsg(e)}`);
  }
  for (const id of missing) {
    const url = previews.get(id);
    if (!url) continue;
    try {
      const info = await detectAvatarOrientation(id, url);
      if (info) known.set(id, info);
    } catch (e) {
      console.warn(`[Studio] orientacja awatara ${id}: ${errMsg(e)}`);
    }
  }
  return known;
}

/** Ręczna korekta (MCP): orientacja i/lub punkt kadru. */
export async function setAvatarFraming(input: {
  avatarId: string;
  orientation?: AvatarOrientation;
  width?: number;
  height?: number;
  focusX?: number;
  focusY?: number;
}): Promise<AvatarFrameInfo | null> {
  const current = (await loadAvatarOrientations([input.avatarId])).get(input.avatarId);
  const width = input.width ?? current?.width ?? (input.orientation === "landscape" ? 1920 : 1080);
  const height =
    input.height ?? current?.height ?? (input.orientation === "landscape" ? 1080 : 1920);
  const { error } = await db.from("studio_avatar_orientations").upsert(
    {
      avatar_id: input.avatarId,
      orientation: input.orientation ?? current?.orientation ?? classifyOrientation(width, height),
      width,
      height,
      focus_x: input.focusX ?? current?.focusX ?? DEFAULT_FOCUS.x,
      focus_y: input.focusY ?? current?.focusY ?? DEFAULT_FOCUS.y,
      source: "manual",
      checked_at: new Date().toISOString(),
    },
    { onConflict: "avatar_id", ignoreDuplicates: false },
  );
  if (error) throw new Error(`studio_avatar_orientations: ${error.message}`);
  return (await loadAvatarOrientations([input.avatarId])).get(input.avatarId) ?? null;
}
