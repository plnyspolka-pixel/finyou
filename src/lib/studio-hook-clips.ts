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
  /** Co klip znaczy (po polsku) — po tym i po tagach dobieramy go do treści rolki. */
  description?: string | null;
  tags?: string[] | null;
};

// ── Dobór do TREŚCI rolki (nie losowanie, nie rotacja) ──────────────────────
//
// Kandydaci: aktywne klipy toru rolki albo `both`. Klipy jednego konceptu
// (ta sama metafora z różnych modeli wideo) zwijamy do jednej pozycji —
// dopasowanie wybiera KONCEPT (AI albo słowa kluczowe), a w koncepcie bierzemy
// najwyżej oceniony klip; najdawniej użyty rozstrzyga tylko remis ocen (żeby
// ten sam koncept przy kolejnej rolce mógł przyjść z innego modelu). Brak
// dopasowania = brak klipu (zejście na grafikę Studia), nigdy losowy klip.

/** Minimalny wynik dopasowania AI (0–100), żeby klip wszedł do rolki. */
export const HOOK_CLIP_AI_MIN_SCORE = 55;
/** Minimalny wynik dopasowania po słowach kluczowych (bez AI). */
export const HOOK_CLIP_KEYWORD_MIN_SCORE = 5;

export type HookClipConcept = {
  /** Klucz konceptu (`concept`, a bez niego slug klipu). */
  concept: string;
  title: string;
  description: string;
  tags: string[];
  /** Klipy konceptu od najlepszego: ocena malejąco, remis → najdawniej użyty, slug. */
  clips: HookClip[];
};

const usedAt = (c: HookClip) => (c.last_used_at ? Date.parse(c.last_used_at) || 0 : -1);
const bySlug = (a: HookClip, b: HookClip) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** Klip konceptu do rolki: najwyższa ocena; najdawniej użyty tylko przy remisie ocen. */
export const compareClipsInConcept = (a: HookClip, b: HookClip) =>
  b.rating - a.rating || usedAt(a) - usedAt(b) || bySlug(a, b);

/** Aktywne klipy toru (albo `both`; null = dowolny) zwinięte do konceptów. */
export function groupHookClipConcepts(clips: HookClip[], track: Track | null): HookClipConcept[] {
  const groups = new Map<string, HookClip[]>();
  for (const c of clips) {
    if (!c.active || !c.media_url) continue;
    if (track && c.track !== track && c.track !== "both") continue;
    const key = (c.concept || c.slug).trim();
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()]
    .map(([concept, list]) => {
      const sorted = [...list].sort(compareClipsInConcept);
      const rep = sorted[0];
      const tags = [...new Set(list.flatMap((c) => c.tags ?? []))];
      return {
        concept,
        title: rep.title ?? concept,
        description: list.find((c) => c.description)?.description ?? "",
        tags,
        clips: sorted,
      };
    })
    .sort((a, b) => (a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0));
}

// ── Słowa kluczowe (zapas bez AI) ────────────────────────────────────────────

const STOPWORDS = new Set(
  "ale albo ani bez bo by byc być ci cie cię co czy dla do go i ich im ja jak jaki jakie jest je jego jej juz już ki ktore które ktory który lub ma mam masz mi mnie moze może my na nad nam nas nasz nawet od on ona one oni po pod przez przy sa są sie się so ta tak tam te tego tej ten to ty tu twoj twój twoje twoja u w we wiec więc wy z za ze że czym tym tez też gdy kiedy oraz"
    .split(" ")
    .map((w) => foldPl(w)),
);

/** Małe litery po polsku i bez znaków diakrytycznych (ł → l). */
export function foldPl(text: string): string {
  return text
    .toLocaleLowerCase("pl-PL")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Prosty rdzeń: słowo ≥ 5 znaków → pierwsze 5 znaków (odmiana: „pieniądze” / „pieniędzy”). */
export const stemPl = (w: string) => (w.length >= 5 ? w.slice(0, 5) : w);

/** Rdzenie słów znaczących (bez krótkich i bez słów funkcyjnych). */
export function keywordStems(text: string): string[] {
  return foldPl(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stemPl);
}

/** Rdzenie pasują: równe albo krótszy (≥ 4 znaki) jest początkiem dłuższego („bank” / „banku”). */
export const stemsMatch = (a: string, b: string) => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
};

/**
 * Wynik dopasowania konceptu do tekstu rolki: tag w całości obecny w tekście
 * (wszystkie jego rdzenie) = 3 pkt za każde słowo tagu (min. 3), do tego
 * 1 pkt za każdy wspólny rdzeń tekstu z tagami / opisem / tytułem.
 */
export function keywordMatchScore(text: string, concept: HookClipConcept): number {
  const textStems = [...new Set(keywordStems(text))];
  const has = (stem: string) => textStems.some((t) => stemsMatch(t, stem));
  let score = 0;
  for (const tag of concept.tags) {
    const stems = keywordStems(tag);
    if (stems.length && stems.every(has)) score += 3 * Math.max(1, stems.length);
  }
  const pool = [
    ...new Set(keywordStems(`${concept.tags.join(" ")} ${concept.description} ${concept.title}`)),
  ];
  for (const t of textStems) if (pool.some((p) => stemsMatch(t, p))) score += 1;
  return score;
}

export type HookClipMatch = {
  concept: HookClipConcept;
  clip: HookClip;
  score: number;
  reason: string;
  method: "ai" | "keywords" | "pinned";
};

/** Najlepszy koncept po słowach kluczowych — tylko powyżej progu, inaczej null. */
export function matchHookClipByKeywords(
  text: string,
  concepts: HookClipConcept[],
  minScore = HOOK_CLIP_KEYWORD_MIN_SCORE,
): HookClipMatch | null {
  let best: { c: HookClipConcept; score: number } | null = null;
  for (const c of concepts) {
    const score = keywordMatchScore(text, c);
    const better =
      !best ||
      score > best.score ||
      (score === best.score && c.clips[0].rating > best.c.clips[0].rating);
    if (better) best = { c, score };
  }
  if (!best || best.score < minScore) return null;
  return {
    concept: best.c,
    clip: best.c.clips[0],
    score: best.score,
    reason: `słowa kluczowe (wynik ${best.score})`,
    method: "keywords",
  };
}

/** Tekst rolki do dopasowania: tekst hooka, temat i początek scenariusza. */
export function hookClipMatchText(input: {
  script?: string | null;
  topic?: string | null;
  hookText?: string | null;
}): string {
  return [input.hookText ?? "", input.topic ?? "", (input.script ?? "").slice(0, 600)]
    .filter(Boolean)
    .join("\n");
}

/** Lista konceptów dla AI: „N. [koncept] tytuł — opis (tagi: …)”. */
export function hookClipConceptList(concepts: HookClipConcept[]): string {
  return concepts
    .map(
      (c, i) =>
        `${i + 1}. [${c.concept}] ${c.title} — ${c.description || "(bez opisu)"}${
          c.tags.length ? ` (tagi: ${c.tags.join(", ")})` : ""
        }`,
    )
    .join("\n");
}

/**
 * Odpowiedź AI {concept, score, reason} → dopasowanie albo null (nieznany
 * koncept, brak wyniku, wynik poniżej progu). `concept` może być kluczem
 * konceptu albo numerem z listy.
 */
export function acceptAiClipMatch(
  raw: unknown,
  concepts: HookClipConcept[],
  minScore = HOOK_CLIP_AI_MIN_SCORE,
): HookClipMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const score = Number(o.score);
  if (!Number.isFinite(score) || score < minScore) return null;
  const key = typeof o.concept === "string" ? o.concept.trim().replace(/^\[|\]$/g, "") : "";
  const n = typeof o.concept === "number" ? o.concept : /^\d+$/.test(key) ? Number(key) : NaN;
  const concept =
    concepts.find((c) => c.concept === key) ??
    (Number.isInteger(n) && n >= 1 && n <= concepts.length ? concepts[n - 1] : undefined);
  if (!concept) return null;
  const reason = typeof o.reason === "string" ? o.reason.replace(/\s+/g, " ").trim() : "";
  return {
    concept,
    clip: concept.clips[0],
    score: Math.min(100, Math.round(score)),
    reason: `AI ${Math.min(100, Math.round(score))}/100: ${reason.slice(0, 200) || "dopasowanie"}`,
    method: "ai",
  };
}

export type HookClipImportItem = {
  slug: string;
  concept: string | null;
  title: string | null;
  track: HookClipTrack;
  model: string | null;
  rating: number;
  tags: string[];
  description: string | null;
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
    ? [...new Set(o.tags.map((t) => s(t, 60).toLocaleLowerCase("pl-PL")).filter(Boolean))].slice(
        0,
        24,
      )
    : [];
  return {
    slug,
    concept: s(o.concept, 80) || null,
    title: s(o.title, 160) || null,
    track,
    model: s(o.model, 40) || null,
    rating,
    tags,
    description: s(o.description, 500) || null,
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
