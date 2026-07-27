// Wskaźnik pewności (0–100).
//
// Niski, gdy wynik może oznaczać zarówno centrum dużego miasta, jak i odległą
// gminę wiejską (szeroki rozkład) — nawet jeśli średnia atrakcyjność jest
// wysoka (spec §13). Zależy od: kompletności mapowania prefiksu, jakości danych
// o obszarach, liczby obserwacji historycznych, stabilności sygnału
// repertoryjnego oraz szerokości rozkładu wyników (P90−P10).

import type { CourtDepartmentInfo, ObservationAggregate, SerialRangeSignal } from "./types";
import type { DistributionResult } from "./distribution";

export type ConfidenceInput = {
  court: CourtDepartmentInfo | null;
  distribution: DistributionResult;
  observations: ObservationAggregate | null;
  serialSignal: SerialRangeSignal;
  /** Najgorsza jakość danych wśród prawdopodobnych lokalizacji. */
  worstAreaDataQuality: "high" | "medium" | "low";
};

/** Składa wynik pewności z komponentów; zwraca 0–100 wraz z rozbiciem. */
export function computeConfidence(input: ConfidenceInput): {
  score: number;
  components: Record<string, number>;
} {
  const { court, distribution, observations, serialSignal, worstAreaDataQuality } = input;

  // 1) Kompletność/pewność mapowania prefiksu (0–1).
  const mapping = court ? clamp01(court.mappingConfidence) : 0;

  // 2) Jakość danych o obszarach.
  const dataQuality =
    worstAreaDataQuality === "high" ? 1 : worstAreaDataQuality === "medium" ? 0.7 : 0.4;

  // 3) Szerokość rozkładu wyników — im węższy (P90−P10 małe), tym pewniej.
  const spread = distribution.attractivenessP90 - distribution.attractivenessP10; // 0–100
  const spreadConfidence = clamp01(1 - spread / 100);

  // 4) Koncentracja rozkładu — dominująca lokalizacja podnosi pewność.
  const topProbability = distribution.locations.reduce((max, l) => Math.max(max, l.probability), 0);
  const concentration = clamp01(topProbability);

  // 5) Liczba obserwacji historycznych (nasyca się ~50).
  const sample = observations?.sampleCount ?? 0;
  const historyConfidence = clamp01(sample / 50);

  // 6) Stabilność sygnału repertoryjnego — bonus tylko gdy zastosowany.
  const serialConfidence = serialSignal?.applied ? clamp01(serialSignal.sampleCount / 100) : 0;

  // Wagi komponentów pewności (nie mylić z wagami scoringu atrakcyjności).
  const score =
    100 *
    clamp01(
      0.3 * mapping +
        0.2 * dataQuality +
        0.2 * spreadConfidence +
        0.15 * concentration +
        0.1 * historyConfidence +
        0.05 * serialConfidence,
    );

  return {
    score: Math.round(score),
    components: {
      mapping: round2(mapping),
      dataQuality: round2(dataQuality),
      spreadConfidence: round2(spreadConfidence),
      concentration: round2(concentration),
      historyConfidence: round2(historyConfidence),
      serialConfidence: round2(serialConfidence),
    },
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
