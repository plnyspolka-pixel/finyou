import { describe, it, expect } from "vitest";
import { computeMarketValuation, type MarketValuationInput } from "./market-valuation";
import type { MarketComparablesResult, GovBenchmark } from "./types";

function mc(over: Partial<MarketComparablesResult> = {}): MarketComparablesResult {
  return {
    status: "success",
    message: "OK",
    query: "mieszkanie Poznań",
    city: "Poznań",
    street: null,
    transactionsCount: 6,
    offersCount: 8,
    pricePerM2Median: 10_000,
    pricePerM2Average: 10_200,
    pricePerM2Min: 8_000,
    pricePerM2Max: 13_000,
    pricePerM2P25: 9_000,
    pricePerM2P75: 11_500,
    sample: [
      {
        source: "otodom.pl",
        kind: "offer",
        url: "https://www.otodom.pl/pl/oferta/x",
        title: "Oferta",
        address: null,
        pricePln: 500_000,
        areaM2: 50,
        pricePerM2: 10_000,
        date: null,
      },
    ],
    summaryLine: "",
    ...over,
  };
}

function gov(over: Partial<GovBenchmark> = {}): GovBenchmark {
  return {
    source: "GUS BDL",
    available: true,
    propertyType: "grunt_rolny",
    primarySource: "GUS BDL",
    pricePerHa: 60_000,
    pricePerM2Median: null,
    pricePerM2Average: null,
    soilClass: "R IVa",
    soilCategory: "srednie",
    areaHa: 2,
    landValuePln: 120_000,
    dwellingValuePln: null,
    gusPricePerHa: 60_000,
    gusPricePerM2Median: null,
    rcnAvailable: false,
    rcnPricePerHa: null,
    rcnPricePerM2: null,
    rcnTransactions: 0,
    rcnRadiusKm: null,
    rcnStatus: "disabled",
    rcnStatusMessage: "",
    unitName: "Powiat X",
    unitLevel: "powiat",
    period: "2024",
    fallbackUsed: false,
    summaryLine: "",
    warnings: [],
    ...over,
  };
}

function baseInput(over: Partial<MarketValuationInput> = {}): MarketValuationInput {
  return {
    propertyType: "mieszkanie",
    areaM2: 50,
    landAreaHa: null,
    declaredValuePln: null,
    requestedLoanPln: null,
    marketComparables: mc(),
    govBenchmark: null,
    kwLegal: {
      hasEnforcement: false,
      hasUsufruct: false,
      totalMortgageAmountPln: null,
      mortgages: [],
    },
    ownerMatchesKw: true,
    saleabilityScore: 70,
    ...over,
  };
}

describe("computeMarketValuation", () => {
  it("wycenia mieszkanie z mediany scrapingu × powierzchnia, widełki z kwartyli", () => {
    const v = computeMarketValuation(baseInput());
    expect(v.status).toBe("success");
    expect(v.estimatedValueMidPln).toBe(500_000); // 10 000 zł/m² × 50 m²
    expect(v.estimatedValueLowPln).toBe(450_000); // P25 9 000 × 50
    expect(v.estimatedValueHighPln).toBe(575_000); // P75 11 500 × 50
    expect(v.basisSource).toContain("deweloperuch");
    expect(v.suggestedLtvCapPercent).toBe(65);
    expect(v.suggestedMaxLoanAmountPln).toBe(325_000);
    expect(v.recommendation).toBe("rekomendowana");
  });

  it("grunt rolny: podstawą są ceny GUS zł/ha × ha (scraping tylko pomocniczo)", () => {
    const v = computeMarketValuation(
      baseInput({
        propertyType: "grunt_rolny",
        areaM2: 20_000,
        landAreaHa: 2,
        govBenchmark: gov(),
        marketComparables: mc({ pricePerM2Median: 25 }),
      }),
    );
    expect(v.status).toBe("success");
    expect(v.estimatedValueMidPln).toBe(120_000); // 60 000 zł/ha × 2 ha
    expect(v.basisSource).toContain("GUS");
    expect(v.suggestedLtvCapPercent).toBe(45);
  });

  it("fallback GUS zł/m², gdy scraping bez danych (nie-rolne)", () => {
    const v = computeMarketValuation(
      baseInput({
        marketComparables: mc({ status: "no_data", pricePerM2Median: null }),
        govBenchmark: gov({
          propertyType: "mieszkanie",
          pricePerHa: null,
          gusPricePerHa: null,
          pricePerM2Median: 8_000,
          gusPricePerM2Median: 8_000,
        }),
      }),
    );
    expect(v.status).toBe("success");
    expect(v.estimatedValueMidPln).toBe(400_000);
    expect(v.basisSource).toContain("GUS BDL — przeciętne");
    expect(v.keyRisks.join(" ")).toMatch(/fallback/i);
  });

  it("no_data bez rynku i GUS; oraz bez powierzchni", () => {
    const noMarket = computeMarketValuation(
      baseInput({ marketComparables: null, govBenchmark: null }),
    );
    expect(noMarket.status).toBe("no_data");
    expect(noMarket.recommendation).toBe("do_weryfikacji");

    const noArea = computeMarketValuation(baseInput({ areaM2: null }));
    expect(noArea.status).toBe("no_data");
    expect(noArea.errorMessage).toMatch(/powierzchni/);
  });

  it("egzekucja obniża pułap LTV i zaostrza klasyfikację", () => {
    const v = computeMarketValuation(
      baseInput({
        kwLegal: {
          hasEnforcement: true,
          hasUsufruct: false,
          totalMortgageAmountPln: 200_000,
          mortgages: [{ text: "hipoteka", amount: 200_000, currency: "PLN", creditor: "Bank" }],
        },
      }),
    );
    expect(v.suggestedLtvCapPercent).toBe(55); // 65 − 10 (egzekucja)
    expect(v.recommendation).toBe("warunkowa");
    expect(v.keyRisks.join(" ")).toMatch(/Egzekucja/);
    expect(v.keyRisks.join(" ")).toMatch(/Hipoteki/);
  });

  it("flaguje rozjazd wartości deklarowanej i przekroczenie kwoty przy pułapie LTV", () => {
    const v = computeMarketValuation(
      baseInput({ declaredValuePln: 900_000, requestedLoanPln: 400_000 }),
    );
    expect(v.keyRisks.join(" ")).toMatch(/deklarowana/);
    expect(v.keyRisks.join(" ")).toMatch(/przekracza/);
  });
});
