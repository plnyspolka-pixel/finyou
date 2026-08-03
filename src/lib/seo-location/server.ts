// Programmatic SEO — warstwa serwerowa: generowanie draftów podstron
// lokalizacyjnych z danych referencyjnych (geo_units + geo_unit_location_metrics)
// oraz cotygodniowa publikacja partiami. Wywoływane z hooków cron
// (/api/public/hooks/seo-location-*). Czysta logika treści: ./core.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildLocationPage,
  slugifyCity,
  type GeoUnitInput,
  type GeoMetricsInput,
  type NearbyLink,
} from "./core";

const GEO_DATA_VERSION = process.env.SEO_LOCATION_DATA_VERSION ?? "gus-2021-1";
const TOP_CITIES = 50;

// seo_location_pages nie jest jeszcze w wygenerowanych typach Supabase
// (types.ts odświeża się po zastosowaniu migracji w Lovable Cloud) — do tego
// czasu korzystamy z klienta bez generyka Database.
const db = supabaseAdmin as unknown as SupabaseClient;

type GenerateResult = {
  ok: boolean;
  generated: number;
  updated: number;
  unchanged: number;
  skippedNoData: string[];
};

/**
 * Generuje/odświeża drafty dla TOP N miast wg liczby ludności. Idempotentne:
 * istniejące strony są aktualizowane tylko gdy zmienił się content_hash,
 * status opublikowanych stron nie jest cofany. Miasta bez metryk są pomijane
 * (zasada: brak danych = brak strony).
 */
export async function generateLocationPages(limit = TOP_CITIES): Promise<GenerateResult> {
  const { data: units, error: unitsErr } = await db
    .from("geo_units")
    .select(
      "id, teryt, name, unit_type, parent_teryt, population, area_km2, degurba, is_city_above_30k, is_city_above_100k, is_city_above_250k, data_version",
    )
    .eq("data_version", GEO_DATA_VERSION)
    .eq("unit_type", "municipality")
    .or("degurba.eq.1,is_city_above_30k.eq.true")
    .order("population", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (unitsErr) throw new Error(`geo_units: ${unitsErr.message}`);
  const cityUnits = (units ?? []) as GeoUnitInput[];
  if (!cityUnits.length) {
    return { ok: true, generated: 0, updated: 0, unchanged: 0, skippedNoData: [] };
  }

  const teryts = cityUnits.map((u) => u.teryt);
  const { data: metricRows, error: mErr } = await db
    .from("geo_unit_location_metrics")
    .select(
      "teryt, population_within_10km, population_within_25km, population_within_45km, density_per_km2, is_urban_cluster, fua_role, base_location_attractiveness, data_version",
    )
    .eq("data_version", GEO_DATA_VERSION)
    .in("teryt", teryts);
  if (mErr) throw new Error(`geo_unit_location_metrics: ${mErr.message}`);
  const metricsByTeryt = new Map<string, GeoMetricsInput>();
  for (const m of (metricRows ?? []) as GeoMetricsInput[]) metricsByTeryt.set(m.teryt, m);

  // Sąsiedztwo — do sekcji „Pożyczki w pobliżu" (5–8 linków wewnętrznych).
  const { data: adjacency } = await db
    .from("geo_unit_adjacency")
    .select("teryt, neighbour_teryt")
    .eq("data_version", GEO_DATA_VERSION)
    .in("teryt", teryts);
  const neighboursByTeryt = new Map<string, string[]>();
  for (const a of adjacency ?? []) {
    const list = neighboursByTeryt.get(a.teryt) ?? [];
    list.push(a.neighbour_teryt);
    neighboursByTeryt.set(a.teryt, list);
  }

  // Slugi liczymy z góry dla całego zbioru, żeby linki wewnętrzne mogły
  // wskazywać strony generowane w tym samym przebiegu. Kolizje slugów
  // (miasta o tej samej nazwie) rozstrzygamy sufiksem TERYT.
  const slugByTeryt = new Map<string, string>();
  const usedSlugs = new Set<string>();
  for (const u of cityUnits) {
    let slug = slugifyCity(u.name);
    if (usedSlugs.has(slug)) slug = `${slug}-${u.teryt}`;
    usedSlugs.add(slug);
    slugByTeryt.set(u.teryt, slug);
  }
  const nameByTeryt = new Map(cityUnits.map((u) => [u.teryt, u.name] as const));

  const voivodeshipOf = (teryt: string) => teryt.slice(0, 2);

  function nearbyFor(u: GeoUnitInput): NearbyLink[] {
    const links: NearbyLink[] = [];
    const push = (teryt: string) => {
      if (teryt === u.teryt) return;
      const slug = slugByTeryt.get(teryt);
      const name = nameByTeryt.get(teryt);
      if (!slug || !name) return;
      if (links.some((l) => l.slug === slug)) return;
      links.push({ slug, name });
    };
    // 1) faktyczni sąsiedzi (wspólna granica),
    for (const t of neighboursByTeryt.get(u.teryt) ?? []) push(t);
    // 2) dopełnienie: największe miasta z tego samego województwa,
    if (links.length < 5) {
      for (const other of cityUnits) {
        if (links.length >= 8) break;
        if (voivodeshipOf(other.teryt) === voivodeshipOf(u.teryt)) push(other.teryt);
      }
    }
    // 3) dalsze dopełnienie: największe miasta w kraju.
    if (links.length < 5) {
      for (const other of cityUnits) {
        if (links.length >= 5) break;
        push(other.teryt);
      }
    }
    return links.slice(0, 8);
  }

  const { data: existingRows } = await db
    .from("seo_location_pages")
    .select("slug, teryt, status, content_hash");
  const existingByTeryt = new Map((existingRows ?? []).map((r) => [r.teryt, r] as const));

  let generated = 0;
  let updated = 0;
  let unchanged = 0;
  const skippedNoData: string[] = [];

  for (const u of cityUnits) {
    const draft = buildLocationPage(u, metricsByTeryt.get(u.teryt), nearbyFor(u));
    if (!draft) {
      skippedNoData.push(`${u.name} (${u.teryt})`);
      continue;
    }
    const slug = slugByTeryt.get(u.teryt)!;
    const existing = existingByTeryt.get(u.teryt);
    if (existing && existing.content_hash === draft.contentHash) {
      unchanged++;
      continue;
    }
    const row = {
      slug,
      teryt: u.teryt,
      geo_unit_id: u.id,
      name: u.name,
      meta_title: draft.metaTitle,
      meta_description: draft.metaDescription,
      content: draft.content as unknown as Record<string, unknown>,
      content_hash: draft.contentHash,
      generated_at: new Date().toISOString(),
    };
    if (existing) {
      // Aktualizacja treści bez zmiany statusu (opublikowane zostają opublikowane).
      const { error } = await db.from("seo_location_pages").update(row).eq("teryt", u.teryt);
      if (error) throw new Error(`update ${slug}: ${error.message}`);
      updated++;
    } else {
      const { error } = await db.from("seo_location_pages").insert({ ...row, status: "draft" });
      if (error) throw new Error(`insert ${slug}: ${error.message}`);
      generated++;
    }
  }

  if (skippedNoData.length) {
    console.warn(
      `[seo-location] pominięto ${skippedNoData.length} miast bez metryk: ${skippedNoData.join(", ")}`,
    );
  }
  return { ok: true, generated, updated, unchanged, skippedNoData };
}

/**
 * Publikuje partię najstarszych draftów (domyślnie 10) — wywoływane raz w
 * tygodniu przez pg_cron, żeby indeksacja przyrastała naturalnym tempem.
 * Po publikacji pinguje sitemapę (best-effort).
 */
export async function publishLocationPagesBatch(
  batchSize = 10,
): Promise<{ ok: boolean; published: string[] }> {
  const { data: drafts, error } = await db
    .from("seo_location_pages")
    .select("id, slug")
    .eq("status", "draft")
    .order("generated_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(`seo_location_pages: ${error.message}`);
  const toPublish = drafts ?? [];
  if (!toPublish.length) return { ok: true, published: [] };

  const now = new Date().toISOString();
  const { error: upErr } = await db
    .from("seo_location_pages")
    .update({ status: "published", published_at: now })
    .in(
      "id",
      toPublish.map((d) => d.id),
    );
  if (upErr) throw new Error(`publish: ${upErr.message}`);

  try {
    const { pingSearchEnginesSitemap } = await import("@/lib/seo/ping.server");
    await pingSearchEnginesSitemap();
  } catch (e) {
    console.warn("[seo-location] sitemap ping failed", e);
  }
  return { ok: true, published: toPublish.map((d) => d.slug) };
}

/**
 * Buduje snapshot publicznego rankingu lokalizacji (/raport-lokalizacje) z
 * tabel referencyjnych. Ranking: bazowa atrakcyjność lokalizacji (scoring
 * liczony offline), tie-break ludność w promieniu 25 km. Miasta bez metryk
 * są pomijane — raport zawiera tylko rekordy z pełnymi danymi.
 */
export async function generateLocationReport(
  limit = 100,
): Promise<{ ok: boolean; entries: number; skipped: number }> {
  const { data: units, error: unitsErr } = await db
    .from("geo_units")
    .select("teryt, name, population, degurba, is_city_above_30k, data_version")
    .eq("data_version", GEO_DATA_VERSION)
    .eq("unit_type", "municipality")
    .or("degurba.eq.1,is_city_above_30k.eq.true")
    .order("population", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (unitsErr) throw new Error(`geo_units: ${unitsErr.message}`);
  const cityUnits = units ?? [];
  if (!cityUnits.length) return { ok: true, entries: 0, skipped: 0 };

  const { data: metricRows, error: mErr } = await db
    .from("geo_unit_location_metrics")
    .select(
      "teryt, population_within_25km, population_within_45km, density_per_km2, fua_role, base_location_attractiveness, data_version",
    )
    .eq("data_version", GEO_DATA_VERSION)
    .in(
      "teryt",
      cityUnits.map((u: { teryt: string }) => u.teryt),
    );
  if (mErr) throw new Error(`geo_unit_location_metrics: ${mErr.message}`);
  const metricsByTeryt = new Map(
    (metricRows ?? []).map((m: { teryt: string }) => [m.teryt, m] as const),
  );

  const { VOIVODESHIP_NAMES } = await import("./core");

  type ReportRow = {
    teryt: string;
    name: string;
    voivodeship: string;
    population: number | null;
    density_per_km2: number | null;
    population_within_25km: number;
    population_within_45km: number;
    attractiveness: number | null;
    fua_role: string;
    data_version: string;
  };

  let skipped = 0;
  const rows: ReportRow[] = [];
  for (const u of cityUnits) {
    const m = metricsByTeryt.get(u.teryt) as
      | {
          population_within_25km: number;
          population_within_45km: number;
          density_per_km2: number;
          fua_role: string;
          base_location_attractiveness: number | null;
        }
      | undefined;
    if (!m || !(m.population_within_25km > 0)) {
      skipped++;
      continue;
    }
    rows.push({
      teryt: u.teryt,
      name: u.name,
      voivodeship: VOIVODESHIP_NAMES[u.teryt.slice(0, 2)] ?? "—",
      population: u.population,
      density_per_km2: m.density_per_km2,
      population_within_25km: m.population_within_25km,
      population_within_45km: m.population_within_45km,
      attractiveness: m.base_location_attractiveness,
      fua_role: m.fua_role,
      data_version: GEO_DATA_VERSION,
    });
  }

  rows.sort((a, b) => {
    const av = a.attractiveness ?? -1;
    const bv = b.attractiveness ?? -1;
    if (bv !== av) return bv - av;
    return b.population_within_25km - a.population_within_25km;
  });

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const { error: upsertErr } = await db
    .from("seo_location_report_entries")
    .upsert(ranked, { onConflict: "teryt" });
  if (upsertErr) throw new Error(`seo_location_report_entries: ${upsertErr.message}`);

  // Usuń wpisy, które wypadły z rankingu (np. po zmianie wersji danych).
  const keepTeryts = ranked.map((r) => r.teryt);
  if (keepTeryts.length) {
    await db
      .from("seo_location_report_entries")
      .delete()
      .not("teryt", "in", `(${keepTeryts.map((t) => `"${t}"`).join(",")})`);
  }

  return { ok: true, entries: ranked.length, skipped };
}
