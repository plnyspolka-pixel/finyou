import { describe, it, expect } from "vitest";
import { buildRepaymentSchedule } from "./client-profile-math";
import type { OfferData } from "./client-profile-types";

const baseOffer: OfferData = {
  netAmountToClient: 100_000,
  creditedCommission: 10_000,
  maxMonthlyPaymentByClient: 3_000,
  loanTermMonths: 12,
  payoutDate: "2026-01-15",
  annualInterestPercent: 12,
  investorMonthlyReturnType: "amount",
  investorMonthlyReturnAmount: 2_000,
};

describe("buildRepaymentSchedule — walidacja wejścia", () => {
  it("ujemna kwota netto → null", () => {
    expect(buildRepaymentSchedule({ ...baseOffer, netAmountToClient: -100_000 })).toBeNull();
  });

  it("ujemna prowizja → null", () => {
    expect(buildRepaymentSchedule({ ...baseOffer, creditedCommission: -5_000 })).toBeNull();
  });

  it("ujemna rata / okres → null", () => {
    expect(buildRepaymentSchedule({ ...baseOffer, maxMonthlyPaymentByClient: -3_000 })).toBeNull();
    expect(buildRepaymentSchedule({ ...baseOffer, loanTermMonths: -12 })).toBeNull();
  });

  it("poprawne dane → harmonogram (miesiące + balon)", () => {
    const s = buildRepaymentSchedule(baseOffer);
    expect(s).not.toBeNull();
    expect(s!.rows).toHaveLength(13); // 12 rat + wiersz „Balon"
    expect(s!.warning).toBeUndefined();
  });
});

describe("buildRepaymentSchedule — jawne ostrzeżenie zamiast cichego balonowania", () => {
  it("maxPayment < miesięczne odsetki → ustawia pole warning i wpis w warnings", () => {
    // Kapitał nominalny 110 000 × 24%/12 = 2 200 zł odsetek/mies. > rata 1 000 zł.
    const s = buildRepaymentSchedule({
      ...baseOffer,
      annualInterestPercent: 24,
      maxMonthlyPaymentByClient: 1_000,
      investorMonthlyReturnAmount: 2_500,
    });
    expect(s).not.toBeNull();
    expect(s!.monthlyInterestAmount).toBeGreaterThan(1_000);
    expect(s!.warning).toBeDefined();
    expect(s!.warning).toContain("Rata nie pokrywa odsetek");
    expect(s!.warnings).toContain(s!.warning!);
    // Niedopłata odsetek trafia do balonu.
    expect(s!.balloonPayment).toBeGreaterThan(s!.nominalLoanAmount);
  });

  it("maxPayment pokrywa odsetki → brak ostrzeżenia", () => {
    const s = buildRepaymentSchedule(baseOffer);
    expect(s).not.toBeNull();
    expect(s!.warning).toBeUndefined();
  });
});

describe("buildRepaymentSchedule — odsetki od malejącego salda (nie płaskie)", () => {
  it("gdy kapitał jest spłacany, odsetki w kolejnych miesiącach maleją", () => {
    // Rata 5 000 zł > wynagrodzenie inwestora 2 000 zł → nadwyżka spłaca kapitał.
    const s = buildRepaymentSchedule({ ...baseOffer, maxMonthlyPaymentByClient: 5_000 });
    expect(s).not.toBeNull();
    const first = s!.rows[0];
    const later = s!.rows[10];
    expect(later.interest).toBeLessThan(first.interest);
    // saldo faktycznie maleje
    expect(later.remainingCapital).toBeLessThan(first.remainingCapital);
    // odsetki miesiąca N ≈ saldo z miesiąca N-1 × stopa miesięczna (1% dla 12%)
    const prev = s!.rows[9];
    expect(later.interest).toBeCloseTo(prev.remainingCapital * 0.01, 0);
  });

  it("bez opłaty za ryzyko: rata = odsetki + kapitał, zysk inwestora = odsetki + prowizja", () => {
    const s = buildRepaymentSchedule({ ...baseOffer, maxMonthlyPaymentByClient: 5_000 });
    expect(s).not.toBeNull();
    for (const row of s!.rows) {
      // umowa nie przewiduje opłaty za ryzyko — rata rozlicza tylko odsetki i kapitał
      expect(row.paymentAmount).toBeCloseTo(row.interest + row.capital, 2);
    }
    const totalInterest = s!.rows.reduce((a, r) => a + r.interest, 0);
    expect(s!.totalInvestorProfit).toBeCloseTo(totalInterest + 10_000, 1);
  });

  it("balon domyka zobowiązanie: kapitał pozostały + niedopłacone odsetki", () => {
    const s = buildRepaymentSchedule(baseOffer); // rata 3 000 < odsetki+kapitał → część w balonie
    expect(s).not.toBeNull();
    const balloon = s!.rows[s!.rows.length - 1];
    expect(balloon.index).toBe("Balon");
    expect(balloon.remainingCapital).toBe(0);
    expect(balloon.paymentAmount).toBeCloseTo(balloon.capital + balloon.interest, 2);
    // suma kapitału ze wszystkich wierszy = kwota nominalna
    const totalCapital = s!.rows.reduce((a, r) => a + r.capital, 0);
    expect(totalCapital).toBeCloseTo(s!.nominalLoanAmount, 1);
  });
});
