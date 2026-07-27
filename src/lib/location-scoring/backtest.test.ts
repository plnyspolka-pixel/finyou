import { describe, it, expect } from "vitest";
import {
  runBacktest,
  tunePriorityThreshold,
  calibrateSerialSignal,
  buildAdaptiveRanges,
  rocAuc,
  brier,
  calibrationError,
  precisionRecallAt,
  type EvalPair,
  type SerialObs,
} from "./index";

function pair(priority: number, prob: number, actual: boolean, day: number): EvalPair {
  return {
    priority,
    prob,
    actual,
    observedAt: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
    prefix: "RA1R",
    propertyType: "house",
  };
}

describe("metryki klasyfikacji", () => {
  it("ROC-AUC = 1 dla idealnego separatora", () => {
    const pairs: EvalPair[] = [
      pair(90, 0.9, true, 1),
      pair(80, 0.8, true, 2),
      pair(20, 0.2, false, 3),
      pair(10, 0.1, false, 4),
    ];
    expect(rocAuc(pairs)).toBe(1);
  });

  it("Brier: idealne predykcje = 0", () => {
    expect(
      brier([
        { prob: 1, actual: true },
        { prob: 0, actual: false },
      ]),
    ).toBe(0);
  });

  it("precisionRecallAt liczy poprawnie przy progu", () => {
    const pairs: EvalPair[] = [
      pair(90, 0.9, true, 1),
      pair(80, 0.8, false, 2),
      pair(30, 0.3, false, 3),
    ];
    const m = precisionRecallAt(pairs, 75);
    expect(m.predictedPositive).toBe(2);
    expect(m.precision).toBeCloseTo(0.5, 5);
    expect(m.recall).toBe(1);
  });

  it("calibrationError = 0 dla idealnie skalibrowanych binów", () => {
    const pairs = [
      { prob: 0.0, actual: false },
      { prob: 1.0, actual: true },
    ];
    expect(calibrationError(pairs)).toBe(0);
  });
});

describe("strojenie progu AUTO_ANALYZE_HIGH", () => {
  it("dobiera najniższy próg osiągający docelowy precision (maks. pokrycie)", () => {
    // 40 par: priorytet >=70 to prawie same pozytywne, 50-69 mieszane.
    const pairs: EvalPair[] = [];
    for (let i = 0; i < 20; i++) pairs.push(pair(80, 0.85, true, (i % 28) + 1));
    for (let i = 0; i < 5; i++) pairs.push(pair(65, 0.6, true, (i % 28) + 1));
    for (let i = 0; i < 10; i++) pairs.push(pair(60, 0.55, false, (i % 28) + 1));
    for (let i = 0; i < 10; i++) pairs.push(pair(30, 0.2, false, (i % 28) + 1));
    const s = tunePriorityThreshold(pairs, 0.9, 20);
    expect(s.reachedTarget).toBe(true);
    expect(s.precision).toBeGreaterThanOrEqual(0.9);
    // Najniższy próg maks. pokrycia, ale wykluczający fałszywe pozytywne (priorytet 60).
    expect(s.priorityThreshold).toBeGreaterThan(60);
    expect(s.priorityThreshold).toBeLessThanOrEqual(65);
  });

  it("mała próba → próg domyślny, reachedTarget=false (bez sztucznej pewności)", () => {
    const s = tunePriorityThreshold([pair(90, 0.9, true, 1)], 0.9, 30);
    expect(s.reachedTarget).toBe(false);
    expect(s.priorityThreshold).toBe(75);
    expect(s.sampleSize).toBe(1);
  });
});

describe("runBacktest", () => {
  it("zwraca metryki + notatkę; mała próba → notatka o zbyt małej próbie", () => {
    const pairs: EvalPair[] = [pair(90, 0.9, true, 1), pair(20, 0.2, false, 2)];
    const r = runBacktest(pairs, 75, 0.9);
    expect(r.sampleSize).toBe(2);
    expect(r.note).toMatch(/mała próba/i);
  });
});

describe("kalibracja sygnału repertoryjnego (walidacja czasowa)", () => {
  it("buildAdaptiveRanges dzieli na biny o zadanej próbie", () => {
    const obs: SerialObs[] = Array.from({ length: 45 }, (_, i) => ({
      serialNumber: i * 100,
      good: i % 2 === 0,
      attractiveness: 50,
      observedAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
    }));
    const ranges = buildAdaptiveRanges(obs, 20);
    expect(ranges.length).toBe(3); // 20 + 20 + 5
    expect(ranges[0].sampleCount).toBe(20);
  });

  it("mała próba → sygnał NIEzwalidowany (bramka pozostaje wyłączona)", () => {
    const obs: SerialObs[] = Array.from({ length: 10 }, (_, i) => ({
      serialNumber: i,
      good: true,
      attractiveness: 50,
      observedAt: `2026-01-01T00:00:0${i}Z`,
    }));
    const cal = calibrateSerialSignal(obs, { minSample: 40 });
    expect(cal.validated).toBe(false);
    expect(cal.ranges.every((r) => r.validatedOffline === false)).toBe(true);
  });

  it("silna, spójna zależność numer→wynik na dużej próbie → sygnał zwalidowany", () => {
    // Numery < 500000 prawie zawsze 'good', >= 500000 prawie zawsze nie.
    // Rozkład stabilny w czasie (train wcześniej, test później) → sygnał poprawia Brier.
    const obs: SerialObs[] = [];
    let day = 1;
    for (let i = 0; i < 120; i++) {
      const low = i % 2 === 0;
      const serial = low ? 100000 + i : 700000 + i;
      const good = low ? i % 10 !== 0 : i % 10 === 0; // ~90% separacja
      obs.push({
        serialNumber: serial,
        good,
        attractiveness: good ? 80 : 20,
        observedAt: `2026-${String(Math.min(12, Math.floor(day / 28) + 1)).padStart(2, "0")}-${String((day % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      });
      day++;
    }
    const cal = calibrateSerialSignal(obs, { minSample: 40, minPerBin: 15 });
    expect(cal.signalBrier).toBeLessThan(cal.baselineBrier);
    expect(cal.validated).toBe(true);
    expect(cal.ranges.every((r) => r.validatedOffline === true)).toBe(true);
  });

  it("brak zależności (losowy wynik) → sygnał NIEzwalidowany", () => {
    const obs: SerialObs[] = Array.from({ length: 120 }, (_, i) => ({
      serialNumber: i * 1000,
      good: (i * 7) % 2 === 0, // niezależne od numeru
      attractiveness: 50,
      observedAt: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const cal = calibrateSerialSignal(obs, { minSample: 40, minPerBin: 15 });
    expect(cal.validated).toBe(false);
  });
});
