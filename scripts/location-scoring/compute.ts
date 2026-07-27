// ETL — czysta warstwa obliczeniowa (spec §16, kroki 7–11).
//
// Wykonywana OFFLINE podczas importu. Liczy: promienie 10/25/45 km (haversine —
// bez PostGIS), przypisanie FUA/DEGURBA, sąsiedztwo gmin, bazowe oceny obszarów
// oraz wagi rozkładu zależne od rodzaju nieruchomości. Wyniki (gotowe agregaty)
// zapisuje importer do bazy — pojedynczy wniosek nie uruchamia tych obliczeń.
//
// UWAGA: sumowanie ludności po środkach gmin to PRZYBLIŻENIE seed/dev. Produkcja
// używa siatki NSP 2021 (125/250/1000 m) sumowanej po komórkach w promieniu.

import {
  computeBaseAttractiveness,
  DEFAULT_LOCATION_SCORING_CONFIG,
  type AreaMetrics,
  type FuaRole,
} from "../../src/lib/location-scoring/index";

export type SeedGeoUnit = {
  teryt: string;
  name: string;
  unit_type: string;
  parent_teryt: string | null;
  center_lat: number;
  center_lng: number;
  area_km2: number;
  population: number;
  degurba: number;
  is_city_above_30k: boolean;
  is_city_above_100k: boolean;
  is_city_above_250k: boolean;
};

export type FuaEntry = { code: string; role: FuaRole };

/** Odległość haversine w km między dwoma punktami WGS84. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Suma ludności wszystkich jednostek w zadanym promieniu (km). */
export function populationWithin(unit: SeedGeoUnit, all: SeedGeoUnit[], radiusKm: number): number {
  let sum = 0;
  for (const other of all) {
    const d = haversineKm(unit.center_lat, unit.center_lng, other.center_lat, other.center_lng);
    if (d <= radiusKm) sum += other.population;
  }
  return sum;
}

/** Najmniejsza odległość do miasta spełniającego predykat (km) albo null. */
export function distanceToCity(
  unit: SeedGeoUnit,
  all: SeedGeoUnit[],
  predicate: (u: SeedGeoUnit) => boolean,
): number | null {
  let best: number | null = null;
  for (const other of all) {
    if (!predicate(other)) continue;
    const d = haversineKm(unit.center_lat, unit.center_lng, other.center_lat, other.center_lng);
    if (best === null || d < best) best = d;
  }
  return best;
}

export type ComputedMetrics = {
  teryt: string;
  population_within_10km: number;
  population_within_25km: number;
  population_within_45km: number;
  density_per_km2: number;
  is_urban_cluster: boolean;
  fua_code: string | null;
  fua_role: FuaRole;
  distance_to_city_30k_km: number | null;
  distance_to_city_100k_km: number | null;
  distance_to_city_250k_km: number | null;
  is_adjacent_to_city_30k: boolean;
  base_location_attractiveness: number;
  base_config_version: string;
  data_quality: "high" | "medium" | "low";
};

/**
 * Liczy zagregowane metryki obszaru + bazową atrakcyjność. Sąsiedztwo z miastem
 * >30 tys. przybliżamy progiem odległości środków (< ~12 km) — produkcyjnie
 * zastępowane wspólną granicą z tabeli geo_unit_adjacency.
 */
export function computeMetricsFor(
  unit: SeedGeoUnit,
  all: SeedGeoUnit[],
  fua: Record<string, FuaEntry>,
): ComputedMetrics {
  const pop10 = populationWithin(unit, all, 10);
  const pop25 = populationWithin(unit, all, 25);
  const pop45 = populationWithin(unit, all, 45);
  const density = unit.area_km2 > 0 ? unit.population / unit.area_km2 : 0;

  const distTo30k = distanceToCity(unit, all, (u) => u.is_city_above_30k);
  const distTo100k = distanceToCity(unit, all, (u) => u.is_city_above_100k);
  const distTo250k = distanceToCity(unit, all, (u) => u.is_city_above_250k);

  const fuaEntry = fua[unit.teryt];
  const fuaRole: FuaRole = fuaEntry?.role ?? "none";

  const isUrbanCluster = unit.degurba <= 2 || unit.is_city_above_30k;
  // Sąsiedztwo z miastem >30 tys.: środek gminy w promieniu ~12 km od takiego miasta
  // (i sama nie jest tym miastem). Proxy — produkcyjnie: wspólna granica.
  const isAdjacent = !unit.is_city_above_30k && distTo30k !== null && distTo30k <= 12;

  const area: AreaMetrics = {
    geoUnitId: unit.teryt,
    name: unit.name,
    populationWithin10Km: pop10,
    populationWithin25Km: pop25,
    populationWithin45Km: pop45,
    densityPerKm2: density,
    isCityAbove30k: unit.is_city_above_30k,
    isCityAbove100k: unit.is_city_above_100k,
    isCityAbove250k: unit.is_city_above_250k,
    isAdjacentToCityAbove30k: isAdjacent,
    isUrbanCluster,
    fuaRole,
    distanceToCity30kKm: distTo30k,
    distanceToCity100kKm: distTo100k,
    distanceToCity250kKm: distTo250k,
    dataQuality: "medium",
  };

  const base = computeBaseAttractiveness(area, DEFAULT_LOCATION_SCORING_CONFIG);

  return {
    teryt: unit.teryt,
    population_within_10km: pop10,
    population_within_25km: pop25,
    population_within_45km: pop45,
    density_per_km2: Math.round(density * 100) / 100,
    is_urban_cluster: isUrbanCluster,
    fua_code: fuaEntry?.code ?? null,
    fua_role: fuaRole,
    distance_to_city_30k_km: distTo30k,
    distance_to_city_100k_km: distTo100k,
    distance_to_city_250k_km: distTo250k,
    is_adjacent_to_city_30k: isAdjacent,
    base_location_attractiveness: base,
    base_config_version: DEFAULT_LOCATION_SCORING_CONFIG.version,
    data_quality: "medium",
  };
}

export type PropertyWeight = {
  property_type: "apartment" | "house" | "plot";
  teryt: string;
  weight: number;
  source_quality: "high" | "medium" | "low";
};

/**
 * Generuje wagi rozkładu lokalizacji dla mieszkań/domów/działek w obrębie jednego
 * wydziału KW (spec §8). Ten sam prefiks daje INNE rozkłady:
 *   * mieszkanie — silnie do zwartej zabudowy miejskiej (degurba 1),
 *   * dom — strefy podmiejskie/jednorodzinne (degurba 2–3, blisko miasta),
 *   * działka — tereny peryferyjne (degurba 3, powierzchnia) — niska jakość danych
 *     bez ewidencji działek, więc source_quality='low' (obniża confidence).
 */
export function generatePropertyWeights(
  units: SeedGeoUnit[],
  metricsByTeryt: Map<string, ComputedMetrics>,
): PropertyWeight[] {
  const out: PropertyWeight[] = [];

  for (const u of units) {
    const m = metricsByTeryt.get(u.teryt);
    const suburbanBoost =
      m?.is_adjacent_to_city_30k || m?.fua_role === "commuting_zone" ? 1.6 : 1.0;

    // Mieszkanie: proporcjonalne do zwartej zabudowy (degurba 1 dominuje).
    const aptFactor = u.degurba === 1 ? 1.0 : u.degurba === 2 ? 0.3 : 0.05;
    const apartment = u.population * aptFactor;

    // Dom: zabudowa jednorodzinna — miasta średnie + strefy podmiejskie.
    const houseFactor = u.degurba === 1 ? 0.4 : u.degurba === 2 ? 1.0 : 0.7;
    const house = u.population * houseFactor * suburbanBoost;

    // Działka: tereny peryferyjne + powierzchnia (brak ewidencji działek → proxy).
    const plotFactor = u.degurba === 1 ? 0.15 : u.degurba === 2 ? 0.6 : 1.0;
    const plot = (u.population * 0.3 + u.area_km2 * 30) * plotFactor;

    out.push({
      property_type: "apartment",
      teryt: u.teryt,
      weight: apartment,
      source_quality: "medium",
    });
    out.push({ property_type: "house", teryt: u.teryt, weight: house, source_quality: "medium" });
    // Działki: bez danych ewidencyjnych oznaczamy niską jakość (spec §8).
    out.push({ property_type: "plot", teryt: u.teryt, weight: plot, source_quality: "low" });
  }

  return out;
}
