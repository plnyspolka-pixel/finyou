/**
 * Jeden model matematyczny: kalkulatory klienta (loan-math) liczą silnikiem
 * umów. Kwota Udzielona = kwota z umowy; prowizja FY potrącana z wypłaty;
 * odsetki od pełnej Kwoty Udzielonej; stopa ponad maksimum = błąd.
 */
import { describe, expect, it } from "vitest";
import { clampAnnualRate, computeLoanFigures, defaultAnnualRate } from "./loan-math";

const AS_OF = "2026-09-29";

describe("computeLoanFigures", () => {
  it("100 000 zł: prowizja FY 5 000 zł, na rękę 95 000 zł, rata od pełnej kwoty", () => {
    const f = computeLoanFigures({
      amount: 100_000,
      annualRatePercent: 14.5,
      months: 24,
      asOf: AS_OF,
    });
    expect(f.amount).toBe(100_000);
    expect(f.feeFY).toBe(5_000);
    expect(f.netToClient).toBe(95_000);
    expect(f.errors).toEqual([]);
    // do spłaty = kapitał + odsetki (bez prowizji inwestora)
    expect(f.total).toBeCloseTo(100_000 + f.totalInterest, 2);
    // koszt całkowity = odsetki + prowizja FY
    expect(f.totalCost).toBeCloseTo(f.totalInterest + 5_000, 2);
  });

  it("prowizja inwestora wchodzi do rat i do kosztu, prowizja FY nie", () => {
    const base = computeLoanFigures({
      amount: 200_000,
      annualRatePercent: 12,
      months: 36,
      asOf: AS_OF,
    });
    const f = computeLoanFigures({
      amount: 200_000,
      annualRatePercent: 12,
      months: 36,
      commission: 9_000,
      asOf: AS_OF,
    });
    expect(f.errors).toEqual([]);
    // do spłaty = kapitał + odsetki + prowizja inwestora
    expect(f.total).toBeCloseTo(200_000 + f.totalInterest + 9_000, 2);
    // koszt całkowity = odsetki + prowizja inwestora + prowizja FY
    expect(f.totalCost).toBeCloseTo(f.totalInterest + 9_000 + 10_000, 2);
    expect(f.feeFY).toBe(base.feeFY);
    expect(f.netToClient).toBe(190_000);
  });

  it("stopa ponad odsetki maksymalne → błąd blokujący", () => {
    const f = computeLoanFigures({
      amount: 100_000,
      annualRatePercent: 21.48,
      months: 24,
      asOf: AS_OF,
    });
    expect(f.errors.join(" ")).toMatch(/odsetki maksymalne/);
  });

  it("domyślna stopa i suwak nie przekraczają maksimum", () => {
    expect(defaultAnnualRate(AS_OF)).toBe(14.5);
    expect(clampAnnualRate(30, AS_OF)).toBe(14.5);
    expect(clampAnnualRate(-1, AS_OF)).toBe(0);
  });
});
