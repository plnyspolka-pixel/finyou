// Wersjonowana konfiguracja modułu scoringowego.
//
// Wagi, granice normalizacji i progi NIE mogą być rozsiane po kodzie (spec §7).
// Domyślne wartości żyją tu; panel administratora zapisuje kolejne wersje do
// tabeli location_scoring_settings. Każda zmiana = nowa wersja; historyczne
// wyniki nie zmieniają się bez jawnego ponownego przeliczenia (spec §19).

/** Wersja algorytmu scoringowego (zmiana logiki → bump). */
export const MODEL_VERSION = "loc-scoring-1.0.0";

/** Wersja domyślnej konfiguracji (parametry). */
export const DEFAULT_CONFIG_VERSION = "cfg-default-1";

export type LocationScoringConfig = {
  version: string;

  // Wagi udziału ludności w promieniach + roli w klastrze (suma ~1.0).
  weights: {
    population10: number;
    population25: number;
    population45: number;
    cluster: number;
  };

  // Granice normalizacji logarytmicznej ludności (dolna, górna).
  populationBounds: {
    within10Km: [number, number];
    within25Km: [number, number];
    within45Km: [number, number];
  };

  // Mnożniki oceny klastra wg roli obszaru.
  clusterScores: {
    fuaCore: number;
    fuaCommutingZone: number;
    cityAbove30k: number;
    adjacentToCity30k: number;
    urbanCluster: number;
    other: number;
  };

  // Próg uznania lokalizacji za „dobrą" (base_location_attractiveness >= …).
  goodLocationThreshold: number;

  // Wagi finalnego priorytetu.
  priorityWeights: {
    expectedAttractiveness: number; // 0.70
    probabilityGoodLocation: number; // 0.30
  };

  // Progi decyzyjne (konfigurowalne).
  decisionThresholds: {
    autoHighScore: number;
    autoHighConfidence: number;
    autoStandardScore: number;
    autoStandardConfidence: number;
    lightCheckScore: number;
  };

  // Siła wygładzania bayesowskiego (ekwiwalent liczby obserwacji priora).
  bayesianLambda: number;

  // Minimalna próba, by w ogóle wykorzystać sygnał z numeru repertoryjnego.
  serialSignalMinSample: number;
};

export const DEFAULT_LOCATION_SCORING_CONFIG: LocationScoringConfig = {
  version: DEFAULT_CONFIG_VERSION,
  weights: {
    population10: 0.45,
    population25: 0.3,
    population45: 0.15,
    cluster: 0.1,
  },
  populationBounds: {
    within10Km: [5_000, 500_000],
    within25Km: [20_000, 1_000_000],
    within45Km: [50_000, 2_000_000],
  },
  clusterScores: {
    fuaCore: 1.0,
    fuaCommutingZone: 0.85,
    cityAbove30k: 0.75,
    adjacentToCity30k: 0.7,
    urbanCluster: 0.5,
    other: 0.15,
  },
  goodLocationThreshold: 60,
  priorityWeights: {
    expectedAttractiveness: 0.7,
    probabilityGoodLocation: 0.3,
  },
  decisionThresholds: {
    autoHighScore: 75,
    autoHighConfidence: 60,
    autoStandardScore: 60,
    autoStandardConfidence: 50,
    lightCheckScore: 40,
  },
  // Konserwatywnie: prior odpowiada ~75 obserwacjom (spec §10: 50–100).
  bayesianLambda: 75,
  serialSignalMinSample: 40,
};

/** Scala częściową konfigurację z domyślną (walidacja + wypełnienie braków). */
export function mergeConfig(
  partial: Partial<LocationScoringConfig> | null | undefined,
): LocationScoringConfig {
  const base = DEFAULT_LOCATION_SCORING_CONFIG;
  if (!partial) return base;
  return {
    version: partial.version ?? base.version,
    weights: { ...base.weights, ...partial.weights },
    populationBounds: { ...base.populationBounds, ...partial.populationBounds },
    clusterScores: { ...base.clusterScores, ...partial.clusterScores },
    goodLocationThreshold: partial.goodLocationThreshold ?? base.goodLocationThreshold,
    priorityWeights: { ...base.priorityWeights, ...partial.priorityWeights },
    decisionThresholds: { ...base.decisionThresholds, ...partial.decisionThresholds },
    bayesianLambda: partial.bayesianLambda ?? base.bayesianLambda,
    serialSignalMinSample: partial.serialSignalMinSample ?? base.serialSignalMinSample,
  };
}
