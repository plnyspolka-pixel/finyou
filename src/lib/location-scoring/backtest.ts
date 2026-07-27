// Backtest + auto-kalibracja modułu (spec §11, §20).
//
// Warstwa czysta (bez Supabase) — w pełni testowalna. Dostarcza:
//   * metryki jakości: precision, recall, ROC-AUC, PR-AUC, Brier, calibration error,
//     precision spraw kierowanych automatycznie, pokrycie (coverage),
//   * strojenie progu AUTO_ANALYZE_HIGH pod docelowy precision (domyślnie ≥ 0.90),
//   * walidację sygnału z numeru repertoryjnego (podział CZASOWY, bez wycieku) —
//     wynik ustawia flagę validated_offline (bramka sygnału działa automatycznie).
//
// Zasada braku wycieku: walidacja zawsze na podziale czasowym train/test.

export type EvalPair = {
  /** analysisPriorityScore 0–100 (do progowania decyzji). */
  priority: number;
  /** probabilityGoodLocation 0–1 (do Brier/kalibracji/ROC). */
  prob: number;
  /** rzeczywisty wynik good_location. */
  actual: boolean;
  observedAt: string;
  prefix: string;
  propertyType: string;
};

export type SerialObs = {
  serialNumber: number;
  good: boolean;
  attractiveness: number | null;
  observedAt: string;
};

// ── Metryki klasyfikacji ─────────────────────────────────────────────────────

/** Precision/recall/coverage przy progu na priorytecie. */
export function precisionRecallAt(pairs: EvalPair[], priorityThreshold: number) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let predictedPositive = 0;
  for (const p of pairs) {
    const predPos = p.priority >= priorityThreshold;
    if (predPos) predictedPositive++;
    if (predPos && p.actual) tp++;
    else if (predPos && !p.actual) fp++;
    else if (!predPos && p.actual) fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const coverage = pairs.length > 0 ? predictedPositive / pairs.length : 0;
  return { precision, recall, coverage, tp, fp, fn, predictedPositive };
}

/** ROC-AUC metodą rankingową (Mann–Whitney). */
export function rocAuc(pairs: EvalPair[]): number {
  const pos = pairs.filter((p) => p.actual).map((p) => p.prob);
  const neg = pairs.filter((p) => !p.actual).map((p) => p.prob);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  // Suma rang klas pozytywnych.
  const all = pairs.map((p) => ({ prob: p.prob, pos: p.actual })).sort((a, b) => a.prob - b.prob);
  let rank = 1;
  let i = 0;
  let rankSumPos = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && all[j].prob === all[i].prob) j++;
    const avgRank = (rank + (rank + (j - i) - 1)) / 2;
    for (let k = i; k < j; k++) if (all[k].pos) rankSumPos += avgRank;
    rank += j - i;
    i = j;
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

/** PR-AUC (średnia precyzja) przez całkowanie po recall. */
export function prAuc(pairs: EvalPair[]): number {
  const sorted = [...pairs].sort((a, b) => b.prob - a.prob);
  const totalPos = sorted.filter((p) => p.actual).length;
  if (totalPos === 0) return 0;
  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let area = 0;
  for (const p of sorted) {
    if (p.actual) tp++;
    else fp++;
    const precision = tp / (tp + fp);
    const recall = tp / totalPos;
    area += precision * (recall - prevRecall);
    prevRecall = recall;
  }
  return area;
}

/** Brier score (im niżej, tym lepiej). */
export function brier(pairs: Array<{ prob: number; actual: boolean }>): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((s, p) => s + (p.prob - (p.actual ? 1 : 0)) ** 2, 0) / pairs.length;
}

/** Expected Calibration Error (ECE) na binach prawdopodobieństwa. */
export function calibrationError(
  pairs: Array<{ prob: number; actual: boolean }>,
  bins = 10,
): number {
  if (pairs.length === 0) return 0;
  let ece = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const inBin = pairs.filter(
      (p) => p.prob >= lo && (b === bins - 1 ? p.prob <= hi : p.prob < hi),
    );
    if (inBin.length === 0) continue;
    const avgProb = inBin.reduce((s, p) => s + p.prob, 0) / inBin.length;
    const frac = inBin.filter((p) => p.actual).length / inBin.length;
    ece += (inBin.length / pairs.length) * Math.abs(avgProb - frac);
  }
  return ece;
}

// ── Strojenie progu AUTO_ANALYZE_HIGH ────────────────────────────────────────

export type ThresholdSuggestion = {
  priorityThreshold: number;
  precision: number;
  recall: number;
  coverage: number;
  reachedTarget: boolean;
  sampleSize: number;
};

/**
 * Dobiera najniższy próg priorytetu, który osiąga docelowy precision (maksymalizuje
 * pokrycie przy zachowaniu precyzji). Jeżeli próba nie pozwala osiągnąć celu —
 * zwraca próg o najwyższej precyzji i reachedTarget=false (bez sztucznej pewności).
 */
export function tunePriorityThreshold(
  pairs: EvalPair[],
  targetPrecision = 0.9,
  minSample = 30,
): ThresholdSuggestion {
  if (pairs.length < minSample) {
    return {
      priorityThreshold: 75,
      precision: 0,
      recall: 0,
      coverage: 0,
      reachedTarget: false,
      sampleSize: pairs.length,
    };
  }
  let best: ThresholdSuggestion | null = null;
  let bestByPrecision: ThresholdSuggestion | null = null;
  for (let t = 100; t >= 0; t--) {
    const { precision, recall, coverage, predictedPositive } = precisionRecallAt(pairs, t);
    if (predictedPositive === 0) continue;
    const cand: ThresholdSuggestion = {
      priorityThreshold: t,
      precision,
      recall,
      coverage,
      reachedTarget: precision >= targetPrecision,
      sampleSize: pairs.length,
    };
    if (!bestByPrecision || precision > bestByPrecision.precision) bestByPrecision = cand;
    // Najniższy próg (największe pokrycie) przy zachowaniu precyzji celu.
    if (precision >= targetPrecision) best = cand;
  }
  return (
    best ??
    bestByPrecision ?? {
      priorityThreshold: 75,
      precision: 0,
      recall: 0,
      coverage: 0,
      reachedTarget: false,
      sampleSize: pairs.length,
    }
  );
}

// ── Podział czasowy (bez wycieku) ────────────────────────────────────────────

export function timeSplit<T extends { observedAt: string }>(items: T[], testRatio = 0.3) {
  const sorted = [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const cut = Math.floor(sorted.length * (1 - testRatio));
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) };
}

// ── Metryki zbiorcze backtestu ───────────────────────────────────────────────

export type BacktestReport = {
  sampleSize: number;
  testSize: number;
  rocAuc: number;
  prAuc: number;
  brier: number;
  calibrationError: number;
  precisionAtAuto: number;
  recallAtAuto: number;
  coverageAtAuto: number;
  suggestion: ThresholdSuggestion;
  perPropertyType: Record<string, { sample: number; precisionAtAuto: number }>;
  note: string;
};

/**
 * Pełny backtest na parach (predykcja, rzeczywistość). Podział czasowy: metryki
 * liczone na zbiorze TESTOWYM (nowsze obserwacje), strojenie progu również na teście.
 */
export function runBacktest(
  pairs: EvalPair[],
  currentAutoHighScore: number,
  targetPrecision = 0.9,
): BacktestReport {
  const { test } = timeSplit(pairs, 0.3);
  const evalSet = test.length >= 20 ? test : pairs; // za mało w teście → cały zbiór
  const atAuto = precisionRecallAt(evalSet, currentAutoHighScore);
  const suggestion = tunePriorityThreshold(evalSet, targetPrecision);

  const perPropertyType: BacktestReport["perPropertyType"] = {};
  for (const t of ["apartment", "house", "plot"]) {
    const subset = evalSet.filter((p) => p.propertyType === t);
    if (subset.length > 0) {
      perPropertyType[t] = {
        sample: subset.length,
        precisionAtAuto: precisionRecallAt(subset, currentAutoHighScore).precision,
      };
    }
  }

  const note =
    pairs.length < 30
      ? `Zbyt mała próba (${pairs.length}) — metryki orientacyjne, próg pozostaje domyślny do czasu zebrania danych.`
      : suggestion.reachedTarget
        ? `Próg ${suggestion.priorityThreshold} osiąga precision ${(suggestion.precision * 100).toFixed(1)}% przy pokryciu ${(suggestion.coverage * 100).toFixed(1)}%.`
        : `Cel precision ${(targetPrecision * 100).toFixed(0)}% nieosiągalny na obecnej próbie — najlepszy realny precision ${(suggestion.precision * 100).toFixed(1)}%.`;

  return {
    sampleSize: pairs.length,
    testSize: evalSet.length,
    rocAuc: rocAuc(evalSet),
    prAuc: prAuc(evalSet),
    brier: brier(evalSet),
    calibrationError: calibrationError(evalSet),
    precisionAtAuto: atAuto.precision,
    recallAtAuto: atAuto.recall,
    coverageAtAuto: atAuto.coverage,
    suggestion,
    perPropertyType,
    note,
  };
}

// ── Sygnał numeru repertoryjnego: budowa zakresów + walidacja czasowa ────────

export type CalibratedRange = {
  rangeStart: number;
  rangeEnd: number;
  sampleCount: number;
  positiveCount: number;
  meanAttractiveness: number | null;
  validatedOffline: boolean;
};

/** Dzieli obserwacje na adaptacyjne przedziały numerów o zadanej minimalnej próbie. */
export function buildAdaptiveRanges(obs: SerialObs[], minPerBin = 20): CalibratedRange[] {
  const sorted = [...obs].sort((a, b) => a.serialNumber - b.serialNumber);
  const ranges: CalibratedRange[] = [];
  for (let i = 0; i < sorted.length; i += minPerBin) {
    const chunk = sorted.slice(i, i + minPerBin);
    if (chunk.length === 0) continue;
    const withAttr = chunk.filter((o) => o.attractiveness != null);
    ranges.push({
      rangeStart: chunk[0].serialNumber,
      rangeEnd: chunk[chunk.length - 1].serialNumber,
      sampleCount: chunk.length,
      positiveCount: chunk.filter((o) => o.good).length,
      meanAttractiveness:
        withAttr.length > 0
          ? withAttr.reduce((s, o) => s + (o.attractiveness as number), 0) / withAttr.length
          : null,
      validatedOffline: false,
    });
  }
  return ranges;
}

/**
 * Kalibruje sygnał repertoryjny dla jednej grupy prefiks×rodzaj. Buduje zakresy na
 * pełnej próbie (do zapisu), a flagę validated_offline ustawia na podstawie
 * WALIDACJI CZASOWEJ: sygnał musi poprawić Brier na zbiorze testowym względem
 * predykcji bazowej (base rate) i mieć dostatecznie dużą próbę treningową.
 */
export function calibrateSerialSignal(
  obs: SerialObs[],
  opts: { minSample: number; minImprovement?: number; minPerBin?: number } = { minSample: 40 },
): { ranges: CalibratedRange[]; validated: boolean; baselineBrier: number; signalBrier: number } {
  const minPerBin = opts.minPerBin ?? 20;
  const minImprovement = opts.minImprovement ?? 0.02;
  const fullRanges = buildAdaptiveRanges(obs, minPerBin);

  // Walidacja czasowa.
  const { train, test } = timeSplit(obs, 0.3);
  let validated = false;
  let baselineBrier = 0;
  let signalBrier = 0;

  if (train.length >= opts.minSample && test.length >= 10) {
    const baseRate = train.filter((o) => o.good).length / train.length;
    const trainRanges = buildAdaptiveRanges(train, minPerBin);
    const probFor = (serial: number): number => {
      const r = trainRanges.find((x) => serial >= x.rangeStart && serial <= x.rangeEnd);
      if (!r || r.sampleCount === 0) return baseRate;
      return r.positiveCount / r.sampleCount;
    };
    baselineBrier = brier(test.map((o) => ({ prob: baseRate, actual: o.good })));
    signalBrier = brier(test.map((o) => ({ prob: probFor(o.serialNumber), actual: o.good })));
    // Sygnał ważny, jeśli obniża Brier o co najmniej minImprovement (względnie).
    validated = signalBrier <= baselineBrier * (1 - minImprovement);
  }

  return {
    ranges: fullRanges.map((r) => ({ ...r, validatedOffline: validated })),
    validated,
    baselineBrier,
    signalBrier,
  };
}
