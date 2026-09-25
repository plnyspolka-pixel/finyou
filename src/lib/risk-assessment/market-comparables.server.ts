// PODSTAWOWE źródło cenowe pipeline'u „Ocena ryzyka" — bezpośredni fetch portali
// (real-estate-market.server.ts), bez Firecrawl i bez Perplexity:
//   1) deweloperuch.pl — rzeczywiste ceny TRANSAKCYJNE (RCN); tylko domy i mieszkania,
//   2) otodom.pl, morizon.pl, gratka.pl — aktywne oferty (głównie biura),
//   3) adresowo.pl — oferty bezpośrednie od właścicieli, olx.pl — uzupełnienie (Jina).
// Server-only. Wynik jest podstawą deterministycznej wyceny rynkowej (market-valuation.ts).

import { filterIqrOutliers } from "@/lib/property-analysis/cache.server";
import {
  describePortalSources,
  fetchPortalMarket,
} from "@/lib/property-analysis/real-estate-market.server";
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
  summaryLine: `Rynek porównawczy (portale nieruchomości): ${message}`,
});

// Ceny OFERTOWE (portale) są systematycznie wyższe od TRANSAKCYJNYCH (deweloperuch)
// o kilka procent — to przestrzeń negocjacyjna sprzedającego. Zanim wejdą do
// wspólnej mediany, korygujemy je w dół i dajemy transakcjom większą wagę, żeby
// wycena kotwiczyła się w rzeczywistych cenach zawarcia, nie w cenach wywoławczych.
const OFFER_TO_TRANSACTION_FACTOR = 0.95; // −5% na ofertach z portali
const TRANSACTION_WEIGHT = 3; // 1 transakcja ≈ 3 oferty w medianie
const OFFER_WEIGHT = 1;

interface WeightedPpm2 {
  value: number;
  weight: number;
}

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
 * (deweloperuch) i ofertowych (portale ogłoszeniowe) liczy medianę/kwartyle ważone, z ofertami
 * skorygowanymi w dół i transakcjami o większej wadze. Testowalna bez sieci.
 */
export function computePreferredPpm2(txRaw: number[], offerRaw: number[]): PreferredPpm2Stats {
  const clean = (arr: number[]) =>
    filterIqrOutliers(arr.filter((v) => v != null && v > 10 && v < 100_000));
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

export async function fetchMarketComparables(
  input: MarketComparablesInput,
): Promise<MarketComparablesResult> {
  if (!input.city) return EMPTY("skipped", "brak miasta/miejscowości — pomijam dane rynkowe.");

  const query = [input.street, input.city, input.propertyType].filter(Boolean).join(" ");
  let records: MarketCompRecord[] = [];
  let sourcesNote = "";

  try {
    const market = await fetchPortalMarket({
      propertyType: input.propertyType,
      city: input.city,
      street: input.street,
      voivodeship: input.voivodeship,
    });
    sourcesNote = describePortalSources(market.sources);
    records = market.listings.map((l) => ({
      source: l.source,
      kind: l.kind,
      url: l.url,
      title: l.title,
      address: l.address,
      pricePln: l.pricePln,
      areaM2: l.areaM2,
      pricePerM2: l.pricePerM2,
      date: l.date,
    }));
  } catch (e: any) {
    return EMPTY("error", `Portale nieruchomości: ${e?.message ?? "błąd"}`, query);
  }

  // Statystyki z preferencją transakcji: oferty z portali korygowane w dół
  // (przestrzeń negocjacyjna), transakcje deweloperuch o większej wadze.
  const asPpm2 = (kind: MarketCompRecord["kind"]) =>
    records
      .filter((r) => r.kind === kind)
      .map((r) => r.pricePerM2)
      .filter((v): v is number => v != null);
  const txRaw = asPpm2("transaction");
  const stats = computePreferredPpm2(txRaw, asPpm2("offer"));
  const { median, average, min, max } = stats;
  const transactionsCount = records.filter((r) => r.kind === "transaction").length;
  const offersCount = records.filter((r) => r.kind === "offer").length;

  const status: MarketCompStatus =
    records.length === 0 ? "no_data" : stats.count >= 3 ? "success" : "partial";

  const basisNote =
    txRaw.length > 0
      ? `preferencja transakcji (${transactionsCount} tx ×${TRANSACTION_WEIGHT}, oferty −${Math.round((1 - OFFER_TO_TRANSACTION_FACTOR) * 100)}%)`
      : `wyłącznie oferty (−${Math.round((1 - OFFER_TO_TRANSACTION_FACTOR) * 100)}%)`;
  const offerPortals = [
    ...new Set(records.filter((r) => r.kind === "offer").map((r) => r.source)),
  ].join(", ");
  const summaryLine =
    status === "success" || status === "partial"
      ? `Rynek porównawczy: mediana ${median ? median.toLocaleString("pl-PL") + " zł/m²" : "—"} (${transactionsCount} transakcji deweloperuch, ${offersCount} ofert${offerPortals ? ` — ${offerPortals}` : ""}; ${basisNote})` +
        (input.street ? ` w rejonie ${input.street}, ${input.city}` : ` w ${input.city}`)
      : `Rynek porównawczy (portale nieruchomości): brak danych w ${input.city}${input.street ? `, ${input.street}` : ""}${sourcesNote ? ` [${sourcesNote}]` : ""}.`;

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
    sample: [
      ...records.filter((r) => r.kind === "transaction").slice(0, 6),
      ...records.filter((r) => r.kind === "offer").slice(0, 12),
    ].slice(0, 12),
    summaryLine,
  };
}
