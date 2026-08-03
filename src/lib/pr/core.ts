// Digital PR (moduł 4 promptu SEO) — czysta logika: parsowanie RSS/Atom,
// dopasowanie fraz monitoringu i deduplikacja okazji. Bez dostępu do sieci
// i bazy (testowalne); pobieraniem zajmuje się monitor.server.ts.

export interface RssItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  snippet: string;
}

/** Frazy monitorowane (prompt SEO §MODUŁ 4). */
export const PR_MONITOR_PHRASES = [
  "pożyczka pod zastaw",
  "pożyczki prywatne",
  "rynek nieruchomości",
] as const;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

/**
 * Minimalistyczny parser RSS 2.0 / Atom — wystarczający dla Google News RSS
 * i typowych feedów wydawców. Bez zewnętrznych zależności (działa w Workerze).
 */
export function parseRssItems(xml: string, fallbackSource: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const rawTitle = firstMatch(block, "title") ?? "";
    const title = stripTags(decodeEntities(rawTitle));
    // RSS: <link>url</link>; Atom: <link href="url"/>
    let url = decodeEntities(firstMatch(block, "link") ?? "");
    if (!url) {
      const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      url = href ? decodeEntities(href[1]) : "";
    }
    url = url.trim();
    if (!title || !/^https?:\/\//.test(url)) continue;

    const pub =
      firstMatch(block, "pubDate") ??
      firstMatch(block, "published") ??
      firstMatch(block, "updated");
    let publishedAt: string | null = null;
    if (pub) {
      const d = new Date(decodeEntities(pub));
      publishedAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    const sourceTag = firstMatch(block, "source");
    const source = sourceTag ? stripTags(decodeEntities(sourceTag)) : fallbackSource;

    const desc = firstMatch(block, "description") ?? firstMatch(block, "summary") ?? "";
    const snippet = stripTags(decodeEntities(desc)).slice(0, 500);

    items.push({ title, url, source: source || fallbackSource, publishedAt, snippet });
  }
  return items;
}

/** Które monitorowane frazy pasują do tytułu/snippetu (case-insensitive). */
export function matchedPhrases(item: Pick<RssItem, "title" | "snippet">): string[] {
  const haystack = `${item.title} ${item.snippet}`.toLowerCase();
  return PR_MONITOR_PHRASES.filter((p) => haystack.includes(p.toLowerCase()));
}

/**
 * Klucz deduplikacji: znormalizowany URL (bez parametrów śledzących,
 * ukośnika końcowego i schematu) — ta sama publikacja z dwóch feedów
 * dostaje ten sam hash.
 */
export function dedupeKey(url: string): string {
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "");
  u = u.split("#")[0];
  const [path, query] = u.split("?");
  let keptQuery = "";
  if (query) {
    const kept = query
      .split("&")
      .filter((kv) => !/^(utm_|fbclid|gclid|ref=|source=)/.test(kv))
      .join("&");
    keptQuery = kept ? `?${kept}` : "";
  }
  u = path.replace(/\/+$/, "") + keptQuery;
  // FNV-1a 64-bit (dwa przebiegi 32-bit) — stabilny, krótki klucz.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < u.length; i++) {
    h1 = Math.imul(h1 ^ u.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ u.charCodeAt(i), 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
