import { describe, expect, it } from "vitest";
import { computeProposal, type ProposalParams } from "./proposal-calc";

const base: ProposalParams = {
  amount: 150_000,
  periodMonths: 24,
  interestRatePercent: 14,
  commission: 3_000,
  repaymentMode: "raty",
  requiredSecurities: ["hipoteka_1"],
  requiredDocuments: [],
};

describe("computeProposal", () => {
  it("suma harmonogramu = kapitał + odsetki + prowizja", () => {
    const r = computeProposal(base, 150_000, 500_000);
    const sumKapital = r.schedule.reduce((a, row) => a + row.kapital, 0);
    const sumProwizja = r.schedule.reduce((a, row) => a + row.prowizja, 0);
    expect(sumKapital).toBeCloseTo(150_000, 0);
    expect(sumProwizja).toBeCloseTo(3_000, 0);
    expect(r.totalToRepay).toBeCloseTo(150_000 + r.totalInterest + 3_000, 0);
    expect(r.schedule[r.schedule.length - 1].saldo).toBeCloseTo(0, 2);
  });

  it("LTV proponowanej kwoty liczony względem wartości nieruchomości", () => {
    const r = computeProposal(base, 150_000, 500_000);
    expect(r.ltvPercent).toBe(30);
    const noValue = computeProposal(base, 150_000, null);
    expect(noValue.ltvPercent).toBeNull();
  });

  it("kwota niższa niż oczekiwana → ostrzeżenie i ujemna różnica", () => {
    const r = computeProposal({ ...base, amount: 100_000 }, 150_000, 500_000);
    expect(r.amountDifference).toBe(-50_000);
    expect(r.warnings.join(" ")).toMatch(/niższe niż kwota oczekiwana/);
  });

  it("pełna kwota → bez ostrzeżenia o niższym finansowaniu", () => {
    const r = computeProposal(base, 150_000, 500_000);
    expect(r.warnings.join(" ")).not.toMatch(/niższe niż kwota oczekiwana/);
  });

  it("tryb balonowy: pułap raty tworzy ratę końcową (balon)", () => {
    const r = computeProposal(
      { ...base, repaymentMode: "balon", maxMonthlyPayment: 2_000 },
      150_000,
      500_000,
    );
    const last = r.schedule[r.schedule.length - 1];
    expect(last.isBalloon).toBe(true);
    expect(r.finalPayment).toBeGreaterThan(r.monthlyPayment);
  });

  it("stopa zwrotu inwestora rośnie z oprocentowaniem", () => {
    const lo = computeProposal({ ...base, interestRatePercent: 8 }, 150_000, 500_000);
    const hi = computeProposal({ ...base, interestRatePercent: 16 }, 150_000, 500_000);
    expect(hi.investorAnnualReturnPercent).toBeGreaterThan(lo.investorAnnualReturnPercent);
  });
});
