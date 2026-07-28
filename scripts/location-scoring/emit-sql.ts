/**
 * Generator SQL rozszerzonego seeda (spec §16) — pokrycie prefiksów, których
 * FAKTYCZNIE używają wnioski w bazie. Wypisuje IDEMPOTENTNY SQL (UPSERT) dla
 * tabel referencyjnych, do wykonania na produkcji.
 *
 * DANE PRZYBLIŻONE (seed-real-1) — miasto-siedziba sądu per prefiks + realne
 * przybliżone populacje/współrzędne. NIE są to pełne dane GUS/TERYT; mapowanie
 * sądów jest best-effort (mapping_confidence poniżej). Do zastąpienia oficjalnym
 * importem MS + GUS.
 *
 *   bun run scripts/location-scoring/emit-sql.ts > /tmp/loc-seed.sql
 */
import { ROWS, terytFor, DATA_VERSION, JUR_LABEL, buildDataset } from "./real-dataset";

function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

const { units, metrics, weights } = buildDataset();

const out: string[] = [];
out.push(`-- Rozszerzony seed (${DATA_VERSION}) — dane PRZYBLIŻONE, best-effort mapowanie sądów.`);

// 1) Wersja właściwości.
out.push(
  `INSERT INTO public.kw_jurisdiction_versions (version_label, source, valid_from, fetched_at, is_active)
   VALUES (${sqlStr(JUR_LABEL)}, ${sqlStr("SEED-REAL (przybliżenie)")}, '2026-01-01', now(), true)
   ON CONFLICT (version_label) DO UPDATE SET is_active=true;`,
);

// 2) geo_units (multi-row).
out.push(
  `INSERT INTO public.geo_units (teryt,name,unit_type,parent_teryt,center_lat,center_lng,area_km2,population,degurba,is_city_above_30k,is_city_above_100k,is_city_above_250k,data_version,source) VALUES\n` +
    units
      .map(
        (u) =>
          `(${sqlStr(u.teryt)},${sqlStr(u.name)},'municipality',NULL,${u.center_lat},${u.center_lng},${u.area_km2},${u.population},${u.degurba},${u.is_city_above_30k},${u.is_city_above_100k},${u.is_city_above_250k},${sqlStr(DATA_VERSION)},'SEED-REAL')`,
      )
      .join(",\n") +
    `\nON CONFLICT (teryt,data_version) DO UPDATE SET population=EXCLUDED.population, is_city_above_30k=EXCLUDED.is_city_above_30k, is_city_above_100k=EXCLUDED.is_city_above_100k, is_city_above_250k=EXCLUDED.is_city_above_250k;`,
);

// 3) geo_unit_location_metrics (multi-row).
out.push(
  `INSERT INTO public.geo_unit_location_metrics (teryt,data_version,population_within_10km,population_within_25km,population_within_45km,density_per_km2,is_urban_cluster,fua_code,fua_role,distance_to_city_30k_km,distance_to_city_100k_km,distance_to_city_250k_km,is_adjacent_to_city_30k,base_location_attractiveness,base_config_version,data_quality) VALUES\n` +
    metrics
      .map(
        (m) =>
          `(${sqlStr(m.teryt)},${sqlStr(DATA_VERSION)},${m.population_within_10km},${m.population_within_25km},${m.population_within_45km},${m.density_per_km2},${m.is_urban_cluster},${m.fua_code ? sqlStr(m.fua_code) : "NULL"},${sqlStr(m.fua_role)},${m.distance_to_city_30k_km ?? "NULL"},${m.distance_to_city_100k_km ?? "NULL"},${m.distance_to_city_250k_km ?? "NULL"},${m.is_adjacent_to_city_30k},${m.base_location_attractiveness},${sqlStr(m.base_config_version)},'medium')`,
      )
      .join(",\n") +
    `\nON CONFLICT (teryt,data_version) DO UPDATE SET base_location_attractiveness=EXCLUDED.base_location_attractiveness, population_within_10km=EXCLUDED.population_within_10km, population_within_25km=EXCLUDED.population_within_25km, population_within_45km=EXCLUDED.population_within_45km, fua_role=EXCLUDED.fua_role;`,
);

// 4) departamenty (jeden set-based INSERT).
out.push(
  `INSERT INTO public.kw_court_departments (prefix,court_name,department_name,jurisdiction_version_id,mapping_confidence,source,fetched_at)\n` +
    `SELECT t.prefix, t.court, NULL, v.id, t.conf, 'SEED-REAL', now()\n` +
    `FROM (VALUES\n` +
    ROWS.map((r) => `(${sqlStr(r.prefix)},${sqlStr(r.court)},${r.conf})`).join(",\n") +
    `\n) t(prefix,court,conf) CROSS JOIN public.kw_jurisdiction_versions v WHERE v.version_label=${sqlStr(JUR_LABEL)}\n` +
    `ON CONFLICT (prefix,jurisdiction_version_id) DO UPDATE SET court_name=EXCLUDED.court_name, mapping_confidence=EXCLUDED.mapping_confidence;`,
);

// 5) obszary właściwości (jeden set-based INSERT).
out.push(
  `INSERT INTO public.kw_jurisdiction_areas (department_id,teryt,jurisdiction_role,confidence,source)\n` +
    `SELECT d.id, t.teryt, 'current', t.conf, 'SEED-REAL'\n` +
    `FROM (VALUES\n` +
    ROWS.map((r) => `(${sqlStr(r.prefix)},${sqlStr(terytFor(r))},${r.conf})`).join(",\n") +
    `\n) t(prefix,teryt,conf)\n` +
    `JOIN public.kw_court_departments d ON d.prefix=t.prefix\n` +
    `JOIN public.kw_jurisdiction_versions v ON v.id=d.jurisdiction_version_id AND v.version_label=${sqlStr(JUR_LABEL)}\n` +
    `ON CONFLICT (department_id,teryt,jurisdiction_role,valid_from) DO NOTHING;`,
);

// 6) wagi rodzaju (jeden set-based INSERT). Prefiks→teryt jego wydziału.
const prefixTeryt = new Map(ROWS.map((r) => [r.prefix, terytFor(r)]));
const weightVals: string[] = [];
for (const r of ROWS) {
  const teryt = prefixTeryt.get(r.prefix)!;
  for (const w of weights.filter((x) => x.teryt === teryt)) {
    weightVals.push(
      `(${sqlStr(r.prefix)},${sqlStr(w.property_type)},${sqlStr(teryt)},${w.weight},${sqlStr(w.source_quality)},${sqlStr(DATA_VERSION)})`,
    );
  }
}

if (weightVals.length > 0) {
  out.push(
    `INSERT INTO public.property_type_location_weights (prefix,property_type,teryt,weight,source_quality,data_version) VALUES\n` +
      weightVals.join(",\n") +
      `\nON CONFLICT (prefix,property_type,teryt,data_version) DO UPDATE SET weight=EXCLUDED.weight;`,
  );
}

// eslint-disable-next-line no-console
console.log(out.join("\n"));
