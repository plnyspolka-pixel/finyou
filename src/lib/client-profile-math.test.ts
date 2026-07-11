import { describe, it, expect } from "vitest";
import { buildDirectorSchedule } from "./client-profile-math";
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

describe("buildDirectorSchedule — walidacja wejścia", () => {
  it("ujemna kwota netto → null", () => {
    expect(buildDirectorSchedule({ ...baseOffer, netAmountToClient: -100_000 })).toBeNull();
  });

  it("ujemna prowizja → null", () => {
    expect(buildDirectorSchedule({ ...baseOffer, creditedCommission: -5_000 })).toBeNull();
  });

  it("ujemna rata / okres → null", () => {
    expect(buildDirectorSchedule({ ...baseOffer, maxMonthlyPaymentByClient: -3_000 })).toBeNull();
    expect(buildDirectorSchedule({ ...baseOffer, loanTermMonths: -12 })).toBeNull();
  });

  it("poprawne dane → harmonogram (miesiące + balon)", () => {
    const s = buildDirectorSchedule(baseOffer);
    expect(s).not.toBeNull();
    expect(s!.rows).toHaveLength(13); // 12 rat + wiersz „Balon"
    expect(s!.warning).toBeUndefined();
  });
});

describe("buildDirectorSchedule — jawne ostrzeżenie zamiast cichego balonowania", () => {
  it("maxPayment < miesięczne odsetki → ustawia pole warning i wpis w warnings", () => {
    // Kapitał nominalny 110 000 × 24%/12 = 2 200 zł odsetek/mies. > rata 1 000 zł.
    const s = buildDirectorSchedule({
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
    const s = buildDirectorSchedule(baseOffer);
    expect(s).not.toBeNull();
    expect(s!.warning).toBeUndefined();
  });
});
