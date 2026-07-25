// PODSTAWOWE źródło cenowe pipeline'u „Ocena ryzyka" (scraping przez Firecrawl v2):
//   1) deweloperuch.pl — rzeczywiste ceny transakcyjne; scraping po mieście/miejscowości
//      + rodzaju nieruchomości (deweloperuch obsługuje wyłącznie DOMY i MIESZKANIA),
//   2) otodom.pl — aktywne oferty sprzedaży; tutaj MIESZKANIA, DOMY i DZIAŁKI.
// Server-only. Wynik jest podstawą deterministycznej wyceny rynkowej
// (market-valuation.ts) — bez udziału Perplexity.

import { filterIqrOutliers } from "@/lib/property-analysis/cache.server";
import type { MarketComparablesResult, MarketCompRecord, MarketCompStatus } from "./types";

export type { MarketComparablesResult, MarketCompRecord, MarketCompStatus } from "./types";


const EMPTY = (status: MarketCompStatus, message: string, query = ""): MarketComparablesResult => ({
  status,
  message,
  query,
  city: null,
  street: null,
  transactionsCount: 0,
  offersCount: 0,
  pricePerM2Median: null,
  pricePerM2Average: null,
  pricePerM2Min: null,
  pricePerM2Max: null,
  pricePerM2P25: null,
  pricePerM2P75: null,
  sample: [],
  summaryLine: `Rynek porównawczy (deweloperuch/otodom): ${message}`,
});

function slugPl(s: string): string {
  const map: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  return s.toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => map[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parsePricePln(text: string): number | null {
  if (!text) return null;
  const m = text.match(/([\d][\d\s.,]{3,})\s*(zł|pln)\b/i);
  if (!m) return null;
  const raw = m[1].replace(/[\s.]/g, "").replace(",", ".");
  const n = Number(raw.replace(/\.\d{1,2}$/, ""));
  if (!Number.isFinite(n) || n < 5_000 || n > 200_000_000) return null;
  return Math.round(n);
}

function parseAreaM2(text: string): number | null {
  if (!text) return null;
  const m = text.match(/([\d]+(?:[.,]\d{1,2})?)\s*m\s*(?:²|2)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n < 8 || n > 500_000) return null;
  return n;
}

const PRICE_PER_M2_RE = /([\d][\d\s.,]{2,})\s*(?:zł|pln)\s*\/?\s*m\s*(?:²|2)/gi;

function normalizePpm2(raw: string): number | null {
  const n = Number(raw.replace(/[\s.]/g, "").replace(",", ".").replace(/\.\d{1,2}$/, ""));
  if (!Number.isFinite(n) || n < 10 || n > 100_000) return null;
  return Math.round(n);
}

function parsePricePerM2(text: string): number | null {
  if (!text) return null;
  PRICE_PER_M2_RE.lastIndex = 0;
  const m = PRICE_PER_M2_RE.exec(text);
  return m ? normalizePpm2(m[1]) : null;
}

/** Wszystkie ceny zł/m² z tekstu (np. strona wyników otodom z wieloma ofertami). */
function parseAllPricesPerM2(text: string, max = 10): number[] {
  if (!text) return [];
  const out: number[] = [];
  PRICE_PER_M2_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRICE_PER_M2_RE.exec(text)) !== null && out.length < max) {
    const v = normalizePpm2(m[1]);
    if (v != null) out.push(v);
  }
  return out;
}

async function firecrawlSearch(apiKey: string, query: string, limit = 12): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
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
    if (!res.ok) return [];
    const json: any = await res.json().catch(() => null);
    // Firecrawl v2 /search zwraca { data: { web: [...] } } — `data` bywa OBIEKTEM,
    // nie tablicą (wcześniej wywalało "items is not iterable").
    const candidates = [json?.data?.web, json?.data, json?.web, json?.results?.web];
    for (const c of candidates) if (Array.isArray(c)) return c;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function firecrawlScrape(apiKey: string, url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    return json?.data?.markdown ?? json?.markdown ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Parsowanie tabeli transakcji z markdown deweloperuch.pl. Rekordy w tabeli mają
// format: data | adres | m² użytk. | m² zabudowy | działka | cena.
function parseDeweloperuchTransactions(markdown: string, streetFilter?: string | null): MarketCompRecord[] {
  const out: MarketCompRecord[] = [];
  const lines = markdown.split("\n");
  const streetLc = streetFilter ? streetFilter.toLowerCase() : null;
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    // Szukaj daty i ceny w komórkach.
    const dateCell = cells.find((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c));
    const priceCell = cells.find((c) => /zł|pln/i.test(c) || /^\d[\d\s.,]{4,}$/.test(c));
    if (!dateCell) continue;
    const addressCell = cells.find((c) => /^ul\.|^al\.|^pl\./i.test(c) || /\d+\w?$/.test(c));
    if (streetLc && addressCell && !addressCell.toLowerCase().includes(streetLc)) continue;
    const areaCell = cells.find((c) => /m\s*(?:²|2)/i.test(c));
    const price = priceCell ? parsePricePln(priceCell) : null;
    const area = areaCell ? parseAreaM2(areaCell) : null;
    const ppm2 = price && area ? Math.round(price / area) : null;
    if (!price && !ppm2) continue;
    out.push({
      source: "deweloperuch.pl",
      kind: "transaction",
      url: null,
      title: addressCell ?? null,
      address: addressCell ?? null,
      pricePln: price,
      areaM2: area,
      pricePerM2: ppm2,
      date: dateCell,
    });
  }
  return out.slice(0, 40);
}

// Strona statystyk deweloperuch — gotowa mediana transakcyjna dla miasta.
// Zwraca pojedynczy rekord-kotwicę (mediana zł/m² z RCN), gdy tabela transakcji milczy.
function parseDeweloperuchStats(markdown: string, citySlug: string): MarketCompRecord[] {
  const median = markdown.match(/median\w*[^0-9]{0,60}?([\d][\d\s.,]{2,})\s*(?:zł|pln)\s*\/?\s*m\s*(?:²|2)/i);
  const ppm2 = median ? normalizePpm2(median[1]) : null;
  if (ppm2 == null) return [];
  const txCountM = markdown.match(/(\d{1,5})\s+transakcj/i);
  return [{
    source: "deweloperuch.pl",
    kind: "transaction",
    url: null,
    title: `mediana transakcyjna (statystyki${txCountM ? `, ${txCountM[1]} transakcji` : ""})`,
    address: citySlug,
    pricePln: null,
    areaM2: null,
    pricePerM2: ppm2,
    date: null,
  }];
}

// Deweloperuch: scraping miasto/miejscowość + rodzaj (tylko „domy" i „mieszkania").
// Realne ścieżki serwisu: /ceny-transakcyjne/{miasto}/{rodzaj} (tabela transakcji)
// oraz /statystyki/ceny-transakcyjne/{rodzaj}/{miasto} (mediana z RCN).
async function scrapeDeweloperuch(apiKey: string, city: string, street: string | null, kind: "domy" | "mieszkania"): Promise<MarketCompRecord[]> {
  const citySlug = slugPl(city);
  // Deweloperuch nie ma stabilnej ścieżki dla ulicy — zaczynamy od widoku miasta i filtrujemy po adresie.
  const tableUrls = [
    `https://deweloperuch.pl/ceny-transakcyjne/${citySlug}/${kind}`,
    `https://deweloperuch.pl/ceny-transakcyjne/polska/${citySlug}/${kind}`,
  ];
  for (const url of tableUrls) {
    const md = await firecrawlScrape(apiKey, url);
    if (!md || md.length < 200) continue;
    const rows = parseDeweloperuchTransactions(md, street);
    if (rows.length > 0) return rows;
  }
  // Fallback: strona statystyk z medianą transakcyjną dla miasta.
  const statsMd = await firecrawlScrape(apiKey, `https://deweloperuch.pl/statystyki/ceny-transakcyjne/${kind}/${citySlug}`);
  if (statsMd && statsMd.length >= 200) return parseDeweloperuchStats(statsMd, citySlug);
  return [];
}

// Otodom: aktywne oferty sprzedaży — mieszkania, domy i działki.
// Firecrawl search ograniczony do otodom.pl; strony wyników („/wyniki/") niosą
// wiele cen zł/m² naraz, strony ofert („/oferta/") — pojedynczą cenę + metraż.
// UWAGA: bez ulicy w zapytaniu — dla małych miejscowości zawężenie do ulicy
// praktycznie zawsze daje 0 wyników; ulica służy tylko do filtrowania tabel.
async function scrapeOtodomOffers(apiKey: string, city: string, voivodeship: string | null, label: string, limit = 15): Promise<MarketCompRecord[]> {
  let items = await firecrawlSearch(apiKey, `${label} na sprzedaż ${city} site:otodom.pl`, limit);
  if (!items.some((it: any) => /otodom\.pl/.test(it?.url ?? ""))) {
    // Fallback: bez operatora site: (bywa ignorowany), z województwem dla jednoznaczności.
    items = await firecrawlSearch(apiKey, `otodom ${label} na sprzedaż ${city}${voivodeship ? " " + voivodeship : ""}`, limit);
  }
  const out: MarketCompRecord[] = [];
  for (const it of items) {
    const url: string = it?.url ?? "";
    if (!/otodom\.pl/.test(url)) continue;
    const title: string = it?.title ?? "";
    const desc: string = it?.description ?? it?.snippet ?? "";
    const md: string = it?.markdown ?? it?.content ?? "";
    const blob = `${title}\n${desc}\n${md.slice(0, 6000)}`;

    if (/\/wyniki\//.test(url)) {
      // Strona z listą ofert — zbierz wszystkie ceny zł/m² (do 10 z jednej strony).
      for (const ppm2 of parseAllPricesPerM2(md.slice(0, 12_000))) {
        out.push({
          source: "otodom.pl", kind: "offer", url, title: title.slice(0, 200),
          address: null, pricePln: null, areaM2: null, pricePerM2: ppm2, date: null,
        });
      }
      continue;
    }

    const price = parsePricePln(blob);
    const area = parseAreaM2(blob);
    const ppm2Explicit = parsePricePerM2(blob);
    const ppm2 = ppm2Explicit ?? (price && area ? Math.round(price / area) : null);
    if (!ppm2) continue;
    out.push({
      source: "otodom.pl",
      kind: "offer",
      url,
      title: title.slice(0, 200),
      address: null,
      pricePln: price,
      areaM2: area,
      pricePerM2: ppm2,
      date: null,
    });
  }
  return out.slice(0, 30);
}

// Etykieta zapytania otodom wg typu nieruchomości z wniosku.
function otodomLabel(propertyType: string): string | null {
  const t = (propertyType || "").toLowerCase();
  if (/mieszk/.test(t)) return "mieszkanie";
  if (/dom/.test(t)) return "dom";
  if (/dzialka|działka|grunt|siedlisk/.test(t)) return "działka";
  if (/lokal/.test(t)) return "lokal użytkowy";
  return null;
}

// Ceny OFERTOWE (otodom) są systematycznie wyższe od TRANSAKCYJNYCH (deweloperuch)
// o kilka procent — to przestrzeń negocjacyjna sprzedającego. Zanim wejdą do
// wspólnej mediany, korygujemy je w dół i dajemy transakcjom większą wagę, żeby
// wycena kotwiczyła się w rzeczywistych cenach zawarcia, nie w cenach wywoławczych.
const OFFER_TO_TRANSACTION_FACTOR = 0.95; // −5% na ofertach otodom
const TRANSACTION_WEIGHT = 3;             // 1 transakcja ≈ 3 oferty w medianie
const OFFER_WEIGHT = 1;

interface WeightedPpm2 { value: number; weight: number }

// Kwantyl ważony (mediana = q 0.5): sortuje po wartości i szuka miejsca, w którym
// skumulowana waga przekracza q·(suma wag).
function weightedQuantile(items: WeightedPpm2[], q: number): number | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, it) => s + it.weight, 0);
  if (total <= 0) return null;
  const target = total * q;
  let acc = 0;
  for (const it of sorted) {
    acc += it.weight;
    if (acc >= target) return Math.round(it.value);
  }
  return Math.round(sorted[sorted.length - 1].value);
}

function weightedMean(items: WeightedPpm2[]): number | null {
  const total = items.reduce((s, it) => s + it.weight, 0);
  if (total <= 0) return null;
  return Math.round(items.reduce((s, it) => s + it.value * it.weight, 0) / total);
}

export interface PreferredPpm2Stats {
  median: number | null;
  average: number | null;
  min: number | null;
  max: number | null;
  p25: number | null;
  p75: number | null;
  /** Liczba wartości po korekcie i filtrze (transakcje + oferty). */
  count: number;
}

/**
 * Czysta logika „preferencji transakcji": z surowych cen zł/m² transakcyjnych
 * (deweloperuch) i ofertowych (otodom) liczy medianę/kwartyle ważone, z ofertami
 * skorygowanymi w dół i transakcjami o większej wadze. Testowalna bez sieci.
 */
export function computePreferredPpm2(txRaw: number[], offerRaw: number[]): PreferredPpm2Stats {
  const clean = (arr: number[]) => filterIqrOutliers(arr.filter((v) => v != null && v > 10 && v < 100_000));
  const txPpm2 = clean(txRaw);
  const offerPpm2 = clean(offerRaw).map((v) => Math.round(v * OFFER_TO_TRANSACTION_FACTOR));
  const weighted: WeightedPpm2[] = [
    ...txPpm2.map((value) => ({ value, weight: TRANSACTION_WEIGHT })),
    ...offerPpm2.map((value) => ({ value, weight: OFFER_WEIGHT })),
  ];
  const values = weighted.map((w) => w.value);
  return {
    median: weightedQuantile(weighted, 0.5),
    average: weightedMean(weighted),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    p25: weightedQuantile(weighted, 0.25),
    p75: weightedQuantile(weighted, 0.75),
    count: values.length,
  };
}

export interface MarketComparablesInput {
  propertyType: string;
  city: string | null;
  street: string | null;
  voivodeship: string | null;
}

export async function fetchMarketComparables(input: MarketComparablesInput): Promise<MarketComparablesResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return EMPTY("error", "Brak FIRECRAWL_API_KEY.");
  if (!input.city) return EMPTY("skipped", "brak miasta/miejscowości — pomijam scraping rynku.");

  const t = (input.propertyType || "").toLowerCase();
  const isDom = /dom/.test(t);
  const isMieszkanie = /mieszk/.test(t) || (/lokal/.test(t) && /mieszk/.test(t));
  const label = otodomLabel(input.propertyType);

  const query = [input.street, input.city, label ?? input.propertyType].filter(Boolean).join(" ");
  const records: MarketCompRecord[] = [];

  try {
    // 1) deweloperuch.pl — wyłącznie domy i mieszkania (rzeczywiste transakcje).
    const deweloperuchP = (isDom || isMieszkanie)
      ? scrapeDeweloperuch(apiKey, input.city, input.street, isDom ? "domy" : "mieszkania")
      : Promise.resolve<MarketCompRecord[]>([]);
    // 2) otodom.pl — mieszkania, domy i działki (aktywne oferty).
    const otodomP = label
      ? scrapeOtodomOffers(apiKey, input.city, input.voivodeship, label)
      : Promise.resolve<MarketCompRecord[]>([]);

    const [trans, offers] = await Promise.all([deweloperuchP, otodomP]);
    records.push(...trans, ...offers);
  } catch (e: any) {
    return EMPTY("error", `Firecrawl: ${e?.message ?? "błąd"}`, query);
  }

  // Statystyki z preferencją transakcji: oferty otodom korygowane w dół
  // (przestrzeń negocjacyjna), transakcje deweloperuch o większej wadze.
  const asPpm2 = (kind: MarketCompRecord["kind"]) =>
    records.filter((r) => r.kind === kind)
      .map((r) => r.pricePerM2)
      .filter((v): v is number => v != null);
  const txRaw = asPpm2("transaction");
  const stats = computePreferredPpm2(txRaw, asPpm2("offer"));
  const { median, average, min, max } = stats;
  const transactionsCount = records.filter((r) => r.kind === "transaction").length;
  const offersCount = records.filter((r) => r.kind === "offer").length;

  const status: MarketCompStatus =
    records.length === 0 ? "no_data" : stats.count >= 3 ? "success" : "partial";

  const basisNote = txRaw.length > 0
    ? `preferencja transakcji (${transactionsCount} tx ×${TRANSACTION_WEIGHT}, oferty −${Math.round((1 - OFFER_TO_TRANSACTION_FACTOR) * 100)}%)`
    : `wyłącznie oferty (−${Math.round((1 - OFFER_TO_TRANSACTION_FACTOR) * 100)}%)`;
  const summaryLine = status === "success" || status === "partial"
    ? `Rynek porównawczy: mediana ${median ? median.toLocaleString("pl-PL") + " zł/m²" : "—"} (${transactionsCount} transakcji deweloperuch, ${offersCount} ofert otodom; ${basisNote})` +
      (input.street ? ` w rejonie ${input.street}, ${input.city}` : ` w ${input.city}`)
    : `Rynek porównawczy (deweloperuch/otodom): brak danych w ${input.city}${input.street ? `, ${input.street}` : ""}.`;

  return {
    status,
    message: status === "success" ? "OK" : status === "partial" ? "częściowe dane" : "brak danych",
    query,
    city: input.city,
    street: input.street,
    transactionsCount,
    offersCount,
    pricePerM2Median: median != null ? Math.round(median) : null,
    pricePerM2Average: average != null ? Math.round(average) : null,
    pricePerM2Min: min,
    pricePerM2Max: max,
    pricePerM2P25: stats.p25,
    pricePerM2P75: stats.p75,
    sample: records.slice(0, 12),
    summaryLine,
  };
}
