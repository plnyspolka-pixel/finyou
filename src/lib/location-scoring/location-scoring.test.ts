import { describe, it, expect } from "vitest";
import {
  parseKwNumber,
  computeKwCheckDigit,
  normalizeKwRaw,
  logNormalize,
  computeBaseAttractiveness,
  computeDistribution,
  applyBayesianSmoothing,
  buildSerialSignal,
  scoreLocation,
  maskKwNumber,
  DEFAULT_LOCATION_SCORING_CONFIG,
  MODEL_VERSION,
  mergeConfig,
  type AreaMetrics,
  type LocationCandidate,
  type ScoringContext,
  type ParsedKwNumber,
} from "./index";

const NOW = "2026-07-25T00:00:00.000Z";
const config = DEFAULT_LOCATION_SCORING_CONFIG;

// ── Fabryki testowe ──────────────────────────────────────────────────────────
function area(partial: Partial<AreaMetrics> & { geoUnitId: string; name: string }): AreaMetrics {
  return {
    populationWithin10Km: 0,
    populationWithin25Km: 0,
    populationWithin45Km: 0,
    densityPerKm2: 0,
    isCityAbove30k: false,
    isCityAbove100k: false,
    isCityAbove250k: false,
    isAdjacentToCityAbove30k: false,
    isUrbanCluster: false,
    fuaRole: "none",
    distanceToCity30kKm: null,
    distanceToCity100kKm: null,
    distanceToCity250kKm: null,
    dataQuality: "high",
    ...partial,
  };
}

const bigCityCore = area({
  geoUnitId: "1465",
  name: "Warszawa (centrum)",
  populationWithin10Km: 900_000,
  populationWithin25Km: 2_000_000,
  populationWithin45Km: 3_000_000,
  densityPerKm2: 3500,
  isCityAbove30k: true,
  isCityAbove100k: true,
  isCityAbove250k: true,
  fuaRole: "core",
});

const suburb = area({
  geoUnitId: "1421",
  name: "Gmina podmiejska (strefa dojazdowa)",
  populationWithin10Km: 90_000,
  populationWithin25Km: 800_000,
  populationWithin45Km: 2_400_000,
  densityPerKm2: 250,
  isAdjacentToCityAbove30k: true,
  fuaRole: "commuting_zone",
});

const remoteVillage = area({
  geoUnitId: "1409",
  name: "Odległa gmina wiejska",
  populationWithin10Km: 4_000,
  populationWithin25Km: 18_000,
  populationWithin45Km: 60_000,
  densityPerKm2: 30,
  fuaRole: "none",
  dataQuality: "medium",
});

function ctx(over: Partial<ScoringContext>): ScoringContext {
  const parsed = parseKwNumber("WA1M/00000001/X");
  return {
    parsedKw: over.parsedKw ?? { ...parsed, formatValid: true },
    propertyType: over.propertyType ?? "house",
    court: over.court ?? {
      prefix: "WA1M",
      name: "Sąd Rejonowy dla Warszawy-Mokotowa",
      jurisdictionVersion: "2026.1",
      mappingConfidence: 0.95,
    },
    candidates: over.candidates ?? [],
    observations: over.observations ?? null,
    serialSignal: over.serialSignal ?? null,
    config: over.config ?? config,
  };
}

// ── 1. Normalizacja i cyfra kontrolna ────────────────────────────────────────
describe("KW parser", () => {
  it("normalizuje spacje i wielkość liter", () => {
    expect(normalizeKwRaw("  ra1r / 00123456 / 7 ")).toBe("RA1R/00123456/7");
  });

  it("rozdziela numer na części (przykład ze specyfikacji)", () => {
    const p = parseKwNumber("RA1R/00123456/7");
    expect(p.prefix).toBe("RA1R");
    expect(p.serialNumber).toBe(123456);
    expect(p.serialNumberPadded).toBe("00123456");
    expect(p.checkDigit).toBe(7);
    expect(p.formatValid).toBe(true);
  });

  it("akceptuje format bez ukośników i z różnymi separatorami", () => {
    expect(parseKwNumber("RA1R 00123456 7").normalized).toBe("RA1R/00123456/7");
    expect(parseKwNumber("RA1R-00123456-7").prefix).toBe("RA1R");
  });

  it("cyfra kontrolna: poprawna vs błędna", () => {
    const cd = computeKwCheckDigit("RA1R", "00123456");
    expect(cd).toBeGreaterThanOrEqual(0);
    expect(cd).toBeLessThanOrEqual(9);
    const valid = parseKwNumber(`RA1R/00123456/${cd}`);
    expect(valid.checkDigitValid).toBe(true);
    expect(valid.isValid).toBe(true);
    const wrong = parseKwNumber(`RA1R/00123456/${(cd + 1) % 10}`);
    expect(wrong.checkDigitValid).toBe(false);
    expect(wrong.formatValid).toBe(true);
  });

  it("odrzuca śmieciowy numer (brak formatu)", () => {
    const p = parseKwNumber("przesłany");
    expect(p.formatValid).toBe(false);
    expect(p.isValid).toBe(false);
  });

  it("maskuje numer KW", () => {
    const p = parseKwNumber("RA1R/00123456/7");
    expect(maskKwNumber(p)).toBe("RA1R/00****56/7");
  });
});

// ── 2. Normalizacja logarytmiczna ────────────────────────────────────────────
describe("logNormalize", () => {
  it("zwraca 0..1 i jest monotoniczna", () => {
    expect(logNormalize(1_000, 5_000, 500_000)).toBe(0); // poniżej dolnej granicy
    expect(logNormalize(1_000_000, 5_000, 500_000)).toBe(1); // powyżej górnej
    const a = logNormalize(50_000, 5_000, 500_000);
    const b = logNormalize(500_000, 5_000, 500_000);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
  });

  it("różnica 5k↔50k ma większą wagę niż 505k↔550k (log)", () => {
    const low = logNormalize(50_000, 5_000, 2_000_000) - logNormalize(5_000, 5_000, 2_000_000);
    const high = logNormalize(550_000, 5_000, 2_000_000) - logNormalize(505_000, 5_000, 2_000_000);
    expect(low).toBeGreaterThan(high);
  });
});

// ── 3. Bazowa atrakcyjność obszaru ───────────────────────────────────────────
describe("computeBaseAttractiveness", () => {
  it("rdzeń dużego miasta > strefa podmiejska > odległa wieś", () => {
    const core = computeBaseAttractiveness(bigCityCore, config);
    const sub = computeBaseAttractiveness(suburb, config);
    const remote = computeBaseAttractiveness(remoteVillage, config);
    expect(core).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(remote);
    expect(core).toBeLessThanOrEqual(100);
    expect(remote).toBeGreaterThanOrEqual(0);
  });

  it("strefa podmiejska dużego miasta oceniana wysoko (nie karana za granicę gminy)", () => {
    const sub = computeBaseAttractiveness(suburb, config);
    expect(sub).toBeGreaterThanOrEqual(50);
  });
});

// ── 4. Prefiksy: różne zasięgi ───────────────────────────────────────────────
describe("scoreLocation — zasięg prefiksu", () => {
  it("prefiks wyłącznie dużego miasta → wysoki priorytet, wysoka pewność", () => {
    const r = scoreLocation(ctx({ candidates: [{ area: bigCityCore, weight: 1 }] }), { now: NOW });
    expect(r.decision).toBe("AUTO_ANALYZE_HIGH");
    expect(r.analysisPriorityScore).toBeGreaterThanOrEqual(75);
    expect(r.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(r.expectedLocationAttractiveness).toBeGreaterThan(80);
  });

  it("duże miasto + gminy podmiejskie → wysoki wynik", () => {
    const cands: LocationCandidate[] = [
      { area: bigCityCore, weight: 0.5 },
      { area: suburb, weight: 0.5 },
    ];
    const r = scoreLocation(ctx({ candidates: cands }), { now: NOW });
    expect(r.expectedLocationAttractiveness).toBeGreaterThan(60);
    expect(r.probabilityUrbanOrSuburban).toBeGreaterThan(0.9);
  });

  it("duże miasto + odległe gminy → szeroki rozkład obniża pewność", () => {
    const narrow = scoreLocation(ctx({ candidates: [{ area: bigCityCore, weight: 1 }] }), {
      now: NOW,
    });
    const wide = scoreLocation(
      ctx({
        candidates: [
          { area: bigCityCore, weight: 0.5 },
          { area: remoteVillage, weight: 0.5 },
        ],
      }),
      { now: NOW },
    );
    expect(wide.confidenceScore).toBeLessThan(narrow.confidenceScore);
    expect(wide.attractivenessP90 - wide.attractivenessP10).toBeGreaterThan(
      narrow.attractivenessP90 - narrow.attractivenessP10,
    );
  });

  it("nieznany prefiks / brak kandydatów → INSUFFICIENT_DATA (nie blokuje)", () => {
    const r = scoreLocation(ctx({ court: null, candidates: [] }), { now: NOW });
    expect(r.decision).toBe("INSUFFICIENT_DATA");
    expect(r.explanation.limitations.length).toBeGreaterThan(0);
  });

  it("niepoprawny numer KW → INVALID_KW (nie blokuje, wniosek zapisany)", () => {
    const bad = parseKwNumber("zły numer");
    const r = scoreLocation(
      ctx({ parsedKw: bad, candidates: [{ area: bigCityCore, weight: 1 }] }),
      {
        now: NOW,
      },
    );
    expect(r.decision).toBe("INVALID_KW");
  });
});

// ── 5. Różne wyniki dla mieszkania / domu / działki ──────────────────────────
describe("scoreLocation — rodzaj nieruchomości zmienia rozkład", () => {
  // Ten sam prefiks; wagi lokalizacji zależne od rodzaju (jak z ETL).
  const apartmentCands: LocationCandidate[] = [
    { area: bigCityCore, weight: 0.85 }, // mieszkania → zwarta zabudowa miejska
    { area: suburb, weight: 0.13 },
    { area: remoteVillage, weight: 0.02 },
  ];
  const houseCands: LocationCandidate[] = [
    { area: bigCityCore, weight: 0.25 },
    { area: suburb, weight: 0.6 }, // domy → strefa podmiejska
    { area: remoteVillage, weight: 0.15 },
  ];
  const plotCands: LocationCandidate[] = [
    { area: bigCityCore, weight: 0.1 },
    { area: suburb, weight: 0.4 },
    { area: remoteVillage, weight: 0.5 }, // działki → więcej terenów peryferyjnych
  ];

  it("mieszkanie mocniej przypisane do rdzenia niż działka", () => {
    const apt = scoreLocation(ctx({ propertyType: "apartment", candidates: apartmentCands }), {
      now: NOW,
    });
    const plot = scoreLocation(ctx({ propertyType: "plot", candidates: plotCands }), { now: NOW });
    expect(apt.probabilityUrbanCore).toBeGreaterThan(plot.probabilityUrbanCore);
    expect(apt.expectedLocationAttractiveness).toBeGreaterThan(plot.expectedLocationAttractiveness);
  });

  it("dom w strefie podmiejskiej nadal atrakcyjny", () => {
    const house = scoreLocation(ctx({ propertyType: "house", candidates: houseCands }), {
      now: NOW,
    });
    expect(house.probabilityUrbanOrSuburban).toBeGreaterThan(0.7);
    expect(house.expectedLocationAttractiveness).toBeGreaterThan(50);
  });
});

// ── 6. Wygładzanie bayesowskie ───────────────────────────────────────────────
describe("applyBayesianSmoothing", () => {
  it("mała próba prawie nie rusza priora", () => {
    const adj = applyBayesianSmoothing(
      80,
      0.9,
      {
        sampleCount: 3,
        empiricalMeanAttractiveness: 10,
        empiricalGoodCount: 0,
      },
      config.bayesianLambda,
    );
    expect(adj.posteriorMeanAttractiveness).toBeGreaterThan(75); // nadal blisko 80
  });

  it("duża próba dominuje nad priorem", () => {
    const adj = applyBayesianSmoothing(
      80,
      0.9,
      {
        sampleCount: 1000,
        empiricalMeanAttractiveness: 20,
        empiricalGoodCount: 100,
      },
      config.bayesianLambda,
    );
    expect(adj.posteriorMeanAttractiveness).toBeLessThan(30);
    expect(adj.posteriorGoodProbability).toBeLessThan(0.3);
  });

  it("brak obserwacji → prior bez zmian", () => {
    const adj = applyBayesianSmoothing(70, 0.5, null, config.bayesianLambda);
    expect(adj.applied).toBe(false);
    expect(adj.posteriorMeanAttractiveness).toBe(70);
  });

  it("kilka przypadkowych obserwacji nie odwraca decyzji", () => {
    const base = scoreLocation(ctx({ candidates: [{ area: bigCityCore, weight: 1 }] }), {
      now: NOW,
    });
    const withNoise = scoreLocation(
      ctx({
        candidates: [{ area: bigCityCore, weight: 1 }],
        observations: { sampleCount: 2, empiricalMeanAttractiveness: 5, empiricalGoodCount: 0 },
      }),
      { now: NOW },
    );
    expect(withNoise.expectedLocationAttractiveness).toBeGreaterThan(70);
    expect(
      base.expectedLocationAttractiveness - withNoise.expectedLocationAttractiveness,
    ).toBeLessThan(15);
  });
});

// ── 7. Sygnał z numeru repertoryjnego ────────────────────────────────────────
describe("buildSerialSignal", () => {
  it("mała próba → sygnał pominięty", () => {
    const sig = buildSerialSignal(
      { sampleCount: 5, meanAttractiveness: 30, positiveShare: 0.2, validatedOffline: true },
      config.serialSignalMinSample,
    );
    expect(sig?.applied).toBe(false);
  });

  it("duża, zwalidowana próba → sygnał zastosowany", () => {
    const sig = buildSerialSignal(
      { sampleCount: 200, meanAttractiveness: 30, positiveShare: 0.2, validatedOffline: true },
      config.serialSignalMinSample,
    );
    expect(sig?.applied).toBe(true);
  });

  it("niezwalidowany offline → pominięty mimo dużej próby", () => {
    const sig = buildSerialSignal(
      { sampleCount: 500, meanAttractiveness: 30, positiveShare: 0.2, validatedOffline: false },
      config.serialSignalMinSample,
    );
    expect(sig?.applied).toBe(false);
  });

  it("sygnał niezastosowany nie wpływa na wynik", () => {
    const withoutSig = scoreLocation(ctx({ candidates: [{ area: bigCityCore, weight: 1 }] }), {
      now: NOW,
    });
    const withSmallSig = scoreLocation(
      ctx({
        candidates: [{ area: bigCityCore, weight: 1 }],
        serialSignal: buildSerialSignal(
          { sampleCount: 5, meanAttractiveness: 10, positiveShare: 0, validatedOffline: true },
          config.serialSignalMinSample,
        ),
      }),
      { now: NOW },
    );
    expect(withSmallSig.expectedLocationAttractiveness).toBe(
      withoutSig.expectedLocationAttractiveness,
    );
  });
});

// ── 8. Wersjonowanie i konfiguracja ──────────────────────────────────────────
describe("wersjonowanie i konfiguracja", () => {
  it("wynik zawiera wersję modelu, danych i konfiguracji", () => {
    const r = scoreLocation(ctx({ candidates: [{ area: bigCityCore, weight: 1 }] }), {
      now: NOW,
      dataVersion: "gus-2021-nsp-v3",
    });
    expect(r.modelVersion).toBe(MODEL_VERSION);
    expect(r.dataVersion).toBe("gus-2021-nsp-v3");
    expect(r.configVersion).toBe(config.version);
    expect(r.calculatedAt).toBe(NOW);
  });

  it("zmiana progów konfiguracji zmienia decyzję (deterministycznie)", () => {
    const strict = mergeConfig({
      version: "cfg-strict",
      decisionThresholds: {
        autoHighScore: 99,
        autoHighConfidence: 99,
        autoStandardScore: 95,
        autoStandardConfidence: 95,
        lightCheckScore: 90,
      },
    });
    const r = scoreLocation(ctx({ candidates: [{ area: suburb, weight: 1 }], config: strict }), {
      now: NOW,
    });
    expect(["LIGHT_LOCATION_CHECK", "LOW_PRIORITY"]).toContain(r.decision);
    expect(r.configVersion).toBe("cfg-strict");
  });

  it("prawdopodobieństwa są w zakresie 0–1 i sumują sensownie", () => {
    const r = scoreLocation(
      ctx({
        candidates: [
          { area: bigCityCore, weight: 0.3 },
          { area: suburb, weight: 0.3 },
          { area: remoteVillage, weight: 0.4 },
        ],
      }),
      { now: NOW },
    );
    for (const p of [
      r.probabilityUrbanCore,
      r.probabilityUrbanOrSuburban,
      r.probabilityFua,
      r.probabilityGoodLocation,
      r.probabilityRemoteArea,
    ]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

// ── 8. „Dobra lokalizacja" = okolica większego skupiska (≥ ~20–30 tys.) ──────
describe("probabilityGoodLocation — okolica skupiska ludzkiego", () => {
  it("miasto ≥30 tys. i strefa podmiejska liczą się jako okolica skupiska", () => {
    const r = scoreLocation(
      ctx({
        candidates: [
          { area: bigCityCore, weight: 0.5 },
          { area: suburb, weight: 0.5 },
        ],
      }),
      { now: NOW },
    );
    expect(r.probabilityGoodLocation).toBe(1);
  });

  it("miasteczko ~25 tys. w promieniu 10 km kwalifikuje się mimo braku flag miejskich", () => {
    const smallTownArea = area({
      geoUnitId: "0601",
      name: "Gmina przy mieście ~25 tys.",
      populationWithin10Km: 26_000, // ≥ próg 25 000 → okolica skupiska
      populationWithin25Km: 60_000,
      populationWithin45Km: 150_000,
      densityPerKm2: 120,
      fuaRole: "none",
    });
    const r = scoreLocation(ctx({ candidates: [{ area: smallTownArea, weight: 1 }] }), {
      now: NOW,
    });
    expect(r.probabilityGoodLocation).toBe(1);
  });

  it("odległa gmina bez skupiska w zasięgu NIE kwalifikuje się", () => {
    const r = scoreLocation(ctx({ candidates: [{ area: remoteVillage, weight: 1 }] }), {
      now: NOW,
    });
    expect(r.probabilityGoodLocation).toBe(0);
  });

  it("mieszany rozkład: szansa = masa prawdopodobieństwa obszarów przy skupisku", () => {
    const r = scoreLocation(
      ctx({
        candidates: [
          { area: bigCityCore, weight: 0.6 },
          { area: remoteVillage, weight: 0.4 },
        ],
      }),
      { now: NOW },
    );
    expect(r.probabilityGoodLocation).toBeCloseTo(0.6, 4);
  });

  it("próg ludności 10 km jest konfigurowalny", () => {
    const nearTown = area({
      geoUnitId: "0602",
      name: "Gmina z 22 tys. w 10 km",
      populationWithin10Km: 22_000,
      populationWithin25Km: 40_000,
      populationWithin45Km: 90_000,
      densityPerKm2: 90,
    });
    const strict = mergeConfig({ nearSettlement: { minPopulationWithin10Km: 30_000 } });
    const lenient = mergeConfig({ nearSettlement: { minPopulationWithin10Km: 20_000 } });
    const rStrict = scoreLocation(
      ctx({ candidates: [{ area: nearTown, weight: 1 }], config: strict }),
      { now: NOW },
    );
    const rLenient = scoreLocation(
      ctx({ candidates: [{ area: nearTown, weight: 1 }], config: lenient }),
      { now: NOW },
    );
    expect(rStrict.probabilityGoodLocation).toBe(0);
    expect(rLenient.probabilityGoodLocation).toBe(1);
  });
});

// ── 9. Scoring bez rodzaju nieruchomości (propertyType="any") ────────────────
describe("scoreLocation — rodzaj nieruchomości pomocniczy (any)", () => {
  it("działa bez rodzaju: pełny wynik + zaznaczone ograniczenie", () => {
    const r = scoreLocation(
      ctx({
        propertyType: "any",
        candidates: [
          { area: bigCityCore, weight: 0.7 },
          { area: suburb, weight: 0.3 },
        ],
      }),
      { now: NOW },
    );
    expect(r.decision).not.toBe("INSUFFICIENT_DATA");
    expect(r.propertyType).toBe("any");
    expect(r.probabilityGoodLocation).toBe(1);
    expect(r.expectedLocationAttractiveness).toBeGreaterThan(60);
    expect(r.explanation.limitations.join(" ")).toContain("Rodzaj nieruchomości nieokreślony");
  });

  it("wynik dla 'any' mieści się między wynikami rodzajów (rozkład zagregowany)", () => {
    // Zagregowane wagi (suma po rodzajach) — tak buduje kandydatów warstwa
    // serwerowa dla "any": rozkład ogólny, bez doprecyzowania rodzajem.
    const perType = {
      apartment: [
        { area: bigCityCore, weight: 0.9 },
        { area: remoteVillage, weight: 0.1 },
      ],
      plot: [
        { area: bigCityCore, weight: 0.2 },
        { area: remoteVillage, weight: 0.8 },
      ],
    };
    const aggregated = [
      { area: bigCityCore, weight: 0.9 + 0.2 },
      { area: remoteVillage, weight: 0.1 + 0.8 },
    ];
    const apt = scoreLocation(ctx({ propertyType: "apartment", candidates: perType.apartment }), {
      now: NOW,
    });
    const plot = scoreLocation(ctx({ propertyType: "plot", candidates: perType.plot }), {
      now: NOW,
    });
    const any = scoreLocation(ctx({ propertyType: "any", candidates: aggregated }), { now: NOW });
    expect(any.probabilityGoodLocation).toBeGreaterThan(plot.probabilityGoodLocation);
    expect(any.probabilityGoodLocation).toBeLessThan(apt.probabilityGoodLocation);
  });
});
