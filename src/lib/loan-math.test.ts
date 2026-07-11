import { describe, it, expect } from "vitest";
import { computeLoanFigures, computeLoanSchedule, monthlyPayment } from "./loan-math";

describe("monthlyPayment — walidacja wejścia", () => {
  it("odrzuca wartości ujemne (zwraca 0)", () => {
    expect(monthlyPayment(-100_000, 10, 12)).toBe(0);
    expect(monthlyPayment(100_000, 10, -12)).toBe(0);
    expect(monthlyPayment(100_000, -10, 12)).toBe(0);
  });

  it("zero kwoty / miesięcy → 0", () => {
    expect(monthlyPayment(0, 10, 12)).toBe(0);
    expect(monthlyPayment(100_000, 10, 0)).toBe(0);
  });

  it("stopa 0% → kapitał / miesiące", () => {
    expect(monthlyPayment(120_000, 0, 12)).toBe(10_000);
  });
});

describe("computeLoanSchedule — balon domyka harmonogram do zera", () => {
  // Właściwość: dla wielu kombinacji parametrów saldo końcowe ≈ 0,
  // a balon = rzeczywista pozostałość po spłacie ograniczonych rat.
  const cases: Array<{ principal: number; rate: number; months: number; maxPayment?: number }> = [
    { principal: 100_000, rate: 10, months: 12 }, // bez limitu
    { principal: 100_000, rate: 10, months: 12, maxPayment: 5_000 },
    { principal: 250_000, rate: 18, months: 36, maxPayment: 4_000 },
    { principal: 50_000, rate: 22.5, months: 24, maxPayment: 1_500 },
    { principal: 1_000_000, rate: 15, months: 72, maxPayment: 10_000 },
    { principal: 20_000, rate: 0, months: 10, maxPayment: 1_500 }, // stopa 0%
    { principal: 100_000, rate: 12, months: 1, maxPayment: 5_000 }, // 1 miesiąc
  ];

  it.each(cases)("saldo końcowe ≈ 0 dla %j", ({ principal, rate, months, maxPayment }) => {
    const s = computeLoanSchedule({ principal, annualRatePercent: rate, months, maxPayment });
    expect(s.rows).toHaveLength(months);
    const finalSaldo = s.rows[s.rows.length - 1].saldo;
    expect(Math.abs(finalSaldo)).toBeLessThan(0.01);
    // Suma kapitału spłaconego = kapitał początkowy (z tolerancją groszową).
    expect(s.totalKap).toBeCloseTo(principal, 1);
    // Rekonstrukcja salda z wierszy: saldo_i = saldo_{i-1} − kap_i.
    let saldo = principal;
    for (const r of s.rows) {
      expect(r.rata).toBeCloseTo(r.kap + r.ods, 6);
      saldo -= r.kap;
    }
    expect(Math.abs(saldo)).toBeLessThan(0.01);
  });

  it("balon = rzeczywista pozostałość, a nie liniowe (nominal − capped) × mies.", () => {
    const principal = 100_000;
    const months = 24;
    const rate = 20;
    const maxPayment = 3_000;
    const s = computeLoanSchedule({ principal, annualRatePercent: rate, months, maxPayment });
    const linearHeuristic = (s.nominalRata - s.cappedRata) * months;
    // Heurystyka liniowa ignoruje kapitalizację — musi się różnić od balonu.
    expect(Math.abs(s.balloon - linearHeuristic)).toBeGreaterThan(1);
    // Balon rzeczywisty: symulacja salda z ograniczoną ratą.
    let saldo = principal;
    const r = rate / 100 / 12;
    for (let i = 0; i < months; i++) saldo -= s.cappedRata - saldo * r;
    expect(s.balloon).toBeCloseTo(Math.round(saldo * 100) / 100, 2);
  });

  it("bez limitu raty balon = 0", () => {
    const s = computeLoanSchedule({ principal: 100_000, annualRatePercent: 10, months: 12 });
    expect(s.balloon).toBe(0);
    expect(s.cappedRata).toBeCloseTo(s.nominalRata, 10);
  });

  it("limit wyższy niż rata nominalna → jak bez limitu", () => {
    const s = computeLoanSchedule({
      principal: 100_000,
      annualRatePercent: 10,
      months: 12,
      maxPayment: 50_000,
    });
    expect(s.balloon).toBe(0);
    expect(s.cappedRata).toBeCloseTo(s.nominalRata, 10);
  });
});

describe("computeLoanSchedule — ujemna amortyzacja", () => {
  it("flaguje, gdy rata nie pokrywa odsetek pierwszego miesiąca", () => {
    // 100 000 × 20%/12 = 1 666,67 zł odsetek; rata 1 000 zł ich nie pokrywa.
    const s = computeLoanSchedule({
      principal: 100_000,
      annualRatePercent: 20,
      months: 12,
      maxPayment: 1_000,
    });
    expect(s.negativeAmortization).toBe(true);
    // Saldo rośnie w trakcie harmonogramu (przed balonem)...
    expect(s.rows[s.rows.length - 2].saldo).toBeGreaterThan(100_000);
    // ...ale balon i tak domyka do zera.
    expect(Math.abs(s.rows[s.rows.length - 1].saldo)).toBeLessThan(0.01);
    // Balon > kapitał początkowy − suma wpłaconych rat (narosłe odsetki).
    expect(s.balloon).toBeGreaterThan(100_000 - 1_000 * 12);
  });

  it("nie flaguje, gdy rata pokrywa odsetki", () => {
    const s = computeLoanSchedule({
      principal: 100_000,
      annualRatePercent: 12,
      months: 12,
      maxPayment: 2_000, // odsetki 1. mies. = 1 000 zł < 2 000 zł
    });
    expect(s.negativeAmortization).toBe(false);
  });
});

describe("computeLoanFigures — spójność z harmonogramem", () => {
  it("total = suma rat (capped × mies. + balon), balon z symulacji", () => {
    const input = { amount: 200_000, annualRatePercent: 16, months: 24, maxPayment: 4_000 };
    const f = computeLoanFigures(input);
    const s = computeLoanSchedule({
      principal: input.amount,
      annualRatePercent: input.annualRatePercent,
      months: input.months,
      maxPayment: input.maxPayment,
    });
    expect(f.balloon).toBe(s.balloon);
    expect(f.total).toBeCloseTo(f.monthly * input.months + f.balloon, 6);
    expect(f.investorCompensation).toBeCloseTo(f.total - input.amount, 6);
  });

  it("przenosi flagę ujemnej amortyzacji", () => {
    const f = computeLoanFigures({
      amount: 100_000,
      annualRatePercent: 20,
      months: 12,
      maxPayment: 1_000,
    });
    expect(f.negativeAmortization).toBe(true);
  });
});
