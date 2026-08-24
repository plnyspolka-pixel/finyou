/**
 * Generator PEŁNEJ warstwy referencyjnej scoringu lokalizacyjnego
 * (data_version = ms-teryt-2026-1) — wszystkie prefiksy KW × wszystkie gminy.
 *
 * ŹRÓDŁA (w repo, katalog data/):
 *   data/ms-kw-prefiksy-2026.json
 *     – kompletna mapa właściwości wydziałów KW → TERYT gmin, przygotowana z
 *       Rozporządzenia MS z 29.05.2026 (Dz.U. 2026 poz. 740, zał. 1; obowiązuje
 *       od 2026-07-01). 342 prefiksy, 2891 obszarów, mapping_confidence per wpis.
 *   data/lau-centres-pl-2020.csv
 *     – EDJNet lau_centres (https://github.com/EDJNet/lau_centres, CC-BY;
 *       Eurostat GISCO LAU 2020 + siatka ludności): TERYT6 gminy, ludność,
 *       powierzchnia, populacyjnie ważony środek (WGS84). 2477 gmin.
 *
 * Klucz TERYT: 6 cyfr (WW PP GG, bez cyfry rodzaju) — części miejska/wiejska
 * gmin miejsko-wiejskich są scalane do jednej jednostki LAU.
 *
 * PRZYBLIŻENIA (do zastąpienia pełnym ETL GUS — gus-import.ts):
 *   - DEGURBA: heurystyka ludność/gęstość (Eurostat CSV niedostępny offline),
 *   - FUA: rdzeń = miasto ≥100 tys.; strefa dojazdu = gmina blisko rdzenia
 *     (≤25 km od miasta ≥250 tys., ≤15 km od miasta ≥100 tys.),
 *   - promienie ludności: sumowanie po środkach gmin (nie po siatce NSP).
 *
 * Wyjście: idempotentny SQL (UPSERT) na stdout — do migracji Supabase:
 *   npx tsx scripts/location-scoring/ms-teryt-import.ts > /tmp/ms-teryt.sql
 * Raport jakości na stderr.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeMetricsFor,
  generatePropertyWeights,
  haversineKm,
  type FuaEntry,
  type SeedGeoUnit,
} from "./compute";

export const DATA_VERSION = "ms-teryt-2026-1";
export const JUR_LABEL = "2026.1-ms";
const DATA_DIR = resolve(import.meta.dirname ?? __dirname, "data");

// ── Wejście: mapa MS (bogaty format z areas jako obiektami) ──────────────────
type MsArea = { type: string; name: string; teryt: string; partial: boolean };
type MsEntry = {
  prefix: string;
  court_name: string;
  department_name: string | null;
  mapping_confidence: number;
  source: string;
  areas: MsArea[];
};

/** „Sądzie Rejonowym w X" (miejscownik ze źródła) → „Sąd Rejonowy w X". */
function courtNominative(name: string): string {
  return name.replace(/^Sądzie Rejonowym/u, "Sąd Rejonowy");
}

function loadMs(): MsEntry[] {
  return JSON.parse(
    readFileSync(resolve(DATA_DIR, "ms-kw-prefiksy-2026.json"), "utf-8"),
  ) as MsEntry[];
}

// ── Wejście: gminy LAU 2020 (TERYT6, ludność, powierzchnia, centroid) ────────
type LauRow = {
  teryt6: string;
  name: string;
  population: number;
  areaKm2: number;
  lat: number;
  lng: number;
};

function loadLau(): Map<string, LauRow> {
  const lines = readFileSync(resolve(DATA_DIR, "lau-centres-pl-2020.csv"), "utf-8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean);
  const out = new Map<string, LauRow>();
  for (const ln of lines) {
    const [teryt6, name, population, areaKm2, lat, lng] = ln.split(",");
    out.set(teryt6, {
      teryt6,
      name,
      population: Number(population),
      areaKm2: Number(areaKm2),
      lat: Number(lat),
      lng: Number(lng),
    });
  }
  return out;
}

// ── Przybliżenie DEGURBA (1 miasto / 2 miasteczko-przedmieścia / 3 wieś) ─────
function approxDegurba(population: number, densityPerKm2: number): number {
  if (population >= 100_000 || densityPerKm2 >= 1500) return 1;
  if (population >= 20_000 || densityPerKm2 >= 400) return 2;
  return 3;
}

// ── Budowa jednostek + przybliżone FUA ───────────────────────────────────────
export function buildUnits(lau: Map<string, LauRow>): {
  units: SeedGeoUnit[];
  fua: Record<string, FuaEntry>;
} {
  const units: SeedGeoUnit[] = [];
  for (const r of lau.values()) {
    const density = r.areaKm2 > 0 ? r.population / r.areaKm2 : 0;
    units.push({
      teryt: r.teryt6,
      name: r.name,
      unit_type: "municipality",
      parent_teryt: r.teryt6.slice(0, 4),
      center_lat: r.lat,
      center_lng: r.lng,
      area_km2: r.areaKm2,
      population: r.population,
      degurba: approxDegurba(r.population, density),
      is_city_above_30k: r.population >= 30_000,
      is_city_above_100k: r.population >= 100_000,
      is_city_above_250k: r.population >= 250_000,
    });
  }

  // FUA (przybliżenie): rdzeń = miasto ≥100 tys.; strefa dojazdu = gmina w
  // promieniu 25 km od miasta ≥250 tys. lub 15 km od miasta ≥100 tys.
  const cores = units.filter((u) => u.is_city_above_100k);
  const fua: Record<string, FuaEntry> = {};
  for (const core of cores) fua[core.teryt] = { code: `APX${core.teryt}`, role: "core" };
  for (const u of units) {
    if (fua[u.teryt]) continue;
    for (const core of cores) {
      const d = haversineKm(u.center_lat, u.center_lng, core.center_lat, core.center_lng);
      const radius = core.is_city_above_250k ? 25 : 15;
      if (d <= radius) {
        fua[u.teryt] = { code: `APX${core.teryt}`, role: "commuting_zone" };
        break;
      }
    }
  }
  return { units, fua };
}

// ── MAIN: metryki + wagi + SQL ───────────────────────────────────────────────
function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function main() {
  const ms = loadMs();
  const lau = loadLau();
  const { units, fua } = buildUnits(lau);

  console.error(`[ms-teryt] gmin: ${units.length}, prefiksów: ${ms.length}`);
  const metrics = units.map((u) => computeMetricsFor(u, units, fua));
  const metricsByTeryt = new Map(metrics.map((m) => [m.teryt, m]));
  const weights = generatePropertyWeights(units, metricsByTeryt);
  const weightByKey = new Map(weights.map((w) => [`${w.teryt}|${w.property_type}`, w]));

  // Obszary per prefiks: TERYT7 z mapy MS → TERYT6; dedupe (części miejska i
  // wiejska gminy m-w wskazują tę samą jednostkę LAU); partial → waga × 0.5.
  let missingAreas = 0;
  const deptAreas = new Map<string, Map<string, { partial: boolean }>>();
  for (const e of ms) {
    const byT6 = new Map<string, { partial: boolean }>();
    for (const a of e.areas) {
      const t6 = String(a.teryt).slice(0, 6);
      if (!lau.has(t6)) {
        missingAreas++;
        continue; // gmina utworzona po 2020 — brak metryk; sąsiadki pokrywają obszar
      }
      const prev = byT6.get(t6);
      byT6.set(t6, { partial: (prev?.partial ?? true) && a.partial });
    }
    deptAreas.set(e.prefix, byT6);
  }
  console.error(`[ms-teryt] obszary bez metryk (gminy po 2020): ${missingAreas}`);

  const out: string[] = [];
  out.push(
    `-- Pełna warstwa referencyjna ${DATA_VERSION}: MS wykaz wydziałów KW (Dz.U. 2026 poz. 740)`,
  );
  out.push(`-- × gminy LAU 2020 (EDJNet lau_centres / Eurostat GISCO). Wygenerowane przez`);
  out.push(`-- scripts/location-scoring/ms-teryt-import.ts — idempotentne (UPSERT).`);

  out.push(
    `INSERT INTO public.kw_jurisdiction_versions (version_label, source, valid_from, fetched_at, is_active)
 VALUES (${sqlStr(JUR_LABEL)}, ${sqlStr("Rozp. MS z 29.05.2026 (Dz.U. 2026 poz. 740), zał. 1")}, '2026-07-01', now(), true)
 ON CONFLICT (version_label) DO UPDATE SET is_active=true;`,
  );

  out.push(
    `INSERT INTO public.geo_units (teryt,name,unit_type,parent_teryt,center_lat,center_lng,area_km2,population,degurba,is_city_above_30k,is_city_above_100k,is_city_above_250k,data_version,source) VALUES\n` +
      units
        .map(
          (u) =>
            `(${sqlStr(u.teryt)},${sqlStr(u.name)},'municipality',${sqlStr(u.parent_teryt ?? "")},${u.center_lat},${u.center_lng},${u.area_km2},${u.population},${u.degurba},${u.is_city_above_30k},${u.is_city_above_100k},${u.is_city_above_250k},${sqlStr(DATA_VERSION)},'MS/LAU2020')`,
        )
        .join(",\n") +
      `\nON CONFLICT (teryt,data_version) DO UPDATE SET population=EXCLUDED.population, degurba=EXCLUDED.degurba, is_city_above_30k=EXCLUDED.is_city_above_30k, is_city_above_100k=EXCLUDED.is_city_above_100k, is_city_above_250k=EXCLUDED.is_city_above_250k;`,
  );

  out.push(
    `INSERT INTO public.geo_unit_location_metrics (teryt,data_version,population_within_10km,population_within_25km,population_within_45km,density_per_km2,is_urban_cluster,fua_code,fua_role,distance_to_city_30k_km,distance_to_city_100k_km,distance_to_city_250k_km,is_adjacent_to_city_30k,base_location_attractiveness,base_config_version,data_quality) VALUES\n` +
      metrics
        .map(
          (m) =>
            `(${sqlStr(m.teryt)},${sqlStr(DATA_VERSION)},${m.population_within_10km},${m.population_within_25km},${m.population_within_45km},${m.density_per_km2},${m.is_urban_cluster},${m.fua_code ? sqlStr(m.fua_code) : "NULL"},${sqlStr(m.fua_role)},${m.distance_to_city_30k_km?.toFixed(2) ?? "NULL"},${m.distance_to_city_100k_km?.toFixed(2) ?? "NULL"},${m.distance_to_city_250k_km?.toFixed(2) ?? "NULL"},${m.is_adjacent_to_city_30k},${m.base_location_attractiveness},${sqlStr(m.base_config_version)},'medium')`,
        )
        .join(",\n") +
      `\nON CONFLICT (teryt,data_version) DO UPDATE SET base_location_attractiveness=EXCLUDED.base_location_attractiveness, population_within_10km=EXCLUDED.population_within_10km, population_within_25km=EXCLUDED.population_within_25km, population_within_45km=EXCLUDED.population_within_45km, fua_code=EXCLUDED.fua_code, fua_role=EXCLUDED.fua_role;`,
  );

  out.push(
    `INSERT INTO public.kw_court_departments (prefix,court_name,department_name,jurisdiction_version_id,mapping_confidence,source,fetched_at)\n` +
      `SELECT t.prefix, t.court, NULLIF(t.dept,''), v.id, t.conf, 'MS Dz.U. 2026 poz. 740', now()\n` +
      `FROM (VALUES\n` +
      ms
        .map(
          (e) =>
            `(${sqlStr(e.prefix)},${sqlStr(courtNominative(e.court_name))},${sqlStr(e.department_name ?? "")},${e.mapping_confidence})`,
        )
        .join(",\n") +
      `\n) t(prefix,court,dept,conf) CROSS JOIN public.kw_jurisdiction_versions v WHERE v.version_label=${sqlStr(JUR_LABEL)}\n` +
      `ON CONFLICT (prefix,jurisdiction_version_id) DO UPDATE SET court_name=EXCLUDED.court_name, department_name=EXCLUDED.department_name, mapping_confidence=EXCLUDED.mapping_confidence;`,
  );

  const areaVals: string[] = [];
  for (const e of ms) {
    for (const [t6, { partial }] of deptAreas.get(e.prefix)!) {
      areaVals.push(
        `(${sqlStr(e.prefix)},${sqlStr(t6)},${partial ? e.mapping_confidence * 0.5 : e.mapping_confidence})`,
      );
    }
  }
  out.push(
    `INSERT INTO public.kw_jurisdiction_areas (department_id,teryt,jurisdiction_role,confidence,source)\n` +
      `SELECT d.id, t.teryt, 'current', t.conf, 'MS Dz.U. 2026 poz. 740'\n` +
      `FROM (VALUES\n` +
      areaVals.join(",\n") +
      `\n) t(prefix,teryt,conf)\n` +
      `JOIN public.kw_court_departments d ON d.prefix=t.prefix\n` +
      `JOIN public.kw_jurisdiction_versions v ON v.id=d.jurisdiction_version_id AND v.version_label=${sqlStr(JUR_LABEL)}\n` +
      `ON CONFLICT (department_id,teryt,jurisdiction_role,valid_from) DO NOTHING;`,
  );

  const weightVals: string[] = [];
  let weightsRows = 0;
  for (const e of ms) {
    for (const [t6, { partial }] of deptAreas.get(e.prefix)!) {
      for (const pt of ["apartment", "house", "plot"] as const) {
        const w = weightByKey.get(`${t6}|${pt}`);
        if (!w) continue;
        const weight = Math.round(w.weight * (partial ? 0.5 : 1) * 1000) / 1000;
        weightVals.push(
          `(${sqlStr(e.prefix)},${sqlStr(pt)},${sqlStr(t6)},${weight},${sqlStr(w.source_quality)},${sqlStr(DATA_VERSION)})`,
        );
        weightsRows++;
      }
    }
  }
  out.push(
    `INSERT INTO public.property_type_location_weights (prefix,property_type,teryt,weight,source_quality,data_version) VALUES\n` +
      weightVals.join(",\n") +
      `\nON CONFLICT (prefix,property_type,teryt,data_version) DO UPDATE SET weight=EXCLUDED.weight;`,
  );

  console.error(
    `[ms-teryt] raport: ${JSON.stringify({
      dataVersion: DATA_VERSION,
      geoUnits: units.length,
      departments: ms.length,
      areaRows: areaVals.length,
      weightsRows,
      missingAreas,
      avgBaseAttractiveness:
        Math.round(
          (metrics.reduce((s, m) => s + m.base_location_attractiveness, 0) / metrics.length) * 10,
        ) / 10,
    })}`,
  );
  console.log(out.join("\n"));
}

main();
