// Orchestrator analizy zabezpieczenia — łączy wszystkie źródła.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DataSourceUsage, LegalRiskResult, LocationScoreResult, MarketLiquidityResult,
  PropertyAnalysisInput, PropertyAnalysisResult, ValuationBenchmark,
} from "./types";
import { rcnBenchmarkCached, rcnStatusMessage } from "./rcn-geoportal.server";

import { gusBenchmark, classifySoil } from "./gus-bdl.server";
import { nbpTrend } from "./nbp-real-estate.server";
import { geocode, locationScore } from "./location-score.server";
import { extractDocuments } from "./document-extraction.server";
import { analyzeFloodRisk } from "./flood-risk.server";
import { scrapeSimilarListings } from "./listings-scraping.server";
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
    // 3) RCN (z pełną diagnostyką)
    const rcn = geo
      ? await rcnBenchmarkCached({ lat: geo.lat, lng: geo.lng, propertyType: input.propertyType })
      : { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: { status: "missing_coordinates" as const, statusMessage: "Brak współrzędnych — RCN nie odpytany.", endpoint: null, availableLayers: [], layerUsed: null, crsUsed: null, inputCoordinates: { lat: null, lng: null, crs: "EPSG:4326" }, queryBbox: null, radiusM: null, radiiTried: [], featuresRawCount: 0, featuresFilteredCount: 0, filtersApplied: [], periodCounts: { countAllDates: 0, countLast12Months: 0, countLast24Months: 0, countLast36Months: 0 }, sampleFeature: null, rawResponseSnippet: null, errorTechnical: null, capabilitiesChecked: false, propertyTypeMapping: { applicationType: null, keywords: [], matchedLayerKeywords: [] } } };
    const rcnDiag = rcn.diagnostics;
    const rcnTechnicalFailure = rcnDiag.status === "wfs_capabilities_failed" || rcnDiag.status === "wfs_request_failed" || rcnDiag.status === "wfs_timeout" || rcnDiag.status === "wfs_parse_error" || rcnDiag.status === "wfs_layer_not_found" || rcnDiag.status === "bad_bbox";
    sourcesUsed.push({
      source: "RCN / Geoportal WFS",
      used: !!rcn.stats,
      purpose: "ceny transakcyjne",
      dataLevel: rcn.radiusKm ? `promień ${rcn.radiusKm} km · ${rcnDiag.layerUsed ?? "—"}` : (rcnDiag.endpoint ? "endpoint OK" : "—"),
      period: rcn.stats ? `${rcn.stats.periodMonths} mies.` : "",
      status: rcn.stats ? "success" : (rcnTechnicalFailure ? "error" : "no_data"),
      note: rcnDiag.statusMessage,
    });
    if (rcnTechnicalFailure) {
      warnings.push(`RCN niedostępny z powodu błędu technicznego: ${rcnDiag.status}. ${rcnDiag.errorTechnical ? `Szczegóły: ${rcnDiag.errorTechnical}. ` : ""}Benchmark oparto tymczasowo o GUS BDL.`);
    } else if (rcnDiag.status === "features_found_but_filtered_out") {
      warnings.push("RCN zwrócił dane, ale wszystkie zostały odfiltrowane. Prawdopodobnie filtr typu nieruchomości albo daty jest zbyt restrykcyjny.");
    }
    // Alarm dla dużych miast (Warszawa/Kraków/Wrocław/...) jeżeli brak wyników nawet w 10 km
    const isMajorCity = /warszaw|krak[óo]w|wroc[lł]aw|pozna[nń]|gda[nń]sk|katowice|[lł]od[zź]|szczecin|lublin|bydgoszcz/i.test(`${input.city ?? ""} ${input.address ?? ""}`);
    if (isMajorCity && rcnDiag.status === "no_features_in_bbox") {
      warnings.push(`RCN nie zwrócił wyników dla "${input.city ?? "—"}" nawet w promieniu 10 km. Sprawdź endpoint, warstwę, CRS, bbox i parsowanie odpowiedzi.`);
    }


    // Normalizacja Warszawy (alias dzielnic/gmin) — wymusza city = Warszawa, county = m.st. Warszawa.
    const addrLower = `${input.address ?? ""} ${input.city ?? ""}`.toLowerCase();
    if (/warszaw/i.test(addrLower)) {
      input.city = "Warszawa";
      input.county = "m.st. Warszawa";
      input.voivodeship = input.voivodeship || "mazowieckie";
    }

    // 4) GUS BDL
    const gusRes = await gusBenchmark({
      propertyType: input.propertyType,
      city: input.city,
      voivodeship: input.voivodeship,
      county: input.county,
      soilClass: input.soilClass ?? null,
    });
    const gus = gusRes.stats;
    const gusDiagnostics = gusRes.diagnostics;
    sourcesUsed.push({
      source: "GUS BDL", used: !!gus, purpose: "benchmark statystyczny",
      dataLevel: gusDiagnostics.resolvedLocation.bdlUnitName + " · " + gusDiagnostics.resolvedLocation.bdlUnitLevel,
      period: gusDiagnostics.period.label || "",
      status: gus ? (gusDiagnostics.sanityCheckStatus === "suspicious" ? "partial" : "success")
                  : (gusDiagnostics.sanityCheckStatus === "rejected" ? "error" : "no_data"),
      note: gusDiagnostics.summaryLine,
    });
    for (const w of gusDiagnostics.warnings) warnings.push(w);

    // 5) NBP
    const nbp = await nbpTrend(input.city);
    sourcesUsed.push({
      source: "NBP", used: !!nbp, purpose: "trend rynku mieszkaniowego",
      dataLevel: nbp?.market ?? "—", period: "", status: nbp ? "success" : "no_data",
    });

    // 5b) Ogłoszenia z portali nieruchomościowych (Otodom/OLX/Domiporta/Gratka/Morizon)
    const listings = await scrapeSimilarListings({
      propertyType: input.propertyType,
      city: input.city,
      voivodeship: input.voivodeship,
      areaM2: input.usableAreaM2 ?? input.buildingAreaM2 ?? null,
    }).catch((e): Awaited<ReturnType<typeof scrapeSimilarListings>> => ({
      status: "error", query: "", portals: [], totalFound: 0, used: 0,
      pricePerM2Median: null, pricePerM2Average: null, pricePerM2Min: null, pricePerM2Max: null,
      listings: [], errorMessage: e?.message ?? "błąd",
    }));
    sourcesUsed.push({
      source: "Portale nieruchomościowe (Firecrawl)",
      used: listings.used > 0,
      purpose: "podobne ogłoszenia sprzedaży",
      dataLevel: listings.portals.join(", "),
      period: "aktualne oferty",
      status: listings.status,
      note: listings.used > 0
        ? `${listings.used} ofert z ${listings.totalFound} (mediana ${listings.pricePerM2Median?.toLocaleString("pl-PL") ?? "—"} zł/m²)`
        : listings.errorMessage,
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

    // Cross-check RCN vs GUS — jeżeli GUS jest podejrzany, nie używamy go jako głównego.
    const gusSuspicious = gusDiagnostics.sanityCheckStatus !== "ok";
    if (rcn.stats) {
      mainSource = "RCN / Geoportal";
      if (rcn.stats.unit === "pln_per_m2") {
        pricePerM2Median = rcn.stats.median; pricePerM2Average = rcn.stats.average;
        // Cross-check: GUS vs RCN > 35% różnicy = niespójność
        if (gus?.pricePerM2Median && rcn.stats.median) {
          const diff = Math.abs(gus.pricePerM2Median - rcn.stats.median) / rcn.stats.median;
          if (diff > 0.35) warnings.push(`Benchmark GUS BDL (${Math.round(gus.pricePerM2Median)} zł/m²) różni się od RCN (${Math.round(rcn.stats.median)} zł/m²) o ${(diff * 100).toFixed(0)}% — wynik oznaczony jako niespójny.`);
        }
      } else { pricePerHa = rcn.stats.median; }
      if (gus && !gusSuspicious) supporting.push("GUS BDL");
      if (nbp) supporting.push("NBP");
    } else if (gus && !gusSuspicious) {
      mainSource = "GUS BDL";
      pricePerM2Median = gus.pricePerM2Median ?? null;
      pricePerM2Average = gus.pricePerM2Average ?? null;
      pricePerHa = gus.pricePerHaByClass?.ogolem ?? null;
      if (nbp) supporting.push("NBP");
    } else if (gus && gusSuspicious) {
      mainSource = "GUS BDL (podejrzane — wymaga weryfikacji)";
      warnings.push("Uwaga: benchmark GUS BDL wygląda nietypowo nisko dla tej lokalizacji. Prawdopodobna przyczyna: błędna jednostka terytorialna, niewłaściwy okres albo fallback. Wynik nie został przyjęty jako główne źródło wartości bez dodatkowej weryfikacji.");
    } else if (nbp) {
      mainSource = "NBP (pomocniczo)";
    } else if (listings.pricePerM2Median) {
      mainSource = "Portale ogłoszeniowe (pomocniczo)";
      pricePerM2Median = listings.pricePerM2Median;
      pricePerM2Average = listings.pricePerM2Average;
      warnings.push("Brak danych transakcyjnych — wartość wyliczona z mediany ofert portali ogłoszeniowych (ceny ofertowe są zwykle wyższe od transakcyjnych o 5–15%).");
    }
    if (listings.pricePerM2Median) {
      supporting.push(`Portale ogłoszeniowe (${listings.used} ofert)`);
      // Cross-check ofert vs benchmark
      if (pricePerM2Median && mainSource !== "Portale ogłoszeniowe (pomocniczo)") {
        const diff = (listings.pricePerM2Median - pricePerM2Median) / pricePerM2Median;
        if (Math.abs(diff) > 0.30) {
          warnings.push(`Mediana ofert (${listings.pricePerM2Median.toLocaleString("pl-PL")} zł/m²) różni się od głównego benchmarku (${pricePerM2Median.toLocaleString("pl-PL")} zł/m²) o ${(diff * 100).toFixed(0)}% — sprawdź lokalizację i typ nieruchomości.`);
        }
      }
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

    // 10) Ryzyko powodziowe ISOK/Wody Polskie
    const flood = await analyzeFloodRisk({
      latitude: input.latitude, longitude: input.longitude,
      address: input.address, city: input.city, voivodeship: input.voivodeship,
      propertyId: property?.id ?? null,
    });
    sourcesUsed.push({
      source: "ISOK / Wody Polskie MZP/MRP",
      used: flood.success,
      purpose: "weryfikacja zagrożenia powodziowego",
      dataLevel: flood.property.geometryUsed === "parcel_geometry" ? "geometria działki" : "punkt",
      period: "",
      status: flood.success ? "success" : "error",
    });
    if (!flood.success) warnings.push(flood.message ?? "Ryzyko powodziowe wymaga ręcznej weryfikacji.");
    if (flood.success && flood.floodRisk.riskLevel !== "none" && flood.floodRisk.riskLevel !== "unknown") {
      warnings.push(...flood.alerts);
    }
    const floodRiskForScoring = {
      riskLevel: flood.floodRisk.riskLevel,
      available: flood.success,
    };

    // 11) Scoring
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
      floodRisk: floodRiskForScoring,
    });

    // 12) Teksty oferty
    const weakData = !rcn.stats && !gus;
    if (weakData) warnings.push("Dostępność danych porównawczych jest ograniczona — wymagana ręczna weryfikacja.");
    const offerText = generateOfferText({
      input, valuation, location: loc, legal, collateralScore, sourcesUsed,
      rcnCount: rcn.transactionsCount, rcnRadiusKm: rcn.radiusKm, weakData,
      floodRisk: { ...flood.floodRisk, available: flood.success, geometryUsed: flood.property.geometryUsed },
      floodAvailable: flood.success,
    });

    const result: PropertyAnalysisResult = buildAnalysisResult({
      input, valuation, ltv, location: loc, legal, market,
      collateralScore, sourcesUsed, warnings, offerText,
      raw: { rcn: rcn.stats, gus, gusDiagnostics, nbp, loc, flood: flood.raw, listings },
      floodRisk: { ...flood.floodRisk, available: flood.success, geometryUsed: flood.property.geometryUsed },
      floodAlerts: flood.alerts,
    });
    result.gusDiagnostics = gusDiagnostics;
    result.listingsBenchmark = listings;


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
