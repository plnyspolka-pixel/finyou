// Rozkładanie podobnych tematów w czasie — czysty moduł (bez sieci i bazy).
//
// Po audycie profili (10.2026): ten sam temat wychodził na jednym profilu
// kilka razy w ciągu doby (np. rolka z Studia + ręczny post o tym samym),
// co wygląda na spam i dzieli zasięg między dwa materiały. Zanim wpis
// trafi do kolejki, sprawdzamy, czy na tym samym kanale w oknie ±20 h nie
// ma już (zaplanowanego albo opublikowanego) materiału o podobnym tytule —
// jeśli jest, przesuwamy termin o kolejne doby (maks. 7).
//
// Podobieństwo: Jaccard na zbiorach tokenów po normalizacji (małe litery,
// bez emoji / hashtagów / interpunkcji, polskie znaki sprowadzone do ASCII,
// bez słów funkcyjnych, prosty „stem" przez obcięcie do 6 znaków — dzięki
// temu „pożyczka", „pożyczki" i „pozyczke" to ten sam token).

import type { StudioPlatform } from "./studio-platforms";

/** Próg podobieństwa, od którego dwa tytuły uznajemy za ten sam temat. */
export const SIMILARITY_THRESHOLD = 0.5;
/** Okno konfliktu wokół terminu (godziny w każdą stronę). */
export const CONFLICT_WINDOW_H = 20;
/** Krok przesunięcia i maksymalna liczba kroków. */
export const SHIFT_STEP_H = 24;
export const MAX_SHIFT_STEPS = 7;

const HOUR_MS = 3_600_000;
const STEM_LEN = 6;

const PL_FOLD: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

// Słowa funkcyjne — nie niosą tematu, a zawyżają podobieństwo krótkich tytułów.
const STOPWORDS = new Set([
  "a",
  "aby",
  "albo",
  "ale",
  "bez",
  "by",
  "byc",
  "co",
  "czy",
  "dla",
  "do",
  "go",
  "i",
  "ich",
  "ile",
  "im",
  "ja",
  "jak",
  "jaki",
  "jaka",
  "jakie",
  "jest",
  "juz",
  "ktory",
  "ktora",
  "ktore",
  "lub",
  "ma",
  "mi",
  "na",
  "nad",
  "nie",
  "o",
  "od",
  "po",
  "pod",
  "przez",
  "przy",
  "sie",
  "sa",
  "ta",
  "tak",
  "te",
  "ten",
  "to",
  "tu",
  "w",
  "we",
  "z",
  "za",
  "ze",
  "czym",
  "twoj",
  "twoja",
  "twoje",
  "ty",
  "my",
  "wy",
  "oraz",
  "shorts",
]);

/**
 * Tokeny tematu: małe litery, bez emoji, hashtagów, URL-i i interpunkcji,
 * polskie znaki → ASCII, bez słów funkcyjnych, obcięte do 6 znaków.
 */
export function topicTokens(text: string | null | undefined): Set<string> {
  const normalized = (text ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[ąćęłńóśźż]/gu, (ch) => PL_FOLD[ch] ?? ch)
    // Wszystko poza literami i cyframi (emoji, interpunkcja) → spacja.
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  const out = new Set<string>();
  for (const word of normalized.split(" ")) {
    if (!word || STOPWORDS.has(word)) continue;
    // Pojedyncze litery i cyfry to szum (np. „5 błędów" vs „3 błędy").
    if (word.length < 2) continue;
    out.add(word.slice(0, STEM_LEN));
  }
  return out;
}

/** Podobieństwo tematów (Jaccard tokenów), 0…1. Dwa puste teksty → 0. */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined) {
  const ta = topicTokens(a);
  const tb = topicTokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / (ta.size + tb.size - common);
}

/**
 * Tekst „tematu" wpisu: tytuł, a gdy go nie ma (post FB, X) — pierwsza
 * linia treści, przycięta do 140 znaków.
 */
export function topicText(title: string | null | undefined, message?: string | null): string {
  const t = (title ?? "").trim();
  if (t) return t;
  const firstLine =
    (message ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return firstLine.slice(0, 140);
}

/**
 * Kanał, w obrębie którego pilnujemy rozstawu: post i rolka FB lądują na tej
 * samej stronie, więc to jeden kanał; reszta platform — każda osobno.
 */
export function publicationChannel(platform: StudioPlatform | string): string {
  return platform === "facebook_post" || platform === "facebook_reels" ? "facebook" : platform;
}

export type ScheduledNeighbour = {
  id?: string;
  title: string;
  /** Kiedy materiał wyszedł (published) albo ma wyjść (pending). */
  at: string | Date;
};

export type SpreadResult = {
  scheduledAt: Date;
  /** O ile dób przesunięto termin (0 = bez zmian). */
  shiftedDays: number;
  /** Najbardziej podobny wpis, który wymusił pierwsze przesunięcie. */
  conflict: { id?: string; title: string; similarity: number } | null;
  /** Wyczerpano limit przesunięć, a konflikt nadal jest. */
  exhausted: boolean;
};

function conflictsAt(
  slot: number,
  topic: string,
  neighbours: ScheduledNeighbour[],
): { id?: string; title: string; similarity: number } | null {
  let best: { id?: string; title: string; similarity: number } | null = null;
  for (const n of neighbours) {
    const at = new Date(n.at).getTime();
    if (!Number.isFinite(at)) continue;
    if (Math.abs(at - slot) > CONFLICT_WINDOW_H * HOUR_MS) continue;
    const similarity = titleSimilarity(topic, n.title);
    if (similarity < SIMILARITY_THRESHOLD) continue;
    if (!best || similarity > best.similarity) best = { id: n.id, title: n.title, similarity };
  }
  return best;
}

/**
 * Termin publikacji z rozstawem tematów: gdy w oknie ±20 h od terminu jest
 * już wpis o podobnym tytule (≥ 0,5), przesuwa termin o +24 h — aż do
 * wolnego slotu, maksymalnie o 7 dób. Po wyczerpaniu kroków zwraca termin
 * +7 dób z `exhausted: true` (lepiej późno niż dwa razy tego samego dnia).
 */
export function spreadScheduledAt(
  target: string | Date,
  topic: string,
  neighbours: ScheduledNeighbour[],
): SpreadResult {
  const base = new Date(target).getTime();
  const first = conflictsAt(base, topic, neighbours);
  if (!first) {
    return { scheduledAt: new Date(base), shiftedDays: 0, conflict: null, exhausted: false };
  }
  for (let step = 1; step <= MAX_SHIFT_STEPS; step++) {
    const slot = base + step * SHIFT_STEP_H * HOUR_MS;
    if (!conflictsAt(slot, topic, neighbours)) {
      return { scheduledAt: new Date(slot), shiftedDays: step, conflict: first, exhausted: false };
    }
  }
  return {
    scheduledAt: new Date(base + MAX_SHIFT_STEPS * SHIFT_STEP_H * HOUR_MS),
    shiftedDays: MAX_SHIFT_STEPS,
    conflict: first,
    exhausted: true,
  };
}

/** Okno, z którego trzeba pobrać sąsiadów, żeby sprawdzić wszystkie kroki. */
export function neighbourWindow(target: string | Date): { from: Date; to: Date } {
  const base = new Date(target).getTime();
  return {
    from: new Date(base - CONFLICT_WINDOW_H * HOUR_MS),
    to: new Date(base + (MAX_SHIFT_STEPS * SHIFT_STEP_H + CONFLICT_WINDOW_H) * HOUR_MS),
  };
}

/** Notka do `guardrail_notes` o przesunięciu terminu. */
export function describeShift(platform: string, r: SpreadResult): string | null {
  if (!r.shiftedDays || !r.conflict) return null;
  const pct = Math.round(r.conflict.similarity * 100);
  const when = r.scheduledAt.toISOString().slice(0, 16).replace("T", " ");
  return (
    `[${platform}] Termin przesunięty o ${r.shiftedDays} d. (na ${when} UTC) — ` +
    `podobny temat „${r.conflict.title.slice(0, 80)}” (${pct}% podobieństwa) ` +
    `jest już w oknie ±${CONFLICT_WINDOW_H} h.` +
    (r.exhausted ? " Limit 7 dób wyczerpany — sprawdź kolejkę ręcznie." : "")
  );
}
