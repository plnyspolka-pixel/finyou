// Silnik danych rynkowych nieruchomości — bezpośrednio z polskich portali,
// bez Firecrawl i bez Perplexity. Zapytania do portali idą równolegle
// (Promise.allSettled); każdy portal ma własny parser:
//
//   • deweloperuch.pl — ceny TRANSAKCYJNE z aktów notarialnych (RCN), tabela HTML (SSR),
//   • morizon.pl / gratka.pl — oferty z JSON-LD (schema.org Product/Offer)
//                              + statystyki średnich cen m² z FAQPage,
//   • adresowo.pl — oferty BEZPOŚREDNIE od właścicieli (bez prowizji biur),
//   • otodom.pl — oferty z <script id="__NEXT_DATA__"> (searchAds.items),
//   • olx.pl — uzupełnienie ofert prywatnych przez Jina Reader (bezpośrednio 403).
//
// Gdy portal odpowie inaczej niż 200 — fetchHtml() automatycznie przechodzi na
// Jina Reader (r.jina.ai). Server-only.

import {
  extractJsonLd,
  extractNextData,
  fetchHtml,
  fetchReadable,
  htmlToText,
} from "@/lib/web-fetch.server";

export type PortalSource =
  "deweloperuch.pl" | "otodom.pl" | "morizon.pl" | "gratka.pl" | "adresowo.pl" | "olx.pl";

export const ALL_PORTALS: PortalSource[] = [
  "deweloperuch.pl",
  "otodom.pl",
  "morizon.pl",
  "gratka.pl",
  "adresowo.pl",
  "olx.pl",
];

export type ListingPostedBy = "agency" | "private" | "unknown";

export interface PortalListing {
  source: PortalSource;
  kind: "transaction" | "offer";
  postedBy: ListingPostedBy;
  url: string | null;
  title: string | null;
  address: string | null;
  pricePln: number | null;
  areaM2: number | null;
  pricePerM2: number | null;
  date: string | null;
}

export interface PortalSourceReport {
  source: PortalSource;
  status: "ok" | "empty" | "error" | "skipped";
  via: "direct" | "jina" | null;
  url: string | null;
  listingsParsed: number;
  /** Liczba wszystkich ogłoszeń w wynikach wyszukiwania (jeśli portal ją podaje). */
  totalListings: number | null;
  /** Średnia/mediana zł/m² podawana przez sam portal (statystyki miasta). */
  portalAvgPricePerM2: number | null;
  message?: string;
}

export interface PortalMarketResult {
  listings: PortalListing[];
  sources: PortalSourceReport[];
  /** Szacunek podaży: największa liczba ogłoszeń zgłoszona przez pojedynczy portal. */
  totalActiveListings: number;
  agencyListings: number;
  privateListings: number;
  /** Adresy stron wyników, z których pobrano dane (do sekcji „źródła"). */
  sourceUrls: string[];
}

export type MarketCategory = "mieszkanie" | "dom" | "dzialka" | "lokal";

export interface PortalMarketInput {
  propertyType: string;
  city: string | null;
  voivodeship?: string | null;
  county?: string | null;
  street?: string | null;
  /** Promień wyszukiwania (km) — obsługuje go otodom.pl; pozostałe portale szukają w mieście. */
  radiusKm?: number | null;
  /** Ogranicz do wybranych portali (domyślnie wszystkie pasujące do kategorii). */
  sources?: PortalSource[];
}

// ---------- normalizacja ----------

export function slugPl(s: string): string {
  const map: Record<string, string> = {
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
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function marketCategory(propertyType: string): MarketCategory | null {
  const t = (propertyType || "").toLowerCase();
  if (/mieszk/.test(t)) return "mieszkanie";
  if (/dzialka_zabudowana/.test(t)) return "dom";
  if (/dom/.test(t)) return "dom";
  if (/dzialk|działk|grunt|siedlisk|rolny/.test(t)) return "dzialka";
  if (/lokal/.test(t)) return "lokal";
  return null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v)
    .replace(/[\s\u00a0]/g, "")
    .replace(/zł|pln|m²|m2/gi, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function sanePrice(n: number | null): number | null {
  return n != null && n >= 5_000 && n <= 200_000_000 ? Math.round(n) : null;
}
function saneArea(n: number | null): number | null {
  return n != null && n >= 8 && n <= 5_000_000 ? Math.round(n * 100) / 100 : null;
}
function sanePpm2(n: number | null): number | null {
  return n != null && n >= 1 && n <= 150_000 ? Math.round(n) : null;
}

function listing(
  p: Omit<PortalListing, "pricePerM2"> & { pricePerM2?: number | null },
): PortalListing | null {
  const pricePln = sanePrice(p.pricePln);
  const areaM2 = saneArea(p.areaM2);
  const pricePerM2 =
    sanePpm2(p.pricePerM2 ?? null) ?? (pricePln && areaM2 ? sanePpm2(pricePln / areaM2) : null);
  if (!pricePerM2) return null;
  return { ...p, pricePln, areaM2, pricePerM2 };
}

// ---------- parsery tekstowe (wspólne) ----------

const PPM2_RE = /(\d[\d\s\u00a0.,]{0,12})\s*(?:zł|pln)\s*\/\s*m\s*(?:²|2|kw)/i;
const TOTAL_PRICE_RE = /(\d[\d\s\u00a0.,]{3,14})\s*(?:zł|pln)(?!\s*\/)/i;
const AREA_RE = /(\d{1,7}(?:[.,]\d{1,2})?)\s*m\s*(?:²|2)(?![\d])/i;

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0]/g, "");
  // „1.234.567,89" lub „1 234 567" lub „450000.00"
  const normalized = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : /\.\d{3}(\.|$)/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Wyłuskuje ogłoszenia z tekstu strony wyników (OLX w Markdown z Jiny,
 * adresowo po htmlToText): cena całkowita + metraż w oknie kilku linii.
 */
export function extractListingsFromText(
  text: string,
  source: PortalSource,
  opts: { postedBy?: ListingPostedBy; pageUrl?: string | null; max?: number } = {},
): PortalListing[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: PortalListing[] = [];
  const seen = new Set<string>();
  const max = opts.max ?? 40;
  for (let i = 0; i < lines.length && out.length < max; i++) {
    const line = lines[i];
    if (PPM2_RE.test(line) && !TOTAL_PRICE_RE.test(line.replace(PPM2_RE, ""))) continue;
    const pm = line.replace(PPM2_RE, "").match(TOTAL_PRICE_RE);
    if (!pm) continue;
    const price = sanePrice(parseMoney(pm[1]));
    if (!price || price < 20_000) continue;
    let area: number | null = null;
    let ppm2: number | null = null;
    let url: string | null = null;
    let title: string | null = null;
    // Szukamy od najbliższych linii na zewnątrz i nie wchodzimy w sąsiednie
    // ogłoszenie (linia z inną ceną całkowitą kończy okno w danym kierunku).
    const isOtherPrice = (l: string) => TOTAL_PRICE_RE.test(l.replace(PPM2_RE, ""));
    const scan = (j: number) => {
      const l = lines[j];
      if (area == null) {
        const am = l.replace(PPM2_RE, "").match(AREA_RE);
        if (am) area = saneArea(num(am[1]));
      }
      if (ppm2 == null) {
        const ppm = l.match(PPM2_RE);
        if (ppm) ppm2 = sanePpm2(parseMoney(ppm[1]));
      }
      if (url == null) {
        const lm = l.match(/\[([^\]]{5,200})\]\((https?:\/\/[^)\s]+)\)/);
        if (lm && !/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lm[2])) {
          title = lm[1].replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim() || null;
          url = lm[2];
        }
      }
    };
    scan(i);
    let upOpen = true;
    let downOpen = true;
    for (let d = 1; d <= 4; d++) {
      if (downOpen && i + d < lines.length) {
        if (isOtherPrice(lines[i + d])) downOpen = false;
        else scan(i + d);
      }
      if (upOpen && i - d >= 0) {
        if (isOtherPrice(lines[i - d])) upOpen = false;
        else scan(i - d);
      }
    }
    if (!area && !ppm2) continue;
    const key = `${price}|${area ?? ppm2}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rec = listing({
      source,
      kind: "offer",
      postedBy: opts.postedBy ?? "unknown",
      url: url ?? opts.pageUrl ?? null,
      title,
      address: null,
      pricePln: price,
      areaM2: area,
      pricePerM2: ppm2,
      date: null,
    });
    if (rec) out.push(rec);
  }
  return out;
}

/** „średnia cena … 12 345 zł/m²" — statystyka miasta podawana przez portal. */
export function extractPortalAvgPpm2(text: string): number | null {
  const m = text.match(
    /(?:średni\w*|przeciętn\w*|mediana)\s+cen\w*[^.\d]{0,80}?(\d[\d\s\u00a0.,]{2,12})\s*(?:zł|pln)\s*\/\s*m\s*(?:²|2)/i,
  );
  return m ? sanePpm2(parseMoney(m[1])) : null;
}

// ---------- deweloperuch.pl (transakcje) ----------

const DATE_RE = /\b(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/;

/** Wiersze tabeli transakcji (HTML) → rekordy. Kolumny rozpoznawane po treści. */
export function parseDeweloperuchTable(
  html: string,
  streetFilter?: string | null,
): PortalListing[] {
  const out: PortalListing[] = [];
  const streetLc = streetFilter ? streetFilter.toLowerCase() : null;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null && out.length < 60) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      htmlToText(c[1]),
    );
    const rec = parseTransactionCells(cells, streetLc);
    if (rec) out.push(rec);
  }
  return out;
}

/** Wiersze tabeli transakcji w Markdown (Jina) → rekordy. */
export function parseDeweloperuchMarkdown(
  md: string,
  streetFilter?: string | null,
): PortalListing[] {
  const streetLc = streetFilter ? streetFilter.toLowerCase() : null;
  const out: PortalListing[] = [];
  for (const line of md.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const rec = parseTransactionCells(cells, streetLc);
    if (rec) out.push(rec);
    if (out.length >= 60) break;
  }
  return out;
}

function parseTransactionCells(cells: string[], streetLc: string | null): PortalListing | null {
  if (cells.length < 3) return null;
  const dateCell = cells.find((c) => DATE_RE.test(c));
  if (!dateCell) return null;
  const ppm2Cell = cells.find((c) => PPM2_RE.test(c));
  const priceCell =
    cells.find((c) => !PPM2_RE.test(c) && TOTAL_PRICE_RE.test(c)) ??
    cells.find((c) => !DATE_RE.test(c) && /^\d[\d\s\u00a0.,]{5,}$/.test(c));
  const areaCell = cells.find((c) => !PPM2_RE.test(c) && AREA_RE.test(c));
  const addressCell =
    cells.find((c) => /^(ul\.|al\.|pl\.|os\.)/i.test(c)) ??
    cells.find((c) => /[a-ząćęłńóśźż]{3,}/i.test(c) && !DATE_RE.test(c) && !/zł|m²|m2/i.test(c)) ??
    null;
  if (streetLc && addressCell && !addressCell.toLowerCase().includes(streetLc)) return null;
  const price = priceCell
    ? sanePrice(parseMoney((priceCell.match(/\d[\d\s\u00a0.,]*/) ?? [""])[0]))
    : null;
  const area = areaCell ? saneArea(num(areaCell.match(AREA_RE)?.[1])) : null;
  const ppm2 = ppm2Cell ? sanePpm2(parseMoney(ppm2Cell.match(PPM2_RE)![1])) : null;
  return listing({
    source: "deweloperuch.pl",
    kind: "transaction",
    postedBy: "unknown",
    url: null,
    title: addressCell,
    address: addressCell,
    pricePln: price,
    areaM2: area,
    pricePerM2: ppm2,
    date: dateCell.match(DATE_RE)?.[1] ?? null,
  });
}

async function scrapeDeweloperuch(
  city: string,
  street: string | null,
  cat: MarketCategory,
): Promise<{ listings: PortalListing[]; report: PortalSourceReport }> {
  const source: PortalSource = "deweloperuch.pl";
  if (cat !== "mieszkanie" && cat !== "dom") {
    return {
      listings: [],
      report: skipped(source, "deweloperuch obsługuje tylko domy i mieszkania"),
    };
  }
  const kind = cat === "dom" ? "domy" : "mieszkania";
  const citySlug = slugPl(city);
  const urls = [
    `https://deweloperuch.pl/ceny-transakcyjne/${citySlug}/${kind}`,
    `https://deweloperuch.pl/ceny-transakcyjne/polska/${citySlug}/${kind}`,
  ];
  let lastVia: "direct" | "jina" | null = null;
  for (const url of urls) {
    const page = await fetchHtml(url);
    if (!page) continue;
    lastVia = page.via;
    let rows = parseDeweloperuchTable(page.html, street);
    if (rows.length === 0 && street) rows = parseDeweloperuchTable(page.html, null);
    if (rows.length === 0) rows = parseDeweloperuchMarkdown(page.html, null);
    if (rows.length > 0) {
      return {
        listings: rows.slice(0, 40),
        report: {
          source,
          status: "ok",
          via: page.via,
          url,
          listingsParsed: rows.length,
          totalListings: null,
          portalAvgPricePerM2: extractPortalAvgPpm2(htmlToText(page.html)),
        },
      };
    }
  }
  // Fallback: strona statystyk z medianą transakcyjną dla miasta.
  const statsUrl = `https://deweloperuch.pl/statystyki/ceny-transakcyjne/${kind}/${citySlug}`;
  const stats = await fetchHtml(statsUrl);
  if (stats) {
    const text = htmlToText(stats.html);
    const m = text.match(
      /median\w*[^0-9]{0,60}?(\d[\d\s\u00a0.,]{2,12})\s*(?:zł|pln)\s*\/\s*m\s*(?:²|2)/i,
    );
    const ppm2 = m ? sanePpm2(parseMoney(m[1])) : null;
    if (ppm2) {
      const txCount = text.match(/(\d{1,5})\s+transakcj/i);
      return {
        listings: [
          {
            source,
            kind: "transaction",
            postedBy: "unknown",
            url: statsUrl,
            title: `mediana transakcyjna (statystyki${txCount ? `, ${txCount[1]} transakcji` : ""})`,
            address: city,
            pricePln: null,
            areaM2: null,
            pricePerM2: ppm2,
            date: null,
          },
        ],
        report: {
          source,
          status: "ok",
          via: stats.via,
          url: statsUrl,
          listingsParsed: 1,
          totalListings: txCount ? Number(txCount[1]) : null,
          portalAvgPricePerM2: ppm2,
        },
      };
    }
  }
  return {
    listings: [],
    report: {
      source,
      status: "empty",
      via: lastVia,
      url: urls[0],
      listingsParsed: 0,
      totalListings: null,
      portalAvgPricePerM2: null,
      message: "brak tabeli transakcji dla tej miejscowości",
    },
  };
}

// ---------- morizon.pl / gratka.pl (JSON-LD) ----------

function pickDeep(obj: any, keys: string[], depth = 4): any {
  if (!obj || typeof obj !== "object" || depth < 0) return undefined;
  for (const k of keys) if (obj[k] != null) return obj[k];
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const r = pickDeep(v, keys, depth - 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function areaFromNode(node: any): number | null {
  const fs = pickDeep(node, ["floorSize", "lotSize", "area"]);
  if (fs == null) return null;
  if (typeof fs === "object") {
    const v = num(fs.value ?? fs.maxValue ?? fs.minValue);
    const unit = String(fs.unitCode ?? fs.unitText ?? "").toUpperCase();
    if (v == null) return null;
    if (unit === "HAR" || /HA/.test(unit)) return v * 10_000;
    if (unit === "ARE" || unit === "AR") return v * 100;
    return v;
  }
  return num(fs);
}

/**
 * Oferty z JSON-LD (schema.org): każdy obiekt z ceną (Offer / Product.offers /
 * AggregateOffer.offers[]) staje się rekordem; metraż, adres i URL szukamy
 * w tym obiekcie i w obiekcie nadrzędnym (Product/Apartment/itemOffered).
 */
export function parseJsonLdListings(
  nodes: any[],
  source: PortalSource,
): { listings: PortalListing[]; totalListings: number | null; avgPpm2: number | null } {
  const out: PortalListing[] = [];
  const seen = new Set<string>();
  let totalListings: number | null = null;
  let avgPpm2: number | null = null;

  const visit = (node: any, parent: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, parent, depth + 1);
      return;
    }
    const type = String(node["@type"] ?? "");
    if (/AggregateOffer/i.test(type)) {
      const c = num(node.offerCount);
      if (c != null && c > 0) totalListings = Math.max(totalListings ?? 0, Math.round(c));
    }
    if (/FAQPage|Question|Answer/i.test(type)) {
      const text = [node.name, node.text, node.acceptedAnswer?.text].filter(Boolean).join(" ");
      avgPpm2 = avgPpm2 ?? extractPortalAvgPpm2(htmlToText(String(text)));
    }
    const priceRaw = node.price ?? node.priceSpecification?.price;
    if (priceRaw != null && !/AggregateOffer/i.test(type)) {
      const price = num(priceRaw);
      const area = areaFromNode(node) ?? areaFromNode(parent);
      const url = (typeof node.url === "string" && node.url) || (parent?.url as string) || null;
      const addr = pickDeep(node, ["address"]) ?? pickDeep(parent, ["address"]);
      const address =
        addr && typeof addr === "object"
          ? [addr.streetAddress, addr.addressLocality, addr.addressRegion]
              .filter(Boolean)
              .join(", ")
          : typeof addr === "string"
            ? addr
            : null;
      const title = (node.name ?? parent?.name ?? null) as string | null;
      const key = `${url ?? ""}|${price}|${area}`;
      if (!seen.has(key)) {
        seen.add(key);
        const rec = listing({
          source,
          kind: "offer",
          postedBy: "unknown",
          url,
          title: title ? String(title).slice(0, 200) : null,
          address: address || null,
          pricePln: price,
          areaM2: area,
          date: null,
        });
        if (rec) out.push(rec);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "@context") continue;
      if (v && typeof v === "object") visit(v, node, depth + 1);
    }
  };
  for (const n of nodes) visit(n, null, 0);
  return { listings: out.slice(0, 60), totalListings, avgPpm2 };
}

const MORIZON_PATH: Record<MarketCategory, string> = {
  mieszkanie: "mieszkania",
  dom: "domy",
  dzialka: "dzialki",
  lokal: "komercyjne",
};
const GRATKA_PATH: Record<MarketCategory, string> = {
  mieszkanie: "mieszkania",
  dom: "domy",
  dzialka: "dzialki-grunty",
  lokal: "lokale-uzytkowe",
};

async function scrapeJsonLdPortal(
  source: "morizon.pl" | "gratka.pl",
  url: string,
): Promise<{ listings: PortalListing[]; report: PortalSourceReport }> {
  const page = await fetchHtml(url);
  if (!page) return { listings: [], report: errorReport(source, url, "brak odpowiedzi portalu") };
  const { listings, totalListings, avgPpm2 } = parseJsonLdListings(
    extractJsonLd(page.html),
    source,
  );
  // Gdy JSON-LD nie ma ofert (np. HTML z Jiny bez skryptów) — parser tekstowy.
  const text = htmlToText(page.html);
  const rows = listings.length ? listings : extractListingsFromText(text, source, { pageUrl: url });
  return {
    listings: rows,
    report: {
      source,
      status: rows.length ? "ok" : "empty",
      via: page.via,
      url,
      listingsParsed: rows.length,
      totalListings: totalListings ?? extractTotalCount(text),
      portalAvgPricePerM2: avgPpm2 ?? extractPortalAvgPpm2(text),
    },
  };
}

/** „1 234 ogłoszeń/ofert" z nagłówka listy wyników. */
function extractTotalCount(text: string): number | null {
  const m = text.match(/(\d[\d\s\u00a0]{0,8})\s+(?:ogłosze|ofert|wynik)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s\u00a0]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

// ---------- adresowo.pl (oferty bezpośrednie) ----------

const ADRESOWO_PATH: Record<MarketCategory, string> = {
  mieszkanie: "mieszkania",
  dom: "domy",
  dzialka: "dzialki",
  lokal: "lokale",
};

async function scrapeAdresowo(
  city: string,
  cat: MarketCategory,
): Promise<{ listings: PortalListing[]; report: PortalSourceReport }> {
  const source: PortalSource = "adresowo.pl";
  const url = `https://adresowo.pl/${ADRESOWO_PATH[cat]}/${slugPl(city)}/`;
  const page = await fetchHtml(url);
  if (!page) return { listings: [], report: errorReport(source, url, "brak odpowiedzi portalu") };
  const fromLd = parseJsonLdListings(extractJsonLd(page.html), source);
  const text = htmlToText(page.html);
  const rows = (
    fromLd.listings.length
      ? fromLd.listings
      : extractListingsFromText(text, source, { pageUrl: url, postedBy: "private" })
  ).map((l) => ({ ...l, postedBy: "private" as const }));
  return {
    listings: rows,
    report: {
      source,
      status: rows.length ? "ok" : "empty",
      via: page.via,
      url,
      listingsParsed: rows.length,
      totalListings: fromLd.totalListings ?? extractTotalCount(text),
      portalAvgPricePerM2: fromLd.avgPpm2 ?? extractPortalAvgPpm2(text),
    },
  };
}

// ---------- otodom.pl (__NEXT_DATA__) ----------

const OTODOM_PATH: Record<MarketCategory, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  dzialka: "dzialka",
  lokal: "lokal",
};
// Otodom akceptuje tylko wybrane wartości promienia.
const OTODOM_RADII = [0, 5, 10, 15, 25, 50, 75];

function otodomRadius(km: number | null | undefined): number | null {
  if (!km || km <= 0) return null;
  return OTODOM_RADII.find((r) => r >= km) ?? 75;
}

function findKey(obj: any, key: string, depth = 8): any {
  if (!obj || typeof obj !== "object" || depth < 0) return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const r = findKey(v, key, depth - 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

export function parseOtodomNextData(next: any): {
  listings: PortalListing[];
  totalListings: number | null;
} {
  const searchAds = findKey(next, "searchAds");
  const items: any[] = Array.isArray(searchAds?.items) ? searchAds.items : [];
  const pag = searchAds?.pagination ?? {};
  const total = num(pag.totalResults ?? pag.totalItems ?? pag.totalCount);
  const out: PortalListing[] = [];
  for (const it of items) {
    const price = num(it?.totalPrice?.value ?? it?.price?.value ?? it?.totalPrice);
    const area = num(it?.areaInSquareMeters ?? it?.area ?? it?.terrainAreaInSquareMeters);
    const ppm2 = num(it?.pricePerSquareMeter?.value ?? it?.pricePerSquareMeter);
    const isPrivate =
      it?.isPrivateOwner === true ||
      (it?.isPrivateOwner == null && it?.agency == null && it?.advertiserType === "private");
    const isAgency = it?.isPrivateOwner === false || it?.agency != null;
    const loc = it?.location?.address ?? {};
    const address = [loc?.street?.name, loc?.city?.name].filter(Boolean).join(", ") || null;
    const rec = listing({
      source: "otodom.pl",
      kind: "offer",
      postedBy: isPrivate ? "private" : isAgency ? "agency" : "unknown",
      url: it?.slug ? `https://www.otodom.pl/pl/oferta/${it.slug}` : null,
      title: typeof it?.title === "string" ? it.title.slice(0, 200) : null,
      address,
      pricePln: price,
      areaM2: area,
      pricePerM2: ppm2,
      date: typeof it?.createdAtFirst === "string" ? it.createdAtFirst.slice(0, 10) : null,
    });
    if (rec) out.push(rec);
  }
  return { listings: out, totalListings: total != null && total > 0 ? Math.round(total) : null };
}

async function scrapeOtodom(
  city: string,
  voivodeship: string | null,
  county: string | null,
  cat: MarketCategory,
  radiusKm: number | null,
): Promise<{ listings: PortalListing[]; report: PortalSourceReport }> {
  const source: PortalSource = "otodom.pl";
  const c = slugPl(city);
  const v = voivodeship ? slugPl(voivodeship.replace(/^woj(ewództwo|\.)?\s*/i, "")) : null;
  const k = county ? slugPl(county.replace(/^(powiat|m\.?\s*st\.?)\s*/i, "")) : null;
  const base = `https://www.otodom.pl/pl/wyniki/sprzedaz/${OTODOM_PATH[cat]}`;
  const paths = [
    v ? `${v}/${c}/${c}/${c}` : null, // miasto na prawach powiatu
    v && k && k !== c ? `${v}/${k}/${c}/${c}` : null, // miasto-gmina w powiecie
    v && k && k !== c ? `${v}/${k}/${c}` : null,
    v ? `${v}/${c}` : null,
  ].filter((p): p is string => !!p);
  const radius = otodomRadius(radiusKm);
  const qs = `?limit=72${radius != null ? `&distanceRadius=${radius}` : ""}`;
  let lastVia: "direct" | "jina" | null = null;
  let anyDirect = false;
  // Warianty ścieżki próbujemy bezpośrednio; Jina (wolniejsza) tylko dla pierwszego
  // wariantu i tylko gdy portal blokuje wszystkie zapytania bezpośrednie.
  const attempts = [
    ...paths.map((p) => ({ p, jina: false })),
    ...(paths[0] ? [{ p: paths[0], jina: true }] : []),
  ];
  for (const { p, jina } of attempts) {
    if (jina && anyDirect) break;
    const url = `${base}/${p}${qs}`;
    const page = await fetchHtml(url, { jinaFallback: jina });
    if (!page) continue;
    if (page.via === "direct") anyDirect = true;
    lastVia = page.via;
    const next = extractNextData(page.html);
    const parsed = next ? parseOtodomNextData(next) : { listings: [], totalListings: null };
    const rows = parsed.listings.length
      ? parsed.listings
      : extractListingsFromText(htmlToText(page.html), source, { pageUrl: url });
    if (rows.length > 0) {
      return {
        listings: rows,
        report: {
          source,
          status: "ok",
          via: page.via,
          url,
          listingsParsed: rows.length,
          totalListings: parsed.totalListings,
          portalAvgPricePerM2: null,
        },
      };
    }
  }
  return {
    listings: [],
    report: {
      source,
      status: paths.length ? "empty" : "skipped",
      via: lastVia,
      url: paths[0] ? `${base}/${paths[0]}${qs}` : null,
      listingsParsed: 0,
      totalListings: null,
      portalAvgPricePerM2: null,
      message: paths.length ? "brak ofert dla tej lokalizacji" : "brak województwa — pominięto",
    },
  };
}

// ---------- olx.pl (Jina Reader) ----------

const OLX_PATH: Record<MarketCategory, string> = {
  mieszkanie: "mieszkania",
  dom: "domy",
  dzialka: "dzialki",
  lokal: "biura-lokale",
};

async function scrapeOlx(
  city: string,
  cat: MarketCategory,
): Promise<{ listings: PortalListing[]; report: PortalSourceReport }> {
  const source: PortalSource = "olx.pl";
  const url = `https://www.olx.pl/nieruchomosci/${OLX_PATH[cat]}/sprzedaz/${slugPl(city)}/`;
  try {
    const page = await fetchReadable(url, { timeoutMs: 30_000 });
    const rows = extractListingsFromText(page.markdown, source, { pageUrl: url });
    return {
      listings: rows,
      report: {
        source,
        status: rows.length ? "ok" : "empty",
        via: "jina",
        url,
        listingsParsed: rows.length,
        totalListings: extractTotalCount(page.markdown),
        portalAvgPricePerM2: null,
      },
    };
  } catch (e: any) {
    return { listings: [], report: errorReport(source, url, e?.message ?? "błąd Jina Reader") };
  }
}

// ---------- orkiestracja ----------

function skipped(source: PortalSource, message: string): PortalSourceReport {
  return {
    source,
    status: "skipped",
    via: null,
    url: null,
    listingsParsed: 0,
    totalListings: null,
    portalAvgPricePerM2: null,
    message,
  };
}
function errorReport(source: PortalSource, url: string, message: string): PortalSourceReport {
  return {
    source,
    status: "error",
    via: null,
    url,
    listingsParsed: 0,
    totalListings: null,
    portalAvgPricePerM2: null,
    message,
  };
}

/**
 * Pobiera równolegle dane ze wszystkich pasujących portali. Nigdy nie rzuca —
 * błąd pojedynczego portalu trafia do `sources[]` ze statusem "error".
 */
export async function fetchPortalMarket(input: PortalMarketInput): Promise<PortalMarketResult> {
  const empty: PortalMarketResult = {
    listings: [],
    sources: [],
    totalActiveListings: 0,
    agencyListings: 0,
    privateListings: 0,
    sourceUrls: [],
  };
  const cat = marketCategory(input.propertyType);
  if (!input.city || !cat) return empty;
  const city = input.city;
  const want = new Set(input.sources ?? ALL_PORTALS);

  const jobs: Array<Promise<{ listings: PortalListing[]; report: PortalSourceReport }>> = [];
  const add = (
    source: PortalSource,
    job: () => Promise<{ listings: PortalListing[]; report: PortalSourceReport }>,
  ) => {
    if (!want.has(source)) return;
    jobs.push(
      job().catch((e: any) => ({
        listings: [],
        report: errorReport(source, "", e?.message ?? "błąd"),
      })),
    );
  };
  add("deweloperuch.pl", () => scrapeDeweloperuch(city, input.street ?? null, cat));
  add("otodom.pl", () =>
    scrapeOtodom(
      city,
      input.voivodeship ?? null,
      input.county ?? null,
      cat,
      input.radiusKm ?? null,
    ),
  );
  add("morizon.pl", () =>
    scrapeJsonLdPortal(
      "morizon.pl",
      `https://www.morizon.pl/${MORIZON_PATH[cat]}/${slugPl(city)}/`,
    ),
  );
  add("gratka.pl", () =>
    scrapeJsonLdPortal(
      "gratka.pl",
      `https://gratka.pl/nieruchomosci/${GRATKA_PATH[cat]}/${slugPl(city)}`,
    ),
  );
  add("adresowo.pl", () => scrapeAdresowo(city, cat));
  add("olx.pl", () => scrapeOlx(city, cat));

  const settled = await Promise.all(jobs);
  const listings = settled.flatMap((s) => s.listings);
  const sources = settled.map((s) => s.report);
  const offers = listings.filter((l) => l.kind === "offer");

  // Podaż: portale w dużej mierze dublują te same ogłoszenia, więc nie sumujemy —
  // bierzemy największą liczbę zgłoszoną przez pojedynczy portal (lub liczbę próbki).
  const offerTotals = sources
    .filter((s) => s.source !== "deweloperuch.pl")
    .map((s) => s.totalListings ?? s.listingsParsed);
  const totalActiveListings = Math.max(offers.length ? 1 : 0, ...offerTotals, 0);

  // Struktura biura/prywatni: z próbki ofert o znanym wystawcy.
  const known = offers.filter((o) => o.postedBy !== "unknown");
  const agencyShare = known.length
    ? known.filter((o) => o.postedBy === "agency").length / known.length
    : null;
  const agencyListings =
    agencyShare != null
      ? Math.round(totalActiveListings * agencyShare)
      : offers.filter((o) => o.postedBy === "agency").length;
  const privateListings =
    agencyShare != null
      ? totalActiveListings - agencyListings
      : offers.filter((o) => o.postedBy === "private").length;

  return {
    listings,
    sources,
    totalActiveListings,
    agencyListings,
    privateListings,
    sourceUrls: sources.filter((s) => s.status === "ok" && s.url).map((s) => s.url!),
  };
}

/** Jednolinijkowe podsumowanie źródeł do notatek/diagnostyki. */
export function describePortalSources(sources: PortalSourceReport[]): string {
  return sources
    .map((s) => {
      const via = s.via === "jina" ? " przez Jina" : "";
      if (s.status === "ok") return `${s.source}: ${s.listingsParsed}${via}`;
      if (s.status === "skipped") return `${s.source}: pominięto`;
      return `${s.source}: ${s.status === "error" ? "błąd" : "brak"}${s.message ? ` (${s.message})` : ""}`;
    })
    .join("; ");
}
