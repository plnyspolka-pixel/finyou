// Wyszukiwanie wątków na forach przez Google Programmable Search (Custom
// Search JSON API) — czysta część: rotowana lista zapytań, adres zapytania
// i parsowanie wyników do wątków forum. Zastępuje Google Alerts (alerty nie
// mają API, a feed RSS trzeba było zakładać ręcznie). Pobieranie:
// collectors.server.ts → collectWebSearch.
//
// Darmowy limit API: 100 zapytań dziennie. Digest robi najwyżej
// WEB_SEARCH_QUERIES_PER_DAY (4) — reszta zostaje na ręczne testy i zapas.

import { isOwnDomainUrl } from "../backlinks-monitor";
import { hostOf } from "./core";

/**
 * Zapytania (słowo kluczowe × serwis). Rotacja po 4 dziennie — cała lista
 * przechodzi w ~4 dni. `site:` działa, gdy wyszukiwarka (cx) przeszukuje
 * cały internet albo ma te serwisy na liście stron.
 */
export const WEB_SEARCH_QUERIES = [
  '"pożyczka pod zastaw" site:forum.muratordom.pl',
  "kredyt bez BIK site:wykop.pl",
  "finansowanie ziemi site:agrofoto.pl",
  "pożyczka komornik dom forum",
  "pożyczka hipoteczna dla firmy forum",
  "site:reddit.com pożyczka pod hipotekę",
  '"pożyczka pod zastaw mieszkania" forum',
  "kredyt odmowa banku nieruchomość forum",
  "konsolidacja długów hipoteka site:wykop.pl",
  "kredyt na zakup ziemi rolnej site:agrofoto.pl",
  "zadłużony dom licytacja komornicza forum",
  "site:reddit.com/r/Polska kredyt hipoteka komornik",
] as const;

/** Darmowy limit: 100/dzień — digest zużywa najwyżej 4. */
export const WEB_SEARCH_QUERIES_PER_DAY = 4;
/** Wyniki z ostatnich 7 dni (dateRestrict=d7). */
export const WEB_SEARCH_DATE_RESTRICT = "d7";

export const WEB_SEARCH_UNAVAILABLE_HINT =
  "Ustaw GOOGLE_CSE_KEY i GOOGLE_CSE_CX (Programmable Search Engine, darmowe 100 zapytań/dzień) — do tego czasu wątki tylko z feedów RSS.";

export type WebSearchConfig = { key: string; cx: string };

/** Klucz i identyfikator wyszukiwarki z env; brak któregoś = null (źródło niedostępne). */
export function webSearchConfig(env: Record<string, string | undefined>): WebSearchConfig | null {
  const key = (env.GOOGLE_CSE_KEY ?? "").trim();
  const cx = (env.GOOGLE_CSE_CX ?? "").trim();
  return key && cx ? { key, cx } : null;
}

export function buildWebSearchUrl(cfg: WebSearchConfig, q: string): string {
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", cfg.key);
  u.searchParams.set("cx", cfg.cx);
  u.searchParams.set("q", q);
  u.searchParams.set("dateRestrict", WEB_SEARCH_DATE_RESTRICT);
  u.searchParams.set("lr", "lang_pl");
  u.searchParams.set("gl", "pl");
  u.searchParams.set("num", "10");
  return u.toString();
}

/** Wątek znaleziony w wyszukiwarce (ten sam kształt co pozycja RSS). */
export type WebSearchHit = {
  url: string;
  title: string;
  snippet: string;
  source: string;
  publishedAt: string | null;
};

type CseItem = {
  link?: unknown;
  title?: unknown;
  snippet?: unknown;
  displayLink?: unknown;
  pagemap?: { metatags?: Array<Record<string, unknown>> };
};

const DATE_META_KEYS = [
  "article:published_time",
  "og:updated_time",
  "article:modified_time",
  "datepublished",
  "date",
];

function metaDate(item: CseItem): string | null {
  for (const tags of item.pagemap?.metatags ?? []) {
    for (const k of DATE_META_KEYS) {
      const v = tags?.[k];
      if (typeof v !== "string") continue;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

/**
 * Odpowiedź API → wątki. Pomijamy wyniki bez http(s), nasze własne strony
 * i duplikaty adresu. Data z metatagów strony (często jej nie ma — wtedy
 * null, a świeżość gwarantuje dateRestrict).
 */
export function parseWebSearchItems(json: unknown): WebSearchHit[] {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: WebSearchHit[] = [];
  const seen = new Set<string>();
  for (const raw of items as CseItem[]) {
    const url = typeof raw?.link === "string" ? raw.link.trim() : "";
    const title = typeof raw?.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : "";
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue;
    if (isOwnDomainUrl(url)) continue;
    seen.add(url);
    const snippet = typeof raw.snippet === "string" ? raw.snippet.replace(/\s+/g, " ").trim() : "";
    const display =
      typeof raw.displayLink === "string" ? raw.displayLink.replace(/^www\./, "") : "";
    out.push({
      url,
      title: title.slice(0, 300),
      snippet: snippet.slice(0, 500),
      source: display || hostOf(url) || "Google",
      publishedAt: metaDate(raw),
    });
  }
  return out;
}

/** Komunikat błędu API (np. limit dzienny, zły klucz) — bez klucza w treści. */
export function webSearchErrorMessage(status: number, json: unknown): string {
  const err = (json as { error?: { message?: unknown; errors?: Array<{ reason?: unknown }> } })
    ?.error;
  const reason = typeof err?.errors?.[0]?.reason === "string" ? err.errors[0].reason : "";
  const msg = typeof err?.message === "string" ? err.message : "";
  return `Custom Search ${status}${reason ? ` (${reason})` : ""}${msg ? `: ${msg.slice(0, 200)}` : ""}`;
}
