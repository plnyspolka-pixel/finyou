// Źródło porównawcze dla pipeline'u „Ocena ryzyka":
//   1) deweloperuch.pl — rzeczywiste transakcje (RCN) dla domów/mieszkań przy ulicy i w promieniu,
//   2) otodom.pl — aktywne oferty działek (kiedy typ = działka/grunt).
// Server-only. Uzupełnia RCN/Geoportal (który potrafi milczeć) i GUS BDL (przeciętne).
// Wynik trafia do dossier wyceny nadrzędnej Perplexity oraz do rejestru źródeł.

import { median as med, average as avg, filterIqrOutliers } from "@/lib/property-analysis/cache.server";
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

function parsePricePerM2(text: string): number | null {
  if (!text) return null;
  const m = text.match(/([\d][\d\s.,]{2,})\s*(?:zł|pln)\s*\/?\s*m\s*(?:²|2)/i);
  if (!m) return null;
  const raw = m[1].replace(/[\s.]/g, "").replace(",", ".");
  const n = Number(raw.replace(/\.\d{1,2}$/, ""));
  if (!Number.isFinite(n) || n < 100 || n > 100_000) return null;
  return Math.round(n);
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
    return json?.data ?? json?.web ?? json?.results?.web ?? [];
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

async function scrapeDeweloperuch(apiKey: string, city: string, street: string | null, kind: "domy" | "mieszkania"): Promise<MarketCompRecord[]> {
  const citySlug = slugPl(city);
  // Deweloperuch nie ma stabilnej ścieżki dla ulicy — zaczynamy od widoku miasta i filtrujemy po adresie.
  const urls = [
    `https://deweloperuch.pl/ceny-transakcyjne/polska/${citySlug}/${kind}`,
    `https://deweloperuch.pl/polska/${citySlug}/${kind}`,
    `https://deweloperuch.pl/${citySlug}/${kind}`,
  ];
  for (const url of urls) {
    const md = await firecrawlScrape(apiKey, url);
    if (!md || md.length < 200) continue;
    const rows = parseDeweloperuchTransactions(md, street);
    if (rows.length > 0) return rows;
  }
  return [];
}

async function scrapeOtodomPlots(apiKey: string, city: string, street: string | null): Promise<MarketCompRecord[]> {
  const q = `działka sprzedaż ${street ? street + " " : ""}${city} site:otodom.pl OR site:olx.pl OR site:gratka.pl`;
  const items = await firecrawlSearch(apiKey, q, 15);
  const out: MarketCompRecord[] = [];
  for (const it of items) {
    const url: string = it?.url ?? "";
    if (!/otodom\.pl|olx\.pl|gratka\.pl/.test(url)) continue;
    const title: string = it?.title ?? "";
    const desc: string = it?.description ?? it?.snippet ?? "";
    const md: string = it?.markdown ?? it?.content ?? "";
    const blob = `${title}\n${desc}\n${md.slice(0, 3500)}`;
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
  return out.slice(0, 20);
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
  if (!input.city) return EMPTY("skipped", "brak miasta — pomijam scraping rynku.");

  const t = (input.propertyType || "").toLowerCase();
  const isDom = /dom/.test(t);
  const isMieszkanie = /mieszk|lokal/.test(t);
  const isDzialka = /dzialka|działka|grunt/.test(t);

  const query = [input.street, input.city, isDom ? "dom" : isMieszkanie ? "mieszkanie" : "działka"].filter(Boolean).join(" ");
  const records: MarketCompRecord[] = [];

  try {
    if (isDom || isMieszkanie) {
      const kind = isDom ? "domy" : "mieszkania";
      const rows = await scrapeDeweloperuch(apiKey, input.city, input.street, kind);
      records.push(...rows);
    }
    if (isDzialka || records.length === 0) {
      // Dla działek — Otodom/OLX; dla domów/mieszkań uzupełniająco, gdy deweloperuch milczy.
      if (isDzialka) {
        const rows = await scrapeOtodomPlots(apiKey, input.city, input.street);
        records.push(...rows);
      }
    }
  } catch (e: any) {
    return EMPTY("error", `Firecrawl: ${e?.message ?? "błąd"}`, query);
  }

  const ppm2Raw = records.map((r) => r.pricePerM2).filter((v): v is number => v != null && v > 50 && v < 100_000);
  const ppm2 = filterIqrOutliers(ppm2Raw);
  const median = med(ppm2);
  const average = avg(ppm2);
  const min = ppm2.length ? Math.min(...ppm2) : null;
  const max = ppm2.length ? Math.max(...ppm2) : null;
  const transactionsCount = records.filter((r) => r.kind === "transaction").length;
  const offersCount = records.filter((r) => r.kind === "offer").length;

  const status: MarketCompStatus =
    records.length === 0 ? "no_data" : ppm2.length >= 3 ? "success" : "partial";

  const summaryLine = status === "success" || status === "partial"
    ? `Rynek porównawczy: mediana ${median ? median.toLocaleString("pl-PL") + " zł/m²" : "—"} (${transactionsCount} transakcji, ${offersCount} ofert)` +
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
    sample: records.slice(0, 12),
    summaryLine,
  };
}
