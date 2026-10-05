import { describe, expect, it } from "vitest";
import type { KwAnalysisResult } from "@/lib/kw-analysis/types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { AnalyticsCoOwners } from "@/lib/investor-analytics/types";
import {
  maskAddress,
  maskNames,
  sanitizeCoOwnersForTeaser,
  sanitizeCollateralForTeaser,
  sanitizeKwAnalysisForTeaser,
  TEASER_ADDRESS_PLACEHOLDER,
  TEASER_KRS_PLACEHOLDER,
  TEASER_NAME_PLACEHOLDER,
} from "./order-report-teaser";

describe("maskNames", () => {
  it("zastępuje imię i nazwisko w obu szykach i samo nazwisko", () => {
    const names = ["Grażyna Żukowska"];
    expect(maskNames("Tożsamość strony „Grażyna Żukowska” zgodna z Działem II.", names)).toBe(
      `Tożsamość strony „${TEASER_NAME_PLACEHOLDER}” zgodna z Działem II.`,
    );
    expect(maskNames("Właściciel: ŻUKOWSKA Grażyna (1/1)", names)).toBe(
      `Właściciel: ${TEASER_NAME_PLACEHOLDER} (1/1)`,
    );
    expect(maskNames("Pani Żukowska prowadzi działalność.", names)).toBe(
      `Pani ${TEASER_NAME_PLACEHOLDER} prowadzi działalność.`,
    );
  });

  it("nie rusza fragmentów innych słów ani pustych nazwisk", () => {
    expect(maskNames("Nowakowski to nie Nowak.", ["Jan Nowak"])).toBe(
      `Nowakowski to nie ${TEASER_NAME_PLACEHOLDER}.`,
    );
    expect(maskNames("bez zmian", ["", "  "])).toBe("bez zmian");
  });
});

describe("maskAddress", () => {
  it("maskuje pełny adres i sam fragment ulicy z numerem", () => {
    const addr = "ul. Kwiatowa 5/3, 76-200 Słupsk";
    expect(maskAddress(`Mieszkanie przy ${addr}.`, addr)).toBe(
      `Mieszkanie przy ${TEASER_ADDRESS_PLACEHOLDER}.`,
    );
    expect(maskAddress("Lokal: Kwiatowa 5/3 w Słupsku", addr)).toBe(
      `Lokal: ${TEASER_ADDRESS_PLACEHOLDER} w Słupsku`,
    );
    expect(maskAddress("Słupsk, Pomorskie", addr)).toBe("Słupsk, Pomorskie");
  });
});

function kwResult(): KwAnalysisResult {
  const evidence = { section: "II" as const, rawValue: "Żukowska Grażyna, PESEL 80010112345" };
  return {
    kwNumber: "SL1S/00012344/8",
    fetchedAt: "2026-10-01T10:00:00Z",
    rulesetVersion: "1.0",
    overallStatus: "KORZYSTNE",
    findings: [
      {
        id: "f1",
        ruleId: "IDENTITY",
        ruleVersion: "1",
        category: "IDENTITY",
        status: "KORZYSTNE",
        title: "Tożsamość potwierdzona: Grażyna Żukowska",
        plainLanguageSummary: "Grażyna Żukowska figuruje w dziale II.",
        source: [evidence],
        detectedValue: "Grażyna Żukowska",
        whyItMatters: "x",
        rankImpact: "NONE" as never,
        enforcementImpact: "NONE" as never,
        expectedFromClient: "nic",
        requestedDocuments: [],
        proposedResolution: "brak",
        intermediaryMessage: "Zadzwoń do Grażyny",
        clientMessage: "Dzień dobry Pani Grażyno",
        investorMessage: "Tożsamość strony „Grażyna Żukowska” zgodna z Działem II.",
        resolutionState: "VERIFIED",
        confidence: 1,
      },
    ],
    priority: {
      determinable: true,
      expectedInvestorRank: 1,
      effectivePriorEncumbrances: [],
      activeCompetingMentions: [],
      usesVacantRank: false,
      explanation: "Brak obciążeń.",
      evidence: [evidence],
      requiredConditions: [],
    },
    ltv: {
      determinable: true,
      mortgageSumFromKw: null,
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
    unresolvedFindingCount: 0,
    disclaimer: "d",
    computedFrom: { ownersCount: 1, mortgagesCount: 0, sectionThreeCount: 0 },
  };
}

describe("sanitizeKwAnalysisForTeaser", () => {
  it("maskuje numer KW, usuwa cytaty i komunikaty operacyjne, zastępuje nazwiska", () => {
    const out = sanitizeKwAnalysisForTeaser(kwResult(), "SL1S/00****44/8", ["Grażyna Żukowska"]);
    expect(out.kwNumber).toBe("SL1S/00****44/8");
    expect(out.overallStatus).toBe("KORZYSTNE");
    expect(out.priority.evidence).toEqual([]);
    const f = out.findings[0];
    expect(f.source).toEqual([]);
    expect(f.detectedValue).toBeNull();
    expect(f.intermediaryMessage).toBe("");
    expect(f.clientMessage).toBe("");
    expect(f.title).toBe(`Tożsamość potwierdzona: ${TEASER_NAME_PLACEHOLDER}`);
    expect(f.investorMessage).not.toContain("Żukowska");
    expect(JSON.stringify(out)).not.toMatch(/Żukowska|Grażyn|80010112345/);
  });

  it("nie zmienia wejścia", () => {
    const input = kwResult();
    sanitizeKwAnalysisForTeaser(input, "x", ["Grażyna Żukowska"]);
    expect(input.findings[0].source).toHaveLength(1);
    expect(input.kwNumber).toBe("SL1S/00012344/8");
  });
});

describe("sanitizeCoOwnersForTeaser", () => {
  it("zostawia udziały, CEIDG i flagi KRS, a chowa nazwiska, nazwy spółek i notatki", () => {
    const co: AnalyticsCoOwners = {
      totalOwnersInKw: 2,
      summary: "Dział II KW: 2 podmiotów.",
      warnings: ["Jan Nowak — działalność zawieszona"],
      generatedAt: "2026-10-01T10:00:00Z",
      owners: [
        {
          fullName: "Jan Nowak",
          share: "1/2",
          coOwnershipType: "ułamkowa",
          isPrimaryClient: true,
          businessStatus: "działalność gospodarcza: zawieszony",
          krs: [{ companyName: "Nowak Sp. z o.o.", role: "prezes", flags: ["likwidacja"] }],
          notes: ["PESEL zgodny"],
        },
        {
          fullName: "Anna Nowak",
          share: "1/2",
          coOwnershipType: "ułamkowa",
          isPrimaryClient: false,
          businessStatus: null,
          krs: [],
          notes: [],
        },
      ],
    };
    const out = sanitizeCoOwnersForTeaser(co, ["Jan Nowak", "Anna Nowak"]);
    expect(out.owners.map((o) => o.fullName)).toEqual(["Właściciel 1", "Właściciel 2"]);
    expect(out.owners[0].share).toBe("1/2");
    expect(out.owners[0].businessStatus).toBe("działalność gospodarcza: zawieszony");
    expect(out.owners[0].krs[0]).toEqual({
      companyName: TEASER_KRS_PLACEHOLDER,
      role: "prezes",
      flags: ["likwidacja"],
    });
    expect(out.owners[0].notes).toEqual([]);
    expect(out.warnings[0]).toBe(`${TEASER_NAME_PLACEHOLDER} — działalność zawieszona`);
    expect(JSON.stringify(out)).not.toMatch(/Nowak/);
  });
});

describe("sanitizeCollateralForTeaser", () => {
  it("chowa adres, KW, działkę, współrzędne i surowe dane, a wyniki zostawia", () => {
    const addr = "ul. Kwiatowa 5/3, 76-200 Słupsk";
    const result = {
      success: true,
      property: {
        type: "mieszkanie",
        address: addr,
        kwNumber: "SL1S/00012344/8",
        parcelNumber: "12/3",
        county: "słupski",
        voivodeship: "pomorskie",
        latitude: 54.46,
        longitude: 17.03,
        usableAreaM2: 48,
        landAreaM2: null,
        landAreaHa: null,
      },
      dataSourcesUsed: [],
      valuationBenchmark: { conservativeLowPln: 200000, conservativeHighPln: 270000 },
      ltv: { ltvPercent: 39 },
      locationScore: { score: 60, summary: `Lokalizacja: ${addr}`, liquidityComment: "ok" },
      legalRisk: { score: 80, warnings: ["Właściciel Jan Nowak — egzekucja"] },
      marketLiquidity: { score: 50, summary: "s", transactionsCount: 3 },
      collateralScore: {
        total: 71,
        category: "dobre",
        components: {},
        summary: "s",
        mainRisks: [`Lokal przy Kwiatowa 5/3`],
        mainStrengths: ["Dobra lokalizacja"],
      },
      investmentOfferText: {
        propertySummary: `Mieszkanie, ${addr}`,
        investorShortSummary: "Dobre zabezpieczenie",
      },
      warnings: [],
      raw: { geocode: { lat: 54.46 } },
    } as unknown as PropertyAnalysisResult;
    const out = sanitizeCollateralForTeaser(result, ["Jan Nowak"]);
    expect(out.property.address).toBe(TEASER_ADDRESS_PLACEHOLDER);
    expect(out.property.kwNumber).toBeNull();
    expect(out.property.parcelNumber).toBeNull();
    expect(out.property.latitude).toBeNull();
    expect(out.raw).toEqual({});
    expect(out.collateralScore.total).toBe(71);
    expect(out.collateralScore.mainStrengths).toEqual(["Dobra lokalizacja"]);
    expect(out.investmentOfferText.investorShortSummary).toBe("Dobre zabezpieczenie");
    expect(JSON.stringify(out)).not.toMatch(/Kwiatowa|Nowak|00012344|54\.46/);
  });
});
