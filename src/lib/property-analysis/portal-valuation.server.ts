// Wycena nieruchomości na podstawie DZISIEJSZYCH danych z portali (deweloperuch,
// otodom, morizon, gratka, adresowo, olx — real-estate-market.server.ts).
// Liczby (mediana/średnia/kwartyle zł/m², zakres wartości) liczymy deterministycznie
// z pobranych ogłoszeń i transakcji; Lovable AI Gateway dostaje te liczby w prompcie
// i dopisuje tylko trend, komentarz o płynności i uzasadnienie — nie zgaduje cen.
// Zastępuje dawną wycenę Perplexity (sonar-pro).

import type { PropertyType, RcnStats } from "./types";
import { average, filterIqrOutliers, median, quartile } from "./cache.server";
import {
  describePortalSources,
  fetchPortalMarket,
  type PortalListing,
} from "./real-estate-market.server";
import { lovableAiJson } from "@/lib/lovable-ai.server";

export interface PortalValuationInput {
  propertyType: PropertyType | string;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  voivodeship?: string | null;
  usableAreaM2?: number | null;
  buildingAreaM2?: number | null;
  landAreaM2?: number | null;
  landAreaHa?: number | null;
  /** Liczba izb/pokoi (z KW). */
  roomCount?: number | null;
  /** Piętro (0 = parter) — z KW. */
  floorPietro?: number | null;
  /** Sposób korzystania / rodzaj nieruchomości opisany w KW. */
  landUse?: string | null;
  /** Parametry i lokalizacja odczytane z księgi wieczystej. */
  parametersFromKw?: boolean;
  declaredPropertyValuePln?: number | null;
}

export interface PortalValuation {
  status: "success" | "no_data" | "error";
  pricePerM2Median: number | null;
  pricePerM2Average: number | null;
  pricePerM2Min: number | null;
  pricePerM2Max: number | null;
  pricePerHa: number | null;
  estimatedValueLowPln: number | null;
  estimatedValueHighPln: number | null;
  marketTrend: "rosnacy" | "stabilny" | "spadkowy" | "nieznany";
  liquidityComment: string;
  rationale: string;
  comparablesFound: number;
  transactionsFound: number;
  /** Portale, z których pochodzą dane, np. „otodom.pl: 36; deweloperuch.pl: 40". */
  sourcesSummary: string;
  citations: string[];
  errorMessage?: string;
}

const MIN_COMPARABLES = 3;
// Ceny ofertowe są zwykle 5–15% wyższe od transakcyjnych — przy braku transakcji
// koryguję ofertową medianę w dół, żeby nie zawyżać zabezpieczenia.
const OFFER_TO_TRANSACTION_FACTOR = 0.95;

const PROPERTY_LABELS: Record<string, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom jednorodzinny",
  lokal_uslugowy: "lokal użytkowy / usługowy",
  dzialka_budowlana: "działka budowlana",
  dzialka_zabudowana: "działka zabudowana",
  grunt_rolny: "grunt rolny",
  inna: "nieruchomość",
};

function emptyResult(status: "no_data" | "error", message: string): PortalValuation {
  return {
    status,
    pricePerM2Median: null,
    pricePerM2Average: null,
    pricePerM2Min: null,
    pricePerM2Max: null,
    pricePerHa: null,
    estimatedValueLowPln: null,
    estimatedValueHighPln: null,
    marketTrend: "nieznany",
    liquidityComment: "",
    rationale: "",
    comparablesFound: 0,
    transactionsFound: 0,
    sourcesSummary: "",
    citations: [],
    errorMessage: message,
  };
}

function round(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

function subjectArea(input: PortalValuationInput, isLand: boolean): number | null {
  if (isLand) return input.landAreaM2 ?? (input.landAreaHa ? input.landAreaHa * 10_000 : null);
  return input.usableAreaM2 ?? input.buildingAreaM2 ?? input.landAreaM2 ?? null;
}

/** Statystyki zł/m² z ogłoszeń i transakcji (transakcje mają pierwszeństwo). */
export function computePortalStats(listings: PortalListing[]): {
  median: number | null;
  average: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
  count: number;
  transactions: number;
} {
  const ppm2 = (kind: PortalListing["kind"]) =>
    filterIqrOutliers(
      listings
        .filter((l) => l.kind === kind)
        .map((l) => l.pricePerM2)
        .filter((v): v is number => v != null && v > 0),
    );
  const tx = ppm2("transaction");
  const offers = ppm2("offer").map((v) => v * OFFER_TO_TRANSACTION_FACTOR);
  // Przy ≥3 transakcjach — to one są podstawą; oferty tylko uzupełniają małe próbki.
  const values = tx.length >= MIN_COMPARABLES ? tx : [...tx, ...offers];
  return {
    median: round(median(values)),
    average: round(average(values)),
    q1: round(quartile(values, 1)),
    q3: round(quartile(values, 3)),
    min: values.length ? Math.round(Math.min(...values)) : null,
    max: values.length ? Math.round(Math.max(...values)) : null,
    count: tx.length + offers.length,
    transactions: tx.length,
  };
}

function buildPrompt(
  input: PortalValuationInput,
  stats: ReturnType<typeof computePortalStats>,
  sample: PortalListing[],
  sourcesSummary: string,
): string {
  const typeLabel = PROPERTY_LABELS[String(input.propertyType)] ?? "nieruchomość";
  const loc = [input.address, input.city, input.voivodeship].filter(Boolean).join(", ") || "Polska";
  const params = [
    input.usableAreaM2 ? `pow. użytkowa ${input.usableAreaM2} m²` : null,
    input.landAreaM2 ? `działka ${input.landAreaM2} m²` : null,
    input.landAreaHa ? `${input.landAreaHa} ha` : null,
    input.roomCount != null ? `${input.roomCount} izb` : null,
    input.floorPietro != null
      ? input.floorPietro === 0
        ? "parter"
        : `${input.floorPietro}. piętro`
      : null,
    input.landUse ? `sposób korzystania: ${input.landUse}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const sampleLines = sample
    .slice(0, 15)
    .map(
      (l) =>
        `- ${l.source} (${l.kind === "transaction" ? "transakcja" : "oferta"}${l.date ? `, ${l.date}` : ""}): ${l.pricePerM2} zł/m²${l.areaM2 ? `, ${l.areaM2} m²` : ""}${l.address ? `, ${l.address}` : ""}`,
    )
    .join("\n");
  return `Jesteś rzeczoznawcą rynku nieruchomości w Polsce. Oceń rynek dla nieruchomości: ${typeLabel}, ${loc}${params ? ` (${params})` : ""}.

DANE POBRANE DZIŚ Z PORTALI (fakty — nie zmieniaj tych liczb):
- źródła: ${sourcesSummary}
- porównań: ${stats.count} (w tym transakcji z aktów notarialnych: ${stats.transactions})
- mediana ${stats.median} zł/m², średnia ${stats.average} zł/m², kwartyle ${stats.q1}–${stats.q3} zł/m²
Próbka:
${sampleLines}

Na podstawie WYŁĄCZNIE tych danych (i ogólnej wiedzy o lokalnym rynku) zwróć JSON:
{
  "marketTrend": "rosnacy" | "stabilny" | "spadkowy" | "nieznany",
  "liquidityComment": "<1–2 zdania o płynności rynku dla tego typu nieruchomości w tej lokalizacji>",
  "rationale": "<2–4 zdania uzasadnienia wyceny z odniesieniem do liczby i rodzaju porównań>"
}`;
}

export async function portalValuation(input: PortalValuationInput): Promise<PortalValuation> {
  if (!input.city)
    return emptyResult("no_data", "Brak miejscowości — nie pobrano danych z portali.");
  const isLand = input.propertyType === "grunt_rolny";

  let market;
  try {
    market = await fetchPortalMarket({
      propertyType: String(input.propertyType),
      city: input.city,
      county: input.county ?? null,
      voivodeship: input.voivodeship ?? null,
    });
  } catch (e: any) {
    return emptyResult("error", e?.message ?? "Błąd pobierania danych z portali.");
  }
  const sourcesSummary = describePortalSources(market.sources);
  const stats = computePortalStats(market.listings);
  if (stats.count < MIN_COMPARABLES || stats.median == null) {
    const allFailed =
      market.sources.length > 0 && market.sources.every((s) => s.status === "error");
    return {
      ...emptyResult(
        allFailed ? "error" : "no_data",
        `Za mało porównań z portali (${stats.count}) — ${sourcesSummary || "brak źródeł"}.`,
      ),
      comparablesFound: stats.count,
      transactionsFound: stats.transactions,
      sourcesSummary,
      citations: market.sourceUrls,
    };
  }

  const area = subjectArea(input, isLand);
  const pricePerHa = isLand ? stats.median * 10_000 : null;
  const estimatedValueLowPln = area && stats.q1 ? Math.round(stats.q1 * area) : null;
  const estimatedValueHighPln = area && stats.q3 ? Math.round(stats.q3 * area) : null;

  const sample = [
    ...market.listings.filter((l) => l.kind === "transaction").slice(0, 7),
    ...market.listings.filter((l) => l.kind === "offer").slice(0, 8),
  ];
  const citations = [
    ...market.sourceUrls,
    ...sample.map((l) => l.url).filter((u): u is string => !!u),
  ].filter((u, i, arr) => arr.indexOf(u) === i);

  let marketTrend: PortalValuation["marketTrend"] = "nieznany";
  let liquidityComment = "";
  let rationale = `Mediana ${stats.median.toLocaleString("pl-PL")} zł/m² z ${stats.count} porównań (${stats.transactions} transakcji). Źródła: ${sourcesSummary}.`;
  try {
    const ai = await lovableAiJson({
      system:
        "Jesteś rzeczoznawcą rynku nieruchomości w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em.",
      user: buildPrompt(input, stats, sample, sourcesSummary),
      temperature: 0.2,
      timeoutMs: 45_000,
    });
    if (["rosnacy", "stabilny", "spadkowy", "nieznany"].includes(ai?.marketTrend)) {
      marketTrend = ai.marketTrend;
    }
    if (typeof ai?.liquidityComment === "string") liquidityComment = ai.liquidityComment;
    if (typeof ai?.rationale === "string" && ai.rationale) rationale = ai.rationale;
  } catch {
    // Komentarz AI jest dodatkiem — liczby z portali zostają.
  }

  return {
    status: "success",
    pricePerM2Median: stats.median,
    pricePerM2Average: stats.average,
    pricePerM2Min: stats.min,
    pricePerM2Max: stats.max,
    pricePerHa,
    estimatedValueLowPln,
    estimatedValueHighPln,
    marketTrend,
    liquidityComment,
    rationale,
    comparablesFound: stats.count,
    transactionsFound: stats.transactions,
    sourcesSummary,
    citations,
  };
}

// Konwertuje wynik wyceny z portali do RcnStats — żeby scoring i offer-text działały bez zmian.
export function portalValuationToRcnStats(p: PortalValuation, isLand: boolean): RcnStats | null {
  if (p.status !== "success") return null;
  const freshness = p.comparablesFound >= 8 ? "good" : p.comparablesFound >= 3 ? "limited" : "weak";
  if (isLand) {
    if (!p.pricePerHa) return null;
    return {
      count: p.comparablesFound,
      median: p.pricePerHa,
      average: p.pricePerHa,
      q1: null,
      q3: null,
      unit: "pln_per_ha",
      radiusM: 0,
      periodMonths: 12,
      freshness,
    };
  }
  if (!p.pricePerM2Median && !p.pricePerM2Average) return null;
  return {
    count: p.comparablesFound,
    median: p.pricePerM2Median ?? p.pricePerM2Average,
    average: p.pricePerM2Average ?? p.pricePerM2Median,
    q1: p.pricePerM2Min,
    q3: p.pricePerM2Max,
    unit: "pln_per_m2",
    radiusM: 0,
    periodMonths: 12,
    freshness,
  };
}
