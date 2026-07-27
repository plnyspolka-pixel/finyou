// Orkiestracja czystego rdzenia scoringowego (spec §12).
//
// Wejście: ScoringContext (wszystko już wczytane z DB/ETL) → LocationScoringResult.
// Deterministyczne, bez efektów ubocznych — pełny materiał do testów i backtestu.

import type { LocationScoringDecision, LocationScoringResult, ScoringContext } from "./types";
import { MODEL_VERSION } from "./config";
import { computeDistribution } from "./distribution";
import { applyBayesianSmoothing } from "./bayesian";
import { computeConfidence } from "./confidence";
import { buildExplanation } from "./explanation";
import { maskKwNumber } from "./masking";

export type ScoreOptions = {
  now?: string;
  dataVersion?: string;
};

/** Zwraca wynik dla numeru o niepoprawnym formacie (nie blokuje wniosku). */
export function invalidKwResult(
  ctx: ScoringContext,
  now: string,
  dataVersion: string,
): LocationScoringResult {
  return baseShell(ctx, now, dataVersion, "INVALID_KW", {
    title: "Nieprawidłowy numer księgi wieczystej",
    summary:
      "Podany numer KW nie przeszedł walidacji formatu/cyfry kontrolnej. Scoring lokalizacyjny nie został wyznaczony.",
    reasons: [],
    limitations: [
      "Zweryfikuj numer KW. Błąd numeru NIE oznacza odrzucenia wniosku — wniosek jest zapisywany, a analiza może być powtórzona po korekcie.",
    ],
  });
}

/** Zwraca wynik dla przypadku braku danych o lokalizacjach (nie blokuje wniosku). */
export function insufficientDataResult(
  ctx: ScoringContext,
  now: string,
  dataVersion: string,
): LocationScoringResult {
  return baseShell(ctx, now, dataVersion, "INSUFFICIENT_DATA", {
    title: "Niewystarczające dane do oszacowania lokalizacji",
    summary:
      "Dla prefiksu wydziału KW brak zaimportowanych danych przestrzennych/rozkładu lokalizacji. Wynik zostanie wyznaczony po uzupełnieniu importu.",
    reasons: [],
    limitations: [
      "Brak wag lokalizacji dla tej kombinacji prefiks × rodzaj nieruchomości.",
      "Uruchom import danych GUS/TERYT oraz mapy prefiksów, a następnie ponowne przeliczenie.",
    ],
  });
}

function baseShell(
  ctx: ScoringContext,
  now: string,
  dataVersion: string,
  decision: LocationScoringDecision,
  explanation: LocationScoringResult["explanation"],
): LocationScoringResult {
  return {
    applicationId: "",
    normalizedKwNumber: maskKwNumber(ctx.parsedKw),
    kwPrefix: ctx.parsedKw.prefix,
    propertyType: ctx.propertyType,
    probabilityUrbanCore: 0,
    probabilityUrbanOrSuburban: 0,
    probabilityFua: 0,
    probabilityGoodLocation: 0,
    probabilityRemoteArea: 0,
    expectedLocationAttractiveness: 0,
    analysisPriorityScore: 0,
    confidenceScore: 0,
    attractivenessP10: 0,
    attractivenessMedian: 0,
    attractivenessP90: 0,
    decision,
    explanation,
    courtDepartment: {
      prefix: ctx.court?.prefix ?? ctx.parsedKw.prefix,
      name: ctx.court?.name ?? "(nieznany wydział)",
      jurisdictionVersion: ctx.court?.jurisdictionVersion ?? "n/a",
    },
    modelVersion: MODEL_VERSION,
    dataVersion,
    configVersion: ctx.config.version,
    calculatedAt: now,
  };
}

/**
 * Główny scoring. Numer o złym formacie → INVALID_KW; brak kandydatów →
 * INSUFFICIENT_DATA. W obu przypadkach zwraca kompletny (bezpieczny) wynik.
 */
export function scoreLocation(
  ctx: ScoringContext,
  options: ScoreOptions = {},
): LocationScoringResult {
  const now = options.now ?? new Date().toISOString();
  const dataVersion = options.dataVersion ?? "n/a";
  const { config } = ctx;

  if (!ctx.parsedKw.formatValid) return invalidKwResult(ctx, now, dataVersion);
  if (!ctx.candidates || ctx.candidates.length === 0) {
    return insufficientDataResult(ctx, now, dataVersion);
  }

  // 1) Rozkład prawdopodobieństwa lokalizacji + wielkości pochodne.
  const distribution = computeDistribution(ctx.candidates, config);

  // 2) Prior (z modelu przestrzennego) → posterior (empiria historyczna).
  const smoothed = applyBayesianSmoothing(
    distribution.expectedLocationAttractiveness,
    distribution.probabilityGoodLocation,
    ctx.observations,
    config.bayesianLambda,
  );

  let expected = smoothed.posteriorMeanAttractiveness;
  let probGood = smoothed.posteriorGoodProbability;

  // 3) Sygnał z numeru repertoryjnego — tylko gdy zastosowany (duża, stabilna próba).
  const serialApplied = ctx.serialSignal?.applied === true;
  if (serialApplied && ctx.serialSignal) {
    // Delikatna korekta: waga sygnału rośnie z próbą, ale ograniczona do 20%.
    const w = Math.min(0.2, ctx.serialSignal.sampleCount / (config.bayesianLambda * 5));
    expected = (1 - w) * expected + w * ctx.serialSignal.meanAttractiveness;
    probGood = (1 - w) * probGood + w * ctx.serialSignal.positiveShare;
  }

  expected = clamp(expected, 0, 100);
  probGood = clamp(probGood, 0, 1);

  // 4) Priorytet automatycznej analizy (spec §12).
  const pw = config.priorityWeights;
  const analysisPriorityScore = Math.round(
    pw.expectedAttractiveness * expected + pw.probabilityGoodLocation * probGood * 100,
  );

  // 5) Pewność.
  const worstAreaDataQuality = distribution.locations.reduce<"high" | "medium" | "low">(
    (worst, l) => {
      const q = l.area.dataQuality;
      if (worst === "low" || q === "low") return "low";
      if (worst === "medium" || q === "medium") return "medium";
      return "high";
    },
    "high",
  );

  const confidence = computeConfidence({
    court: ctx.court,
    distribution,
    observations: ctx.observations,
    serialSignal: ctx.serialSignal,
    worstAreaDataQuality,
  });

  // 6) Decyzja.
  const decision = decide(analysisPriorityScore, confidence.score, config);

  // 7) Uzasadnienie.
  const explanation = buildExplanation({
    court: ctx.court,
    propertyType: ctx.propertyType,
    distribution,
    expectedAttractiveness: expected,
    probabilityGoodLocation: probGood,
    confidenceScore: confidence.score,
    bayesianApplied: smoothed.applied,
    sampleCount: smoothed.sampleCount,
    serialApplied,
    limitationsExtra: [],
  });

  return {
    applicationId: "",
    normalizedKwNumber: maskKwNumber(ctx.parsedKw),
    kwPrefix: ctx.parsedKw.prefix,
    propertyType: ctx.propertyType,

    probabilityUrbanCore: round4(distribution.probabilityUrbanCore),
    probabilityUrbanOrSuburban: round4(distribution.probabilityUrbanOrSuburban),
    probabilityFua: round4(distribution.probabilityFua),
    probabilityGoodLocation: round4(probGood),
    probabilityRemoteArea: round4(distribution.probabilityRemoteArea),

    expectedLocationAttractiveness: Math.round(expected),
    analysisPriorityScore: clampInt(analysisPriorityScore, 0, 100),
    confidenceScore: clampInt(confidence.score, 0, 100),

    attractivenessP10: Math.round(distribution.attractivenessP10),
    attractivenessMedian: Math.round(distribution.attractivenessMedian),
    attractivenessP90: Math.round(distribution.attractivenessP90),

    decision,
    explanation,

    courtDepartment: {
      prefix: ctx.court?.prefix ?? ctx.parsedKw.prefix,
      name: ctx.court?.name ?? "(nieznany wydział)",
      jurisdictionVersion: ctx.court?.jurisdictionVersion ?? "n/a",
    },

    modelVersion: MODEL_VERSION,
    dataVersion,
    configVersion: config.version,
    calculatedAt: now,
  };
}

/** Mapuje priorytet + pewność na decyzję wg konfigurowalnych progów (spec §12). */
export function decide(
  priorityScore: number,
  confidenceScore: number,
  config: ScoringContext["config"],
): LocationScoringDecision {
  const t = config.decisionThresholds;
  if (priorityScore >= t.autoHighScore && confidenceScore >= t.autoHighConfidence) {
    return "AUTO_ANALYZE_HIGH";
  }
  if (priorityScore >= t.autoStandardScore && confidenceScore >= t.autoStandardConfidence) {
    return "AUTO_ANALYZE_STANDARD";
  }
  if (priorityScore >= t.lightCheckScore) return "LIGHT_LOCATION_CHECK";
  return "LOW_PRIORITY";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}
function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(clamp(v, lo, hi));
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
