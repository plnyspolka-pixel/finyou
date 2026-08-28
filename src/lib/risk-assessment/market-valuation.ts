// Deterministyczna WYCENA RYNKOWA — zastępuje dawną „nadrzędną wycenę Perplexity".
// Podstawa: scraping rynku (deweloperuch.pl — rzeczywiste transakcje domów/mieszkań,
// otodom.pl — aktywne oferty mieszkań/domów/działek). Dane GUS BDL wyłącznie
// POMOCNICZO — przede wszystkim dla gruntów rolnych (ceny zł/ha wg klasy).
// Czysta, testowalna logika — bez zależności serwerowych i bez LLM.

import type {
  MasterValuation,
  MarketComparablesResult,
  GovBenchmark,
  KwLegalAnalysis,
  Recommendation,
} from "./types";
import type { ValuationBasis } from "./plot-buildability";

export interface MarketValuationInput {
  propertyType: string;
  /** Powierzchnia przyjęta do wyceny: użytkowa (mieszkanie/dom/lokal) lub gruntu (działki), m². */
  areaM2: number | null;
  /** Obszar gruntu w ha (działki / grunt rolny). */
  landAreaHa: number | null;
  declaredValuePln: number | null;
  requestedLoanPln: number | null;
  marketComparables: MarketComparablesResult | null;
  /** GUS BDL — pomocniczo; dla gruntu rolnego podstawa (zł/ha × ha). */
  govBenchmark: GovBenchmark | null;
  kwLegal: Pick<
    KwLegalAnalysis,
    "hasEnforcement" | "hasUsufruct" | "totalMortgageAmountPln" | "mortgages"
  >;
  ownerMatchesKw: boolean | null;
  saleabilityScore: number | null;
  onlyFarmerCanBuild?: boolean;
  /**
   * Podstawa wyceny wskazana przez analizę prawa zabudowy (dział I-O KW ma
   * pierwszeństwo przed typem z wniosku): „rolna_gus" wymusza wycenę wg cen
   * gruntów rolnych GUS (zł/ha), nawet gdy wniosek deklaruje działkę budowlaną.
   */
  valuationBasis?: ValuationBasis | null;
}

// Ceny zł/m² małych działek (typowe ogłoszenia ~500–3000 m²) nie skalują się
// liniowo na duże areały. Powyżej progu każdy kolejny m² liczymy z malejącą
// wartością krańcową; bez tej korekty 9 ha pola wycenialiśmy jak 90 działek
// budowlanych w mieście.
const PLOT_FULL_PRICE_AREA_M2 = 3000;
const PLOT_MARGINAL_FACTOR = 0.25;
// Powyżej 1 ha wycena z komparabli małych działek to już ekstrapolacja poza
// segment rynku — wynik traktujemy jako wymagający ręcznej weryfikacji.
const PLOT_EXTRAPOLATION_LIMIT_M2 = 10_000;

function isPlotPropertyType(propertyType: string): boolean {
  return /dzialka|działka|grunt|siedlisk/.test((propertyType || "").toLowerCase());
}

/** Wartość działki z zł/m² z korektą wielkości (malejąca wartość krańcowa). */
export function plotValueWithSizeAdjustment(ppm2: number, areaM2: number): number {
  if (areaM2 <= PLOT_FULL_PRICE_AREA_M2) return Math.round(ppm2 * areaM2);
  return Math.round(
    ppm2 * PLOT_FULL_PRICE_AREA_M2 +
      ppm2 * PLOT_MARGINAL_FACTOR * (areaM2 - PLOT_FULL_PRICE_AREA_M2),
  );
}

const VALUATION_DISCLAIMER =
  "Wycena automatyczna (wskaźnik analityczny) — nie stanowi operatu szacunkowego ani porady inwestycyjnej.";

function ltvCapBase(propertyType: string): number {
  const t = (propertyType || "").toLowerCase();
  if (/mieszk/.test(t)) return 65;
  if (/dom/.test(t)) return 60;
  if (/lokal/.test(t)) return 50;
  if (/grunt_rolny|rolny/.test(t)) return 45;
  if (/dzialka|działka/.test(t)) return 50;
  return 45;
}

function pct(n: number, p: number): number {
  return Math.round(n * p);
}

export function computeMarketValuation(i: MarketValuationInput): MasterValuation {
  // Status rolny wynika z typu wniosku LUB z analizy prawa zabudowy (dział I-O KW
  // „R - GRUNTY ORNE" itp. wymusza podstawę rolną mimo deklaracji „budowlana").
  const isAgri = i.propertyType === "grunt_rolny" || i.valuationBasis === "rolna_gus";
  const isPlot = isPlotPropertyType(i.propertyType);
  const mc = i.marketComparables;
  const gov = i.govBenchmark;
  const mcUsable =
    !!mc && (mc.status === "success" || mc.status === "partial") && mc.pricePerM2Median != null;
  const sampleN = mc ? mc.transactionsCount + mc.offersCount : 0;

  let low: number | null = null;
  let mid: number | null = null;
  let high: number | null = null;
  let basisSource = "brak";
  let sizeAdjusted = false;
  const rationaleParts: string[] = [];

  if (isAgri && gov?.pricePerHa != null && i.landAreaHa != null) {
    // GRUNT ROLNY — podstawą są urzędowe ceny gruntów rolnych GUS (zł/ha wg klasy).
    mid = Math.round(gov.pricePerHa * i.landAreaHa);
    low = pct(mid, 0.85);
    high = pct(mid, 1.1);
    basisSource = "GUS BDL — ceny gruntów rolnych (zł/ha)";
    rationaleParts.push(
      `Grunt rolny: wycena wg cen GUS ${gov.pricePerHa.toLocaleString("pl-PL")} zł/ha (klasa: ${gov.soilCategory}${gov.unitName ? `, ${gov.unitName}` : ""}) × ${i.landAreaHa} ha = ${mid.toLocaleString("pl-PL")} PLN.`,
    );
    if (mcUsable) {
      rationaleParts.push(
        `Pomocniczo rynek (otodom): mediana ofert ${mc!.pricePerM2Median!.toLocaleString("pl-PL")} zł/m² z ${sampleN} rekordów.`,
      );
    }
  } else if (mcUsable && i.areaM2 != null && i.areaM2 > 0) {
    // MIESZKANIE / DOM / DZIAŁKA — podstawą jest scraping rynku (deweloperuch + otodom).
    const medPpm2 = mc!.pricePerM2Median!;
    const lowPpm2 = mc!.pricePerM2P25 ?? pct(medPpm2, 0.85);
    const highPpm2 = mc!.pricePerM2P75 ?? pct(medPpm2, 1.1);
    if (isPlot && i.areaM2 > PLOT_FULL_PRICE_AREA_M2) {
      // Duża działka: zł/m² z ogłoszeń dotyczy małych działek — korekta wielkości.
      sizeAdjusted = true;
      mid = plotValueWithSizeAdjustment(medPpm2, i.areaM2);
      low = plotValueWithSizeAdjustment(Math.min(lowPpm2, medPpm2), i.areaM2);
      high = plotValueWithSizeAdjustment(Math.max(highPpm2, medPpm2), i.areaM2);
      rationaleParts.push(
        `Wycena ze scrapingu rynku z KOREKTĄ WIELKOŚCI działki: mediana ${medPpm2.toLocaleString("pl-PL")} zł/m² (${mc!.transactionsCount} transakcji deweloperuch, ${mc!.offersCount} ofert otodom${mc!.city ? `, ${mc!.city}` : ""}); pierwsze ${PLOT_FULL_PRICE_AREA_M2.toLocaleString("pl-PL")} m² po pełnej stawce, powyżej — ${Math.round(PLOT_MARGINAL_FACTOR * 100)}% stawki (ceny małych działek nie skalują się liniowo na ${i.areaM2.toLocaleString("pl-PL")} m²). Wynik: ${mid.toLocaleString("pl-PL")} PLN.`,
      );
    } else {
      mid = Math.round(medPpm2 * i.areaM2);
      low = Math.round(Math.min(lowPpm2, medPpm2) * i.areaM2);
      high = Math.round(Math.max(highPpm2, medPpm2) * i.areaM2);
      rationaleParts.push(
        `Wycena ze scrapingu rynku: mediana ${medPpm2.toLocaleString("pl-PL")} zł/m² (${mc!.transactionsCount} transakcji deweloperuch, ${mc!.offersCount} ofert otodom${mc!.city ? `, ${mc!.city}` : ""}) × ${i.areaM2} m² = ${mid.toLocaleString("pl-PL")} PLN; widełki z kwartyli próbki.`,
      );
    }
    basisSource =
      mc!.transactionsCount > 0
        ? "deweloperuch.pl (transakcje) + otodom.pl (oferty)"
        : "otodom.pl (aktywne oferty)";
    if (isAgri)
      rationaleParts.push(
        "Uwaga: grunt o statusie rolnym bez danych GUS (zł/ha) — użyto ofert rynkowych; wynik traktuj ostrożnie.",
      );
  } else if (!isAgri && gov?.pricePerM2Median != null && i.areaM2 != null && i.areaM2 > 0) {
    // Fallback pomocniczy: GUS zł/m² (przeciętne ceny lokali), gdy scraping nie dał danych.
    mid = Math.round(gov.pricePerM2Median * i.areaM2);
    low = pct(mid, 0.8);
    high = pct(mid, 1.1);
    basisSource = "GUS BDL — przeciętne ceny (pomocniczo, brak danych ze scrapingu)";
    rationaleParts.push(
      `Scraping rynku nie zwrócił danych — pomocniczo GUS: ${gov.pricePerM2Median.toLocaleString("pl-PL")} zł/m²${gov.unitName ? ` (${gov.unitName})` : ""} × ${i.areaM2} m² = ${mid.toLocaleString("pl-PL")} PLN.`,
    );
  }

  if (mid == null) {
    const why =
      i.areaM2 == null && !(isAgri && i.landAreaHa != null)
        ? "brak powierzchni nieruchomości (KW/wniosek)"
        : "brak danych porównawczych ze scrapingu (deweloperuch/otodom) i danych GUS";
    return {
      status: "no_data",
      basisSource: "brak",
      estimatedValueLowPln: null,
      estimatedValueMidPln: null,
      estimatedValueHighPln: null,
      suggestedMaxLoanAmountPln: null,
      suggestedLtvCapPercent: null,
      marketTrend: "nieznany",
      liquidityComment: "",
      keyRisks: ["Brak wiarygodnej wyceny rynkowej — wymagana ręczna weryfikacja."],
      keyStrengths: [],
      recommendation: "do_weryfikacji",
      rationale: `${VALUATION_DISCLAIMER} Nie wyznaczono wartości: ${why}.`,
      citations: [],
      errorMessage: `Nie wyznaczono wyceny: ${why}.`,
    };
  }

  // Pułap LTV i bezpieczna kwota — deterministycznie, z karami za ryzyka prawne/płynność.
  let ltvCap = ltvCapBase(i.propertyType);
  if (i.kwLegal.hasEnforcement) ltvCap -= 10;
  if (i.kwLegal.hasUsufruct) ltvCap -= 5;
  if (i.onlyFarmerCanBuild) ltvCap -= 5;
  if (i.saleabilityScore != null && i.saleabilityScore < 45) ltvCap -= 5;
  ltvCap = Math.max(20, ltvCap);
  const suggestedMaxLoan = pct(mid, ltvCap / 100);

  const keyRisks: string[] = [];
  const keyStrengths: string[] = [];
  const offersOnly = basisSource === "otodom.pl (aktywne oferty)";
  const extrapolatedPlot =
    sizeAdjusted && i.areaM2 != null && i.areaM2 > PLOT_EXTRAPOLATION_LIMIT_M2;

  if (mcUsable && sampleN < 3)
    keyRisks.push(`Wąska próbka porównawcza (${sampleN} rekordów) — wycena o obniżonej pewności.`);
  if (offersOnly)
    keyRisks.push(
      "Wycena wyłącznie z cen ofertowych (0 transakcji) — ceny wywoławcze bywają zawyżone.",
    );
  if (sizeAdjusted)
    keyRisks.push(
      `Duża działka (${i.areaM2!.toLocaleString("pl-PL")} m²) wyceniona z cen małych działek z korektą wielkości — obniżona pewność wyceny.`,
    );
  if (extrapolatedPlot)
    keyRisks.push(
      "Powierzchnia działki przekracza 1 ha — wycena z komparabli małych działek to ekstrapolacja poza segment rynku; wymagana ręczna weryfikacja (operat/MPZP).",
    );
  if (
    i.requestedLoanPln != null &&
    i.requestedLoanPln > 0 &&
    mid != null &&
    mid > 100 * i.requestedLoanPln
  )
    keyRisks.push(
      `Wycena (${mid.toLocaleString("pl-PL")} PLN) jest nieproporcjonalnie wysoka względem wnioskowanej kwoty (${i.requestedLoanPln.toLocaleString("pl-PL")} PLN) — sprawdź poprawność lokalizacji, typu i powierzchni w danych wejściowych.`,
    );
  if (basisSource.startsWith("GUS BDL — przeciętne"))
    keyRisks.push(
      "Wycena oparta o przeciętne GUS (fallback) — brak lokalnych danych ze scrapingu rynku.",
    );
  if (i.kwLegal.mortgages.length > 0) {
    keyRisks.push(
      `Hipoteki w dziale IV${i.kwLegal.totalMortgageAmountPln ? ` (~${i.kwLegal.totalMortgageAmountPln.toLocaleString("pl-PL")} PLN)` : ""} obniżają wartość zabezpieczenia netto.`,
    );
  }
  if (i.kwLegal.hasEnforcement) keyRisks.push("Egzekucja/zajęcie w KW — pułap LTV obniżony.");
  if (i.kwLegal.hasUsufruct)
    keyRisks.push("Służebność/dożywocie — ograniczenie zbywalności i wartości.");
  if (
    i.declaredValuePln != null &&
    (i.declaredValuePln < pct(mid, 0.7) || i.declaredValuePln > pct(mid, 1.3))
  ) {
    keyRisks.push(
      `Wartość deklarowana (${i.declaredValuePln.toLocaleString("pl-PL")} PLN) istotnie odbiega od wyceny rynkowej (${mid.toLocaleString("pl-PL")} PLN).`,
    );
  }
  if (
    i.requestedLoanPln != null &&
    suggestedMaxLoan != null &&
    i.requestedLoanPln > suggestedMaxLoan
  ) {
    keyRisks.push(
      `Wnioskowana kwota (${i.requestedLoanPln.toLocaleString("pl-PL")} PLN) przekracza kwotę przy pułapie LTV ${ltvCap}% (${suggestedMaxLoan.toLocaleString("pl-PL")} PLN).`,
    );
  }

  if (mc && mc.transactionsCount >= 3)
    keyStrengths.push(
      `Wycena kotwiczona w rzeczywistych transakcjach (deweloperuch.pl: ${mc.transactionsCount}).`,
    );
  if (sampleN >= 8) keyStrengths.push(`Solidna próbka porównawcza (${sampleN} rekordów z rynku).`);
  if (isAgri && basisSource.startsWith("GUS"))
    keyStrengths.push("Grunt rolny wyceniony wg urzędowych cen GUS — stabilna, płynna kotwica.");

  let recommendation: Recommendation = "rekomendowana";
  if (i.kwLegal.hasEnforcement || i.ownerMatchesKw === false) recommendation = "warunkowa";
  // Ekstrapolacja poza segment rynku (działka >1 ha z cen małych działek) —
  // wynik liczbowy zostaje jako wskaźnik, ale rekomendacja wymaga człowieka.
  if (extrapolatedPlot) recommendation = "do_weryfikacji";
  else if (sizeAdjusted && recommendation === "rekomendowana") recommendation = "warunkowa";

  const liquidityComment = mc
    ? `Aktywna podaż w okolicy: ${mc.offersCount} ofert (otodom), ${mc.transactionsCount} transakcji (deweloperuch).`
    : "";

  const citations = (mc?.sample ?? [])
    .map((s) => s.url)
    .filter((u): u is string => !!u)
    .slice(0, 10);

  return {
    status: "success",
    basisSource,
    estimatedValueLowPln: low,
    estimatedValueMidPln: mid,
    estimatedValueHighPln: high,
    suggestedMaxLoanAmountPln: suggestedMaxLoan,
    suggestedLtvCapPercent: ltvCap,
    marketTrend: "nieznany",
    liquidityComment,
    keyRisks,
    keyStrengths,
    recommendation,
    rationale: `${rationaleParts.join(" ")} Podstawa: ${basisSource}. ${VALUATION_DISCLAIMER}`,
    citations,
    offersOnly,
    sizeAdjusted,
  };
}
