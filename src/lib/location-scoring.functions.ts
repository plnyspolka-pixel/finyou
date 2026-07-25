// Server functions modułu „Potencjał lokalizacyjny nieruchomości" (spec §17).
//
// Warstwa serwerowa: autoryzacja (administrator/operator), ładowanie danych
// referencyjnych (mapa prefiksów, agregaty przestrzenne, wagi rodzaju, obserwacje),
// uruchomienie CZYSTEGO rdzenia (src/lib/location-scoring), persystencja wyniku,
// aktualizacja priorytetu wniosku. Ciężkie obliczenia przestrzenne NIE dzieją się
// tutaj — czytamy gotowe agregaty policzone offline (ETL).
//
// Numer KW to dana wrażliwa (spec §22): nie zapisujemy pełnego numeru — jedynie
// prefiks, numer repertoryjny (liczba) i HMAC znormalizowanego numeru (solony).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseKwNumber,
  scoreLocation,
  mergeConfig,
  buildSerialSignal,
  toScoringPropertyType,
  maskKwNumber,
  MODEL_VERSION,
  type AreaMetrics,
  type LocationCandidate,
  type LocationScoringConfig,
  type ObservationAggregate,
  type PropertyType,
  type ScoringContext,
  type LocationScoringResult,
} from "@/lib/location-scoring";

// ── Autoryzacja ──────────────────────────────────────────────────────────────
async function requireOperator(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

// ── HMAC pełnego znormalizowanego numeru KW (deduplikacja bez PII) ───────────
function kwHmac(normalizedFull: string): string | null {
  const secret = process.env.LOCATION_SCORING_HMAC_SECRET;
  if (!secret) return null; // brak sekretu → nie zapisujemy pseudonimu (świadomie)
  return createHmac("sha256", secret).update(normalizedFull).digest("hex");
}

// ── Ładowanie konfiguracji (aktywna wersja) ──────────────────────────────────
async function loadActiveConfig(db: SupabaseClient): Promise<LocationScoringConfig> {
  const { data } = await db
    .from("location_scoring_settings")
    .select("config")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return mergeConfig((data?.config ?? null) as Partial<LocationScoringConfig> | null);
}

// ── Rozwiązanie aktywnej wersji danych przestrzennych ────────────────────────
async function resolveDataVersion(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("geo_unit_location_metrics")
    .select("data_version, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.data_version as string | undefined) ?? null;
}

// ── Mapowanie wydziału KW dla prefiksu (najpewniejsze mapowanie) ─────────────
async function loadCourt(db: SupabaseClient, prefix: string) {
  const { data } = await db
    .from("kw_court_departments")
    .select("prefix, court_name, department_name, mapping_confidence, jurisdiction_version_id")
    .eq("prefix", prefix)
    .order("mapping_confidence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  let versionLabel = "n/a";
  if (data.jurisdiction_version_id) {
    const { data: ver } = await db
      .from("kw_jurisdiction_versions")
      .select("version_label")
      .eq("id", data.jurisdiction_version_id)
      .maybeSingle();
    versionLabel = (ver?.version_label as string | undefined) ?? "n/a";
  }
  return {
    prefix: data.prefix as string,
    name: [data.court_name, data.department_name].filter(Boolean).join(", "),
    jurisdictionVersion: versionLabel,
    mappingConfidence: Number(data.mapping_confidence ?? 0.5),
  };
}

// ── Ładowanie kandydatów (wagi rodzaju × agregaty obszaru) ───────────────────
async function loadCandidates(
  db: SupabaseClient,
  prefix: string,
  propertyType: PropertyType,
  dataVersion: string,
): Promise<LocationCandidate[]> {
  const { data: weights } = await db
    .from("property_type_location_weights")
    .select("teryt, weight, source_quality")
    .eq("prefix", prefix)
    .eq("property_type", propertyType)
    .eq("data_version", dataVersion);
  if (!weights || weights.length === 0) return [];

  const teryts = weights.map((w) => w.teryt as string);
  const [{ data: metrics }, { data: units }] = await Promise.all([
    db
      .from("geo_unit_location_metrics")
      .select("*")
      .eq("data_version", dataVersion)
      .in("teryt", teryts),
    db.from("geo_units").select("*").eq("data_version", dataVersion).in("teryt", teryts),
  ]);

  const metricByTeryt = new Map((metrics ?? []).map((m) => [m.teryt as string, m]));
  const unitByTeryt = new Map((units ?? []).map((u) => [u.teryt as string, u]));

  const candidates: LocationCandidate[] = [];
  for (const w of weights) {
    const teryt = w.teryt as string;
    const m = metricByTeryt.get(teryt);
    const u = unitByTeryt.get(teryt);
    if (!m) continue; // brak agregatów → pomijamy (INSUFFICIENT_DATA jeśli wszystkie)
    const dataQuality =
      (w.source_quality as string) === "low" || (m.data_quality as string) === "low"
        ? "low"
        : (w.source_quality as string) === "medium" || (m.data_quality as string) === "medium"
          ? "medium"
          : "high";
    const area: AreaMetrics = {
      geoUnitId: teryt,
      name: (u?.name as string) ?? teryt,
      populationWithin10Km: Number(m.population_within_10km ?? 0),
      populationWithin25Km: Number(m.population_within_25km ?? 0),
      populationWithin45Km: Number(m.population_within_45km ?? 0),
      densityPerKm2: Number(m.density_per_km2 ?? 0),
      isCityAbove30k: Boolean(u?.is_city_above_30k),
      isCityAbove100k: Boolean(u?.is_city_above_100k),
      isCityAbove250k: Boolean(u?.is_city_above_250k),
      isAdjacentToCityAbove30k: Boolean(m.is_adjacent_to_city_30k),
      isUrbanCluster: Boolean(m.is_urban_cluster),
      fuaRole: (m.fua_role as AreaMetrics["fuaRole"]) ?? "none",
      distanceToCity30kKm:
        m.distance_to_city_30k_km != null ? Number(m.distance_to_city_30k_km) : null,
      distanceToCity100kKm:
        m.distance_to_city_100k_km != null ? Number(m.distance_to_city_100k_km) : null,
      distanceToCity250kKm:
        m.distance_to_city_250k_km != null ? Number(m.distance_to_city_250k_km) : null,
      dataQuality: dataQuality as AreaMetrics["dataQuality"],
    };
    candidates.push({ area, weight: Number(w.weight ?? 0) });
  }
  return candidates;
}

// ── Agregacja obserwacji historycznych (prefiks × rodzaj) ────────────────────
async function loadObservations(
  db: SupabaseClient,
  prefix: string,
  propertyType: PropertyType,
): Promise<ObservationAggregate | null> {
  const { data } = await db
    .from("kw_location_observations")
    .select("real_attractiveness, good_location")
    .eq("kw_prefix", prefix)
    .eq("property_type", propertyType);
  if (!data || data.length === 0) return null;
  const withAttr = data.filter((o) => o.real_attractiveness != null);
  const sampleCount = withAttr.length;
  if (sampleCount === 0) return null;
  const empiricalMeanAttractiveness =
    withAttr.reduce((s, o) => s + Number(o.real_attractiveness), 0) / sampleCount;
  const empiricalGoodCount = withAttr.filter((o) => o.good_location === true).length;
  return { sampleCount, empiricalMeanAttractiveness, empiricalGoodCount };
}

// ── Sygnał zakresu numeru repertoryjnego ─────────────────────────────────────
async function loadSerialSignal(
  db: SupabaseClient,
  prefix: string,
  propertyType: PropertyType,
  serial: number,
  minSample: number,
) {
  const { data } = await db
    .from("kw_number_range_statistics")
    .select("sample_count, mean_attractiveness, positive_count, validated_offline")
    .eq("prefix", prefix)
    .eq("property_type", propertyType)
    .lte("range_start", serial)
    .gte("range_end", serial)
    .order("sample_count", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return buildSerialSignal(null, minSample);
  const sample = Number(data.sample_count ?? 0);
  return buildSerialSignal(
    {
      sampleCount: sample,
      meanAttractiveness: Number(data.mean_attractiveness ?? 0),
      positiveShare: sample > 0 ? Number(data.positive_count ?? 0) / sample : 0,
      validatedOffline: Boolean(data.validated_offline),
    },
    minSample,
  );
}

// ── Persystencja + aktualizacja priorytetu wniosku ───────────────────────────
async function persistResult(
  db: SupabaseClient,
  args: {
    loanApplicationId: string | null;
    parsed: ReturnType<typeof parseKwNumber>;
    propertyType: PropertyType;
    result: LocationScoringResult;
    dataVersion: string;
    contextParams: Record<string, unknown>;
    userId: string;
    status: LocationScoringResult["decision"] extends never ? never : string;
  },
): Promise<string | null> {
  const { result, parsed } = args;
  const status =
    result.decision === "INVALID_KW"
      ? "FAILED"
      : result.decision === "INSUFFICIENT_DATA"
        ? "NEEDS_DATA"
        : "COMPLETED";

  const { data: inserted, error } = await db
    .from("location_scoring_results")
    .insert({
      loan_application_id: args.loanApplicationId,
      kw_prefix: parsed.prefix,
      serial_number: Number.isFinite(parsed.serialNumber) ? parsed.serialNumber : null,
      kw_hmac: parsed.isValid ? kwHmac(parsed.normalized) : null,
      masked_kw_number: result.normalizedKwNumber,
      property_type: args.propertyType,
      probability_urban_core: result.probabilityUrbanCore,
      probability_urban_or_suburban: result.probabilityUrbanOrSuburban,
      probability_fua: result.probabilityFua,
      probability_good_location: result.probabilityGoodLocation,
      probability_remote_area: result.probabilityRemoteArea,
      expected_location_attractiveness: result.expectedLocationAttractiveness,
      analysis_priority_score: result.analysisPriorityScore,
      confidence_score: result.confidenceScore,
      attractiveness_p10: result.attractivenessP10,
      attractiveness_median: result.attractivenessMedian,
      attractiveness_p90: result.attractivenessP90,
      decision: result.decision,
      explanation: result.explanation,
      params: args.contextParams,
      court_prefix: result.courtDepartment.prefix,
      court_name: result.courtDepartment.name,
      jurisdiction_version: result.courtDepartment.jurisdictionVersion,
      model_version: result.modelVersion,
      data_version: args.dataVersion,
      config_version: result.configVersion,
      status,
      created_by: args.userId,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // Aktualizacja kolumn wniosku (kolejka priorytetów + lista) — spec §17, §18.
  if (args.loanApplicationId) {
    await db
      .from("loan_applications")
      .update({
        location_potential_score: result.expectedLocationAttractiveness,
        location_confidence_score: result.confidenceScore,
        location_analysis_priority: result.decision,
        location_scoring_status: status,
        location_scored_at: result.calculatedAt,
      })
      .eq("id", args.loanApplicationId);
  }
  return inserted?.id ?? null;
}

const runInputSchema = z.object({
  applicationId: z.string().uuid().nullish(),
  kwNumber: z.string().min(3),
  // Akceptujemy zarówno typ scoringowy, jak i enum bazy (mapowany).
  propertyType: z.string().min(2),
});

/**
 * Uruchamia scoring lokalizacyjny dla numeru KW i rodzaju nieruchomości.
 * Nigdy nie blokuje wniosku — dla złego numeru zwraca INVALID_KW, dla braku
 * danych NEEDS_DATA; wynik zawsze jest zapisywany (spec §17).
 */
export const runLocationScoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => runInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    const db = supabase as unknown as SupabaseClient;

    const propertyType: PropertyType | null =
      data.propertyType === "apartment" ||
      data.propertyType === "house" ||
      data.propertyType === "plot"
        ? (data.propertyType as PropertyType)
        : toScoringPropertyType(data.propertyType);

    const parsed = parseKwNumber(data.kwNumber);
    const config = await loadActiveConfig(db);

    // Rodzaj nieruchomości nieobsługiwany (np. lokal usługowy/udział) — nie scorujemy.
    if (!propertyType) {
      return {
        ok: false as const,
        status: "unsupported_property_type" as const,
        message:
          "Rodzaj nieruchomości nieobsługiwany przez moduł lokalizacyjny (tylko mieszkanie/dom/działka).",
      };
    }

    // Oznacz PROCESSING (nieblokująco).
    if (data.applicationId) {
      await db
        .from("loan_applications")
        .update({ location_scoring_status: "PROCESSING" })
        .eq("id", data.applicationId);
    }

    const court = await loadCourt(db, parsed.prefix);
    const dataVersion = (await resolveDataVersion(db)) ?? "n/a";

    let candidates: LocationCandidate[] = [];
    let observations: ObservationAggregate | null = null;
    let serialSignal = buildSerialSignal(null, config.serialSignalMinSample);
    if (parsed.formatValid && dataVersion !== "n/a") {
      candidates = await loadCandidates(db, parsed.prefix, propertyType, dataVersion);
      observations = await loadObservations(db, parsed.prefix, propertyType);
      if (Number.isFinite(parsed.serialNumber)) {
        serialSignal = await loadSerialSignal(
          db,
          parsed.prefix,
          propertyType,
          parsed.serialNumber,
          config.serialSignalMinSample,
        );
      }
    }

    const ctx: ScoringContext = {
      parsedKw: parsed,
      propertyType,
      court,
      candidates,
      observations,
      serialSignal,
      config,
    };

    const result = scoreLocation(ctx, { dataVersion });
    result.applicationId = data.applicationId ?? "";

    const contextParams = {
      config,
      dataVersion,
      candidateCount: candidates.length,
      observationSample: observations?.sampleCount ?? 0,
      serialApplied: serialSignal?.applied ?? false,
      courtMapped: Boolean(court),
    };

    let analysisId: string | null = null;
    try {
      analysisId = await persistResult(db, {
        loanApplicationId: data.applicationId ?? null,
        parsed,
        propertyType,
        result,
        dataVersion,
        contextParams,
        userId,
        status: "" as never,
      });
    } catch (e) {
      // Błąd persystencji nie może blokować procesu — logujemy zamaskowany numer.
      console.error(`[location-scoring] persist failed for ${maskKwNumber(parsed)}:`, e);
    }

    return { ok: true as const, analysisId, result };
  });

/** Zwraca najnowszy wynik scoringu dla wniosku. */
export const getLocationScoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    const db = supabase as unknown as SupabaseClient;
    const { data: row, error } = await db
      .from("location_scoring_results")
      .select("*")
      .eq("loan_application_id", data.applicationId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { found: Boolean(row), result: row ?? null };
  });

/** Zapisuje obserwację po pełnej analizie KW (uczenie estymacji) — spec §10. */
export const recordLocationObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        applicationId: z.string().uuid().nullish(),
        kwNumber: z.string().min(3),
        propertyType: z.string().min(2),
        realTeryt: z.string().nullish(),
        realLocality: z.string().nullish(),
        realAttractiveness: z.number().min(0).max(100).nullish(),
        goodLocation: z.boolean().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    const db = supabase as unknown as SupabaseClient;

    const parsed = parseKwNumber(data.kwNumber);
    if (!parsed.formatValid) throw new Error("Nieprawidłowy numer KW.");
    const hmac = kwHmac(parsed.normalized);
    if (!hmac) {
      throw new Error(
        "Brak LOCATION_SCORING_HMAC_SECRET — obserwacja nie może zostać zapseudonimizowana.",
      );
    }
    const propertyType =
      data.propertyType === "apartment" ||
      data.propertyType === "house" ||
      data.propertyType === "plot"
        ? data.propertyType
        : toScoringPropertyType(data.propertyType);
    if (!propertyType) throw new Error("Rodzaj nieruchomości nieobsługiwany.");

    const { error } = await db.from("kw_location_observations").upsert(
      {
        loan_application_id: data.applicationId ?? null,
        kw_prefix: parsed.prefix,
        serial_number: parsed.serialNumber,
        property_type: propertyType,
        kw_hmac: hmac,
        real_teryt: data.realTeryt ?? null,
        real_locality: data.realLocality ?? null,
        real_attractiveness: data.realAttractiveness ?? null,
        good_location: data.goodLocation ?? null,
        data_version: (await resolveDataVersion(db)) ?? null,
        created_by: userId,
      },
      { onConflict: "kw_hmac" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Zwraca aktywną konfigurację + wszystkie wersje (panel administratora) — spec §19. */
export const getLocationScoringSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    const db = supabase as unknown as SupabaseClient;
    const { data: versions } = await db
      .from("location_scoring_settings")
      .select("config_version, config, is_active, created_at")
      .order("created_at", { ascending: false });
    const active = (versions ?? []).find((v) => v.is_active) ?? versions?.[0] ?? null;
    return {
      active: active
        ? mergeConfig(active.config as Partial<LocationScoringConfig>)
        : mergeConfig(null),
      versions: versions ?? [],
      modelVersion: MODEL_VERSION,
    };
  });

/**
 * Zapisuje NOWĄ wersję konfiguracji (nie nadpisuje historii). Historyczne wyniki
 * nie zmieniają się bez jawnego przeliczenia (spec §19). Tylko administrator.
 */
export const saveLocationScoringSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ configVersion: z.string().min(1), config: z.record(z.string(), z.unknown()) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "administrator")) {
      throw new Error("Zmiana konfiguracji wymaga roli administrator.");
    }
    const db = supabase as unknown as SupabaseClient;
    const merged = mergeConfig({
      ...(data.config as Partial<LocationScoringConfig>),
      version: data.configVersion,
    });
    // Dezaktywuj poprzednie, aktywuj nową (nowa wersja = nowy rekord).
    await db.from("location_scoring_settings").update({ is_active: false }).eq("is_active", true);
    const { error } = await db.from("location_scoring_settings").insert({
      config_version: data.configVersion,
      config: merged as unknown as Record<string, unknown>,
      is_active: true,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, configVersion: data.configVersion };
  });
