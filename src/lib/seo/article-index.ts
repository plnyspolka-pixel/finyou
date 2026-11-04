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

/**
 * Artykuł docelowy klastra „pożyczki pod zastaw vs obligacje COI/EDO vs lokaty”.
 * Wybrany, bo jest w indeksie Google i ma najwięcej wyświetleń w klastrze
 * (audyt Search Console, 2026-11-04).
 */
const COI_EDO_CANONICAL =
  "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-c-1";

/**
 * Scalone duplikaty (301 → artykuł docelowy). Autopilot wygenerował kilkanaście
 * niemal identycznych porównań; Google indeksował z nich tylko część i
 * rozpraszał sygnały między kopie.
 */
export const BLOG_MERGED: Readonly<Record<string, string>> = Object.fromEntries(
  [
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-p",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-p-1",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-p-2",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-p-3",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-p-4",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-c",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-c-2",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-12m-c-3",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokaty-banko",
    "pozyczka-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokata-12m-p",
    "pozyczka-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokata-12m-p-1",
    "pozyczka-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokata-12m-c",
    "pozyczka-pod-zastaw-nieruchomosci-vs-obligacje-coi-edo-vs-lokata-12m-c-1",
    "pozyczka-pod-zastaw-nieruchomosci-vs-obligacje-skarbowe-coi-edo-vs-lok",
    "pozyczka-pod-zastaw-nieruchomosci-vs-obligacje-skarbowe-coi-edo-vs-lok-1",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-i-lokaty-co-w-portfelu-",
    "pozyczki-pod-zastaw-nieruchomosci-vs-obligacje-i-lokaty-porownanie-dla",
    "pozyczki-hipoteczne-vs-obligacje-vs-lokaty-co-wybrac-w-2026",
    "w-co-inwestowac-pieniadze-w-2024-porownanie-lokaty-obligacje-nieruchom",
  ].map((slug) => [slug, COI_EDO_CANONICAL]),
);

/**
 * Wpisy zostawione pod swoim adresem, ale z `noindex`: komentarze „dnia bez
 * danych” (brak treści) i przeglądy tygodnia opisujące wydarzenia z 2024 r.
 * opublikowane w 2026 r. (nieaktualne, mylące).
 */
export const BLOG_NOINDEX: ReadonlySet<string> = new Set([
  "brak-danych-z-rynku-co-oznacza-dla-inwestora-w-pozyczki-hipoteczne",
  "dzienny-komentarz-dla-inwestora-pozyczki-pod-zastaw-nieruchomosci-przy",
  "brak-swiezych-danych-z-rynku-a-pozyczka-pod-zastaw-nieruchomosci-co-ro",
  "dzien-bez-danych-rynkowych-jak-dzis-myslec-o-pozyczkach-pod-zastaw-nie",
  "codzienny-komentarz-dla-pozyczkobiorcy-pozyczka-pod-zastaw-nieruchomos",
  "brak-swiezych-danych-makro-co-to-oznacza-dla-inwestora-w-pozyczki-pod-",
  "przeglad-tygodnia-16-09-22-09-2024-zmiany-w-prawie-i-na-rynku-nierucho",
  "przeglad-tygodnia-13-19-05-2024-rynek-nieruchomosci-miedzy-licytacja-k",
]);

/** Flagi z `raw_ai_output` (albo z kolumn wybranych aliasem w PostgREST). */
export type IndexFlags = { merged_into?: unknown; noindex?: unknown } | null | undefined;

function rawObj(raw: RawLike): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** Slug artykułu docelowego, jeśli ten artykuł został scalony; inaczej null. */
export function mergedInto(raw: RawLike, slug?: string): string | null {
  if (slug && BLOG_MERGED[slug]) return BLOG_MERGED[slug];
  const v = rawObj(raw)?.merged_into;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function isNoindex(raw: RawLike, slug?: string): boolean {
  if (slug && BLOG_NOINDEX.has(slug)) return true;
  return rawObj(raw)?.noindex === true;
}

/** Czy artykuł powinien być widoczny w sitemapie, na liście bloga i w „powiązanych”. */
export function isIndexable(raw: RawLike, slug?: string): boolean {
  return !mergedInto(raw, slug) && !isNoindex(raw, slug);
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
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l"),
  );
}
