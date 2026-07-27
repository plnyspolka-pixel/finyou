// Scraping podobnych ogłoszeń z portali nieruchomościowych (Otodom, OLX, Domiporta, Gratka, Morizon)
// przez Firecrawl Search API. Server-only.
import type { PropertyType } from "./types";
import { median as med, average as avg, filterIqrOutliers } from "./cache.server";

export type ListingPostedBy = "agency" | "private" | "unknown";

export interface ScrapedListing {
  source: string; // np. "otodom.pl"
  url: string;
  title: string;
  pricePln: number | null;
  areaM2: number | null;
  pricePerM2: number | null;
  snippet?: string;
  /** Kto wystawił ofertę: biuro nieruchomości / osoba prywatna / nieustalone. */
  postedBy?: ListingPostedBy;
}

// Portale zdominowane przez oferty biur nieruchomości (domyślnie klasyfikujemy jako agency).
const AGENCY_LEANING_PORTALS = [
  "domiporta.pl",
  "morizon.pl",
  "gratka.pl",
  "nieruchomosci-online.pl",
];

function classifyPostedBy(blob: string, domain: string): ListingPostedBy {
  const b = blob.toLowerCase();
  // Jawne sygnały oferty prywatnej mają priorytet — „bez pośredników"/„od właściciela"
  // zawierają fragment „pośrednik", więc muszą być sprawdzone przed regułą agencyjną.
  const privateHit =
    /(oferta prywatna|osoba prywatna|bez po[śs]redni|bezpo[śs]rednio od w[łl]a[śs]cic|od w[łl]a[śs]ciciela|sprzedam bezpo[śs]rednio)/.test(
      b,
    );
  if (privateHit) return "private";
  const agencyHit =
    /(biuro nieruchomo|agencja nieruchomo|po[śs]rednik|prowizj|oferta biura|oferta od:\s*(biuro|agencja)|zapraszam do biura|numer oferty|nr oferty|mln estate|dom development|sp\.\s*z\s*o\.o\.)/.test(
      b,
    );
  if (agencyHit) return "agency";
  if (AGENCY_LEANING_PORTALS.includes(domain)) return "agency";
  return "unknown";
}

export interface ListingsBenchmark {
  status: "success" | "no_data" | "error" | "partial";
  query: string;
  portals: string[];
  totalFound: number;
  used: number;
  pricePerM2Median: number | null;
  pricePerM2Average: number | null;
  pricePerM2Min: number | null;
  pricePerM2Max: number | null;
  listings: ScrapedListing[];
  errorMessage?: string;
}

const TYPE_KEYWORDS: Record<string, string> = {
  mieszkanie: "mieszkanie sprzedaż",
  dom: "dom sprzedaż",
  lokal_uslugowy: "lokal użytkowy sprzedaż",
  dzialka_budowlana: "działka budowlana sprzedaż",
  dzialka_zabudowana: "działka zabudowana sprzedaż",
  grunt_rolny: "grunt rolny sprzedaż",
  inna: "nieruchomość sprzedaż",
};

const PORTAL_DOMAINS = [
  "otodom.pl",
  "olx.pl",
  "domiporta.pl",
  "gratka.pl",
  "morizon.pl",
  "nieruchomosci-online.pl",
];

// Parsowanie ceny w PLN z tekstu (np. "699 000 zł", "1.250.000 PLN", "699,000 zł").
function parsePricePln(text: string): number | null {
  if (!text) return null;
  // Szuka liczby (z separatorami spacja/kropka/przecinek) tuż przed zł|PLN
  const re = /([\d][\d\s.,]{3,})\s*(zł|pln)\b/i;
  const m = text.match(re);
  if (!m) return null;
  const raw = m[1].replace(/[\s.]/g, "").replace(",", ".");
  const n = Number(raw.replace(/\.\d{1,2}$/, "")); // odetnij ewentualne grosze
  if (!Number.isFinite(n) || n < 10_000 || n > 100_000_000) return null;
  return Math.round(n);
}

// Parsowanie powierzchni w m².
function parseAreaM2(text: string): number | null {
  if (!text) return null;
  // Np. "52,4 m²", "120 m2", "Powierzchnia: 65.3 m²"
  const re = /([\d]+(?:[.,]\d{1,2})?)\s*m\s*(?:²|2)\b/i;
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n < 8 || n > 5000) return null;
  return n;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface ListingsScrapeParams {
  propertyType: PropertyType | string;
  city?: string | null;
  district?: string | null;
  voivodeship?: string | null;
  areaM2?: number | null;
  maxResults?: number;
}

export async function scrapeSimilarListings(p: ListingsScrapeParams): Promise<ListingsBenchmark> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const portals = PORTAL_DOMAINS;
  const typeKw = TYPE_KEYWORDS[p.propertyType as string] ?? TYPE_KEYWORDS.inna;
  const locParts = [p.district, p.city, p.voivodeship].filter(Boolean).join(" ");
  const siteFilter = portals.map((d) => `site:${d}`).join(" OR ");
  const query = `${typeKw} ${locParts} (${siteFilter})`.trim();

  const empty: ListingsBenchmark = {
    status: "no_data",
    query,
    portals,
    totalFound: 0,
    used: 0,
    pricePerM2Median: null,
    pricePerM2Average: null,
    pricePerM2Min: null,
    pricePerM2Max: null,
    listings: [],
  };
  if (!apiKey) return { ...empty, status: "error", errorMessage: "Brak FIRECRAWL_API_KEY." };
  if (!p.city) return { ...empty, errorMessage: "Brak miasta — nie wyszukano ogłoszeń." };

  const limit = Math.max(6, Math.min(p.maxResults ?? 12, 20));

  // Firecrawl Search v2 — pobieramy także markdown z każdego trafienia, by wyciągnąć cenę/powierzchnię.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let resp: Response;
  try {
    resp = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        limit,
        lang: "pl",
        country: "pl",
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    return { ...empty, status: "error", errorMessage: `Firecrawl: ${e?.message ?? "błąd sieci"}` };
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return {
      ...empty,
      status: "error",
      errorMessage: `Firecrawl HTTP ${resp.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = (await resp.json().catch(() => null)) as any;
  // Firecrawl v2 zwraca albo { data: [...] } albo { web: [...] }
  const items: any[] = json?.data ?? json?.web ?? json?.results?.web ?? [];

  const parsed: ScrapedListing[] = [];
  for (const it of items) {
    const url: string = it?.url ?? it?.link ?? "";
    const domain = domainOf(url);
    if (!url || !portals.includes(domain)) continue;
    const title: string = it?.title ?? "";
    const description: string = it?.description ?? it?.snippet ?? "";
    const markdown: string = it?.markdown ?? it?.content ?? "";
    const blob = `${title}\n${description}\n${markdown.slice(0, 4000)}`;

    const pricePln = parsePricePln(blob);
    const areaM2 = parseAreaM2(blob);
    const pricePerM2 = pricePln && areaM2 ? Math.round(pricePln / areaM2) : null;

    parsed.push({
      source: domain,
      url,
      title: title.slice(0, 200),
      pricePln,
      areaM2,
      pricePerM2,
      snippet: description ? description.slice(0, 240) : undefined,
      postedBy: classifyPostedBy(blob, domain),
    });
  }

  const ppm2Raw = parsed
    .map((l) => l.pricePerM2)
    .filter((v): v is number => v != null && v > 500 && v < 80_000);
  const ppm2 = filterIqrOutliers(ppm2Raw);
  const median = med(ppm2);
  const average = avg(ppm2);
  const min = ppm2.length ? Math.min(...ppm2) : null;
  const max = ppm2.length ? Math.max(...ppm2) : null;

  return {
    status: parsed.length === 0 ? "no_data" : ppm2.length >= 3 ? "success" : "partial",
    query,
    portals,
    totalFound: items.length,
    used: ppm2.length,
    pricePerM2Median: median != null ? Math.round(median) : null,
    pricePerM2Average: average != null ? Math.round(average) : null,
    pricePerM2Min: min,
    pricePerM2Max: max,
    listings: parsed.slice(0, 15),
  };
}
