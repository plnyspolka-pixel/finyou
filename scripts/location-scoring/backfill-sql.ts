/**
 * Generator SQL przeliczenia potencjału dla ISTNIEJĄCYCH wniosków (backfill).
 * Liczy wynik dla każdej kombinacji prefiks × rodzaj czystym rdzeniem
 * (scoreLocation) na danych seed-real-1, a następnie emituje:
 *   1) UPDATE loan_applications SET location_* (zasila plakietki wszędzie),
 *   2) INSERT location_scoring_results (zakładka „Lokalizacja" + fallback prefiksu).
 * Join po prefiksie KW i rodzaju nieruchomości — nie wymaga pełnych numerów KW.
 *
 *   bun run scripts/location-scoring/backfill-sql.ts > /tmp/loc-backfill.sql
 */
import { ROWS, areaTerytsFor, DATA_VERSION, JUR_LABEL, buildDataset } from "./real-dataset";
import {
  scoreLocation,
  DEFAULT_LOCATION_SCORING_CONFIG,
  MODEL_VERSION,
  type AreaMetrics,
  type LocationCandidate,
  type PropertyType,
  type ScoringContext,
} from "../../src/lib/location-scoring/index";

const { metricsByTeryt, units, weights } = buildDataset();
const unitByTeryt = new Map(units.map((u) => [u.teryt, u]));

function weightFor(teryt: string, pt: PropertyType): number {
  const w = weights.find((x) => x.teryt === teryt && x.property_type === pt);
  return w ? w.weight : 0;
}

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

const TYPES: PropertyType[] = ["apartment", "house", "plot"];

function scoreFor(prefix: string) {
  const r = ROWS.find((x) => x.prefix === prefix)!;
  const teryts = areaTerytsFor(r);
  return (pt: PropertyType) => {
    // Rozkład na wszystkie obszary wydziału (rdzeń + strefy podmiejskie).
    const candidates: LocationCandidate[] = teryts
      .map((teryt) => ({ area: areaFor(teryt), weight: weightFor(teryt, pt) }))
      .filter((c) => c.weight > 0);
    const ctx: ScoringContext = {
      parsedKw: {
        raw: prefix,
        normalized: `${prefix}/00000000/0`,
        prefix,
        serialNumber: 0,
        serialNumberPadded: "00000000",
        checkDigit: 0,
        formatValid: true,
        checkDigitValid: true,
        isValid: true,
      },
      propertyType: pt,
      court: { prefix, name: r.court, jurisdictionVersion: JUR_LABEL, mappingConfidence: r.conf },
      candidates: candidates.length ? candidates : [{ area: areaFor(teryts[0]), weight: 1 }],
      observations: null,
      serialSignal: null,
      config: DEFAULT_LOCATION_SCORING_CONFIG,
    };
    return scoreLocation(ctx, { now: "2026-07-28T00:00:00.000Z", dataVersion: DATA_VERSION });
  };
}

const sql = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const dbTypes = (pt: PropertyType) =>
  pt === "apartment"
    ? ["mieszkanie"]
    : pt === "house"
      ? ["dom"]
      : ["dzialka_budowlana", "grunt_rolny"];

// Ograniczenie do kombinacji faktycznie występujących we wnioskach (env ALLOW).
const allow = (process.env.ALLOW ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowSet = allow.length ? new Set(allow) : null;

type Combo = ReturnType<ReturnType<typeof scoreFor>> & { prefix: string; ptype: PropertyType };
const combos: Combo[] = [];
for (const r of ROWS) {
  const f = scoreFor(r.prefix);
  for (const pt of TYPES) {
    if (allowSet && !allowSet.has(`${r.prefix}:${pt}`)) continue;
    const res = f(pt);
    if (res.decision === "INVALID_KW" || res.decision === "INSUFFICIENT_DATA") continue;
    combos.push({ ...res, prefix: r.prefix, ptype: pt });
  }
}

// Wspólny predykat dopasowania prefiksu + rodzaju do properties.
function typePred(alias: string, pt: PropertyType): string {
  return `${alias}.property_type IN (${dbTypes(pt).map(sql).join(",")})`;
}

const out: string[] = [];
out.push(`-- Backfill potencjału lokalizacyjnego dla istniejących wniosków (seed-real-1).`);

// 1) UPDATE loan_applications — zasila plakietki wszędzie.
for (const c of combos) {
  out.push(
    `UPDATE public.loan_applications la
     SET location_potential_score=${c.expectedLocationAttractiveness},
         location_confidence_score=${c.confidenceScore},
         location_analysis_priority=${sql(c.decision)},
         location_scoring_status='COMPLETED',
         location_scored_at=now()
     FROM public.properties p
     WHERE p.loan_application_id=la.id
       AND substring(upper(replace(p.land_register_number,' ','')) from '^[A-Z0-9]{4}')=${sql(c.prefix)}
       AND ${typePred("p", c.ptype)};`,
  );
}

// 2) INSERT location_scoring_results — szczegóły w zakładce „Lokalizacja".
for (const c of combos) {
  // Kompaktowe wyjaśnienie (pełne regeneruje się po „Przelicz ponownie").
  const expl = JSON.stringify({
    title: c.explanation.title,
    summary: c.explanation.summary,
    reasons: c.explanation.reasons.slice(0, 2),
    limitations: [c.explanation.limitations[c.explanation.limitations.length - 1]].filter(Boolean),
  });
  out.push(
    `INSERT INTO public.location_scoring_results
     (loan_application_id,kw_prefix,property_type,probability_urban_core,probability_urban_or_suburban,probability_fua,probability_good_location,probability_remote_area,expected_location_attractiveness,analysis_priority_score,confidence_score,attractiveness_p10,attractiveness_median,attractiveness_p90,decision,explanation,params,court_prefix,court_name,jurisdiction_version,model_version,data_version,config_version,status,calculated_at)
     SELECT p.loan_application_id,${sql(c.prefix)},${sql(c.ptype)},${c.probabilityUrbanCore},${c.probabilityUrbanOrSuburban},${c.probabilityFua},${c.probabilityGoodLocation},${c.probabilityRemoteArea},${c.expectedLocationAttractiveness},${c.analysisPriorityScore},${c.confidenceScore},${c.attractivenessP10},${c.attractivenessMedian},${c.attractivenessP90},${sql(c.decision)},${sql(expl)}::jsonb,'{"backfill":true,"dataVersion":"seed-real-1"}'::jsonb,${sql(c.prefix)},${sql(c.courtDepartment.name)},${sql(JUR_LABEL)},${sql(MODEL_VERSION)},${sql(DATA_VERSION)},'cfg-default-1','COMPLETED',now()
     FROM public.properties p JOIN public.loan_applications la ON la.id=p.loan_application_id
     WHERE substring(upper(replace(p.land_register_number,' ','')) from '^[A-Z0-9]{4}')=${sql(c.prefix)}
       AND ${typePred("p", c.ptype)}
       AND NOT EXISTS (SELECT 1 FROM public.location_scoring_results r WHERE r.loan_application_id=p.loan_application_id AND r.data_version=${sql(DATA_VERSION)});`,
  );
}

console.log(out.join("\n"));
