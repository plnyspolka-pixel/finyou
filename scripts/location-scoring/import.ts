/**
 * ETL importer modułu „Potencjał lokalizacyjny" (spec §16).
 *
 * Kroki: pobranie zbiorów → normalizacja TERYT → import granic → ludność →
 * promienie 10/25/45 km → FUA/DEGURBA → sąsiedztwo → oceny bazowe → wagi rodzaju
 * → zapis wersji danych → raport jakości. Proces IDEMPOTENTNY (upsert po kluczach
 * naturalnych) — można uruchamiać wielokrotnie.
 *
 * Źródło danych:
 *   * domyślnie: scripts/location-scoring/seed-data.json (ZIARNO DEV/TEST — NIE
 *     dane produkcyjne),
 *   * produkcyjnie: ustaw LOCATION_SCORING_SOURCE=/ścieżka/do/dataset.json w tym
 *     samym formacie, wygenerowanego z oficjalnych zbiorów GUS/TERYT/NSP 2021
 *     (patrz docs/location-scoring.md — instrukcja przygotowania).
 *
 * Uruchomienie:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/location-scoring/import.ts
 *   (dry-run bez zapisu: dodaj LOCATION_SCORING_DRY_RUN=1)
 *
 * Wymaga wcześniejszego zastosowania migracji 20260725120000_location_scoring.sql.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  computeMetricsFor,
  generatePropertyWeights,
  type ComputedMetrics,
  type FuaEntry,
  type SeedGeoUnit,
} from "./compute";

type Seed = {
  dataVersion: string;
  jurisdictionVersion: { version_label: string; source: string; valid_from?: string };
  departments: Array<{
    prefix: string;
    court_name: string;
    department_name: string;
    mapping_confidence: number;
    source: string;
    areas: string[];
  }>;
  geoUnits: SeedGeoUnit[];
  fua: Record<string, FuaEntry>;
};

function log(msg: string) {
  console.log(`[location-etl] ${msg}`);
}

async function main() {
  const dryRun = process.env.LOCATION_SCORING_DRY_RUN === "1";
  const sourcePath = process.env.LOCATION_SCORING_SOURCE
    ? resolve(process.env.LOCATION_SCORING_SOURCE)
    : resolve(import.meta.dirname ?? __dirname, "seed-data.json");

  log(`Źródło: ${sourcePath}`);
  const seed = JSON.parse(readFileSync(sourcePath, "utf-8")) as Seed;
  const dataVersion = seed.dataVersion;
  const isSeed = dataVersion.startsWith("seed-");
  if (isSeed) {
    log(
      "UWAGA: używasz ZIARNA DEV/TEST — to NIE są pełne dane produkcyjne (data_version=" +
        dataVersion +
        ").",
    );
  }

  // 3. Normalizacja TERYT (trim + string) + walidacja podstawowa.
  const units = seed.geoUnits.map((u) => ({ ...u, teryt: String(u.teryt).trim() }));

  // 7–10. Obliczenia offline: promienie, FUA, sąsiedztwo, oceny bazowe.
  const metricsList: ComputedMetrics[] = units.map((u) => computeMetricsFor(u, units, seed.fua));
  const metricsByTeryt = new Map(metricsList.map((m) => [m.teryt, m]));

  // 11. Wagi rozkładu zależne od rodzaju nieruchomości (per wydział).
  const allWeights = generatePropertyWeights(units, metricsByTeryt);

  // Raport jakości importu (13).
  const quality = {
    dataVersion,
    isSeed,
    geoUnits: units.length,
    departments: seed.departments.length,
    weightsRows: 0,
    avgBaseAttractiveness:
      Math.round(
        (metricsList.reduce((s, m) => s + m.base_location_attractiveness, 0) / metricsList.length) *
          10,
      ) / 10,
    lowQualityWeightShare: 0,
  };

  if (dryRun || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log("Tryb dry-run / brak SUPABASE_* — nie zapisuję do bazy.");
    log(`Metryki (${metricsList.length}):`);
    for (const m of metricsList) {
      log(
        `  ${m.teryt}: base=${m.base_location_attractiveness} pop10=${m.population_within_10km} fua=${m.fua_role} adj30k=${m.is_adjacent_to_city_30k}`,
      );
    }
    log(`Raport jakości: ${JSON.stringify(quality)}`);
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 0. Rejestr zadania importu.
  const { data: job } = await supabase
    .from("location_scoring_import_jobs")
    .insert({
      job_type: "full",
      status: "RUNNING",
      source: sourcePath,
      data_version: dataVersion,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  const jobId = job?.id ?? null;

  try {
    // 1. Wersja właściwości wydziałów.
    const { data: jver } = await supabase
      .from("kw_jurisdiction_versions")
      .upsert(
        {
          version_label: seed.jurisdictionVersion.version_label,
          source: seed.jurisdictionVersion.source,
          valid_from: seed.jurisdictionVersion.valid_from ?? null,
          fetched_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "version_label" },
      )
      .select("id")
      .maybeSingle();
    const jurisdictionVersionId = jver?.id ?? null;

    // 4. Import granic administracyjnych → geo_units.
    await supabase.from("geo_units").upsert(
      units.map((u) => ({
        teryt: u.teryt,
        name: u.name,
        unit_type: u.unit_type,
        parent_teryt: u.parent_teryt,
        center_lat: u.center_lat,
        center_lng: u.center_lng,
        area_km2: u.area_km2,
        population: u.population,
        degurba: u.degurba,
        is_city_above_30k: u.is_city_above_30k,
        is_city_above_100k: u.is_city_above_100k,
        is_city_above_250k: u.is_city_above_250k,
        data_version: dataVersion,
        source: isSeed ? "SEED" : seed.jurisdictionVersion.source,
      })),
      { onConflict: "teryt,data_version" },
    );

    // 8/10. Zagregowane metryki obszaru (gotowe do scoringu).
    await supabase.from("geo_unit_location_metrics").upsert(
      metricsList.map((m) => ({ ...m, data_version: dataVersion })),
      { onConflict: "teryt,data_version" },
    );

    // Mapa prefiksów + obszary właściwości.
    for (const dept of seed.departments) {
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
      if (deptId) {
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

        // 11. Wagi rodzaju — tylko dla TERYT w zasięgu tego wydziału.
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
            data_version: dataVersion,
          }));
        quality.weightsRows += deptWeights.length;
        if (deptWeights.length) {
          await supabase
            .from("property_type_location_weights")
            .upsert(deptWeights, { onConflict: "prefix,property_type,teryt,data_version" });
        }
      }
    }

    quality.lowQualityWeightShare =
      Math.round(
        (allWeights.filter((w) => w.source_quality === "low").length / allWeights.length) * 100,
      ) / 100;

    // 12/13. Zapis wersji danych (zamknięcie zadania + raport jakości).
    if (jobId) {
      await supabase
        .from("location_scoring_import_jobs")
        .update({ status: "COMPLETED", finished_at: new Date().toISOString(), stats: quality })
        .eq("id", jobId);
    }
    log(`Import zakończony. Raport: ${JSON.stringify(quality)}`);
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
  console.error("[location-etl] BŁĄD:", e);
  process.exit(1);
});
