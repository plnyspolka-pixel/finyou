import { describe, it, expect } from "vitest";
import { calculateDebt, maxDelayInterestRate } from "./debt-collection-math";

const base = {
  principalAmount: 100_000,
  payoutDate: "2025-01-01",
  dueDate: "2025-07-01",
  contractualAnnualRate: 0,
  penaltyAnnualRate: 24.5,
  maxStatutoryRate: 24.5,
  payments: [],
  actionFees: [],
};

describe("maxDelayInterestRate", () => {
  it("liczy 2×(NBP+5,5)", () => {
    expect(maxDelayInterestRate(5.75)).toBe(22.5);
  });
});

describe("calculateDebt — reżim odsetek za opóźnienie", () => {
  it("umowa niewypowiedziana: odsetki tylko od zaległych rat", () => {
    const r = calculateDebt({
      ...base,
      terminated: false,
      overdueInstallmentsAmount: 10_000,
      asOf: "2026-07-01", // ~1 rok po terminie
    });
    expect(r.delayRegime).toBe("zalegle_raty");
    expect(r.delayInterestBase).toBe(10_000);
    // ~24,5% od 10 000 przez rok ≈ 2 450 zł (a nie od 100 000).
    expect(r.delayInterest).toBeGreaterThan(2_300);
    expect(r.delayInterest).toBeLessThan(2_600);
    expect(r.principalOutstanding).toBe(100_000);
  });

  it("umowa wypowiedziana: odsetki od całości (kapitał+prowizja+dopłaty)", () => {
    const r = calculateDebt({
      ...base,
      terminated: true,
      terminationDate: "2025-07-01",
      commission: 8_000,
      surcharges: 2_000,
      overdueInstallmentsAmount: 10_000, // ignorowane po wypowiedzeniu
      asOf: "2026-07-01",
    });
    expect(r.delayRegime).toBe("calosc_po_wypowiedzeniu");
    // Podstawa ≈ 100 000 + 8 000 + 2 000 = 110 000.
    expect(r.delayInterestBase).toBeGreaterThan(109_000);
    // ~24,5% od 110 000 przez rok ≈ 26 950 zł — znacznie więcej niż od rat.
    expect(r.delayInterest).toBeGreaterThan(25_000);
    expect(r.commissionOutstanding).toBe(8_000);
    expect(r.surchargesOutstanding).toBe(2_000);
  });

  it("brak opóźnienia: brak odsetek za opóźnienie", () => {
    const r = calculateDebt({
      ...base,
      terminated: false,
      overdueInstallmentsAmount: 0,
      asOf: "2025-06-01", // przed terminem
    });
    expect(r.delayRegime).toBe("brak");
    expect(r.delayInterest).toBe(0);
  });

  it("wpłata redukuje zaległe raty i odsetki (art. 451 KC)", () => {
    const r = calculateDebt({
      ...base,
      terminated: true,
      terminationDate: "2025-07-01",
      payments: [{ paid_on: "2025-08-01", amount: 50_000 }],
      asOf: "2026-07-01",
    });
    expect(r.totalPaid).toBe(50_000);
    expect(r.principalOutstanding).toBeLessThan(100_000);
  });
});
