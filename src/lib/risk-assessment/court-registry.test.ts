import { describe, expect, it } from "vitest";
import { summarizeCourtRegistry } from "./court-registry";
import { combineRiskAssessment, WEIGHTS } from "./risk-scoring";
import type { OwnerIntelligenceReport } from "@/lib/coowners/owner-intelligence.types";

const report = (
  over: Partial<OwnerIntelligenceReport["subjects"][number]> = {},
): OwnerIntelligenceReport => ({
  checkedAt: new Date().toISOString(),
  note: "",
  subjects: [
    {
      name: "Artur Schwarz",
      kind: "person",
      role: "client",
      courtStatus: "checked",
      courtNote: "ok",
      exchangesStatus: "checked",
      exchangesNote: "",
      hits: [],
      ...over,
    },
  ],
});

describe("summarizeCourtRegistry", () => {
  it("brak raportu — niesprawdzone", () => {
    const r = summarizeCourtRegistry(null);
    expect(r.available).toBe(false);
    expect(r.clientChecked).toBe(false);
  });

  it("czysty klient sprawdzony przez API", () => {
    const r = summarizeCourtRegistry(report());
    expect(r.clientFullyChecked).toBe(true);
    expect(r.confirmedHits + r.unconfirmedHits).toBe(0);
  });

  it("częściowe sprawdzenie klienta jest oznaczone", () => {
    const r = summarizeCourtRegistry(report({ courtStatus: "partial" }));
    expect(r.clientFullyChecked).toBe(false);
    expect(r.summary).toMatch(/CZĘŚCIOWO/);
  });

  it("liczy trafienia po identyfikatorze", () => {
    const r = summarizeCourtRegistry(
      report({
        hits: [
          {
            source: "KRZ/MSiG — iMSiG",
            category: "court_notice",
            title: "Upadłość konsumencka",
            detail: null,
            publicationDate: "2025-01-02",
            caseSignature: "XII GUp 1/25",
            url: "https://example.org",
            match: "identifier",
          },
        ],
      }),
    );
    expect(r.confirmedHits).toBe(1);
    expect(r.clientHits).toBe(1);
    expect(r.findings[0]).toMatch(/Pożyczkobiorca Artur Schwarz: Upadłość konsumencka/);
  });

  it("kopia tablicy KRZ: zakres dat w podsumowaniu, trafienie z analizą AI w ustaleniach", () => {
    const r = summarizeCourtRegistry(
      report({
        courtStatus: "partial",
        courtNote:
          "Oficjalny MSiG: brak ogłoszeń. | KRZ (kopia lokalna 2026-11-01…2026-11-06, 4000 obw.): 1 obwieszcz. — sprawdź w krz.ms.gov.pl.",
        hits: [
          {
            source: "KRZ — tablica obwieszczeń (kopia lokalna)",
            category: "court_notice",
            title: "Obwieszczenie postanowienia o ustanowieniu tymczasowego nadzorcy sądowego",
            detail:
              "Upadłość: Zabezpieczenie majątku; AI: zabezpieczenie majątku, ryzyko sredni — Ustanowiono TNS.",
            publicationDate: "2026-11-06",
            caseSignature: "WR1F/GU/865/2026",
            url: "https://krz.ms.gov.pl/",
            match: "name_only",
          },
        ],
      }),
    );
    expect(r.clientFullyChecked).toBe(false);
    expect(r.summary).toContain("kopii tablicy KRZ (2026-11-01…2026-11-06)");
    expect(r.unconfirmedHits).toBe(1);
    expect(r.findings[0]).toMatch(/tymczasowego nadzorcy.*WR1F\/GU\/865\/2026.*tylko po nazwisku/);
  });

  it("bez kopii KRZ zostaje dotychczasowy komunikat o ręcznym sprawdzeniu", () => {
    const r = summarizeCourtRegistry(
      report({
        courtStatus: "partial",
        courtNote:
          "Oficjalny MSiG: brak ogłoszeń. | KRZ (kopia lokalna): brak danych — tablica obwieszczeń nie była jeszcze pobrana.",
      }),
    );
    expect(r.summary).toContain("nie jest automatycznie dostępny");
  });
});

describe("scoring", () => {
  it("wagi sumują się do 1 i nie ma korespondencji", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(Object.keys(WEIGHTS)).not.toContain("correspondence");
    expect(Object.keys(WEIGHTS)).toContain("courtRegistry");
  });

  it("twarde trafienie KRZ ogranicza ocenę", () => {
    const base = {
      collateral: null,
      owner: {
        lifeExpectancy: { longevityRiskBand: "niskie" },
        kwOwnerProfiles: [],
        peselValid: true,
        matchesKwOwner: true,
        multipleEstates: false,
        businessActivity: null,
      },
      kwLegal: { available: true, legalRiskScore: 95, warnings: [], hasEnforcement: false },
      ocr: { documentsProcessed: 0, documents: [] },
      saleability: {
        available: true,
        score: 95,
        band: "latwa",
        localMarketOffers: { available: true, agencyListings: 0, radiusKm: 10 },
        reasonableMarket: true,
        localityPopulation: 100000,
        sellabilityCategory: null,
        populationTrend: "stabilna",
        floorFactor: null,
      },
      master: {
        status: "no_data",
        keyRisks: [],
        keyStrengths: [],
        recommendation: "rekomendowana",
      },
    } as any;
    const hit = summarizeCourtRegistry(
      report({
        hits: [
          {
            source: "x",
            category: "court_notice",
            title: "Upadłość",
            detail: null,
            publicationDate: null,
            caseSignature: null,
            url: "https://x.pl",
            match: "identifier",
          },
        ],
      }),
    );
    const r = combineRiskAssessment({ ...base, courtRegistry: hit });
    expect(r.investmentScore).toBeLessThanOrEqual(39);
    expect(r.keyRisks.some((k) => k.startsWith("KRZ/MSiG:"))).toBe(true);
  });
});
