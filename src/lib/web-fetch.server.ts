// Darmowe pobieranie stron i wyszukiwanie w sieci — zastępuje Firecrawl.
//
//   • fetchHtml     — bezpośredni fetch() z nagłówkami przeglądarki; gdy portal
//                     odpowie inaczej niż 200 (np. 403 z WAF), automatyczny
//                     fallback na Jina Reader (r.jina.ai) w trybie HTML,
//   • fetchReadable — czysty Markdown strony przez Jina Reader (tytuł, opis,
//                     treść, linki) — do analizy treści (konkurencja, SERP),
//   • webSearch     — wyniki wyszukiwania z DuckDuckGo HTML (bez klucza API),
//   • extractJsonLd / extractNextData / htmlToText — parsery pomocnicze.
//
// Opcjonalny JINA_API_KEY podnosi limity Jina Reader (bez klucza też działa).
// Server-only.

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
};

const JINA_READER = "https://r.jina.ai/";

function jinaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.JINA_API_KEY;
  return { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra };
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchedHtml {
  html: string;
  via: "direct" | "jina";
  status: number;
}

/**
 * Pobiera HTML strony. Najpierw bezpośrednio (nagłówki przeglądarki), a gdy
 * serwis zwróci błąd/blokadę — przez Jina Reader (x-return-format: html).
 * Zwraca null, gdy żadna droga nie dała sensownej treści.
 */
// Krótka pamięć podręczna w obrębie instancji — ocena ryzyka odpytuje te same strony
// z kilku modułów (rynek porównawczy, oferty w okolicy, wycena zabezpieczenia).
const HTML_CACHE_TTL_MS = 10 * 60_000;
const htmlCache = new Map<string, { at: number; value: Promise<FetchedHtml | null> }>();

export function fetchHtml(
  url: string,
  opts: { timeoutMs?: number; jinaFallback?: boolean; minLength?: number } = {},
): Promise<FetchedHtml | null> {
  const key = `${opts.jinaFallback === false ? "d" : "j"}|${url}`;
  const hit = htmlCache.get(key);
  if (hit && Date.now() - hit.at < HTML_CACHE_TTL_MS) return hit.value;
  if (htmlCache.size > 200) htmlCache.clear();
  const value = fetchHtmlUncached(url, opts);
  htmlCache.set(key, { at: Date.now(), value });
  // Nie trzymamy porażek — kolejne wywołanie spróbuje ponownie.
  value.then((v) => (v ? undefined : htmlCache.delete(key))).catch(() => htmlCache.delete(key));
  return value;
}

async function fetchHtmlUncached(
  url: string,
  opts: { timeoutMs?: number; jinaFallback?: boolean; minLength?: number },
): Promise<FetchedHtml | null> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const minLength = opts.minLength ?? 500;
  let lastStatus = 0;
  try {
    const res = await timedFetch(url, { headers: BROWSER_HEADERS, redirect: "follow" }, timeoutMs);
    lastStatus = res.status;
    if (res.ok) {
      const html = await res.text();
      if (html.length >= minLength) return { html, via: "direct", status: res.status };
    }
  } catch {
    // sieć / timeout — próbujemy Jiny
  }
  if (opts.jinaFallback === false) return null;
  try {
    const res = await timedFetch(
      JINA_READER + url,
      { headers: jinaHeaders({ "X-Return-Format": "html" }) },
      timeoutMs + 10_000,
    );
    if (!res.ok) return null;
    const html = await res.text();
    return html.length >= minLength
      ? { html, via: "jina", status: lastStatus || res.status }
      : null;
  } catch {
    return null;
  }
}

export interface ReadablePage {
  url: string;
  title: string | null;
  description: string | null;
  markdown: string;
  links: string[];
}

/** Czysta treść strony (Markdown) przez Jina Reader — odpowiednik Firecrawl /scrape. */
export async function fetchReadable(
  url: string,
  opts: { timeoutMs?: number; withLinks?: boolean } = {},
): Promise<ReadablePage> {
  const res = await timedFetch(
    JINA_READER + url,
    {
      headers: jinaHeaders({
        Accept: "application/json",
        ...(opts.withLinks ? { "X-With-Links-Summary": "true" } : {}),
      }),
    },
    opts.timeoutMs ?? 30_000,
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Jina Reader ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json().catch(() => null);
  const d = json?.data ?? {};
  const rawLinks = d.links;
  const links: string[] = Array.isArray(rawLinks)
    ? rawLinks.map((l: any) => (typeof l === "string" ? l : (l?.[1] ?? l?.url))).filter(Boolean)
    : rawLinks && typeof rawLinks === "object"
      ? Object.values(rawLinks).filter((v): v is string => typeof v === "string")
      : [];
  return {
    url: d.url ?? url,
    title: d.title ?? null,
    description: d.description ?? null,
    markdown: d.content ?? "",
    links,
  };
}

/**
 * Surowy Markdown strony przez Jina Reader (tryb tekstowy). Zachowuje nagłówki
 * i ceny kart, które tryb JSON potrafi pominąć (np. ceny całkowite na OLX).
 */
export async function fetchReadableMarkdown(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const res = await timedFetch(
    JINA_READER + url,
    { headers: jinaHeaders({ "X-Return-Format": "markdown" }) },
    opts.timeoutMs ?? 30_000,
  );
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Jina Reader ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

/** Wszystkie obiekty JSON-LD ze strony (spłaszczone tablice i @graph). */
export function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.shift();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
        out.push(node);
      }
    } catch {
      // uszkodzony blok — pomijamy
    }
  }
  return out;
}

/** Obiekt z <script id="__NEXT_DATA__"> (Next.js SSR), jeśli jest. */
export function extractNextData(html: string): any | null {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  sup2: "²",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all);
}

/** HTML → tekst (bez skryptów/stylów), z zachowaniem granic bloków jako nowych linii. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d|article|section|td|th)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
}

function parseDuckDuckGoHtml(html: string, limit: number): WebSearchResult[] {
  const out: WebSearchResult[] = [];
  const seen = new Set<string>();
  const blockRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && out.length < limit) {
    let href = decodeEntities(m[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (href.startsWith("//")) href = "https:" + href;
    if (!/^https?:\/\//i.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const snippetM = m[3].match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    out.push({
      url: href,
      title: htmlToText(m[2]).slice(0, 300),
      snippet: snippetM ? htmlToText(snippetM[1]).slice(0, 500) : "",
    });
  }
  return out;
}

/**
 * Wyszukiwanie w sieci bez płatnego API (DuckDuckGo HTML, region PL).
 * Przy blokadzie bezpośredniego zapytania — przez Jina Reader.
 */
export async function webSearch(
  query: string,
  opts: { limit?: number; region?: string } = {},
): Promise<WebSearchResult[]> {
  const limit = opts.limit ?? 10;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${opts.region ?? "pl-pl"}`;
  const page = await fetchHtml(url, { minLength: 200 });
  if (!page) return [];
  return parseDuckDuckGoHtml(page.html, limit);
}

export const __test = { parseDuckDuckGoHtml };
