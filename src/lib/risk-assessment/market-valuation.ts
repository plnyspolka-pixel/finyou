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
  const isAgri = i.propertyType === "grunt_rolny";
  const mc = i.marketComparables;
  const gov = i.govBenchmark;
  const mcUsable =
    !!mc && (mc.status === "success" || mc.status === "partial") && mc.pricePerM2Median != null;
  const sampleN = mc ? mc.transactionsCount + mc.offersCount : 0;

  let low: number | null = null;
  let mid: number | null = null;
  let high: number | null = null;
  let basisSource = "brak";
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
    mid = Math.round(medPpm2 * i.areaM2);
    low = Math.round(Math.min(lowPpm2, medPpm2) * i.areaM2);
    high = Math.round(Math.max(highPpm2, medPpm2) * i.areaM2);
    basisSource =
      mc!.transactionsCount > 0
        ? "deweloperuch.pl (transakcje) + otodom.pl (oferty)"
        : "otodom.pl (aktywne oferty)";
    rationaleParts.push(
      `Wycena ze scrapingu rynku: mediana ${medPpm2.toLocaleString("pl-PL")} zł/m² (${mc!.transactionsCount} transakcji deweloperuch, ${mc!.offersCount} ofert otodom${mc!.city ? `, ${mc!.city}` : ""}) × ${i.areaM2} m² = ${mid.toLocaleString("pl-PL")} PLN; widełki z kwartyli próbki.`,
    );
    if (isAgri)
      rationaleParts.push("Uwaga: brak danych GUS dla gruntu rolnego — użyto ofert rynkowych.");
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

  if (mcUsable && sampleN < 3)
    keyRisks.push(`Wąska próbka porównawcza (${sampleN} rekordów) — wycena o obniżonej pewności.`);
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
  };
}
