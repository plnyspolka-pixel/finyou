// Test integracyjny ścieżki: dane ETL (seed) → metryki → rozkład prefiks×rodzaj
// → scoring → priorytet. Odpowiada spec §21 (integracja) na warstwie czystej,
// bez Supabase. Weryfikuje kryteria ukończenia (§24): strefy podmiejskie wysoko,
// większe skupiska ludności = wyższy priorytet, różnice mieszkanie/dom/działka.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeMetricsFor,
  generatePropertyWeights,
  type ComputedMetrics,
  type SeedGeoUnit,
  type FuaEntry,
} from "../../../scripts/location-scoring/compute";
import {
  parseKwNumber,
  scoreLocation,
  DEFAULT_LOCATION_SCORING_CONFIG,
  type AreaMetrics,
  type LocationCandidate,
  type ScoringContext,
} from "./index";

type Seed = {
  dataVersion: string;
  departments: Array<{
    prefix: string;
    court_name: string;
    areas: string[];
    mapping_confidence: number;
  }>;
  geoUnits: SeedGeoUnit[];
  fua: Record<string, FuaEntry>;
};

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/location-scoring/seed-data.json"), "utf-8"),
) as Seed;

const units = seed.geoUnits;
const metrics: ComputedMetrics[] = units.map((u) => computeMetricsFor(u, units, seed.fua));
const metricsByTeryt = new Map(metrics.map((m) => [m.teryt, m]));
const weights = generatePropertyWeights(units, metricsByTeryt);
const unitByTeryt = new Map(units.map((u) => [u.teryt, u]));

function areaFor(teryt: string): AreaMetrics {
  const m = metricsByTeryt.get(teryt)!;
  const u = unitByTeryt.get(teryt)!;
  return {
    geoUnitId: teryt,
    name: u.name,
    populationWithin10Km: m.population_within_10km,
    populationWithin25Km: m.population_within_25km,
    populationWithin45Km: m.population_within_45km,
    densityPerKm2: m.density_per_km2,
    isCityAbove30k: u.is_city_above_30k,
    isCityAbove100k: u.is_city_above_100k,
    isCityAbove250k: u.is_city_above_250k,
    isAdjacentToCityAbove30k: m.is_adjacent_to_city_30k,
    isUrbanCluster: m.is_urban_cluster,
    fuaRole: m.fua_role,
    distanceToCity30kKm: m.distance_to_city_30k_km,
    distanceToCity100kKm: m.distance_to_city_100k_km,
    distanceToCity250kKm: m.distance_to_city_250k_km,
    dataQuality: "medium",
  };
}

function candidatesFor(
  prefix: string,
  propertyType: "apartment" | "house" | "plot",
): LocationCandidate[] {
  const dept = seed.departments.find((d) => d.prefix === prefix)!;
  const inScope = new Set(dept.areas);
  return weights
    .filter((w) => w.property_type === propertyType && inScope.has(w.teryt))
    .map((w) => ({ area: areaFor(w.teryt), weight: w.weight }));
}

function scoreFor(prefix: string, propertyType: "apartment" | "house" | "plot") {
  const dept = seed.departments.find((d) => d.prefix === prefix)!;
  const ctx: ScoringContext = {
    parsedKw: { ...parseKwNumber(`${prefix}/00000001/1`), formatValid: true },
    propertyType,
    court: {
      prefix,
      name: dept.court_name,
      jurisdictionVersion: "2026.1-seed",
      mappingConfidence: dept.mapping_confidence,
    },
    candidates: candidatesFor(prefix, propertyType),
    observations: null,
    serialSignal: null,
    config: DEFAULT_LOCATION_SCORING_CONFIG,
  };
  return scoreLocation(ctx, { now: "2026-07-25T00:00:00.000Z", dataVersion: seed.dataVersion });
}

describe("ETL compute (haversine, radii, base scores)", () => {
  it("rdzeń dużego miasta ma najwyższą bazową atrakcyjność", () => {
    const warsaw = metricsByTeryt.get("1465011")!;
    const remote = metricsByTeryt.get("1425072")!; // Przytyk
    expect(warsaw.base_location_attractiveness).toBeGreaterThan(
      remote.base_location_attractiveness,
    );
    expect(warsaw.population_within_10km).toBeGreaterThan(remote.population_within_10km);
  });

  it("gmina podmiejska otrzymuje wysoką bazę (nie karana za granicę miasta)", () => {
    const piaseczno = metricsByTeryt.get("1418052")!; // strefa dojazdowa Warszawy
    expect(piaseczno.fua_role).toBe("commuting_zone");
    expect(piaseczno.base_location_attractiveness).toBeGreaterThanOrEqual(55);
  });
});

describe("scoring end-to-end z danych seed", () => {
  it("większe skupisko ludności → wyższy priorytet analizy", () => {
    const wa = scoreFor("WA1M", "apartment"); // aglomeracja warszawska
    const ra = scoreFor("RA1R", "apartment"); // Radom + wieś
    expect(wa.analysisPriorityScore).toBeGreaterThan(ra.analysisPriorityScore);
    expect(wa.decision).toBe("AUTO_ANALYZE_HIGH");
  });

  it("ten sam prefiks daje różne wyniki dla mieszkania/domu/działki", () => {
    const apt = scoreFor("RA1R", "apartment");
    const house = scoreFor("RA1R", "house");
    const plot = scoreFor("RA1R", "plot");
    // Mieszkania mocniej w rdzeniu miejskim niż działki.
    expect(apt.probabilityUrbanCore).toBeGreaterThan(plot.probabilityUrbanCore);
    // Trzy różne oczekiwane atrakcyjności (rozkłady się różnią).
    const set = new Set([
      apt.expectedLocationAttractiveness,
      house.expectedLocationAttractiveness,
      plot.expectedLocationAttractiveness,
    ]);
    expect(set.size).toBeGreaterThan(1);
  });

  it("działki mają obniżoną jakość danych (source_quality=low → niższa pewność)", () => {
    const plotWeights = weights.filter((w) => w.property_type === "plot");
    expect(plotWeights.every((w) => w.source_quality === "low")).toBe(true);
  });

  it("wynik zawsze zawiera wersję danych i model (audyt)", () => {
    const r = scoreFor("KR1P", "house");
    expect(r.dataVersion).toBe(seed.dataVersion);
    expect(r.modelVersion).toBeTruthy();
    expect(r.decision).not.toBe("INVALID_KW");
  });
});
