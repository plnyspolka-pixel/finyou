// Moduł „Potencjał lokalizacyjny nieruchomości" — typy publiczne.
//
// Warstwa czysta (bez Supabase, bez importów sieciowych) — w pełni testowalna.
// Prawdopodobieństwa przechowujemy WEWNĘTRZNIE jako wartości 0–1; procenty
// wyliczamy dopiero w warstwie prezentacji (UI).
//
// Kolejność warstw modułu:
//   kw-parser.ts        normalizacja + walidacja numeru KW (prefiks/repertorium/cyfra kontrolna)
//   config.ts           wersjonowana konfiguracja (wagi, granice, progi, lambda)
//   base-attractiveness  bazowy potencjał lokalizacyjny obszaru 0–100
//   distribution.ts     rozkład P(lokalizacja | prefiks, rodzaj) → oczekiwana atrakcyjność
//   bayesian.ts         wygładzanie bayesowskie obserwacji
//   confidence.ts       wskaźnik pewności + percentyle
//   scoring.ts          orkiestracja → LocationScoringResult
//   explanation.ts      budowa uzasadnienia (title/summary/reasons/limitations)
//   masking.ts          maskowanie numeru KW (dane wrażliwe)

export type PropertyType = "apartment" | "house" | "plot";

export type PlotType = "building" | "agricultural" | "commercial" | "unknown";

/** Wejście modułu. Pola „declared*" są opcjonalne (rozszerzenie przyszłościowe). */
export type LocationScoringInput = {
  applicationId: string;
  kwNumber: string;
  propertyType: PropertyType;

  // Rozszerzenia — nie mogą być wymagane w pierwszej wersji.
  plotType?: PlotType;
  declaredVoivodeship?: string;
  declaredCounty?: string;
  declaredMunicipality?: string;
  declaredLocality?: string;
};

export type LocationScoringDecision =
  | "AUTO_ANALYZE_HIGH"
  | "AUTO_ANALYZE_STANDARD"
  | "LIGHT_LOCATION_CHECK"
  | "LOW_PRIORITY"
  | "INVALID_KW"
  | "INSUFFICIENT_DATA";

/** Rola obszaru w funkcjonalnym obszarze miejskim (FUA). */
export type FuaRole = "core" | "commuting_zone" | "none";

/**
 * Znormalizowany numer KW rozbity na części składowe.
 * `serialNumber` to numer REPERTORYJNY — NIE koduje oficjalnie lokalizacji,
 * ale po zebraniu dużej liczby obserwacji może być sygnałem statystycznym.
 */
export type ParsedKwNumber = {
  raw: string;
  normalized: string; // "RA1R/00123456/7"
  prefix: string; // "RA1R"
  serialNumber: number; // 123456
  serialNumberPadded: string; // "00123456"
  checkDigit: number; // 7
  formatValid: boolean; // poprawny format (prefiks/8 cyfr/kontrolna)
  checkDigitValid: boolean; // zgodna cyfra kontrolna (algorytm EKW)
  isValid: boolean; // formatValid && checkDigitValid
};

/**
 * Metryki jednej możliwej lokalizacji (zagregowany obszar / komórka siatki).
 * Wyliczane OFFLINE w ETL i zapisywane jako gotowe agregaty — moduł scoringowy
 * nie wykonuje ciężkich obliczeń przestrzennych w trakcie obsługi wniosku.
 */
export type AreaMetrics = {
  geoUnitId: string; // TERYT / identyfikator obszaru
  name: string; // czytelna nazwa (miejscowość/gmina)
  populationWithin10Km: number;
  populationWithin25Km: number;
  populationWithin45Km: number;
  densityPerKm2: number;
  isCityAbove30k: boolean;
  isCityAbove100k: boolean;
  isCityAbove250k: boolean;
  isAdjacentToCityAbove30k: boolean;
  isUrbanCluster: boolean;
  fuaRole: FuaRole;
  distanceToCity30kKm: number | null;
  distanceToCity100kKm: number | null;
  distanceToCity250kKm: number | null;
  /** Jakość danych źródłowych dla tego obszaru (wpływa na confidence). */
  dataQuality: "high" | "medium" | "low";
};

/**
 * Waga (prawdopodobieństwo warunkowe) jednej lokalizacji dla kombinacji
 * prefiks × rodzaj nieruchomości. `weight` przed normalizacją; suma po
 * normalizacji = 1.
 */
export type LocationCandidate = {
  area: AreaMetrics;
  /** Surowa waga z ETL (property_type_location_weights). */
  weight: number;
};

/** Zagregowane statystyki historyczne (bayesian prior/posterior). */
export type ObservationAggregate = {
  sampleCount: number;
  empiricalMeanAttractiveness: number; // 0–100
  empiricalGoodCount: number; // liczba obserwacji good_location
};

/**
 * Sygnał z numeru repertoryjnego (środkowe cyfry) — używany TYLKO gdy próba
 * jest dostatecznie duża i sygnał przechodzi walidację. Dla małych prób = null.
 */
export type SerialRangeSignal = {
  sampleCount: number;
  meanAttractiveness: number; // 0–100
  positiveShare: number; // 0–1
  applied: boolean; // czy sygnał został włączony do wyniku
} | null;

export type CourtDepartmentInfo = {
  prefix: string;
  name: string;
  jurisdictionVersion: string;
  /** Kompletność/pewność mapowania prefiksu (0–1). */
  mappingConfidence: number;
};

/** Wejście do czystego rdzenia scoringowego (wszystko już wczytane z DB/ETL). */
export type ScoringContext = {
  parsedKw: ParsedKwNumber;
  propertyType: PropertyType;
  court: CourtDepartmentInfo | null;
  candidates: LocationCandidate[]; // możliwe lokalizacje z wagami
  observations: ObservationAggregate | null; // historia dla prefiks×rodzaj
  serialSignal: SerialRangeSignal;
  config: import("./config").LocationScoringConfig;
};

export type LocationScoringExplanation = {
  title: string;
  summary: string;
  reasons: string[];
  limitations: string[];
};

export type LocationScoringResult = {
  applicationId: string;
  normalizedKwNumber: string; // ZAMASKOWANY numer (dane wrażliwe)
  kwPrefix: string;
  propertyType: PropertyType;

  // Prawdopodobieństwa 0–1 (w UI pokazywane jako procenty).
  probabilityUrbanCore: number;
  probabilityUrbanOrSuburban: number;
  probabilityFua: number;
  probabilityGoodLocation: number;
  probabilityRemoteArea: number;

  expectedLocationAttractiveness: number; // 0–100
  analysisPriorityScore: number; // 0–100
  confidenceScore: number; // 0–100

  attractivenessP10: number;
  attractivenessMedian: number;
  attractivenessP90: number;

  decision: LocationScoringDecision;

  explanation: LocationScoringExplanation;

  courtDepartment: {
    prefix: string;
    name: string;
    jurisdictionVersion: string;
  };

  modelVersion: string;
  dataVersion: string;
  configVersion: string;
  calculatedAt: string;
};
