// Bank b-rolli — czysta logika doboru materiału (bez I/O, żeby dało się ją
// przetestować bez Supabase). Serwerowa część: src/lib/studio-broll.server.ts.

export type BrollKind = "broll" | "hook";

/** Tyle z materiału wystarczy, żeby ocenić dopasowanie do frazy. */
export type MatchableAsset = { tags: string[]; title: string; source_query: string };

/** Tyle wystarczy, żeby ustawić kolejność rotacji. */
export type RotatableAsset = { last_used_at: string | null; use_count: number };

// ── Słowa kluczowe ───────────────────────────────────────────────────────────

/** Rozbija frazę na słowa-klucze (bez szumu: spójniki, 1-2 znaki). */
export function keywordsFrom(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/[\s-]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    ),
  ];
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "oraz",
  "jest",
  "dla",
  "nie",
]);

/**
 * Dopasowanie materiału do frazy: liczy pokrycie słów kluczowych frazy
 * przez tagi/tytuł/frazę źródłową materiału. 0 = nic wspólnego.
 */
export function scoreAsset(asset: MatchableAsset, query: string): number {
  const wanted = keywordsFrom(query);
  if (!wanted.length) return 0;
  const haystack = new Set([
    ...asset.tags.flatMap((t) => keywordsFrom(t)),
    ...keywordsFrom(asset.title),
    ...keywordsFrom(asset.source_query),
  ]);
  const hits = wanted.filter((w) => haystack.has(w)).length;
  return hits / wanted.length;
}

/** Od tylu punktów uznajemy, że materiał faktycznie ilustruje frazę. */
export const MATCH_THRESHOLD = 0.34;

/** Pion → kwadrat → reszta: przy kadrze 9:16 poziomy obrazek traci najwięcej. */
export function orientationRank(o: string | null): number {
  if (o === "portrait") return 0;
  if (o === "square") return 1;
  return 2;
}

/** Najdawniej użyte idzie pierwsze — dzięki temu bank się rotuje, a nie zużywa. */
export function byLeastUsed(a: RotatableAsset, b: RotatableAsset): number {
  const at = a.last_used_at ? Date.parse(a.last_used_at) : 0;
  const bt = b.last_used_at ? Date.parse(b.last_used_at) : 0;
  return at - bt || a.use_count - b.use_count;
}
