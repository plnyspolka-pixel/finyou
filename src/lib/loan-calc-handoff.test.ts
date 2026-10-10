import { describe, it, expect } from "vitest";
import { buildCalcHandoffMessage } from "./loan-calc-handoff";
import type { LoanCalcPayload } from "./loan-calc-pdf";

function payload(months: number): LoanCalcPayload {
  return {
    v: 1,
    generatedAt: "2026-09-27 10:00:00",
    onHand: 50_000,
    nominal: 55_000,
    months,
    annualRate: 12,
    commissionPct: 10,
    commissionPln: 5_000,
    financeYouFeePct: 3,
    financeYouFeePln: 1_500,
    monthlyPayment: 2_000,
    balloon: 0,
    totalInterest: 1_650,
    totalCost: 8_150,
    totalToRepay: 56_000,
    mortgageAmount: 112_000,
    art777Amount: 112_000,
    agreementDate: "01.10.2026",
    clientName: "Jan Kowalski",
    schedule: Array.from({ length: months }, (_, i) => ({
      idx: i + 1,
      date: `01.${String((i % 12) + 1).padStart(2, "0")}.2027`,
      rata: 2_000,
      kap: 1_000,
      ods: 550,
      prow: 450,
      saldo: 55_000 - (i + 1) * 1_000,
    })),
  };
}

describe("buildCalcHandoffMessage", () => {
  it("zawiera parametry i wszystkie raty krótkiego harmonogramu", () => {
    const m = buildCalcHandoffMessage(payload(3));
    expect(m).toContain("harmonogram spłat z kalkulatora");
    expect(m).toContain("55 000,00");
    expect(m).toContain("12 %");
    expect(m).toContain("Data umowy: 01.10.2026");
    expect(m).toContain("Jan Kowalski");
    expect(m).toContain("3. 01.03.2027");
    expect(m).not.toContain("kolejnych rat");
    expect(m).toContain("są już wpisane do szkicu umowy");
  });

  it("długi harmonogram przycina do limitu serwera i mówi, ile rat pominięto", () => {
    const m = buildCalcHandoffMessage(payload(120));
    expect(m.length).toBeLessThan(6_000);
    expect(m).toMatch(/oraz \d+ kolejnych rat/);
  });

  it("dokleja dane pożyczkobiorcy i KW („Stwórz umowę”) i nadal mieści się w limicie", () => {
    const ctx =
      "Dane pożyczkobiorcy (z wniosku):\n• PESEL: 80010112345\n• Numer(y) KW: LD1M/00012345/6";
    const m = buildCalcHandoffMessage(payload(120), ctx);
    expect(m).toContain("PESEL: 80010112345");
    expect(m).toContain("LD1M/00012345/6");
    expect(m).toContain("Wpisz do umowy podane wyżej dane");
    expect(m.length).toBeLessThan(6_000);
  });
});
