/**
 * Raport analityczny inwestora w PDF: model z danych trzech widoków
 * (Analityka, analiza własnego wniosku, raport Projektu w Zleceniach) i plik
 * pdf-lib. Model nie może przenieść komunikatów do pośrednika/klienta ani
 * pełnego PESEL, zastrzeżenia są raz, skala A–E inwestycji i kategoria
 * zbywalności mają osobne tytuły, a każdy znak mieści się w foncie.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { KwAnalysisResult, KwFinding } from "@/lib/kw-analysis/types";
import { REPORT_DISCLAIMER } from "@/lib/kw-analysis/policy";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";
import {
  buildInvestorValuationSummary,
  type InvestorValuationSummary,
} from "@/lib/risk-assessment/risk-assessment.functions";
import type { OrderProjectReportDetail } from "@/lib/investor-agreements/order-projects.functions";
import {
  sanitizeCoOwnersForTeaser,
  sanitizeCollateralForTeaser,
  sanitizeKwAnalysisForTeaser,
} from "@/lib/investor-agreements/order-report-teaser";
import { charsOutsideFont } from "@/lib/pdf/report-writer";
import type { AnalyticsCoOwners, AnalyticsDetail, KwCheckDetail } from "./types";
import {
  GRADE_SECTION_TITLE,
  REPORT_TEASER_NOTE,
  RISK_DISCLAIMER_TEXT,
  SELLABILITY_SECTION_TITLE,
  VALUATION_NOT_APPRAISAL,
  buildInvestorReportModel,
  renderInvestorReportPdf,
  reportModelText,
  reportPdfFilename,
  type InvestorReportModel,
  type InvestorReportSource,
} from "./report-pdf";

const DATE = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));
const PESEL = "80010112345";
const SECRET_INTERMEDIARY = "DLA-POSREDNIKA: zadzwoń do klienta po prowizję";
const SECRET_CLIENT = "DO-KLIENTA: Dzień dobry Pani Grażyno";

function finding(i: number, over: Partial<KwFinding> = {}): KwFinding {
  return {
    id: `f${i}`,
    ruleId: `R${i}`,
    ruleVersion: "1",
    category: i % 2 ? "MORTGAGE" : "RIGHT_OR_CLAIM",
    status: i === 0 ? "STOP" : i % 3 === 0 ? "WARUNKOWO_DOPUSZCZALNE" : "INFORMACYJNE",
    title: `Znalezisko ${i + 1}: hipoteka umowna na rzecz banku`,
    plainLanguageSummary:
      "W dziale IV widnieje hipoteka umowna — trzeba ustalić saldo i pierwszeństwo. ✓ sprawdzono treść.",
    source: [
      {
        section: "II",
        fieldCode: "2.2.5",
        entryNumber: "1",
        fieldLabel: "Osoba fizyczna",
        rawValue: `Żukowska Grażyna, PESEL ${PESEL}, córka Jana`,
      },
    ],
    detectedValue: null,
    whyItMatters: "Wpis poprzedza hipotekę inwestora.",
    rankImpact: "DIRECT",
    enforcementImpact: "POSSIBLE",
    expectedFromClient: "Zaświadczenie banku o saldzie zadłużenia.",
    requestedDocuments: [
      { code: "BANK_CERT", label: "Zaświadczenie wierzyciela", requiredFields: ["saldo", "data"] },
    ],
    proposedResolution: "Spłata z wypłaty pożyczki i wykreślenie hipoteki.",
    agreementCondition: "Zgoda banku na wykreślenie.",
    payoutCondition: "Wypłata bezpośrednio na rachunek banku.",
    intermediaryMessage: SECRET_INTERMEDIARY,
    clientMessage: SECRET_CLIENT,
    investorMessage: "Hipoteka inwestora po spłacie banku — 1. miejsce.",
    resolutionState: "UNRESOLVED",
    confidence: 0.9,
    ...over,
  };
}

function kwResult(findings = 3): KwAnalysisResult {
  return {
    kwNumber: "SL1S/00012344/8",
    fetchedAt: "2026-10-01T10:00:00Z",
    rulesetVersion: "kw-analysis@1.2.0",
    overallStatus: "STOP",
    findings: Array.from({ length: findings }, (_, i) => finding(i)),
    priority: {
      determinable: true,
      expectedInvestorRank: 1,
      effectivePriorEncumbrances: [
        {
          kind: "MORTGAGE",
          label: "Hipoteka umowna — PKO BP",
          sum: 120000,
          currency: "PLN",
          creditor: "PKO BP",
          evidence: { section: "IV", rawValue: "hipoteka" },
        },
      ],
      activeCompetingMentions: [],
      usesVacantRank: false,
      explanation: "Po spłacie banku hipoteka inwestora będzie na 1. miejscu.",
      evidence: [],
      requiredConditions: ["Spłata hipoteki PKO BP przed wypłatą."],
    },
    ltv: {
      determinable: true,
      mortgageSumFromKw: 120000,
      seniorBalanceFromCertificate: null,
      priorExposureForCltv: null,
      priorExposureSource: "none",
      newLoanExposure: 90000,
      acceptedPropertyValue: 231795,
      cltv: 0.39,
      maxCltv: 0.5,
      withinPolicy: true,
      note: "CLTV 39% ≤ limit 50%.",
    },
    activeMentionCount: 0,
    unresolvedFindingCount: findings,
    disclaimer: REPORT_DISCLAIMER,
    computedFrom: { ownersCount: 1, mortgagesCount: 1, sectionThreeCount: 0 },
  };
}

function valuation(): InvestorValuationSummary {
  return {
    riskGrade: "B",
    investmentScore: 76,
    recommendation: "rekomendowana",
    recommendationLabel: "Profil niskiego ryzyka",
    predictedValue: {
      lowPln: 410000,
      midPln: 450000,
      highPln: 490000,
      marketTrend: "stabilny",
      suggestedMaxLoanAmountPln: 225000,
      suggestedLtvCapPercent: 50,
    },
    quickSale: {
      firstAuctionOpeningPln: 337500,
      secondAuctionOpeningPln: 300000,
      expectedLowPln: 290000,
      expectedHighPln: 340000,
      likelyAuctionOutcome: "pierwsza_licytacja",
      residentialAuctionBlocked: true,
      residentialBlockMessage: "Należność główna poniżej 5% wartości nieruchomości.",
    },
    saleability: {
      available: true,
      score: 81,
      band: "latwa",
      sellabilityCategory: {
        category: "A",
        label: "mieszkanie w dużym mieście",
        rationale: "Miasto powyżej 100 tys. mieszkańców.",
      },
      estimatedDaysOnMarket: 60,
      localityPopulation: 89000,
      populationTrend: "malejaca",
      nearestLargeCity: { name: "Gdańsk", population: 486000, distanceKm: 120 },
      demandDrivers: {
        largeCityWithin50km: false,
        waterBodyWithin20km: true,
        spaResortWithin20km: false,
        sanatoriumWithin20km: false,
        touristAttractionWithin20km: true,
        majorRoadWithin10km: true,
      },
      offersTotal: 240,
      offersAgency: 180,
      medianPricePerM2: 6900,
      reasonableMarket: true,
      floor: { available: true, floorPietro: 2, label: "piętro środkowe — neutralnie" },
    },
    buildability: null,
    govBenchmark: null,
    generatedAt: "2026-10-01T10:05:00Z",
  };
}

function collateral(): PropertyAnalysisResult {
  return {
    success: true,
    property: {
      type: "mieszkanie",
      address: "ul. Kwiatowa 5/3, 76-200 Słupsk",
      kwNumber: "SL1S/00012344/8",
      parcelNumber: "12/3",
      county: "słupski",
      voivodeship: "pomorskie",
      latitude: 54.46,
      longitude: 17.02,
      usableAreaM2: 54,
      landAreaM2: null,
      landAreaHa: null,
    },
    dataSourcesUsed: [
      {
        source: "Portale nieruchomości",
        used: true,
        purpose: "Wycena porównawcza",
        dataLevel: "miasto",
        period: "2026",
        status: "success",
      },
      {
        source: "Nieużyte źródło",
        used: false,
        purpose: "—",
        dataLevel: "—",
        period: "—",
        status: "skipped",
      },
    ],
    valuationBenchmark: {
      mainSource: "portale",
      supportingSources: [],
      pricePerM2Median: 7000,
      pricePerM2Average: 7100,
      pricePerHa: null,
      estimatedValueMedianPln: 450000,
      estimatedValueAveragePln: 455000,
      conservativeLowPln: 400000,
      conservativeHighPln: 470000,
      declaredValuePln: 480000,
      varianceFromDeclaredValuePercent: -6,
    },
    ltv: {
      requestedLoanAmountPln: 90000,
      estimatedValuePln: 450000,
      ltvPercent: 20,
      ltvCategory: "safe",
    },
    locationScore: { score: 70, summary: "Dobra lokalizacja.", liquidityComment: "Płynny rynek." },
    legalRisk: { score: 80, warnings: [] },
    marketLiquidity: { score: 70, summary: "Płynny rynek.", transactionsCount: 40 },
    collateralScore: {
      total: 78,
      category: "dobre",
      components: {
        legalAndDocuments: 80,
        valueAndLtv: 85,
        marketLiquidity: 70,
        technicalAndUseRisks: 70,
        dataQuality: 75,
      },
      summary: "Dobre zabezpieczenie.",
      mainRisks: ["Malejąca liczba mieszkańców"],
      mainStrengths: ["Niskie LTV", "Płynny rynek mieszkań"],
    },
    investmentOfferText: {
      propertySummary: "Mieszkanie 54 m².",
      valuationSummary: "Wycena 450 tys. zł.",
      locationSummary: "Centrum.",
      legalRiskSummary: "Hipoteka do spłaty.",
      collateralScoreSummary: "78/100.",
      investorShortSummary: "Mieszkanie w Słupsku z niskim LTV.",
      floodRiskSummary: "Poza strefą zalewową 1%.",
    },
    floodRisk: {
      riskLevel: "low",
      scenario10Percent: false,
      scenario1Percent: false,
      scenario02Percent: true,
      specialFloodHazardArea: false,
      waterDepth: null,
      flowVelocity: null,
      riskMapIntersection: false,
      score: 90,
      available: true,
    },
    warnings: [],
    raw: {},
  };
}

function coowners(): AnalyticsCoOwners {
  return {
    totalOwnersInKw: 2,
    summary: "Dział II KW: 2 osoby fizyczne, sprawdzone w CEIDG i KRS.",
    // Gdyby PESEL trafił do opisu, model i tak go maskuje.
    warnings: [`Jeden z właścicieli (PESEL ${PESEL}) figuruje w KRS.`],
    generatedAt: "2026-10-01T10:02:00Z",
    owners: [
      {
        fullName: "Grażyna Żukowska",
        share: "1/2",
        coOwnershipType: "wspólność majątkowa",
        isPrimaryClient: true,
        businessStatus: "działalność gospodarcza: aktywny",
        krs: [{ companyName: "Żukowska Sp. z o.o.", role: "prezes", flags: [] }],
        notes: [],
      },
      {
        fullName: "Jan Żukowski",
        share: "1/2",
        coOwnershipType: "wspólność majątkowa",
        isPrimaryClient: false,
        businessStatus: null,
        krs: [],
        notes: ["Brak numeru PESEL przy tej osobie w dziale II KW."],
      },
    ],
  };
}

function analyticsDetail(findings = 3): AnalyticsDetail {
  return {
    item: {
      id: "00000000-0000-0000-0000-000000000001",
      source: "okazja",
      projectRef: "FY-Z-4-P1",
      loanAmount: 90000,
      periodMonths: 12,
      annualRate: 14,
      ltv: 20,
      propertyType: "mieszkanie",
      city: "Słupsk",
      voivodeship: "pomorskie",
      estimatedValue: 480000,
      areaSqm: 54,
      kwNumber: "SL1S/00012344/8",
      locationScore: 70,
      availableToInvestors: true,
      createdAt: "2026-09-30T10:00:00Z",
      run: {
        id: "run-1",
        kwNumber: "SL1S/00012344/8",
        status: "done",
        steps: {
          kw: { status: "done" },
          coowners: { status: "done" },
          kw_analysis: { status: "done" },
          risk: { status: "done" },
        },
        triggerReason: "inwestor: na żądanie",
        error: null,
        startedAt: "2026-10-01T09:58:00Z",
        finishedAt: "2026-10-01T10:05:00Z",
      },
      results: {
        kwFetched: true,
        kwAnalysisStatus: "STOP",
        coowners: true,
        risk: true,
        collateral: true,
      },
    },
    kwDocument: null,
    kwAnalysis: { result: kwResult(findings), createdAt: "2026-10-01T10:03:00Z" },
    coowners: coowners(),
    valuation: valuation(),
    collateral: collateral(),
    canRequestRun: false,
    runBlockedReason: null,
  };
}

function risk(): InvestmentRiskAssessment {
  const v = valuation();
  return {
    success: true,
    applicationId: "kwcheck:1",
    generatedAt: "2026-10-01T10:05:00Z",
    investmentScore: 76.4,
    riskGrade: "B",
    recommendation: "rekomendowana",
    owner: {
      fullName: "Grażyna Żukowska",
      birthDate: "1980-01-01",
      sex: "K",
      age: 46,
      peselValid: true,
      lifeExpectancy: { available: false },
      kwOwnerProfiles: [],
      multipleEstates: false,
      matchesKwOwner: true,
      businessActivity: { available: false },
      notes: [],
    },
    saleability: {
      available: true,
      score: v.saleability.score,
      band: "latwa",
      sellabilityCategory: {
        category: "A",
        baseScore: 86,
        label: v.saleability.sellabilityCategory!.label,
        rationale: v.saleability.sellabilityCategory!.rationale,
      },
      estimatedDaysOnMarket: 60,
      localityPopulation: 89000,
      populationTrend: "malejaca",
      reasonableMarket: true,
      floorFactor: null,
      nearestLargeCity: v.saleability.nearestLargeCity,
      demandDrivers: v.saleability.demandDrivers,
      rentalDemand: "sredni",
      purchasingPowerComment: null,
      localMarketOffers: {
        available: true,
        totalActiveListings: 240,
        agencyListings: 180,
        privateListings: 60,
        medianPricePerM2: 6900,
        radiusKm: 10,
        source: "portale",
        sample: [],
      },
      rationale: "",
      citations: [],
      summary: "",
    },
    plotBuildability: { applicable: false },
    govBenchmark: { available: false },
    forcedSale: {
      firstAuctionOpeningPln: 337500,
      secondAuctionOpeningPln: 300000,
      expectedForcedSaleLowPln: 290000,
      expectedForcedSaleHighPln: 340000,
      likelyAuctionOutcome: "pierwsza_licytacja",
      residentialAuctionBlock: { blocked: false, message: "" },
    },
    masterValuation: {
      status: "success",
      estimatedValueLowPln: 410000,
      estimatedValueMidPln: 450000,
      estimatedValueHighPln: 490000,
      suggestedMaxLoanAmountPln: 225000,
      suggestedLtvCapPercent: 50,
      marketTrend: "stabilny",
      liquidityComment: "",
      keyRisks: [],
      keyStrengths: [],
      recommendation: "rekomendowana",
      rationale: "",
      citations: [],
    },
    collateralAnalysis: collateral(),
    componentScores: {
      collateral: 78,
      valuationConfidence: 70,
      legal: 60,
      borrowerLongevity: 45,
      correspondence: 60,
      documentCompleteness: 30,
      exitLiquidity: 86,
    },
    // Jak w risk-scoring.ts: kategoria zbywalności i punkty karty zabezpieczenia
    // trafiają też do mocnych stron / ryzyk oceny.
    keyRisks: ["Hipoteka banku do spłaty przed wypłatą", "Malejąca liczba mieszkańców"],
    keyStrengths: [
      "Kategoria zbywalności A (mieszkanie w dużym mieście) — Miasto powyżej 100 tys. mieszkańców.",
      "Czysty stan prawny nieruchomości (KW).",
      "Płynny rynek mieszkań",
    ],
    warnings: [],
    dataSources: collateral().dataSourcesUsed,
    executiveSummary: "Ocena inwestycji: 76/100 (klasa B) — kategoria A.",
  } as unknown as InvestmentRiskAssessment;
}

function kwCheckDetail(): KwCheckDetail {
  return {
    item: {
      id: "00000000-0000-0000-0000-000000000002",
      kwNumber: "SL1S/00012344/8",
      label: "Mieszkanie Słupsk — znajomy",
      propertyType: "mieszkanie",
      loanAmount: 90000,
      propertyValue: 480000,
      periodMonths: 12,
      status: "done",
      steps: {
        kw: { status: "done" },
        coowners: { status: "done" },
        kw_analysis: { status: "done" },
        risk: { status: "done" },
      },
      error: null,
      kwAnalysisStatus: "STOP",
      createdAt: "2026-10-01T09:58:00Z",
      finishedAt: "2026-10-01T10:05:00Z",
    },
    kwDocument: null,
    coowners: coowners(),
    kwAnalysis: { result: kwResult(), createdAt: "2026-10-01T10:03:00Z" },
    risk: risk(),
  };
}

/** Raport Projektu przed rezerwacją — oczyszczony tak, jak robi to serwer. */
function teaserOrderDetail(): OrderProjectReportDetail {
  const names = ["Grażyna Żukowska", "Jan Żukowski"];
  return {
    report: {
      status: "done",
      startedAt: "2026-10-01T09:58:00Z",
      finishedAt: "2026-10-01T10:05:00Z",
      error: null,
      locationScore: 70,
      steps: {
        kw: { status: "done" },
        coowners: { status: "done" },
        kw_analysis: { status: "done" },
        risk: { status: "done" },
      },
      results: {
        kwFetched: true,
        kwAnalysisStatus: "STOP",
        coowners: true,
        risk: true,
        collateral: true,
      },
    },
    disclosed: false,
    kwNumber: "SL1S/00****44/8",
    kwDocument: null,
    coowners: sanitizeCoOwnersForTeaser(coowners(), names),
    kwAnalysis: {
      result: sanitizeKwAnalysisForTeaser(kwResult(), "SL1S/00****44/8", names),
      createdAt: "2026-10-01T10:03:00Z",
    },
    valuation: valuation(),
    collateral: sanitizeCollateralForTeaser(collateral(), names),
  };
}

const PROJECT = { ref: "FY-Z-4-P1", loanAmount: 90000 };

const SOURCES: Array<[string, InvestorReportSource]> = [
  ["Analityka", { kind: "analityka", detail: analyticsDetail() }],
  ["analiza własnego wniosku", { kind: "kw_check", detail: kwCheckDetail() }],
  [
    "raport Projektu przed rezerwacją",
    { kind: "zlecenie", detail: teaserOrderDetail(), project: PROJECT },
  ],
];

/** Analityka tuż po kroku 1: księga pobrana, reszta jeszcze bez wyników. */
function stepOneOnlyDetail(): AnalyticsDetail {
  const d = analyticsDetail();
  return {
    ...d,
    item: {
      ...d.item,
      run: { ...d.item.run!, status: "running", steps: { kw: { status: "done" } } },
      results: {
        kwFetched: true,
        kwAnalysisStatus: null,
        coowners: false,
        risk: false,
        collateral: false,
      },
    },
    kwDocument: {
      status: "fetched",
      fetchedAt: "2026-10-01T10:00:00Z",
      lastError: null,
      sections: {
        okladka: null,
        dzial_1o: null,
        dzial_1s: null,
        dzial_2: null,
        dzial_3: null,
        dzial_4: null,
      },
    },
    kwAnalysis: null,
    coowners: null,
    valuation: null,
    collateral: null,
  };
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

function headings(model: InvestorReportModel): string[] {
  return model.blocks.flatMap((b) => (b.t === "heading" || b.t === "subheading" ? [b.text] : []));
}

describe("model raportu PDF", () => {
  it.each(SOURCES)("%s — bez komunikatów do pośrednika/klienta i bez pełnego PESEL", (_, src) => {
    const model = buildInvestorReportModel(src);
    const json = JSON.stringify(model);
    expect(json).not.toContain(SECRET_INTERMEDIARY);
    expect(json).not.toContain(SECRET_CLIENT);
    expect(json).not.toContain(PESEL);
    expect(json).not.toMatch(/birthDate|1980-01-01/);
    // Treść dla inwestora zostaje.
    expect(json).toContain("Hipoteka inwestora po spłacie banku");
  });

  it("cytaty z KW w raporcie pokazują PESEL zamaskowany", () => {
    const text = reportModelText(buildInvestorReportModel(SOURCES[0][1]));
    expect(text).toContain("80*******45");
    expect(text).toContain("Żukowska Grażyna");
  });

  it("długi cytat skracany na PESEL-u nie zostawia jego cyfr", () => {
    // PESEL na pozycjach 590–600 — granica skrótu (600 znaków) wypada w środku numeru.
    const rawValue = `${"x".repeat(583)} PESEL ${PESEL}, córka Jana`;
    const detail = analyticsDetail(0);
    detail.kwAnalysis!.result.findings = [
      finding(0, { source: [{ section: "II", fieldCode: "2.2.5", rawValue }] }),
    ];
    const text = reportModelText(buildInvestorReportModel({ kind: "analityka", detail }));
    for (let n = 5; n <= PESEL.length; n++) expect(text).not.toContain(PESEL.slice(0, n));
    expect(text).not.toContain("80*******4…");
    expect(text).toContain("PESEL…");
  });

  it.each(SOURCES)("%s — zastrzeżenia dokładnie raz", (_, src) => {
    const text = reportModelText(buildInvestorReportModel(src));
    expect(count(text, REPORT_DISCLAIMER)).toBe(1);
    expect(count(text, RISK_DISCLAIMER_TEXT)).toBe(1);
    expect(count(text, VALUATION_NOT_APPRAISAL)).toBe(1);
  });

  it.each(SOURCES)("%s — bez słowa „okazja”", (_, src) => {
    const text = reportModelText(buildInvestorReportModel(src));
    expect(text).not.toMatch(/[Oo]kazj/);
  });

  it("Projekt z Zlecenia ma etykietę „Projekt z Twojego Zlecenia”", () => {
    const text = reportModelText(buildInvestorReportModel(SOURCES[0][1]));
    expect(text).toContain("Projekt z Twojego Zlecenia · FY-Z-4-P1");
  });

  it.each(SOURCES)(
    "%s — ocena inwestycyjna A–E i kategoria zbywalności to osobne skale",
    (_, src) => {
      const model = buildInvestorReportModel(src);
      const titles = headings(model);
      expect(GRADE_SECTION_TITLE).not.toBe(SELLABILITY_SECTION_TITLE);
      expect(titles).toContain(GRADE_SECTION_TITLE);
      expect(titles).toContain(SELLABILITY_SECTION_TITLE);
      // Pasek skali A–E pokazuje klasę ryzyka (B), nie kategorię zbywalności (A).
      const scales = model.blocks.filter((b) => b.t === "gradeScale");
      expect(scales).toEqual([{ t: "gradeScale", grade: "B" }]);
      const gradeAt = model.blocks.findIndex(
        (b) => b.t === "heading" && b.text === GRADE_SECTION_TITLE,
      );
      const nextHeading = model.blocks.findIndex((b, i) => i > gradeAt && b.t === "heading");
      const gradeSection = reportModelText({
        ...model,
        title: "",
        subtitle: null,
        blocks: model.blocks.slice(gradeAt, nextHeading),
      });
      expect(gradeSection).toContain("Klasa B (70–84 pkt) — Niskie ryzyko");
      expect(gradeSection).not.toMatch(/zbywaln/i);
      // Bez profilu ryzyka (inne progi niż A–E — drugi, sprzeczny werdykt).
      expect(gradeSection).not.toMatch(/Profil/);
    },
  );

  it("mocne strony i ryzyka oceny: osobna sekcja, bez kategorii zbywalności i powtórek", () => {
    const model = buildInvestorReportModel(SOURCES[1][1]);
    const at = model.blocks.findIndex(
      (b) => b.t === "heading" && b.text === "Mocne strony i główne ryzyka",
    );
    expect(at).toBeGreaterThan(-1);
    const next = model.blocks.findIndex((b, i) => i > at && b.t === "heading");
    const section = reportModelText({
      ...model,
      title: "",
      subtitle: null,
      blocks: model.blocks.slice(at, next),
    });
    expect(section).toContain("Czysty stan prawny nieruchomości (KW).");
    expect(section).toContain("Hipoteka banku do spłaty przed wypłatą");
    expect(section).not.toMatch(/zbywaln/i);
    // Punkty karty zabezpieczenia są raz — w „Analizie zabezpieczenia”.
    const text = reportModelText(model);
    expect(count(text, "Płynny rynek mieszkań")).toBe(1);
    expect(count(text, "Malejąca liczba mieszkańców")).toBe(1);
  });

  it.each(SOURCES)("%s — każdy znak modelu jest w foncie PDF", async (_, src) => {
    const text = reportModelText(buildInvestorReportModel(src));
    expect(await charsOutsideFont(text)).toEqual([]);
  });

  it("wersja przed rezerwacją: notka, zamaskowany numer KW, nazwa pliku bez KW", () => {
    const model = buildInvestorReportModel(SOURCES[2][1]);
    expect(model.teaser).toBe(true);
    const text = reportModelText(model);
    expect(text).toContain(REPORT_TEASER_NOTE);
    expect(REPORT_TEASER_NOTE).toMatch(/^Wersja przed rezerwacją — dane identyfikujące ukryte/);
    expect(text).toContain("SL1S/00****44/8");
    expect(text).not.toContain("SL1S/00012344/8");
    expect(text).not.toMatch(/Żukowsk|Grażyn|Kwiatowa/);
    // Numer Projektu i kwota z karty — raporty kilku Projektów da się rozróżnić.
    expect(model.subtitle).toContain("Projekt FY-Z-4-P1");
    expect(text).toContain("Wnioskowana kwota");
    expect(reportPdfFilename(model, DATE)).toBe("FY-raport-projektu-FY-Z-4-P1-2026-10-10.pdf");
  });

  it("raport Projektu po rezerwacji: numer Projektu i KW w nazwie pliku", () => {
    const model = buildInvestorReportModel({
      kind: "zlecenie",
      detail: { ...teaserOrderDetail(), disclosed: true, kwNumber: "SL1S/00012344/8" },
      project: PROJECT,
    });
    expect(model.teaser).toBe(false);
    expect(reportPdfFilename(model, DATE)).toBe(
      "FY-raport-projektu-FY-Z-4-P1-SL1S-00012344-8-2026-10-10.pdf",
    );
  });

  it("po samym kroku 1: notki zamiast pustych sekcji, bez zastrzeżenia analizy KW", () => {
    const model = buildInvestorReportModel({ kind: "analityka", detail: stepOneOnlyDetail() });
    expect(model.stepsDone).toBe(1);
    const text = reportModelText(model);
    expect(text).toContain("Treść KW pobrana");
    expect(headings(model)).toEqual(
      expect.arrayContaining([
        "Wycena i zbywalność",
        "Analiza księgi wieczystej",
        "Właściciele i rejestry",
      ]),
    );
    expect(text).toContain("Raport analizy KW pojawi się po pobraniu księgi wieczystej");
    expect(text).toContain("Zestawienie właścicieli z działu II KW");
    expect(text).not.toContain(GRADE_SECTION_TITLE);
    expect(count(text, REPORT_DISCLAIMER)).toBe(0);
    expect(count(text, RISK_DISCLAIMER_TEXT)).toBe(1);
    expect(count(text, VALUATION_NOT_APPRAISAL)).toBe(1);
  });

  it("nazwa pliku po ujawnieniu zawiera numer KW", () => {
    const model = buildInvestorReportModel(SOURCES[0][1]);
    expect(reportPdfFilename(model, DATE)).toBe(
      "FY-raport-analityczny-SL1S-00012344-8-2026-10-10.pdf",
    );
  });
});

describe("plik PDF raportu", () => {
  it("długa lista znalezisk daje poprawny, wielostronicowy PDF A4", async () => {
    const model = buildInvestorReportModel({ kind: "analityka", detail: analyticsDetail(40) });
    const bytes = await renderInvestorReportPdf(model, {
      preparedFor: "Łukasz Żółkiewski",
      generatedAt: DATE,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(6);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe("Raport analityczny");
    expect(doc.getAuthor()).toBe("Finance You");
    expect(doc.getSubject()).toContain("KW SL1S/00012344/8");
  });

  it.each(SOURCES)("%s — renderuje się bez błędów", async (_, src) => {
    const model = buildInvestorReportModel(src);
    const bytes = await renderInvestorReportPdf(model, { preparedFor: "inwestor@example.com" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
  });
});

describe("podsumowanie wyceny dla inwestora", () => {
  it("zawiera ocenę inwestycyjną A–E i neutralny profil ryzyka", () => {
    const s = buildInvestorValuationSummary(risk());
    expect(s.riskGrade).toBe("B");
    expect(s.investmentScore).toBe(76);
    expect(s.recommendation).toBe("rekomendowana");
    expect(s.recommendationLabel).toBe("Profil niskiego ryzyka");
    // Bez danych właściciela.
    expect(JSON.stringify(s)).not.toMatch(/birthDate|Żukowska/);
  });

  it("klasa z wyniku, gdy starsza ocena nie ma litery", () => {
    const r = { ...risk(), riskGrade: undefined, investmentScore: 41 } as never;
    expect(buildInvestorValuationSummary(r).riskGrade).toBe("D");
  });
});
