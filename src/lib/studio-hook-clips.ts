// Bank klipów hooka (`clip_bank`) — czyste reguły doboru i walidacji, bez I/O.
//
// Klipy to gotowe ujęcia 9:16 (~5 s, mp4): mocne otwarcie, a OSTATNIA klatka
// to nieruchoma biała ściana biura z logo 3D financeyou.pl — to samo tło, na
// którym stoją pionowe awatary HeyGen e0db8779828f484a8311fd427e815abe
// i 65ef986081bc48ed890c742cfa73d42e. Dlatego klip gra w całości (bez
// najazdu, wstrząsu, błysku i wygaszenia) i tnie się na twardo do awatara.
// I/O (Storage, tabela `studio_hook_clips`): studio-hook-clips.server.ts.

import type { Track } from "./autopilot/types";

export const HOOK_CLIP_TRACKS = ["pozyczkobiorca", "inwestor", "both"] as const;
export type HookClipTrack = (typeof HOOK_CLIP_TRACKS)[number];

/** Awatary stojące przed tą samą ścianą z logo, na której kończą się klipy. */
export const HOOK_CLIP_AVATAR_IDS = [
  "e0db8779828f484a8311fd427e815abe",
  "65ef986081bc48ed890c742cfa73d42e",
] as const;

/** Długość klipu, gdy nie znamy jej z pliku (s). */
export const HOOK_CLIP_DEFAULT_SECONDS = 5;

export type HookClip = {
  id: string;
  slug: string;
  track: HookClipTrack;
  rating: number;
  media_url: string;
  duration_s: number | null;
  active: boolean;
  use_count: number;
  last_used_at: string | null;
  concept?: string | null;
  title?: string | null;
};

/**
 * Kolejność doboru klipu dla toru (null = dowolny klip). Pula = klipy z
 * najwyższą oceną i jedną niżej (słabsze tylko, gdy lepszych brak); w puli
 * rotacja: najpierw nigdy nieużyte, potem najdawniej użyte; remis → wyższa
 * ocena, potem slug (deterministycznie).
 */
export function rankHookClips(clips: HookClip[], track: Track | null): HookClip[] {
  const matching = clips.filter(
    (c) => c.active && c.media_url && (!track || c.track === track || c.track === "both"),
  );
  if (!matching.length) return [];
  const top = Math.max(...matching.map((c) => c.rating));
  const pool = matching.filter((c) => c.rating >= top - 1);
  // Nieużyte (-1) przed każdym użytym.
  const usedAt = (c: HookClip) => (c.last_used_at ? Date.parse(c.last_used_at) || 0 : -1);
  return [...pool].sort(
    (a, b) =>
      usedAt(a) - usedAt(b) ||
      b.rating - a.rating ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}

export type HookClipImportItem = {
  slug: string;
  concept: string | null;
  title: string | null;
  track: HookClipTrack;
  model: string | null;
  rating: number;
  tags: string[];
  source_url: string;
};

const s = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Walidacja pozycji importu; błąd po polsku (trafia do wyniku narzędzia). */
export function sanitizeHookClipItem(raw: unknown): HookClipImportItem {
  if (!raw || typeof raw !== "object") throw new Error("Pozycja importu musi być obiektem.");
  const o = raw as Record<string, unknown>;
  const slug = s(o.slug, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    throw new Error(`Nieprawidłowy slug „${slug}” (małe litery, cyfry, _ i -).`);
  }
  const track = HOOK_CLIP_TRACKS.find((t) => t === o.track);
  if (!track) throw new Error(`${slug}: tor musi być pozyczkobiorca | inwestor | both.`);
  const source_url = s(o.source_url, 2000);
  if (!/^https:\/\//i.test(source_url)) throw new Error(`${slug}: source_url musi być https.`);
  const r = Number(o.rating ?? 3);
  const rating = Number.isFinite(r) ? Math.min(5, Math.max(1, Math.round(r))) : 3;
  const tags = Array.isArray(o.tags)
    ? [...new Set(o.tags.map((t) => s(t, 40).toLowerCase()).filter(Boolean))].slice(0, 24)
    : [];
  return {
    slug,
    concept: s(o.concept, 80) || null,
    title: s(o.title, 160) || null,
    track,
    model: s(o.model, 40) || null,
    rating,
    tags,
    source_url,
  };
}

const u32 = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/**
 * Długość filmu MP4 (s) z nagłówka `mvhd` (timescale + duration). Null, gdy
 * nagłówka nie ma albo jest nieczytelny — wtedy plan przyjmuje 5 s.
 */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  for (let i = 4; i + 36 <= bytes.length; i++) {
    // „mvhd”
    if (
      bytes[i] !== 0x6d ||
      bytes[i + 1] !== 0x76 ||
      bytes[i + 2] !== 0x68 ||
      bytes[i + 3] !== 0x64
    )
      continue;
    const version = bytes[i + 4];
    let timescale: number;
    let duration: number;
    if (version === 1) {
      timescale = u32(bytes, i + 4 + 4 + 16);
      duration = u32(bytes, i + 4 + 4 + 20) * 2 ** 32 + u32(bytes, i + 4 + 4 + 24);
    } else {
      timescale = u32(bytes, i + 4 + 4 + 8);
      duration = u32(bytes, i + 4 + 4 + 12);
    }
    if (!timescale || !duration) return null;
    const secs = duration / timescale;
    return secs > 0 && secs < 600 ? Math.round(secs * 1000) / 1000 : null;
  }
  return null;
}
