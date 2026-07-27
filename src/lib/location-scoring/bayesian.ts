// Wygładzanie bayesowskie obserwacji historycznych (spec §10).
//
// Kilka przypadkowych obserwacji nie może przeważyć danych bazowych. Prior to
// wynik z modelu przestrzennego (rozkład + oczekiwana atrakcyjność); posterior
// przesuwa się w stronę empirii proporcjonalnie do liczby obserwacji i lambdy.

import type { ObservationAggregate } from "./types";

export type BayesianAdjustment = {
  posteriorMeanAttractiveness: number; // 0–100
  posteriorGoodProbability: number; // 0–1
  applied: boolean;
  sampleCount: number;
};

/**
 * Łączy prior (z modelu) z empirią (obserwacje). Gdy brak obserwacji, zwraca
 * prior bez zmian (applied=false).
 */
export function applyBayesianSmoothing(
  priorMeanAttractiveness: number,
  priorGoodProbability: number,
  observations: ObservationAggregate | null,
  lambda: number,
): BayesianAdjustment {
  if (!observations || observations.sampleCount <= 0) {
    return {
      posteriorMeanAttractiveness: priorMeanAttractiveness,
      posteriorGoodProbability: priorGoodProbability,
      applied: false,
      sampleCount: 0,
    };
  }

  const n = observations.sampleCount;
  const lam = Math.max(0, lambda);

  const posteriorMeanAttractiveness =
    (n * observations.empiricalMeanAttractiveness + lam * priorMeanAttractiveness) / (n + lam);

  const posteriorGoodProbability =
    (observations.empiricalGoodCount + lam * priorGoodProbability) / (n + lam);

  return {
    posteriorMeanAttractiveness: clamp(posteriorMeanAttractiveness, 0, 100),
    posteriorGoodProbability: clamp(posteriorGoodProbability, 0, 1),
    applied: true,
    sampleCount: n,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
