// Bazowy potencjał lokalizacyjny obszaru (0–100).
//
// Logarytmiczna normalizacja ludności — różnica 5 tys. ↔ 50 tys. jest ważniejsza
// niż 505 tys. ↔ 550 tys. (spec §7). Wzór i wagi są konfigurowalne.

import type { AreaMetrics, FuaRole } from "./types";
import type { LocationScoringConfig } from "./config";

/** Normalizacja logarytmiczna do przedziału [0, 1]. */
export function logNormalize(value: number, lowerBound: number, upperBound: number): number {
  const normalized =
    (Math.log1p(value) - Math.log1p(lowerBound)) /
    (Math.log1p(upperBound) - Math.log1p(lowerBound));
  return Math.max(0, Math.min(1, normalized));
}

/** Ocena klastra/roli obszaru wg konfiguracji (0–1). */
export function clusterScore(area: AreaMetrics, config: LocationScoringConfig): number {
  const c = config.clusterScores;
  const role: FuaRole = area.fuaRole;
  if (role === "core") return c.fuaCore;
  if (role === "commuting_zone") return c.fuaCommutingZone;
  if (area.isCityAbove30k) return c.cityAbove30k;
  if (area.isAdjacentToCityAbove30k) return c.adjacentToCity30k;
  if (area.isUrbanCluster) return c.urbanCluster;
  return c.other;
}

/**
 * Bazowa atrakcyjność obszaru 0–100 wg wzoru ze spec §7. Uwzględnia strefy
 * podmiejskie i sąsiedztwo dużych miast przez `clusterScore` — dom/działka na
 * wsi tuż przy dużym mieście dostaną wysoką ocenę.
 */
export function computeBaseAttractiveness(
  area: AreaMetrics,
  config: LocationScoringConfig,
): number {
  const b = config.populationBounds;
  const w = config.weights;

  const population10Score = logNormalize(
    area.populationWithin10Km,
    b.within10Km[0],
    b.within10Km[1],
  );
  const population25Score = logNormalize(
    area.populationWithin25Km,
    b.within25Km[0],
    b.within25Km[1],
  );
  const population45Score = logNormalize(
    area.populationWithin45Km,
    b.within45Km[0],
    b.within45Km[1],
  );
  const cluster = clusterScore(area, config);

  const raw =
    w.population10 * population10Score +
    w.population25 * population25Score +
    w.population45 * population45Score +
    w.cluster * cluster;

  return Math.round(100 * raw);
}
