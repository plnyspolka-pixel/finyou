// Orkiestrator „Wycena i ocena ryzyka inwestycji".
// Pipeline: BRAMKA KW (KW Engine — bez poprawnie pobranej księgi ocena nie startuje)
// → stan prawny KW → właściciel (PESEL, trwanie życia) → korespondencja →
// → scraping rynku (deweloperuch.pl transakcje + otodom.pl oferty, Firecrawl) →
// → deterministyczna wycena rynkowa (GUS BDL pomocniczo — grunty rolne zł/ha).
// Perplexity usunięta z toru wyceny. Moduły RCN oraz OCR dokumentów wyłączone.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runPropertyCollateralAnalysisCore } from "@/lib/property-analysis/property-collateral-analysis.functions";
import type { DataSourceUsage } from "@/lib/property-analysis/types";
import { fetchAndStoreKw, normalizeKwNumber } from "@/lib/kw-fetch.server";
import { analyzeKwLegal } from "./kw-parser.server";
import { analyzeOwner } from "./owner-analysis.server";
import { analyzeCorrespondence } from "./correspondence-intel.server";
import {
  analyzeSaleability,
  applyFloorToSaleability,
  applyPlotBuildabilityToSaleability,
} from "./saleability.server";
import { assessFloor } from "./floor-factor";
import { assessPlotBuildability } from "./plot-buildability";
import { estimateForcedSale } from "./forced-sale";
import { computeMarketValuation } from "./market-valuation";
import { fetchGusAuxiliaryBenchmark } from "./gov-benchmark.server";
import { fetchMarketComparables } from "./market-comparables.server";

import { clampLoanTermYears } from "./life-expectancy";
import { combineRiskAssessment } from "./risk-scoring";
import type { InvestmentRiskAssessment, GovBenchmark, OcrSummary } from "./types";
import { recommendationLabel } from "./types";

type SupabaseLike = { from: (t: string) => any };

const EMPTY_OCR: OcrSummary = { status: "no_data", documentsProcessed: 0, documents: [] };

// Fallback, gdy pomocnicze zapytanie GUS BDL zawiedzie — ocena liczy się dalej
// na scrapingu rynku (deweloperuch + otodom).
function emptyGovBenchmark(propertyType: string): GovBenchmark {
  return {
    source: "GUS BDL",
    available: false,
    propertyType,
    primarySource: "brak",
    pricePerHa: null,
    pricePerM2Median: null,
    pricePerM2Average: null,
    soilClass: null,
    soilCategory: "ogolem",
    areaHa: null,
    landValuePln: null,
    dwellingValuePln: null,
    gusPricePerHa: null,
    gusPricePerM2Median: null,
    rcnAvailable: false,
    rcnPricePerHa: null,
    rcnPricePerM2: null,
    rcnTransactions: 0,
    rcnRadiusKm: null,
    rcnStatus: "disabled",
    rcnStatusMessage: "Moduł RCN wyłączony.",
    unitName: null,
    unitLevel: null,
    period: null,
    fallbackUsed: false,
    summaryLine:
      "GUS BDL (pomocniczo): brak danych — wycena bazuje na scrapingu rynku (deweloperuch + otodom).",
    warnings: [],
  };
}

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

export const runInvestmentRiskAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ applicationId: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    return runInvestmentRiskAssessmentCore(supabase, data.applicationId, {
      force: data.force ?? false,
    });
  });

/**
 * Ocena liczona JEDEN RAZ na temat inwestycyjny (wniosek). Zapisujemy przy kliencie
 * (client_id) i cache'ujemy — kolejne wywołania zwracają zapis, chyba że force=true
 * (świadome przeliczenie przez administratora/operatora).
 */
export async function runInvestmentRiskAssessmentCore(
  supabase: SupabaseLike,
  applicationId: string,
  opts: { force?: boolean } = {},
): Promise<InvestmentRiskAssessment> {
  const db = supabase;
  // Idempotencja: jeśli ocena już istnieje i nie wymuszono przeliczenia — zwróć zapis.
  if (!opts.force) {
    try {
      const { data: existing } = await db
        .from("investment_risk_assessments")
        .select("result_json")
        .eq("application_id", applicationId)
        .maybeSingle();
      if (existing?.result_json) return existing.result_json as InvestmentRiskAssessment;
    } catch {
      // brak tabeli / błąd odczytu — policz normalnie
    }
  }

  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  // 0) Wczytaj wniosek, właściciela (client_id), nieruchomość, dokumenty.
  const [{ data: app }, { data: props }] = await Promise.all([
    db.from("loan_applications").select("*").eq("id", applicationId).maybeSingle(),
    db.from("properties").select("*").eq("loan_application_id", applicationId),
  ]);

  if (!app) throw new Error("Wniosek nie znaleziony.");
  const property = props?.[0] ?? null;
  const clientId = (app as any).client_id ?? null;
  // Pożyczki udzielamy na 1–5 lat — dożycie liczymy dla tego zakresu (poza nim clamp do 1–5;
  // brak deklaracji okresu → 5 lat, tj. najostrożniejszy horyzont).
  const loanTermYears = clampLoanTermYears(
    app.preferred_period_months ? app.preferred_period_months / 12 : null,
  );
  const declaredValue = property?.estimated_value ?? null;
  const loanAmount = app.loan_amount ?? null;

  // 1) BRAMKA KW — ocena NIE startuje bez poprawnie pobranej treści księgi
  //    wieczystej z KW Engine (CMD). Najpierw upewniamy się, że dane KW są
  //    pobrane i czytelne; dopiero potem ruszają dalsze analizy i wycena.
  const kwNumber = normalizeKwNumber(property?.land_register_number ?? "");
  if (!kwNumber) {
    throw new Error(
      "Ocena przerwana: wniosek nie ma poprawnego numeru księgi wieczystej (KW). Uzupełnij numer KW i uruchom ocenę ponownie.",
    );
  }
  const kwFetch = await fetchAndStoreKw(kwNumber, { pollMaxMs: 60_000 });
  if (!kwFetch.ok) {
    const reason =
      kwFetch.status === "processing"
        ? "pobieranie treści KW nadal trwa — spróbuj ponownie za chwilę"
        : (kwFetch.error ?? `status: ${kwFetch.status}`);
    throw new Error(
      `Ocena przerwana: nie udało się poprawnie pobrać treści KW ${kwNumber} z KW Engine (${reason}).`,
    );
  }

  // 1a) Stan prawny KW — dział I-O daje też adres i parametry nieruchomości,
  //     którymi uzupełniamy braki w danych wniosku dla wszystkich dalszych analiz.
  const kwLegal = await analyzeKwLegal({
    kwNumber,
    hasCoOwners: property?.has_co_owners ?? null,
    hasMortgageFlag: property?.has_mortgage ?? null,
  });
  if (!kwLegal.available) {
    throw new Error(
      `Ocena przerwana: treść KW ${kwNumber} została pobrana, ale nie udało się odczytać jej działów. Zweryfikuj treść KW i uruchom ponownie.`,
    );
  }

  // Adres efektywny: dane wniosku → fallback z działu I-O KW.
  const kwAddr = kwLegal.address;
  const effAddress = property?.address || kwAddr?.fullAddress || null;
  const effCity = property?.city || kwAddr?.city || null;
  const effVoivodeship = property?.voivodeship || kwAddr?.voivodeship || null;

  // Parametry nieruchomości z działu I-O KW (oznaczenie) — źródło do wyceny.
  const kwParams = kwLegal.propertyParams;
  const kwFloorPietro = kwLegal.kondygnacja != null ? Math.max(0, kwLegal.kondygnacja - 1) : null;
  const kwAreaSqm = kwParams.usableAreaM2 ?? kwParams.landAreaM2 ?? null;

  if (property && (kwAddr || kwAreaSqm != null)) {
    // Uzupełnij puste pola rekordu nieruchomości (dane z KW są urzędowe) —
    // dzięki temu widzi je też analiza zabezpieczenia i diagnostyka RCN.
    const patch: {
      address?: string;
      street?: string;
      city?: string;
      voivodeship?: string;
      area_sqm?: number;
    } = {};
    if (!property.address && kwAddr?.fullAddress) patch.address = kwAddr.fullAddress;
    if (!property.street && kwAddr?.street) patch.street = kwAddr.street;
    if (!property.city && kwAddr?.city) patch.city = kwAddr.city;
    if (!property.voivodeship && kwAddr?.voivodeship) patch.voivodeship = kwAddr.voivodeship;
    if (property.area_sqm == null && kwAreaSqm != null) patch.area_sqm = kwAreaSqm;
    if (Object.keys(patch).length > 0) {
      const { error: patchError } = await db.from("properties").update(patch).eq("id", property.id);
      if (patchError)
        console.error("[risk-assessment] property KW backfill failed:", patchError.message);
      else Object.assign(property, patch);
    }
  }

  // KW-parametry przekazywane do analizy zabezpieczenia: mają pierwszeństwo, bo
  // wycena ma dotyczyć nieruchomości o parametrach i lokalizacji z księgi wieczystej.
  const kwValuationOpts = {
    kw: {
      usableAreaM2: kwParams.usableAreaM2,
      landAreaM2: kwParams.landAreaM2,
      landAreaHa: kwParams.landAreaHa,
      roomCount: kwParams.roomCount,
      floorPietro: kwFloorPietro,
      landUse: kwParams.landUse ?? kwParams.kind ?? null,
      fromKw: kwLegal.available,
    },
  };

  // 2) Analiza zabezpieczenia (reuse: lokalizacja + ryzyko powodziowe + scoring).
  //    Pozostawiona bez zmian („reszta systemu"); jej wewnętrzna wycena nie jest
  //    już podstawą — podstawą jest wycena ze scrapingu rynku (krok 6).
  //    Nie przerywamy oceny, gdy padnie — degradujemy się miękko.
  let collateral = null as InvestmentRiskAssessment["collateralAnalysis"];
  try {
    collateral = await runPropertyCollateralAnalysisCore(applicationId, kwValuationOpts);
  } catch (e: any) {
    warnings.push(`Analiza zabezpieczenia nie powiodła się: ${e?.message ?? "błąd"}.`);
  }

  // 3) Korespondencja + łatwość sprzedaży — równolegle. OCR dokumentów wyłączony.
  const ocr = EMPTY_OCR;
  const [correspondence, saleabilityRaw] = await Promise.all([
    analyzeCorrespondence({ applicationId, clientId, declaredValue, loanAmount, city: effCity }),
    analyzeSaleability({
      propertyType: property?.property_type ?? "inna",
      address: effAddress,
      city: effCity,
      voivodeship: effVoivodeship,
      areaM2: property?.area_sqm ?? null,
    }),
  ]);

  // 4) Właściciel — potrzebuje wyników KW do porównania nazwiska; PESEL
  //    zaciągany bezpośrednio z działu II KW (rekord klienta tylko zapasowo).
  const owner = await analyzeOwner({
    clientId,
    loanTermYears,
    kwLegal,
    kwNumber: kwLegal.kwNumber,
    city: effCity,
    voivodeship: effVoivodeship,
  });
  warnings.push(
    ...owner.notes.filter((n) => /nieprawidłowy|niezgod|brak PESEL|brak powiązanego/i.test(n)),
  );

  // 5) Czynnik kondygnacji (mieszkania) — 1. piętro najlepiej, ostatnie w niskim
  //    budynku bez windy najgorzej. Kondygnacja z działu I-O KW.
  const saleabilityFloor =
    property?.property_type === "mieszkanie"
      ? applyFloorToSaleability(
          saleabilityRaw,
          assessFloor({ kondygnacja: kwLegal.kondygnacja, totalFloors: kwLegal.floorsInBuilding }),
        )
      : saleabilityRaw;

  // 5b) Prawo zabudowy działki (RM/siedlisko/grunt rolny) — ograniczony krąg nabywców
  //     (budowa zasadniczo tylko dla rolnika) obniża płynność i sugeruje wycenę rolną.
  const plotBuildability = assessPlotBuildability({
    propertyType: property?.property_type ?? "inna",
    mpzpInfo: (property as any)?.mpzp_info ?? null,
    landRegistryExtract: (property as any)?.land_registry_extract ?? null,
    ocrText: null,
  });
  const saleability = plotBuildability.applicable
    ? applyPlotBuildabilityToSaleability(saleabilityFloor, plotBuildability)
    : saleabilityFloor;
  if (plotBuildability.onlyFarmerCanBuild) warnings.push(...plotBuildability.warnings);

  // 5c) GUS BDL — wyłącznie POMOCNICZO: dla gruntu rolnego podstawa wyceny
  //     (ceny zł/ha wg klasy bonitacyjnej z KW), dla pozostałych typów fallback.
  //     RCN pozostaje wyłączony.
  const govBenchmark = await fetchGusAuxiliaryBenchmark({
    propertyType: property?.property_type ?? "inna",
    city: effCity,
    voivodeship: effVoivodeship,
    soilClass: kwLegal.soilClass,
    areaSqm: property?.area_sqm ?? null,
    landAreaHa: kwParams.landAreaHa,
  }).catch((e) => {
    warnings.push(`GUS BDL (pomocniczo): ${e?.message ?? "błąd"}.`);
    return emptyGovBenchmark(property?.property_type ?? "inna");
  });

  // 5d) PODSTAWA WYCENY — scraping rynku (Firecrawl):
  //     deweloperuch.pl: miasto/miejscowość + rodzaj (tylko DOMY i MIESZKANIA — transakcje),
  //     otodom.pl: MIESZKANIA, DOMY i DZIAŁKI (aktywne oferty).
  const marketComparables = await fetchMarketComparables({
    propertyType: property?.property_type ?? "inna",
    city: effCity,
    street: (property as any)?.street ?? kwLegal.address?.street ?? null,
    voivodeship: effVoivodeship,
  }).catch((e) => {
    warnings.push(`Rynek porównawczy (deweloperuch/otodom): ${e?.message ?? "błąd"}.`);
    return null;
  });

  // 6) Deterministyczna wycena rynkowa — mediana zł/m² ze scrapingu × powierzchnia
  //    z KW; grunt rolny: ceny GUS zł/ha × ha. Bez udziału LLM.
  const isPlotType = /dzialka|działka|grunt|siedlisk/.test(
    (property?.property_type ?? "").toLowerCase(),
  );
  const areaM2 = isPlotType
    ? (kwParams.landAreaM2 ?? property?.area_sqm ?? null)
    : (kwParams.usableAreaM2 ?? property?.area_sqm ?? null);
  const master = computeMarketValuation({
    propertyType: property?.property_type ?? "inna",
    areaM2,
    landAreaHa: kwParams.landAreaHa,
    declaredValuePln: declaredValue,
    requestedLoanPln: loanAmount,
    marketComparables,
    govBenchmark,
    kwLegal,
    ownerMatchesKw: owner.matchesKwOwner,
    saleabilityScore: saleability.available ? saleability.score : null,
    onlyFarmerCanBuild: plotBuildability.applicable ? plotBuildability.onlyFarmerCanBuild : false,
  });
  if (master.status !== "success")
    warnings.push(
      `Wycena rynkowa (deweloperuch/otodom + GUS): ${master.errorMessage ?? "brak danych"}.`,
    );

  // 7) Cena sprzedaży i wymuszonej sprzedaży (licytacje komornicze).
  //    Podstawa: mediana wyceny nadrzędnej → wycena zabezpieczenia → wartość deklarowana.
  const collateralMid =
    collateral?.valuationBenchmark?.estimatedValueMedianPln ??
    (collateral?.perplexityValuation?.estimatedValueLowPln &&
    collateral?.perplexityValuation?.estimatedValueHighPln
      ? Math.round(
          (collateral.perplexityValuation.estimatedValueLowPln +
            collateral.perplexityValuation.estimatedValueHighPln) /
            2,
        )
      : null);
  // Dla gruntu rolnego podstawą wyceny są ceny gruntów rolnych GUS (zł/ha × ha) —
  // wycena rynkowa (master) liczy to samo, ale zostawiamy jawny priorytet.
  const govLandValue = property?.property_type === "grunt_rolny" ? govBenchmark.landValuePln : null;
  const basisValue =
    govLandValue ?? master.estimatedValueMidPln ?? collateralMid ?? declaredValue ?? null;
  const basisSource = govLandValue
    ? "GUS BDL (ceny gruntów rolnych)"
    : master.estimatedValueMidPln
      ? `Wycena rynkowa — ${master.basisSource ?? "deweloperuch/otodom"}`
      : collateralMid
        ? "Analiza zabezpieczenia"
        : declaredValue
          ? "Wartość deklarowana"
          : "brak";
  const forcedSale = estimateForcedSale({
    basisValuePln: basisValue,
    basisSource,
    propertyType: property?.property_type ?? null,
    requestedLoanPln: loanAmount,
    saleabilityScore: saleability.available ? saleability.score : null,
    marketLowPln:
      master.estimatedValueLowPln ?? collateral?.valuationBenchmark?.conservativeLowPln ?? null,
    marketMidPln: basisValue,
    marketHighPln:
      master.estimatedValueHighPln ?? collateral?.valuationBenchmark?.conservativeHighPln ?? null,
  });
  if (forcedSale.loanToForcedSalePercent != null && forcedSale.loanToForcedSalePercent > 100) {
    warnings.push(
      "Kwota pożyczki przekracza spodziewany odzysk z licytacji komorniczej (II licytacja) — bardzo wysokie ryzyko.",
    );
  }
  if (forcedSale.residentialAuctionBlock.blocked) {
    warnings.push(forcedSale.residentialAuctionBlock.message);
  }

  // 8) Zbiorczy scoring.
  const combined = combineRiskAssessment({
    collateral,
    owner,
    kwLegal,
    correspondence,
    ocr,
    saleability,
    plotBuildability,
    master,
  });

  // 9) Rejestr wykorzystanych źródeł danych.
  const dataSources = buildDataSources({
    ocr,
    kwLegal,
    owner,
    correspondence,
    saleability,
    govBenchmark,
    collateral,
    master,
    marketComparables,
  });

  // 9) Executive summary.
  const valueStr = master.estimatedValueMidPln
    ? `${master.estimatedValueLowPln?.toLocaleString("pl-PL") ?? "—"}–${master.estimatedValueHighPln?.toLocaleString("pl-PL") ?? "—"} PLN`
    : collateral?.valuationBenchmark?.conservativeLowPln
      ? `${collateral.valuationBenchmark.conservativeLowPln.toLocaleString("pl-PL")}–${collateral.valuationBenchmark.conservativeHighPln?.toLocaleString("pl-PL") ?? "—"} PLN`
      : "brak wiarygodnej wyceny";
  const forcedStr = forcedSale.secondAuctionOpeningPln
    ? `Wymuszona sprzedaż (komornik): I licytacja od ${forcedSale.firstAuctionOpeningPln?.toLocaleString("pl-PL")} PLN, II licytacja od ${forcedSale.secondAuctionOpeningPln.toLocaleString("pl-PL")} PLN. `
    : "";
  const saleStr = saleability.available
    ? `Prognozowana łatwość sprzedaży: ${saleability.score}/100. `
    : "";
  const executiveSummary =
    `Ocena inwestycji: ${combined.investmentScore}/100 (klasa ${combined.riskGrade}) — ${recommendationLabel(combined.recommendation)}. ` +
    `Szacowana wartość nieruchomości: ${valueStr}. ` +
    saleStr +
    forcedStr +
    (master.suggestedMaxLoanAmountPln
      ? `Kwota odpowiadająca pułapowi LTV do ${master.suggestedLtvCapPercent ?? "—"}%: ${master.suggestedMaxLoanAmountPln.toLocaleString("pl-PL")} PLN (wskaźnik analityczny). `
      : "") +
    (combined.keyRisks.length
      ? `Główne ryzyka: ${combined.keyRisks.slice(0, 3).join("; ")}.`
      : "Nie zidentyfikowano krytycznych ryzyk.");

  const result: InvestmentRiskAssessment = {
    success: true,
    applicationId,
    generatedAt,
    investmentScore: combined.investmentScore,
    riskGrade: combined.riskGrade,
    recommendation: combined.recommendation,
    owner,
    kwLegal,
    correspondence,
    ocr,
    saleability,
    plotBuildability,
    govBenchmark,
    marketComparables,
    forcedSale,

    masterValuation: master,
    collateralAnalysis: collateral,
    componentScores: combined.componentScores,
    keyRisks: combined.keyRisks,
    keyStrengths: combined.keyStrengths,
    warnings: dedupeStr(warnings),
    dataSources,
    executiveSummary,
  };

  // 10) Zapis. Uwaga: supabase-js nie rzuca wyjątków — błąd trzeba odczytać z { error }.
  try {
    const { error: saveError } = await db.from("investment_risk_assessments").upsert(
      {
        application_id: applicationId,
        property_id: property?.id ?? null,
        client_id: clientId,
        investment_score: combined.investmentScore,
        risk_grade: combined.riskGrade,
        recommendation: combined.recommendation,
        saleability_score: saleability.available ? saleability.score : null,
        forced_sale_floor_pln: forcedSale.secondAuctionOpeningPln,
        result_json: result,
        data_sources: dataSources,
        warnings,
        master_valuation_status: master.status,
      },
      { onConflict: "application_id" },
    );
    if (saveError) throw saveError;
  } catch (e: any) {
    // Zapis nie może wywrócić całej oceny — ale musi być widoczny dla operatora.
    console.error("[risk-assessment] save failed:", e?.message ?? e);
    result.warnings = dedupeStr([
      ...result.warnings,
      `Nie udało się zapisać oceny w bazie (${e?.message ?? "błąd"}) — wynik nie będzie widoczny po odświeżeniu strony.`,
    ]);
  }

  return result;
}

function buildDataSources(a: {
  ocr: InvestmentRiskAssessment["ocr"];
  kwLegal: InvestmentRiskAssessment["kwLegal"];
  owner: InvestmentRiskAssessment["owner"];
  correspondence: InvestmentRiskAssessment["correspondence"];
  saleability: InvestmentRiskAssessment["saleability"];
  govBenchmark: InvestmentRiskAssessment["govBenchmark"];
  collateral: InvestmentRiskAssessment["collateralAnalysis"];
  master: InvestmentRiskAssessment["masterValuation"];
  marketComparables?: InvestmentRiskAssessment["marketComparables"];
}): DataSourceUsage[] {
  const sources: DataSourceUsage[] = [];

  // PODSTAWA WYCENY: scraping rynku (Firecrawl) — deweloperuch + otodom.
  const mc = a.marketComparables;
  sources.push({
    source:
      "Rynek porównawczy — deweloperuch.pl (transakcje domów/mieszkań) + otodom.pl (oferty mieszkań/domów/działek)",
    used: !!mc && (mc.status === "success" || mc.status === "partial"),
    purpose:
      "PODSTAWA WYCENY: twarde zł/m² ze scrapingu rynku (Firecrawl) — miasto/miejscowość + rodzaj nieruchomości",
    dataLevel: mc
      ? [
          mc.pricePerM2Median != null
            ? `mediana ${mc.pricePerM2Median.toLocaleString("pl-PL")} zł/m²`
            : null,
          `${mc.transactionsCount} transakcji`,
          `${mc.offersCount} ofert`,
          mc.street ? `rejon: ${mc.street}` : mc.city ? mc.city : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "—",
    period: "aktualne / ostatnie 12–24 mies.",
    status:
      mc?.status === "success"
        ? "success"
        : mc?.status === "partial"
          ? "partial"
          : mc?.status === "error"
            ? "error"
            : "no_data",
    note: mc && mc.status !== "success" ? mc.message : undefined,
  });

  // GUS BDL — pomocniczo (podstawa tylko dla gruntów rolnych: ceny zł/ha).
  const gb = a.govBenchmark;
  sources.push({
    source: "GUS BDL — ceny gruntów rolnych / przeciętne ceny lokali (dane rządowe, pomocniczo)",
    used: gb.gusPricePerHa != null || gb.gusPricePerM2Median != null,
    purpose:
      "dane pomocnicze — dla gruntów rolnych podstawa wyceny (zł/ha wg klasy), dla pozostałych typów fallback",
    dataLevel:
      [
        gb.gusPricePerHa != null ? `${gb.gusPricePerHa.toLocaleString("pl-PL")} zł/ha` : null,
        gb.gusPricePerM2Median != null
          ? `${gb.gusPricePerM2Median.toLocaleString("pl-PL")} zł/m²`
          : null,
        gb.unitName,
      ]
        .filter(Boolean)
        .join(", ") || "—",
    period: gb.period ?? "",
    status: gb.gusPricePerHa != null || gb.gusPricePerM2Median != null ? "success" : "no_data",
    note: gb.fallbackUsed ? `dane zastępcze: ${gb.unitLevel ?? ""}` : undefined,
  });

  sources.push({
    source: "Skany dokumentów (OCR — Gemini)",
    used: a.ocr.documentsProcessed > 0 && a.ocr.status !== "no_data",
    purpose: "odczyt operatów, wypisów, umów i zaświadczeń",
    dataLevel: `${a.ocr.documentsProcessed} dokumentów`,
    period: "",
    status: a.ocr.status,
  });
  sources.push({
    source: "Księga wieczysta (EKW / CMD KW Engine)",
    used: a.kwLegal.available,
    purpose:
      "stan prawny: adres (dz. I-O), własność (dz. II), obciążenia (dz. III), hipoteki (dz. IV)",
    dataLevel:
      [
        a.kwLegal.kwNumber ? `KW ${a.kwLegal.kwNumber}` : null,
        a.kwLegal.address?.fullAddress ?? null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    period: "",
    status: a.kwLegal.available ? "success" : "no_data",
  });
  sources.push({
    source: "Analiza właściciela (PESEL + tablice trwania życia GUS)",
    used: a.owner.peselValid,
    purpose: "wiek/płeć właściciela i aktuarialne ryzyko dożycia/sukcesji",
    dataLevel:
      a.owner.age != null
        ? `wiek ${a.owner.age}, e(x) ${a.owner.lifeExpectancy.remainingYears ?? "—"} lat`
        : "brak PESEL",
    period: "GUS 2022",
    status: a.owner.peselValid ? "success" : "no_data",
  });
  sources.push({
    source: "CEIDG — działalność gospodarcza właściciela",
    used: a.owner.businessActivity?.available ?? false,
    purpose: "czy właściciel jest przedsiębiorcą (JDG) — czynnik obniżający ryzyko",
    dataLevel: a.owner.businessActivity?.isEntrepreneur
      ? `przedsiębiorca (${a.owner.businessActivity.status}, dopasowanie: ${a.owner.businessActivity.matchConfidence})`
      : a.owner.businessActivity?.available
        ? "brak aktywnej działalności"
        : "—",
    period: "",
    status: a.owner.businessActivity?.available ? "success" : "no_data",
    note: a.owner.businessActivity?.note,
  });
  sources.push({
    source: "Korespondencja z klientem (e-mail / DM / transkrypcje)",
    used: a.correspondence.available,
    purpose: "analiza behawioralna, sygnały ostrzegawcze i niespójności",
    dataLevel: `${a.correspondence.messagesAnalyzed} wiadomości${a.correspondence.channels.length ? " (" + a.correspondence.channels.join(", ") + ")" : ""}`,
    period: "",
    status: a.correspondence.available
      ? "success"
      : a.correspondence.messagesAnalyzed > 0
        ? "partial"
        : "no_data",
  });

  sources.push({
    source: "Prognoza łatwości sprzedaży (Perplexity: popyt z otoczenia 20/50 km)",
    used: a.saleability.available,
    purpose:
      "zaludnienie, większe miasto, zbiornik wodny, kurort, sanatorium, atrakcje, dostępność",
    dataLevel: a.saleability.available
      ? `${a.saleability.score}/100 (${a.saleability.band.replace(/_/g, " ")})`
      : "—",
    period: "ostatnie 12 mies.",
    status: a.saleability.available ? "success" : "no_data",
  });
  sources.push({
    source: "Aktywne oferty sprzedaży w okolicy — ceny ofertowe (Perplexity)",
    used: a.saleability.localMarketOffers.totalActiveListings > 0,
    purpose: "realna podaż i ceny ofertowe w okolicy — sygnał płynności zbycia",
    dataLevel: `${a.saleability.localMarketOffers.agencyListings} ofert biur / ${a.saleability.localMarketOffers.totalActiveListings} ogółem (~${a.saleability.localMarketOffers.radiusKm} km)`,
    period: "oferty aktywne",
    status: a.saleability.localMarketOffers.totalActiveListings > 0 ? "success" : "no_data",
  });

  // Źródła z analizy zabezpieczenia (Google Maps, ISOK/Wody Polskie, Perplexity wstępna) — przenieś, by uniknąć duplikatów.
  if (a.collateral?.dataSourcesUsed?.length) {
    for (const s of a.collateral.dataSourcesUsed) {
      if (/perplexity/i.test(s.source)) continue; // wycena raportowana osobno (scraping rynku)
      sources.push(s);
    }
  }

  sources.push({
    source: "Wycena rynkowa (deterministyczna) — deweloperuch + otodom, GUS pomocniczo",
    used: a.master.status === "success",
    purpose:
      "wyliczenie wartości low/mid/high z mediany zł/m² × powierzchnia z KW (grunt rolny: GUS zł/ha × ha)",
    dataLevel: a.master.basisSource ?? "—",
    period: "aktualne dane rynkowe",
    status:
      a.master.status === "success"
        ? "success"
        : a.master.status === "no_data"
          ? "no_data"
          : "error",
    note:
      a.master.status === "success"
        ? recommendationLabel(a.master.recommendation)
        : a.master.errorMessage,
  });

  return sources;
}

function dedupeStr(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

export const getInvestmentRiskAssessment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseLike;
    try {
      const { data: row } = await db
        .from("investment_risk_assessments")
        .select("*")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return row ?? null;
    } catch {
      return null;
    }
  });

// ---- Podsumowanie dla kalkulatora inwestora (bezpieczny podzbiór) ----
// Zawiera WYŁĄCZNIE dane o nieruchomości i rynku: prognozowaną wartość, szybką/
// wymuszoną sprzedaż oraz ludność/otoczenie. NIE zawiera danych właściciela
// (PESEL/trwanie życia) ani analizy korespondencji.
export interface InvestorValuationSummary {
  predictedValue: {
    lowPln: number | null;
    midPln: number | null;
    highPln: number | null;
    marketTrend: string;
    suggestedMaxLoanAmountPln: number | null;
    suggestedLtvCapPercent: number | null;
  };
  quickSale: {
    firstAuctionOpeningPln: number | null;
    secondAuctionOpeningPln: number | null;
    expectedLowPln: number | null;
    expectedHighPln: number | null;
    likelyAuctionOutcome: string;
    residentialAuctionBlocked: boolean;
    residentialBlockMessage: string;
  };
  saleability: {
    available: boolean;
    score: number;
    band: string;
    estimatedDaysOnMarket: number | null;
    localityPopulation: number | null;
    populationTrend: string;
    nearestLargeCity: { name: string | null; population: number | null; distanceKm: number | null };
    demandDrivers: InvestmentRiskAssessment["saleability"]["demandDrivers"];
    offersTotal: number;
    offersAgency: number;
    medianPricePerM2: number | null;
    reasonableMarket: boolean;
    floor: { available: boolean; floorPietro: number | null; label: string } | null;
  };
  buildability: {
    applicable: boolean;
    category: string;
    buyerPool: string;
    valuationBasis: string;
    onlyFarmerCanBuild: boolean;
  } | null;
  govBenchmark: {
    available: boolean;
    primarySource: string;
    pricePerHa: number | null;
    pricePerM2Median: number | null;
    landValuePln: number | null;
    dwellingValuePln: number | null;
    rcnTransactions: number;
    rcnRadiusKm: number | null;
    unitName: string | null;
    unitLevel: string | null;
    period: string | null;
    soilCategory: string;
  } | null;
  generatedAt: string;
}

export const getInvestorValuationSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InvestorValuationSummary | null> => {
    const db = context.supabase as unknown as SupabaseLike;
    try {
      const { data: app } = await db
        .from("loan_applications")
        .select("id, available_to_investors")
        .eq("id", data.applicationId)
        .maybeSingle();
      if (!app || !app.available_to_investors) return null;

      const { data: row } = await db
        .from("investment_risk_assessments")
        .select("result_json")
        .eq("application_id", data.applicationId)
        .maybeSingle();
      const r = row?.result_json as InvestmentRiskAssessment | undefined;
      if (!r) return null;
      return buildInvestorValuationSummary(r);
    } catch {
      return null;
    }
  });

// Diagnostyka RCN — moduł wyłączony. Stub zachowany, aby nie łamać importów w UI.
export const diagnoseRcnForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async () => {
    return {
      ok: false as const,
      message:
        "Moduł RCN/GUS został wyłączony — bazujemy na rynku porównawczym (deweloperuch + otodom).",
    };
  });

/** Buduje bezpieczny (bez PII) podzbiór dla inwestora z pełnego dossier. */
export function buildInvestorValuationSummary(
  r: InvestmentRiskAssessment,
): InvestorValuationSummary {
  const mv = r.masterValuation;
  const cb = r.collateralAnalysis?.valuationBenchmark ?? null;
  return {
    predictedValue: {
      lowPln: mv.estimatedValueLowPln ?? cb?.conservativeLowPln ?? null,
      midPln: mv.estimatedValueMidPln ?? cb?.estimatedValueMedianPln ?? null,
      highPln: mv.estimatedValueHighPln ?? cb?.conservativeHighPln ?? null,
      marketTrend: mv.marketTrend,
      suggestedMaxLoanAmountPln: mv.suggestedMaxLoanAmountPln,
      suggestedLtvCapPercent: mv.suggestedLtvCapPercent,
    },
    quickSale: {
      firstAuctionOpeningPln: r.forcedSale.firstAuctionOpeningPln,
      secondAuctionOpeningPln: r.forcedSale.secondAuctionOpeningPln,
      expectedLowPln: r.forcedSale.expectedForcedSaleLowPln,
      expectedHighPln: r.forcedSale.expectedForcedSaleHighPln,
      likelyAuctionOutcome: r.forcedSale.likelyAuctionOutcome,
      residentialAuctionBlocked: r.forcedSale.residentialAuctionBlock.blocked,
      residentialBlockMessage: r.forcedSale.residentialAuctionBlock.message,
    },
    saleability: {
      available: r.saleability.available,
      score: r.saleability.score,
      band: r.saleability.band,
      estimatedDaysOnMarket: r.saleability.estimatedDaysOnMarket,
      localityPopulation: r.saleability.localityPopulation,
      populationTrend: r.saleability.populationTrend,
      nearestLargeCity: r.saleability.nearestLargeCity,
      demandDrivers: r.saleability.demandDrivers,
      offersTotal: r.saleability.localMarketOffers.totalActiveListings,
      offersAgency: r.saleability.localMarketOffers.agencyListings,
      medianPricePerM2: r.saleability.localMarketOffers.medianPricePerM2,
      reasonableMarket: r.saleability.reasonableMarket,
      floor: r.saleability.floorFactor
        ? {
            available: r.saleability.floorFactor.available,
            floorPietro: r.saleability.floorFactor.floorPietro,
            label: r.saleability.floorFactor.label,
          }
        : null,
    },
    buildability: r.plotBuildability?.applicable
      ? {
          applicable: true,
          category: r.plotBuildability.category,
          buyerPool: r.plotBuildability.buyerPool,
          valuationBasis: r.plotBuildability.valuationBasis,
          onlyFarmerCanBuild: r.plotBuildability.onlyFarmerCanBuild,
        }
      : null,
    govBenchmark: r.govBenchmark?.available
      ? {
          available: true,
          primarySource: r.govBenchmark.primarySource,
          pricePerHa: r.govBenchmark.pricePerHa,
          pricePerM2Median: r.govBenchmark.pricePerM2Median,
          landValuePln: r.govBenchmark.landValuePln,
          dwellingValuePln: r.govBenchmark.dwellingValuePln,
          rcnTransactions: r.govBenchmark.rcnTransactions,
          rcnRadiusKm: r.govBenchmark.rcnRadiusKm,
          unitName: r.govBenchmark.unitName,
          unitLevel: r.govBenchmark.unitLevel,
          period: r.govBenchmark.period,
          soilCategory: r.govBenchmark.soilCategory,
        }
      : null,
    generatedAt: r.generatedAt,
  };
}
