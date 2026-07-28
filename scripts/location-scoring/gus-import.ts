/**
 * ETL produkcyjny (spec §16) — import REALNYCH danych GUS/TERYT/NSP + MS KW
 * do modułu „Potencjał lokalizacyjny nieruchomości".
 *
 * NIE zastępuje logiki scoringu — używa istniejącej `compute.ts` (haversine,
 * FUA, wagi rodzaju) i zapisuje do TYCH SAMYCH tabel co seed. Idempotentny:
 * upsert po (teryt,data_version) / (prefix,jurisdiction_version_id).
 *
 * data_version zapisywany do bazy: `gus-2021-1` (nie nadpisuje seed-real-2 —
 * scorer sam wybiera najnowszy po created_at).
 *
 * ŹRÓDŁA
 * ------
 * Automatycznie pobierane (nie wymagają autoryzacji):
 *   - GUS BDL API: ludność gmin 2021 (var 72305, level=6).
 *   - GUS BDL API: lista gmin (units level=6) — TERYT + nazwy.
 *
 * WYMAGANE PLIKI LOKALNE (patrz README-import.md):
 *   data-import/gugik-prg-jednostki-2024.geojson
 *     – Państwowy Rejestr Granic GUGiK, warstwa "jednostki_administracyjne",
 *       poziom gminy. Pobrać z https://www.geoportal.gov.pl (dane otwarte,
 *       „PRG - jednostki administracyjne"). Format: GeoJSON WGS84 z polami
 *       JPT_KOD_JE (TERYT gminy) i geometrią MultiPolygon → z tego liczymy
 *       centroid i area_km2.
 *
 *   data-import/eurostat-degurba-pl-2021.csv
 *     – Eurostat table „urb_lpop1" filtered PL / LAU 2021 kolumny:
 *       lau_code (TERYT) ; degurba (1|2|3). Ręczny eksport z
 *       https://ec.europa.eu/eurostat/web/degree-of-urbanisation.
 *
 *   data-import/ms-kw-prefiksy-2026.json
 *     – Wykaz kodów wydziałów ksiąg wieczystych Ministerstwa Sprawiedliwości.
 *       Ręczne przygotowanie z „Rozporządzenia Ministra Sprawiedliwości
 *       w sprawie zakładania i prowadzenia ksiąg wieczystych" (wykaz sądów)
 *       + rozporządzeń o właściwości sądów rejonowych. Format JSON:
 *         [{ prefix, court_name, department_name, mapping_confidence,
 *            source, areas: [teryt, ...] }]
 *
 *   data-import/eurostat-fua-pl-2021.csv (opcjonalne — bez niego FUA=none)
 *     – Eurostat FUA (Functional Urban Areas) PL, kolumny:
 *       fua_code ; lau_code (TERYT) ; role ("core"|"commuting_zone").
 *
 * URUCHOMIENIE
 * ------------
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     bun run scripts/location-scoring/gus-import.ts
 *   (dry-run: LOCATION_SCORING_DRY_RUN=1)
 *
 * BEZPIECZEŃSTWO
 * --------------
 * Skrypt NIE odpytuje EKW, NIE obchodzi CAPTCHA, NIE zapisuje żadnych
 * pełnych numerów KW. Buduje wyłącznie warstwę referencyjną (jednostki
 * administracyjne + mapa właściwości wydziałów).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  computeMetricsFor,
  generatePropertyWeights,
  type ComputedMetrics,
  type FuaEntry,
  type SeedGeoUnit,
} from "./compute";

const DATA_VERSION = "gus-2021-1";
const JUR_LABEL = "2026.1-gus";
const BDL_BASE = "https://bdl.stat.gov.pl/api/v1";
const DATA_DIR = resolve(process.cwd(), "data-import");

// ----------------------------------------------------------------------------
// GUS BDL — pobranie ludności gmin (var 72305, ludność ogółem, rok 2021).
// ----------------------------------------------------------------------------
type BdlDataRow = { id: string; name: string; values: Array<{ year: string; val: number }> };

async function fetchBdlPopulation(): Promise<Map<string, { name: string; population: number }>> {
  const out = new Map<string, { name: string; population: number }>();
  let page = 0;
  const pageSize = 100;
  // 1 req/s to respect anonymous rate limit.

  while (true) {
    const url = `${BDL_BASE}/data/by-variable/72305?unit-level=6&year=2021&format=json&page-size=${pageSize}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`BDL ${res.status} on page ${page}`);
    const json = (await res.json()) as { results: BdlDataRow[]; links: { next?: string } };
    for (const r of json.results) {
      const pop = r.values[0]?.val ?? 0;
      out.set(r.id, { name: r.name, population: Math.round(pop) });
    }
    if (!json.links.next) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return out;
}

// ----------------------------------------------------------------------------
// GeoJSON PRG (GUGiK) — centroidy i powierzchnie gmin.
// ----------------------------------------------------------------------------
type GeoJsonFeature = {
  properties: { JPT_KOD_JE?: string; kod?: string };
  geometry: { type: string; coordinates: unknown };
};

function centroidAndArea(geom: GeoJsonFeature["geometry"]): {
  lat: number;
  lng: number;
  areaKm2: number;
} {
  // Prosty centroid = środek bounding boxa. Powierzchnia — planar w stopniach
  // przeskalowana do km² przez cos(lat). Wystarczające dla scoringu
  // gminnego; produkcyjnie zastąpić np. przez turf.js/centroid + area.
  const rings: number[][][] = [];
  const g = geom.coordinates as number[][][][] | number[][][];
  if (geom.type === "Polygon") rings.push(...(g as number[][][]));
  else for (const poly of g as number[][][][]) rings.push(...poly);
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;
  let areaDeg2 = 0;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    // Shoelace na współrzędnych geograficznych (stopnie).
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    areaDeg2 += Math.abs(s) / 2;
  }
  const lat = (minLat + maxLat) / 2;
  const lng = (minLng + maxLng) / 2;
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  return { lat, lng, areaKm2: Math.max(1, areaDeg2 * kmPerDegLat * kmPerDegLng) };
}

function loadGeoJson(): Map<string, { lat: number; lng: number; areaKm2: number }> {
  const path = resolve(DATA_DIR, "gugik-prg-jednostki-2024.geojson");
  if (!existsSync(path)) {
    throw new Error(
      `BRAK PLIKU: ${path}\n` +
        `Pobierz z geoportal.gov.pl (PRG → jednostki administracyjne, poziom gminy) ` +
        `i zapisz jako GeoJSON WGS84.`,
    );
  }
  const gj = JSON.parse(readFileSync(path, "utf-8")) as { features: GeoJsonFeature[] };
  const out = new Map<string, { lat: number; lng: number; areaKm2: number }>();
  for (const f of gj.features) {
    const teryt = f.properties.JPT_KOD_JE ?? f.properties.kod;
    if (!teryt) continue;
    out.set(String(teryt), centroidAndArea(f.geometry));
  }
  return out;
}

// ----------------------------------------------------------------------------
// DEGURBA Eurostat (CSV: lau_code;degurba).
// ----------------------------------------------------------------------------
function loadDegurba(): Map<string, number> {
  const path = resolve(DATA_DIR, "eurostat-degurba-pl-2021.csv");
  const out = new Map<string, number>();
  if (!existsSync(path)) {
    console.warn(`[WARN] Brak ${path} — DEGURBA = 3 (rural) dla wszystkich gmin.`);
    return out;
  }
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).slice(1);
  for (const ln of lines) {
    const [lau, deg] = ln.split(/[,;]/);
    if (!lau || !deg) continue;
    const d = Number(deg);
    if (d >= 1 && d <= 3) out.set(lau.trim(), d);
  }
  return out;
}

// ----------------------------------------------------------------------------
// FUA Eurostat (CSV: fua_code;lau_code;role).
// ----------------------------------------------------------------------------
function loadFua(): Record<string, FuaEntry> {
  const path = resolve(DATA_DIR, "eurostat-fua-pl-2021.csv");
  const out: Record<string, FuaEntry> = {};
  if (!existsSync(path)) {
    console.warn(`[WARN] Brak ${path} — FUA = none dla wszystkich gmin.`);
    return out;
  }
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).slice(1);
  for (const ln of lines) {
    const [fua, lau, role] = ln.split(/[,;]/);
    if (!fua || !lau || !role) continue;
    const r = role.trim();
    if (r === "core" || r === "commuting_zone") out[lau.trim()] = { code: fua.trim(), role: r };
  }
  return out;
}

// ----------------------------------------------------------------------------
// Wykaz KW MS (JSON z ręcznego przygotowania — patrz nagłówek pliku).
// ----------------------------------------------------------------------------
type MsKwEntry = {
  prefix: string;
  court_name: string;
  department_name: string;
  mapping_confidence: number;
  source: string;
  areas: string[];
};

function loadKwDepartments(): MsKwEntry[] {
  const path = resolve(DATA_DIR, "ms-kw-prefiksy-2026.json");
  if (!existsSync(path)) {
    throw new Error(
      `BRAK PLIKU: ${path}\n` +
        `Przygotuj z „Wykazu kodów wydziałów ksiąg wieczystych" MS oraz ` +
        `aktualnego rozporządzenia o właściwości sądów rejonowych. ` +
        `Format: [{prefix,court_name,department_name,mapping_confidence,source,areas:[teryt,...]}]`,
    );
  }
  return JSON.parse(readFileSync(path, "utf-8")) as MsKwEntry[];
}

// ----------------------------------------------------------------------------
// Klasyfikacja miast (progi ludności).
// ----------------------------------------------------------------------------
function cityFlags(pop: number) {
  return {
    is_city_above_30k: pop >= 30_000,
    is_city_above_100k: pop >= 100_000,
    is_city_above_250k: pop >= 250_000,
  };
}

// ----------------------------------------------------------------------------
// MAIN.
// ----------------------------------------------------------------------------
async function main() {
  const dryRun = process.env.LOCATION_SCORING_DRY_RUN === "1";
  console.log(`[gus-etl] Start | data_version=${DATA_VERSION} | dry-run=${dryRun}`);

  console.log("[gus-etl] Pobieranie ludności z GUS BDL (var 72305, 2021)...");
  const pop = await fetchBdlPopulation();
  console.log(`[gus-etl]   ${pop.size} rekordów.`);

  console.log("[gus-etl] Wczytywanie granic GUGiK (PRG) → centroidy + powierzchnie...");
  const geo = loadGeoJson();
  console.log(`[gus-etl]   ${geo.size} gmin z geometrią.`);

  console.log("[gus-etl] Wczytywanie DEGURBA...");
  const degurba = loadDegurba();

  console.log("[gus-etl] Wczytywanie FUA...");
  const fua = loadFua();

  console.log("[gus-etl] Wczytywanie wykazu wydziałów KW (MS)...");
  const departments = loadKwDepartments();
  console.log(`[gus-etl]   ${departments.length} prefiksów wydziałów.`);

  // Budowa geoUnits — bierzemy TERYT z geo (centroidy) i wzbogacamy o ludność.
  const units: SeedGeoUnit[] = [];
  for (const [teryt, g] of geo) {
    const p = pop.get(teryt);
    if (!p) continue; // gmina bez ludności — pomijamy (integralność).
    const flags = cityFlags(p.population);
    units.push({
      teryt,
      name: p.name,
      unit_type: "municipality",
      parent_teryt: teryt.slice(0, 4) || null,
      center_lat: g.lat,
      center_lng: g.lng,
      area_km2: Math.round(g.areaKm2 * 10) / 10,
      population: p.population,
      degurba: degurba.get(teryt) ?? 3,
      ...flags,
    });
  }
  console.log(`[gus-etl] Zbudowano ${units.length} jednostek gminnych.`);

  console.log("[gus-etl] Obliczanie metryk (promienie 10/25/45 km, FUA, sąsiedztwo)...");
  const metricsList: ComputedMetrics[] = units.map((u) => computeMetricsFor(u, units, fua));
  const metricsByTeryt = new Map(metricsList.map((m) => [m.teryt, m]));

  console.log("[gus-etl] Generowanie wag per rodzaj nieruchomości...");
  const allWeights = generatePropertyWeights(units, metricsByTeryt);

  const quality = {
    dataVersion: DATA_VERSION,
    geoUnits: units.length,
    departments: departments.length,
    weightsRows: 0,
    avgBaseAttractiveness:
      Math.round(
        (metricsList.reduce((s, m) => s + m.base_location_attractiveness, 0) / metricsList.length) *
          10,
      ) / 10,
    lowQualityWeightShare: 0,
  };

  if (dryRun || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("[gus-etl] DRY-RUN — nie zapisuję do bazy.");
    console.log(JSON.stringify(quality, null, 2));
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: job } = await supabase
    .from("location_scoring_import_jobs")
    .insert({
      job_type: "full",
      status: "RUNNING",
      source: "GUS BDL 72305 + GUGiK PRG + Eurostat DEGURBA/FUA + MS wykaz KW",
      data_version: DATA_VERSION,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  const jobId = job?.id ?? null;

  try {
    const { data: jver } = await supabase
      .from("kw_jurisdiction_versions")
      .upsert(
        {
          version_label: JUR_LABEL,
          source: "Ministerstwo Sprawiedliwości — wykaz kodów wydziałów KW (2026)",
          fetched_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "version_label" },
      )
      .select("id")
      .maybeSingle();
    const jurisdictionVersionId = jver?.id ?? null;

    // Batchowany upsert gmin.
    const CHUNK = 500;
    for (let i = 0; i < units.length; i += CHUNK) {
      const slice = units
        .slice(i, i + CHUNK)
        .map((u) => ({ ...u, data_version: DATA_VERSION, source: "GUS/GUGiK" }));
      await supabase.from("geo_units").upsert(slice, { onConflict: "teryt,data_version" });
    }
    for (let i = 0; i < metricsList.length; i += CHUNK) {
      const slice = metricsList
        .slice(i, i + CHUNK)
        .map((m) => ({ ...m, data_version: DATA_VERSION }));
      await supabase
        .from("geo_unit_location_metrics")
        .upsert(slice, { onConflict: "teryt,data_version" });
    }

    for (const dept of departments) {
      const { data: d } = await supabase
        .from("kw_court_departments")
        .upsert(
          {
            prefix: dept.prefix,
            court_name: dept.court_name,
            department_name: dept.department_name,
            jurisdiction_version_id: jurisdictionVersionId,
            mapping_confidence: dept.mapping_confidence,
            source: dept.source,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "prefix,jurisdiction_version_id" },
        )
        .select("id")
        .maybeSingle();
      const deptId = d?.id;
      if (!deptId) continue;

      await supabase.from("kw_jurisdiction_areas").upsert(
        dept.areas.map((teryt) => ({
          department_id: deptId,
          teryt,
          jurisdiction_role: "current",
          confidence: dept.mapping_confidence,
          source: dept.source,
        })),
        { onConflict: "department_id,teryt,jurisdiction_role,valid_from" },
      );

      const inScope = new Set(dept.areas);
      const deptWeights = allWeights
        .filter((w) => inScope.has(w.teryt))
        .map((w) => ({
          prefix: dept.prefix,
          jurisdiction_version_id: jurisdictionVersionId,
          property_type: w.property_type,
          teryt: w.teryt,
          weight: w.weight,
          source_quality: w.source_quality,
          data_version: DATA_VERSION,
        }));
      quality.weightsRows += deptWeights.length;
      for (let i = 0; i < deptWeights.length; i += CHUNK) {
        await supabase
          .from("property_type_location_weights")
          .upsert(deptWeights.slice(i, i + CHUNK), {
            onConflict: "prefix,property_type,teryt,data_version",
          });
      }
    }

    quality.lowQualityWeightShare =
      Math.round(
        (allWeights.filter((w) => w.source_quality === "low").length / allWeights.length) * 100,
      ) / 100;

    if (jobId) {
      await supabase
        .from("location_scoring_import_jobs")
        .update({ status: "COMPLETED", finished_at: new Date().toISOString(), stats: quality })
        .eq("id", jobId);
    }
    console.log(`[gus-etl] SUKCES. Raport: ${JSON.stringify(quality)}`);
  } catch (e) {
    if (jobId) {
      await supabase
        .from("location_scoring_import_jobs")
        .update({
          status: "FAILED",
          finished_at: new Date().toISOString(),
          error: e instanceof Error ? e.message : String(e),
        })
        .eq("id", jobId);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error("[gus-etl] BŁĄD:", e);
  process.exit(1);
});
