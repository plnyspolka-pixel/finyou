// Orchestrator analizy zabezpieczenia — łączy wszystkie źródła.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DataSourceUsage, LegalRiskResult, LocationScoreResult, MarketLiquidityResult,
  PropertyAnalysisInput, PropertyAnalysisResult, ValuationBenchmark,
} from "./types";
import { rcnBenchmark } from "./rcn-geoportal.server";
import { gusBenchmark, classifySoil } from "./gus-bdl.server";
import { nbpTrend } from "./nbp-real-estate.server";
import { geocode, locationScore } from "./location-score.server";
import { extractDocuments } from "./document-extraction.server";
import { calculateCollateralScore, classifyLtv } from "./scoring";
import { buildAnalysisResult, generateOfferText } from "./offer-text";

const Input = z.object({ applicationId: z.string().uuid() });

export const runPropertyCollateralAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const { applicationId } = data;
    // Załaduj wniosek + property + dokumenty
    const [{ data: app }, { data: props }, { data: docs }] = await Promise.all([
      supabaseAdmin.from("loan_applications").select("*").eq("id", applicationId).maybeSingle(),
      supabaseAdmin.from("properties").select("*").eq("loan_application_id", applicationId),
      supabaseAdmin.from("documents").select("id, file_name, document_type, file_url").eq("loan_application_id", applicationId),
    ]);
    if (!app) throw new Error("Wniosek nie znaleziony");
    const property = props?.[0] ?? null;

    const input: PropertyAnalysisInput = {
      applicationId,
      propertyType: property?.property_type ?? "inna",
      kwNumber: property?.land_register_number ?? null,
      address: property?.address ?? null,
      city: property?.city ?? null,
      voivodeship: property?.voivodeship ?? null,
      county: null,
      parcelNumber: null,
      latitude: null,
      longitude: null,
      usableAreaM2: property?.area_sqm ?? null,
      landAreaM2: null,
      landAreaHa: null,
      soilClass: null,
      declaredPropertyValuePln: property?.estimated_value ?? null,
      requestedLoanAmountPln: app.loan_amount ?? null,
      documents: (docs ?? []).map(d => ({ id: d.id, url: d.file_url, type: d.document_type, name: d.file_name })),
    };

    const warnings: string[] = [];
    const sourcesUsed: DataSourceUsage[] = [];

    // 1) Ekstrakcja dokumentów
    const docExtraction = await extractDocuments({ applicationId, documents: input.documents ?? [] });
    sourcesUsed.push({
      source: "Dokumenty z wniosku", used: docExtraction.extractions.length > 0,
      purpose: "stan prawny i parametry nieruchomości", dataLevel: "dokumenty klienta", period: "",
      status: docExtraction.status,
    });

    // 2) Geokodowanie
    const geo = input.latitude && input.longitude
      ? { lat: input.latitude, lng: input.longitude }
      : input.address ? await geocode([input.address, input.city, input.voivodeship].filter(Boolean).join(", ")) : null;
    if (geo) { input.latitude = geo.lat; input.longitude = geo.lng; }

    // 3) RCN
    const rcn = geo ? await rcnBenchmark({ lat: geo.lat, lng: geo.lng, propertyType: input.propertyType })
                    : { stats: null, transactionsCount: 0, radiusKm: null };
    sourcesUsed.push({
      source: "RCN / Geoportal WFS", used: !!rcn.stats, purpose: "ceny transakcyjne",
      dataLevel: rcn.radiusKm ? `promień ${rcn.radiusKm} km` : "—",
      period: rcn.stats ? `${rcn.stats.periodMonths} mies.` : "",
      status: rcn.stats ? "success" : "no_data",
    });

    // 4) GUS BDL
    const gus = await gusBenchmark({
      propertyType: input.propertyType, voivodeship: input.voivodeship, county: input.county,
      soilClass: input.soilClass ?? null,
    });
    sourcesUsed.push({
      source: "GUS BDL", used: !!gus, purpose: "benchmark statystyczny",
      dataLevel: gus?.level ?? "—", period: gus?.period ?? "",
      status: gus ? "success" : "no_data",
    });

    // 5) NBP
    const nbp = await nbpTrend(input.city);
    sourcesUsed.push({
      source: "NBP", used: !!nbp, purpose: "trend rynku mieszkaniowego",
      dataLevel: nbp?.market ?? "—", period: "", status: nbp ? "success" : "no_data",
    });

    // 6) Lokalizacja
    const loc: LocationScoreResult = await locationScore({
      lat: input.latitude ?? null, lng: input.longitude ?? null, address: input.address, city: input.city,
    });
    sourcesUsed.push({
      source: "Google Maps Platform", used: input.latitude != null,
      purpose: "lokalizacja i infrastruktura",
      dataLevel: input.latitude != null ? "współrzędne" : "—", period: "",
      status: input.latitude != null ? "success" : "no_data",
    });

    // Klasyfikacja gleby (informacyjnie)
    void classifySoil(input.soilClass);

    // 7) Benchmark wartości
    const isLand = input.propertyType === "grunt_rolny";
    const areaM2 = input.usableAreaM2 ?? input.buildingAreaM2 ?? input.landAreaM2 ?? null;
    const areaHa = input.landAreaHa ?? (input.landAreaM2 ? input.landAreaM2 / 10_000 : null);

    let pricePerM2Median: number | null = null;
    let pricePerM2Average: number | null = null;
    let pricePerHa: number | null = null;
    let mainSource = "Brak danych";
    const supporting: string[] = [];

    if (rcn.stats) {
      mainSource = "RCN / Geoportal";
      if (rcn.stats.unit === "pln_per_m2") {
        pricePerM2Median = rcn.stats.median; pricePerM2Average = rcn.stats.average;
      } else { pricePerHa = rcn.stats.median; }
      if (gus) supporting.push("GUS BDL");
      if (nbp) supporting.push("NBP");
    } else if (gus) {
      mainSource = "GUS BDL";
      pricePerM2Median = gus.pricePerM2Median ?? null;
      pricePerM2Average = gus.pricePerM2Average ?? null;
      pricePerHa = gus.pricePerHaByClass?.ogolem ?? null;
      if (nbp) supporting.push("NBP");
    } else if (nbp) {
      mainSource = "NBP (pomocniczo)";
    }

    const estMedian = isLand
      ? (pricePerHa && areaHa ? pricePerHa * areaHa : null)
      : (pricePerM2Median && areaM2 ? pricePerM2Median * areaM2 : null);
    const estAverage = isLand
      ? (pricePerHa && areaHa ? pricePerHa * areaHa : null)
      : (pricePerM2Average && areaM2 ? pricePerM2Average * areaM2 : null);
    const conservativeLow = estMedian != null ? Math.round(estMedian * 0.85) : null;
    const conservativeHigh = estMedian != null ? Math.round(estMedian * 1.05) : null;
    const declared = input.declaredPropertyValuePln ?? null;
    const variance = declared && estMedian ? ((declared - estMedian) / estMedian) * 100 : null;

    const valuation: ValuationBenchmark = {
      mainSource, supportingSources: supporting,
      pricePerM2Median, pricePerM2Average, pricePerHa,
      estimatedValueMedianPln: estMedian, estimatedValueAveragePln: estAverage,
      conservativeLowPln: conservativeLow, conservativeHighPln: conservativeHigh,
      declaredValuePln: declared, varianceFromDeclaredValuePercent: variance,
    };

    // 8) LTV
    const estValue = estMedian ?? declared ?? null;
    const ltvPercent = estValue && input.requestedLoanAmountPln
      ? Math.round((input.requestedLoanAmountPln / estValue) * 100)
      : null;
    const ltv = {
      requestedLoanAmountPln: input.requestedLoanAmountPln ?? null,
      estimatedValuePln: estValue,
      ltvPercent,
      ltvCategory: classifyLtv(ltvPercent),
    };

    // 9) Ryzyka prawne i płynność
    const legal: LegalRiskResult = { score: 0, warnings: [] };
    if (property?.has_mortgage) legal.warnings.push("Nieruchomość obciążona hipoteką.");
    if (property?.has_co_owners) legal.warnings.push("Współwłaściciele — wymagana ich zgoda.");
    legal.score = legal.warnings.length === 0 ? 80 : legal.warnings.length === 1 ? 60 : 40;

    const market: MarketLiquidityResult = {
      score: rcn.transactionsCount >= 5 ? 80 : rcn.transactionsCount >= 3 ? 60 : rcn.transactionsCount >= 1 ? 40 : 20,
      summary: rcn.transactionsCount > 0
        ? `Odnaleziono ${rcn.transactionsCount} transakcji porównawczych.`
        : "Brak transakcji porównawczych w RCN.",
      transactionsCount: rcn.transactionsCount,
    };

    // 10) Scoring
    const docsPresent = {
      kw: !!input.kwNumber || docExtraction.extractions.some(e => e.docKind === "kw"),
      mpzpOrWz: docExtraction.extractions.some(e => e.docKind === "mpzp"),
      landRegistry: docExtraction.extractions.some(e => e.docKind === "wypis_rejestr_gruntow"),
      appraisal: docExtraction.extractions.some(e => e.docKind === "operat"),
      photos: (property?.photos?.length ?? 0) > 0,
    };
    const collateralScore = calculateCollateralScore({
      input, valuation, ltv, location: loc, legal, market,
      rcn: rcn.stats, gus, nbp, documents: docExtraction.extractions, documentsPresent: docsPresent,
    });

    // 11) Teksty oferty
    const weakData = !rcn.stats && !gus;
    if (weakData) warnings.push("Dostępność danych porównawczych jest ograniczona — wymagana ręczna weryfikacja.");
    const offerText = generateOfferText({
      input, valuation, location: loc, legal, collateralScore, sourcesUsed,
      rcnCount: rcn.transactionsCount, rcnRadiusKm: rcn.radiusKm, weakData,
    });

    const result: PropertyAnalysisResult = buildAnalysisResult({
      input, valuation, ltv, location: loc, legal, market,
      collateralScore, sourcesUsed, warnings, offerText,
      raw: { rcn: rcn.stats, gus, nbp, loc },
    });

    // 12) Zapis
    const { data: saved } = await supabaseAdmin.from("property_analyses").upsert({
      application_id: applicationId,
      property_id: property?.id ?? null,
      status: "done",
      result_json: result as never,
      collateral_score: collateralScore.total,
      collateral_category: collateralScore.category,
      ltv_percent: ltv.ltvPercent,
      estimated_value_pln: estValue,
      main_source: mainSource,
      sources_used: sourcesUsed as never,
      warnings: warnings as never,
    }).select("id").single();

    await supabaseAdmin.from("property_analysis_logs").insert({
      application_id: applicationId,
      property_id: property?.id ?? null,
      analysis_id: saved?.id ?? null,
      sources_used: sourcesUsed.map(s => s.source) as never,
      rcn_status: rcn.stats ? "success" : "no_data",
      gus_bdl_status: gus ? "success" : "no_data",
      nbp_status: nbp ? "success" : "no_data",
      google_maps_status: input.latitude != null ? "success" : "no_data",
      document_extraction_status: docExtraction.status,
      collateral_score: collateralScore.total,
    });

    return result;
  });

export const getPropertyAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("property_analyses")
      .select("*")
      .eq("application_id", data.applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row;
  });
