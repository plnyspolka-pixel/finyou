// Rozkład prawdopodobieństwa lokalizacji dla kombinacji prefiks × rodzaj
// nieruchomości oraz wielkości pochodne (oczekiwana atrakcyjność, percentyle).
//
// P(lokalizacja_i | prefiks, rodzaj) — wagi normalizowane do sumy 1 (spec §9).
// Ten sam prefiks daje INNY rozkład dla mieszkania, domu i działki, ponieważ
// wagi w `LocationCandidate.weight` pochodzą z property_type_location_weights
// (spec §8) — tu jedynie normalizujemy i agregujemy.

import type { AreaMetrics, LocationCandidate } from "./types";
import { computeBaseAttractiveness } from "./base-attractiveness";
import type { LocationScoringConfig } from "./config";

export type NormalizedLocation = {
  area: AreaMetrics;
  probability: number; // 0–1, suma = 1
  baseAttractiveness: number; // 0–100
};

export type DistributionResult = {
  locations: NormalizedLocation[];
  expectedLocationAttractiveness: number; // 0–100
  probabilityGoodLocation: number; // 0–1
  probabilityUrbanCore: number; // 0–1
  probabilityUrbanOrSuburban: number; // 0–1
  probabilityFua: number; // 0–1
  probabilityRemoteArea: number; // 0–1
  attractivenessP10: number;
  attractivenessMedian: number;
  attractivenessP90: number;
};

/** Normalizuje wagi kandydatów do rozkładu prawdopodobieństwa (suma = 1). */
export function normalizeDistribution(
  candidates: LocationCandidate[],
  config: LocationScoringConfig,
): NormalizedLocation[] {
  const positive = candidates.filter((c) => c.weight > 0 && Number.isFinite(c.weight));
  const total = positive.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) {
    // Brak sensownych wag — rozkład jednostajny (lepsze niż dzielenie przez 0).
    const n = candidates.length || 1;
    return candidates.map((c) => ({
      area: c.area,
      probability: candidates.length ? 1 / n : 0,
      baseAttractiveness: computeBaseAttractiveness(c.area, config),
    }));
  }
  return positive.map((c) => ({
    area: c.area,
    probability: c.weight / total,
    baseAttractiveness: computeBaseAttractiveness(c.area, config),
  }));
}

/** Percentyl rozkładu atrakcyjności (interpolacja po posortowanym CDF). */
function weightedPercentile(sorted: NormalizedLocation[], p: number): number {
  if (sorted.length === 0) return 0;
  let cum = 0;
  for (const loc of sorted) {
    cum += loc.probability;
    if (cum >= p) return loc.baseAttractiveness;
  }
  return sorted[sorted.length - 1].baseAttractiveness;
}

/**
 * Liczy pełny rozkład i wszystkie wielkości pochodne z rozkładu lokalizacji.
 * Nie zależy od DB — działa na już wczytanych kandydatach.
 */
export function computeDistribution(
  candidates: LocationCandidate[],
  config: LocationScoringConfig,
): DistributionResult {
  const locations = normalizeDistribution(candidates, config);

  const expectedLocationAttractiveness = locations.reduce(
    (s, l) => s + l.probability * l.baseAttractiveness,
    0,
  );

  const good = config.goodLocationThreshold;
  const probabilityGoodLocation = locations
    .filter((l) => l.baseAttractiveness >= good)
    .reduce((s, l) => s + l.probability, 0);

  const probabilityUrbanCore = locations
    .filter((l) => l.area.fuaRole === "core" || l.area.isCityAbove100k)
    .reduce((s, l) => s + l.probability, 0);

  const probabilityUrbanOrSuburban = locations
    .filter(
      (l) =>
        l.area.fuaRole === "core" ||
        l.area.fuaRole === "commuting_zone" ||
        l.area.isCityAbove30k ||
        l.area.isAdjacentToCityAbove30k ||
        l.area.isUrbanCluster,
    )
    .reduce((s, l) => s + l.probability, 0);

  const probabilityFua = locations
    .filter((l) => l.area.fuaRole === "core" || l.area.fuaRole === "commuting_zone")
    .reduce((s, l) => s + l.probability, 0);

  const probabilityRemoteArea = locations
    .filter(
      (l) =>
        l.area.fuaRole === "none" &&
        !l.area.isCityAbove30k &&
        !l.area.isAdjacentToCityAbove30k &&
        !l.area.isUrbanCluster,
    )
    .reduce((s, l) => s + l.probability, 0);

  const sorted = [...locations].sort((a, b) => a.baseAttractiveness - b.baseAttractiveness);
  const attractivenessP10 = weightedPercentile(sorted, 0.1);
  const attractivenessMedian = weightedPercentile(sorted, 0.5);
  const attractivenessP90 = weightedPercentile(sorted, 0.9);

  return {
    locations,
    expectedLocationAttractiveness,
    probabilityGoodLocation,
    probabilityUrbanCore,
    probabilityUrbanOrSuburban,
    probabilityFua,
    probabilityRemoteArea,
    attractivenessP10,
    attractivenessMedian,
    attractivenessP90,
  };
}
