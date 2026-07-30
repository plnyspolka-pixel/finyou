// Orchestrator analizy zabezpieczenia — wycena oparta wyłącznie o Perplexity (sonar-pro).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DataSourceUsage,
  LegalRiskResult,
  LocationScoreResult,
  MarketLiquidityResult,
  PropertyAnalysisInput,
  PropertyAnalysisResult,
  ValuationBenchmark,
} from "./types";
import { geocode, locationScore } from "./location-score.server";
import { extractDocuments } from "./document-extraction.server";
import { analyzeFloodRisk } from "./flood-risk.server";
import { perplexityValuation, perplexityToRcnStats } from "./perplexity-valuation.server";
import { calculateCollateralScore, classifyLtv } from "./scoring";
import { buildAnalysisResult, generateOfferText } from "./offer-text";

const Input = z.object({ applicationId: z.string().uuid() });

export const runPropertyCollateralAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => runPropertyCollateralAnalysisCore(data.applicationId));

// Parametry nieruchomości odczytane z KW (dział I-O) — mają pierwszeństwo w wycenie
// (pytanie do Perplexity o cenę za m² dla nieruchomości o tych parametrach i lokalizacji).
export interface CollateralAnalysisOpts {
  kw?: {
    usableAreaM2?: number | null;
    landAreaM2?: number | null;
    landAreaHa?: number | null;
    roomCount?: number | null;
    floorPietro?: number | null;
    landUse?: string | null;
    fromKw?: boolean;
  };
}

export async function runPropertyCollateralAnalysisCore(
  applicationId: string,
  opts: CollateralAnalysisOpts = {},
) {
  {
    // Załaduj wniosek + property + dokumenty
    const [{ data: app }, { data: props }, { data: docs }] = await Promise.all([
      supabaseAdmin.from("loan_applications").select("*").eq("id", applicationId).maybeSingle(),
      supabaseAdmin.from("properties").select("*").eq("loan_application_id", applicationId),
      supabaseAdmin
        .from("documents")
        .select("id, file_name, document_type, file_url")
        .eq("loan_application_id", applicationId),
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
      documents: (docs ?? []).map((d) => ({
        id: d.id,
        url: d.file_url,
        type: d.document_type,
        name: d.file_name,
      })),
    };

    // Parametry z KW mają pierwszeństwo — wycena ma dotyczyć nieruchomości
    // o parametrach i lokalizacji odczytanych z księgi wieczystej.
    const kw = opts.kw;
    if (kw) {
      if (kw.usableAreaM2 != null) input.usableAreaM2 = kw.usableAreaM2;
      if (kw.landAreaM2 != null) input.landAreaM2 = kw.landAreaM2;
      if (kw.landAreaHa != null) input.landAreaHa = kw.landAreaHa;
      input.roomCount = kw.roomCount ?? null;
      input.floorPietro = kw.floorPietro ?? null;
      input.landUse = kw.landUse ?? null;
      input.parametersFromKw = !!kw.fromKw;
    }

    const warnings: string[] = [];
    const sourcesUsed: DataSourceUsage[] = [];

    // 1) Ekstrakcja dokumentów
    const docExtraction = await extractDocuments({
      applicationId,
      documents: input.documents ?? [],
    });
    sourcesUsed.push({
      source: "Dokumenty z wniosku",
      used: docExtraction.extractions.length > 0,
      purpose: "stan prawny i parametry nieruchomości",
      dataLevel: "dokumenty klienta",
      period: "",
      status: docExtraction.status,
    });

    // 2) Geokodowanie — z walidacją zgodności z deklarowanym miastem/województwem,
    //    żeby Google nie podstawił nam losowej miejscowości o podobnej nazwie ulicy.
    const geo =
      input.latitude && input.longitude
        ? { lat: input.latitude, lng: input.longitude }
        : input.address
          ? await geocode(
              [input.address, input.city, input.voivodeship, "Polska"].filter(Boolean).join(", "),
              { expectedCity: input.city, expectedVoivodeship: input.voivodeship },
            )
          : null;
    if (geo) {
      input.latitude = geo.lat;
      input.longitude = geo.lng;
    }
    if (!geo && input.address) {
      warnings.push(
        `Geokodowanie odrzuciło wynik niezgodny z miastem "${input.city ?? "—"}". Sprawdź adres nieruchomości.`,
      );
    }

    // Normalizacja Warszawy (alias dzielnic/gmin) — wymusza city = Warszawa, county = m.st. Warszawa.
    const addrLower = `${input.address ?? ""} ${input.city ?? ""}`.toLowerCase();
    if (/warszaw/i.test(addrLower)) {
      input.city = "Warszawa";
      input.county = "m.st. Warszawa";
      input.voivodeship = input.voivodeship || "mazowieckie";
    }

    // 3) Wycena Perplexity (sonar-pro) — jedyne źródło cenowe
    const pplx = await perplexityValuation({
      propertyType: input.propertyType,
      address: input.address,
      city: input.city,
      voivodeship: input.voivodeship,
      usableAreaM2: input.usableAreaM2,
      buildingAreaM2: input.buildingAreaM2,
      landAreaM2: input.landAreaM2,
      landAreaHa: input.landAreaHa,
      roomCount: input.roomCount,
      floorPietro: input.floorPietro,
      landUse: input.landUse,
      parametersFromKw: input.parametersFromKw,
      declaredPropertyValuePln: input.declaredPropertyValuePln,
    });
    sourcesUsed.push({
      source: "Perplexity (sonar-pro)",
      used: pplx.status === "success",
      purpose: input.parametersFromKw
        ? "wycena za m² dla nieruchomości o parametrach i lokalizacji z księgi wieczystej"
        : "wycena porównawcza z aktualnych ogłoszeń i raportów rynkowych",
      dataLevel: input.city ? `lokalnie: ${input.city}` : "Polska",
      period: "ostatnie 12 mies.",
      status: pplx.status,
      note:
        pplx.status === "success"
          ? `${pplx.comparablesFound} porównań, trend: ${pplx.marketTrend}${pplx.citations.length ? `, źródeł: ${pplx.citations.length}` : ""}`
          : pplx.errorMessage,
    });
    if (pplx.status === "error") {
      warnings.push(
        `Perplexity nie zwróciła wyceny: ${pplx.errorMessage ?? "błąd"}. Wymagana ręczna wycena.`,
      );
    } else if (pplx.status === "no_data") {
      warnings.push(
        "Perplexity nie znalazła wystarczających danych porównawczych — wymagana ręczna weryfikacja.",
      );
    }

    // 4) Lokalizacja
    const loc: LocationScoreResult = await locationScore({
      lat: input.latitude ?? null,
      lng: input.longitude ?? null,
      address: input.address,
      city: input.city,
    });
    sourcesUsed.push({
      source: "Google Maps Platform",
      used: input.latitude != null,
      purpose: "lokalizacja i infrastruktura",
      dataLevel: input.latitude != null ? "współrzędne" : "—",
      period: "",
      status: input.latitude != null ? "success" : "no_data",
    });

    // 5) Benchmark wartości — wyłącznie z Perplexity
    const isLand = input.propertyType === "grunt_rolny";
    const areaM2 = input.usableAreaM2 ?? input.buildingAreaM2 ?? input.landAreaM2 ?? null;
    const areaHa = input.landAreaHa ?? (input.landAreaM2 ? input.landAreaM2 / 10_000 : null);

    const pricePerM2Median = pplx.pricePerM2Median;
    const pricePerM2Average = pplx.pricePerM2Average;
    const pricePerHa = pplx.pricePerHa;
    const mainSource = pplx.status === "success" ? "Perplexity (analiza rynkowa)" : "Brak danych";
    const supporting: string[] =
      pplx.status === "success" && pplx.citations.length > 0
        ? [`${pplx.citations.length} źródeł online`]
        : [];

    if (
      input.declaredPropertyValuePln &&
      (pplx.estimatedValueLowPln || pplx.estimatedValueHighPln)
    ) {
      const lo = pplx.estimatedValueLowPln ?? 0;
      const hi = pplx.estimatedValueHighPln ?? Infinity;
      if (input.declaredPropertyValuePln < lo * 0.7 || input.declaredPropertyValuePln > hi * 1.3) {
        warnings.push(
          `Wartość deklarowana (${input.declaredPropertyValuePln.toLocaleString("pl-PL")} PLN) istotnie odbiega od oszacowania rynkowego (${lo.toLocaleString("pl-PL")}–${(pplx.estimatedValueHighPln ?? 0).toLocaleString("pl-PL")} PLN).`,
        );
      }
    }

    const estMedian = isLand
      ? pricePerHa && areaHa
        ? pricePerHa * areaHa
        : null
      : pricePerM2Median && areaM2
        ? pricePerM2Median * areaM2
        : null;
    const estAverage = isLand
      ? pricePerHa && areaHa
        ? pricePerHa * areaHa
        : null
      : pricePerM2Average && areaM2
        ? pricePerM2Average * areaM2
        : null;
    const conservativeLow = estMedian != null ? Math.round(estMedian * 0.85) : null;
    const conservativeHigh = estMedian != null ? Math.round(estMedian * 1.05) : null;
    const declared = input.declaredPropertyValuePln ?? null;
    const variance = declared && estMedian ? ((declared - estMedian) / estMedian) * 100 : null;

    const valuation: ValuationBenchmark = {
      mainSource,
      supportingSources: supporting,
      pricePerM2Median,
      pricePerM2Average,
      pricePerHa,
      estimatedValueMedianPln: estMedian,
      estimatedValueAveragePln: estAverage,
      conservativeLowPln: conservativeLow,
      conservativeHighPln: conservativeHigh,
      declaredValuePln: declared,
      varianceFromDeclaredValuePercent: variance,
    };

    // 8) LTV
    const estValue = estMedian ?? declared ?? null;
    const ltvPercent =
      estValue && input.requestedLoanAmountPln
        ? Math.round((input.requestedLoanAmountPln / estValue) * 100)
        : null;
    const ltv = {
      requestedLoanAmountPln: input.requestedLoanAmountPln ?? null,
      estimatedValuePln: estValue,
      ltvPercent,
      ltvCategory: classifyLtv(ltvPercent),
    };

    // 6) Ryzyka prawne i płynność
    const legal: LegalRiskResult = { score: 0, warnings: [] };
    if (property?.has_mortgage) legal.warnings.push("Nieruchomość obciążona hipoteką.");
    if (property?.has_co_owners) legal.warnings.push("Współwłaściciele — wymagana ich zgoda.");
    legal.score = legal.warnings.length === 0 ? 80 : legal.warnings.length === 1 ? 60 : 40;

    const syntheticRcn = perplexityToRcnStats(pplx, isLand);
    const comparablesCount = pplx.comparablesFound;
    const marketSummary =
      pplx.status === "success"
        ? pplx.liquidityComment ||
          `Perplexity zidentyfikowała ${comparablesCount} porównań w tej lokalizacji.`
        : (pplx.errorMessage ?? "Brak danych porównawczych z Perplexity.");
    const market: MarketLiquidityResult = {
      score:
        comparablesCount >= 10 ? 80 : comparablesCount >= 5 ? 60 : comparablesCount >= 2 ? 40 : 20,
      summary: marketSummary,
      transactionsCount: comparablesCount,
    };

    // 7) Ryzyko powodziowe ISOK/Wody Polskie
    const flood = await analyzeFloodRisk({
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      city: input.city,
      voivodeship: input.voivodeship,
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
    if (!flood.success)
      warnings.push(flood.message ?? "Ryzyko powodziowe wymaga ręcznej weryfikacji.");
    if (
      flood.success &&
      flood.floodRisk.riskLevel !== "none" &&
      flood.floodRisk.riskLevel !== "unknown"
    ) {
      warnings.push(...flood.alerts);
    }
    const floodRiskForScoring = {
      riskLevel: flood.floodRisk.riskLevel,
      available: flood.success,
    };

    // 8) Scoring
    const docsPresent = {
      kw: !!input.kwNumber || docExtraction.extractions.some((e) => e.docKind === "kw"),
      mpzpOrWz: docExtraction.extractions.some((e) => e.docKind === "mpzp"),
      landRegistry: docExtraction.extractions.some((e) => e.docKind === "wypis_rejestr_gruntow"),
      appraisal: docExtraction.extractions.some((e) => e.docKind === "operat"),
      photos: (property?.photos?.length ?? 0) > 0,
    };
    const collateralScore = calculateCollateralScore({
      input,
      valuation,
      ltv,
      location: loc,
      legal,
      market,
      rcn: syntheticRcn,
      gus: null,
      nbp: null,
      documents: docExtraction.extractions,
      documentsPresent: docsPresent,
      floodRisk: floodRiskForScoring,
    });

    // 9) Teksty oferty
    const weakData = pplx.status !== "success" || comparablesCount < 2;
    if (weakData)
      warnings.push(
        "Dostępność danych porównawczych jest ograniczona — wymagana ręczna weryfikacja.",
      );
    const offerText = generateOfferText({
      input,
      valuation,
      location: loc,
      legal,
      collateralScore,
      sourcesUsed,
      rcnCount: comparablesCount,
      rcnRadiusKm: null,
      weakData,
      floodRisk: {
        ...flood.floodRisk,
        available: flood.success,
        geometryUsed: flood.property.geometryUsed,
      },
      floodAvailable: flood.success,
    });

    const result: PropertyAnalysisResult = buildAnalysisResult({
      input,
      valuation,
      ltv,
      location: loc,
      legal,
      market,
      collateralScore,
      sourcesUsed,
      warnings,
      offerText,
      raw: { perplexity: pplx, loc, flood: flood.raw },
      floodRisk: {
        ...flood.floodRisk,
        available: flood.success,
        geometryUsed: flood.property.geometryUsed,
      },
      floodAlerts: flood.alerts,
    });
    result.perplexityValuation = {
      status: pplx.status,
      pricePerM2Median: pplx.pricePerM2Median,
      pricePerM2Average: pplx.pricePerM2Average,
      pricePerM2Min: pplx.pricePerM2Min,
      pricePerM2Max: pplx.pricePerM2Max,
      pricePerHa: pplx.pricePerHa,
      estimatedValueLowPln: pplx.estimatedValueLowPln,
      estimatedValueHighPln: pplx.estimatedValueHighPln,
      marketTrend: pplx.marketTrend,
      liquidityComment: pplx.liquidityComment,
      rationale: pplx.rationale,
      comparablesFound: pplx.comparablesFound,
      citations: pplx.citations,
      errorMessage: pplx.errorMessage,
    };

    // 10) Zapis
    const { data: saved } = await supabaseAdmin
      .from("property_analyses")
      .upsert({
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
      })
      .select("id")
      .single();

    await supabaseAdmin.from("property_analysis_logs").insert({
      application_id: applicationId,
      property_id: property?.id ?? null,
      analysis_id: saved?.id ?? null,
      sources_used: sourcesUsed.map((s) => s.source) as never,
      rcn_status: pplx.status === "success" ? "success" : "no_data",
      gus_bdl_status: "no_data",
      nbp_status: "no_data",
      google_maps_status: input.latitude != null ? "success" : "no_data",
      document_extraction_status: docExtraction.status,
      collateral_score: collateralScore.total,
    });

    return result;
  }
}

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
