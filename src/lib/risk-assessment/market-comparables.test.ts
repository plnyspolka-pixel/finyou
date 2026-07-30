import { describe, expect, it } from "vitest";
import { computePreferredPpm2 } from "./market-comparables.server";

describe("computePreferredPpm2 — preferencja transakcji nad ofertami", () => {
  it("koryguje oferty w dół o 5% i waży transakcje mocniej", () => {
    // Wszystkie oferty na 10 000 → po korekcie 9 500; jedna transakcja 8 000.
    const stats = computePreferredPpm2([8_000], Array(9).fill(10_000));
    // Mediana ważona: 1 tx ×3 (waga 3 przy 8 000) + 9 ofert ×1 (przy 9 500).
    // Suma wag 12, połowa 6 → przekroczona wśród ofert 9 500.
    expect(stats.median).toBe(9_500);
    // Bez preferencji (zwykła mediana surowa) byłoby 10 000 — korekta ściąga w dół.
    expect(stats.median).toBeLessThan(10_000);
  });

  it("mocniejsza transakcja przeważa przy zrównoważonej próbce", () => {
    // 3 transakcje 6 000 (waga 3 = łącznie 9) vs 3 oferty 10 000→9 500 (waga 1 = 3).
    const stats = computePreferredPpm2([6_000, 6_000, 6_000], [10_000, 10_000, 10_000]);
    // Suma wag 12, połowa 6 → mieści się w bloku transakcji (6 000).
    expect(stats.median).toBe(6_000);
  });

  it("sama korekta ofert, gdy brak transakcji", () => {
    const stats = computePreferredPpm2([], [10_000, 10_000, 10_000]);
    expect(stats.median).toBe(9_500); // 10 000 × 0,95
    expect(stats.count).toBe(3);
  });

  it("pusta próbka → same null", () => {
    const stats = computePreferredPpm2([], []);
    expect(stats).toMatchObject({
      median: null,
      average: null,
      min: null,
      max: null,
      p25: null,
      p75: null,
      count: 0,
    });
  });

  it("odfiltrowuje wartości spoza zakresu (śmieci)", () => {
    const stats = computePreferredPpm2([5, 200_000], [9_000, 9_000, 9_000]);
    // 5 i 200 000 poza zakresem (10..100 000) → zostają tylko oferty.
    expect(stats.count).toBe(3);
    expect(stats.median).toBe(Math.round(9_000 * 0.95));
  });

  it("kwartyle ważone rosną monotonicznie", () => {
    const stats = computePreferredPpm2([4_000, 5_000], [8_000, 9_000, 10_000, 11_000]);
    expect(stats.p25).not.toBeNull();
    expect(stats.p75).not.toBeNull();
    expect(stats.p25 as number).toBeLessThanOrEqual(stats.median as number);
    expect(stats.median as number).toBeLessThanOrEqual(stats.p75 as number);
  });
});
