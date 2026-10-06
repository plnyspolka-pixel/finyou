// Autodiscovery feedów RSS/Atom — czysta część: lista stron forów i blogów
// do sprawdzenia oraz wyciąganie <link rel="alternate" type="application/
// rss+xml|atom+xml" href> z HTML (adresy względne → bezwzględne).
// Raz w tygodniu (poniedziałek) digest pobiera te strony i dopisuje nowe
// feedy do engagement_feeds (aktywne, z domyślnymi słowami kluczowymi).

import { parseAttributes, resolveUrl } from "../backlinks-monitor";

/** Strony główne / działy forów i blogów o finansach, nieruchomościach i rolnictwie. */
export const FEED_DISCOVERY_PAGES = [
  "https://forum.muratordom.pl/",
  "https://www.agrofoto.pl/forum/",
  "https://www.bankier.pl/forum/",
  "https://www.wykop.pl/tag/kredyty/",
  "https://www.reddit.com/r/Polska/",
  "https://www.reddit.com/r/inwestowanie/",
  "https://jakoszczedzacpieniadze.pl/",
  "https://subiektywnieofinansach.pl/",
  "https://www.totalmoney.pl/",
  "https://www.dlugi.info/",
] as const;

/** Dzień tygodnia (UTC) autodiscovery: 1 = poniedziałek — najwyżej raz w tygodniu. */
export const FEED_DISCOVERY_WEEKDAY = 1;
/** Najwyżej tyle feedów z jednej strony (blogi WordPress mają wpisy + komentarze + kategorie). */
export const FEEDS_PER_PAGE = 2;

const FEED_TYPES = new Set(["application/rss+xml", "application/atom+xml"]);

export function isFeedDiscoveryDay(now: Date): boolean {
  return now.getUTCDay() === FEED_DISCOVERY_WEEKDAY;
}

export type DiscoveredFeed = { url: string; title: string | null };

/**
 * Feedy zadeklarowane w <head> strony. Pomijamy feedy komentarzy
 * (WordPress: „… » Kanał z komentarzami", /comments/feed/) — tam nie ma
 * nowych wątków. Kolejność jak w HTML, bez duplikatów.
 */
export function extractFeedLinks(html: string, baseUrl: string): DiscoveredFeed[] {
  const out: DiscoveredFeed[] = [];
  const seen = new Set<string>();
  const clean = html.replace(/<!--[\s\S]*?-->/g, " ");
  const re = /<link\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const a = parseAttributes(m[1]);
    const rels = (a.rel ?? "").toLowerCase().split(/\s+/);
    if (!rels.includes("alternate")) continue;
    const type = (a.type ?? "").toLowerCase().split(";")[0].trim();
    if (!FEED_TYPES.has(type) || !a.href) continue;
    const url = resolveUrl(a.href, baseUrl);
    if (!url || seen.has(url)) continue;
    const title = a.title?.trim() || null;
    if (/komentarz|comments?\b/i.test(`${title ?? ""} ${url}`)) continue;
    seen.add(url);
    out.push({ url, title });
  }
  return out;
}
