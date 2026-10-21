// Bank klipów hooka (`clip_bank`) — I/O: dobór klipu z tabeli
// `studio_hook_clips`, odnotowanie użycia i import (kopia pliku do naszego
// Storage — adresy fal.media wygasają). Czyste reguły: studio-hook-clips.ts.
//
// Każdy klip kończy się nieruchomą klatką ściany z logo financeyou.pl — tym
// samym tłem co pionowe awatary e0db… i 65ef… — więc gra w całości i tnie
// się na twardo do awatara (styl `clip` w Hook.tsx).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Track } from "./autopilot/types";
import {
  mp4DurationSeconds,
  rankHookClips,
  sanitizeHookClipItem,
  type HookClip,
  type HookClipTrack,
} from "./studio-hook-clips";

/** Limit pliku klipu przy imporcie. */
export const HOOK_CLIP_MAX_BYTES = 60 * 1024 * 1024;
const STORAGE_PREFIX = "studio-hook-clips";

const db = () => supabaseAdmin as unknown as { from: (t: string) => any };

export type HookClipRow = HookClip & {
  concept: string | null;
  title: string | null;
  model: string | null;
  storage_path: string | null;
  source_url: string | null;
  tags: string[];
  created_at: string;
};

const COLUMNS =
  "id, slug, concept, title, track, model, rating, media_url, storage_path, source_url, duration_s, tags, active, use_count, last_used_at, created_at";

const normalize = (r: Record<string, unknown>): HookClipRow =>
  ({
    ...r,
    rating: Number(r.rating ?? 3),
    use_count: Number(r.use_count ?? 0),
    duration_s: r.duration_s == null ? null : Number(r.duration_s),
    tags: Array.isArray(r.tags) ? r.tags : [],
    active: r.active !== false,
  }) as HookClipRow;

/** Lista klipów (panel / MCP). */
export async function listHookClips(
  opts: { track?: HookClipTrack | null; active?: boolean | null; limit?: number } = {},
): Promise<HookClipRow[]> {
  let q = db().from("studio_hook_clips").select(COLUMNS);
  if (opts.track) q = q.eq("track", opts.track);
  if (opts.active != null) q = q.eq("active", opts.active);
  const { data, error } = await q
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(opts.limit ?? 200, 1), 1000));
  if (error) throw new Error(`studio_hook_clips: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/**
 * Klip dla toru rolki: aktywne klipy toru albo `both` (null = dowolny), wyżej
 * oceniane z rotacją „najdawniej użyte” (rankHookClips). Null = bank pusty.
 */
export async function pickHookClip(track: Track | null): Promise<HookClipRow | null> {
  let q = db().from("studio_hook_clips").select(COLUMNS).eq("active", true);
  if (track) q = q.in("track", [track, "both"]);
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(`studio_hook_clips: ${error.message}`);
  const rows = ((data ?? []) as Record<string, unknown>[]).map(normalize);
  return (rankHookClips(rows, track)[0] as HookClipRow | undefined) ?? null;
}

/** Odnotowuje użycie — napędza rotację przy kolejnych rolkach. */
export async function markHookClipUsed(id: string): Promise<void> {
  const { data } = await db()
    .from("studio_hook_clips")
    .select("id, use_count")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  const { error } = await db()
    .from("studio_hook_clips")
    .update({ use_count: Number(data.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`studio_hook_clips: ${error.message}`);
}

export async function setHookClipActive(id: string, active: boolean): Promise<HookClipRow | null> {
  const { data, error } = await db()
    .from("studio_hook_clips")
    .update({ active })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`studio_hook_clips: ${error.message}`);
  return data ? normalize(data) : null;
}

export type ImportHookClipResult = {
  slug: string;
  status: "imported" | "updated" | "skipped";
  clip: HookClipRow;
};

/**
 * Import jednego klipu: pobiera mp4 (≤ 60 MB, video/*), kopiuje do publicznego
 * bucketu `studio-media` (prefiks `studio-hook-clips`) i zapisuje wpis po
 * slugu. Ponowny import istniejącego sluga z plikiem w Storage aktualizuje
 * tylko metadane (bez pobierania) — chyba że `force`.
 */
export async function importHookClip(
  raw: unknown,
  opts: { force?: boolean } = {},
): Promise<ImportHookClipResult> {
  const item = sanitizeHookClipItem(raw);
  const { data: existing } = await db()
    .from("studio_hook_clips")
    .select(COLUMNS)
    .eq("slug", item.slug)
    .maybeSingle();
  const meta = {
    slug: item.slug,
    concept: item.concept,
    title: item.title,
    track: item.track,
    model: item.model,
    rating: item.rating,
    tags: item.tags,
    source_url: item.source_url,
  };

  if (existing?.media_url && !opts.force) {
    const { data, error } = await db()
      .from("studio_hook_clips")
      .update(meta)
      .eq("id", existing.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`studio_hook_clips: ${error.message}`);
    return {
      slug: item.slug,
      status: "skipped",
      clip: normalize(data ?? { ...existing, ...meta }),
    };
  }

  const { fetchBytes, storeMedia } = await import("./media-storage.server");
  const { bytes, contentType } = await fetchBytes(item.source_url, HOOK_CLIP_MAX_BYTES);
  let mime = contentType.split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("video/")) {
    // fal.media bywa z application/octet-stream — rozstrzyga rozszerzenie pliku.
    if (/\.mp4(?:$|\?)/i.test(item.source_url)) mime = "video/mp4";
    else throw new Error(`${item.slug}: to nie jest film (${contentType || "nieznany typ"}).`);
  }
  const buf = new Uint8Array(bytes);
  if (!buf.byteLength) throw new Error(`${item.slug}: pusty plik.`);
  const stored = await storeMedia(buf, {
    contentType: mime,
    visibility: "public",
    prefix: STORAGE_PREFIX,
    name: item.slug,
  });
  const media = {
    media_url: stored.url,
    storage_path: stored.path,
    duration_s: mp4DurationSeconds(buf),
  };

  if (existing) {
    const { data, error } = await db()
      .from("studio_hook_clips")
      .update({ ...meta, ...media })
      .eq("id", existing.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`studio_hook_clips: ${error.message}`);
    // Stary plik zbędny — sprzątanie nie może wywrócić importu.
    if (existing.storage_path && existing.storage_path !== stored.path) {
      await supabaseAdmin.storage
        .from(stored.bucket)
        .remove([existing.storage_path])
        .catch(() => {});
    }
    return {
      slug: item.slug,
      status: "updated",
      clip: normalize(data ?? { ...existing, ...meta, ...media }),
    };
  }
  const { data, error } = await db()
    .from("studio_hook_clips")
    .insert({ ...meta, ...media })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`studio_hook_clips: ${error.message}`);
  return { slug: item.slug, status: "imported", clip: normalize(data) };
}
