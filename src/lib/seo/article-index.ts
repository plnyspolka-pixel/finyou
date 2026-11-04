// Sterowanie widocznością artykułów bloga w Google — bez zmian schematu bazy.
//
// Flagi trzymamy w `ai_seo_articles.raw_ai_output` (JSON):
// - `merged_into: "<slug>"` — artykuł scalony z innym (duplikat tematu).
//   Adres robi 301 na artykuł docelowy, znika z listy bloga, z „powiązanych”
//   i z sitemapy. Status zostaje `published`, żeby publiczny odczyt (RLS)
//   widział wiersz i mógł wykonać przekierowanie.
// - `noindex: true` — artykuł zostaje pod swoim adresem, ale z meta
//   `noindex, follow` i poza sitemapą (np. krótkotrwały komentarz dnia bez
//   wartości wyszukiwaniowej).

type RawLike = unknown;

function rawObj(raw: RawLike): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function mergedInto(raw: RawLike): string | null {
  const v = rawObj(raw)?.merged_into;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function isNoindex(raw: RawLike): boolean {
  return rawObj(raw)?.noindex === true;
}

/** Czy artykuł powinien być widoczny w sitemapie, na liście bloga i w „powiązanych”. */
export function isIndexable(raw: RawLike): boolean {
  return !mergedInto(raw) && !isNoindex(raw);
}

const STOPWORDS = new Set(
  "a i w we z ze na do od po pod o u dla co czy to jak jest sie się oraz albo lub vs the of and".split(
    " ",
  ),
);

/** Znormalizowane słowa tytułu (bez polskich znaków, liczb i słów łączących). */
export function titleTokens(title: string): Set<string> {
  const norm = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9 ]+/g, " ");
  return new Set(
    norm
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      // prosty stemming: ucinamy końcówki fleksyjne, żeby „pożyczki”/„pożyczka” się zgadzały
      .map((w) => (w.length > 6 ? w.slice(0, 6) : w)),
  );
}

/** Podobieństwo Jaccarda dwóch tytułów (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Najbardziej podobny tytuł z listy (do blokady duplikatów w autopilocie). */
export function mostSimilarTitle(
  title: string,
  others: { slug: string; title: string }[],
): { slug: string; title: string; score: number } | null {
  let best: { slug: string; title: string; score: number } | null = null;
  for (const o of others) {
    const score = titleSimilarity(title, o.title);
    if (!best || score > best.score) best = { ...o, score };
  }
  return best;
}

/**
 * Wpis „o braku danych” — model nie dostał świeżych wiadomości i napisał
 * o tym artykuł. Takie strony Google ocenia jako treść niskiej jakości.
 */
export function isNoDataTitle(title: string): boolean {
  return /\b(brak\w*|bez)\s+(swiez\w*\s+|nowych\s+)?(danych|informacji|wiadomosci)\b/.test(
    title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l"),
  );
}
