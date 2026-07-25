// Publiczne API modułu „Potencjał lokalizacyjny nieruchomości".
//
// Warstwa czysta (bez Supabase) — orkiestracja przez scoreLocation(ScoringContext).
// Warstwa serwerowa (ładowanie danych, persystencja, integracja z wnioskiem):
//   src/lib/location-scoring.functions.ts.

export * from "./types";
export {
  MODEL_VERSION,
  DEFAULT_CONFIG_VERSION,
  DEFAULT_LOCATION_SCORING_CONFIG,
  mergeConfig,
  type LocationScoringConfig,
} from "./config";
export { parseKwNumber, computeKwCheckDigit, describeKw, normalizeKwRaw } from "./kw-parser";
export { logNormalize, computeBaseAttractiveness, clusterScore } from "./base-attractiveness";
export {
  computeDistribution,
  normalizeDistribution,
  type DistributionResult,
} from "./distribution";
export { applyBayesianSmoothing, type BayesianAdjustment } from "./bayesian";
export { computeConfidence } from "./confidence";
export { buildSerialSignal, type RawRangeStat } from "./serial-signal";
export { buildExplanation } from "./explanation";
export { maskKwNumber, maskKwRaw } from "./masking";
export {
  scoreLocation,
  decide,
  invalidKwResult,
  insufficientDataResult,
  type ScoreOptions,
} from "./scoring";
export { toScoringPropertyType, toDbPropertyType, plotTypeFromDb } from "./property-type";
