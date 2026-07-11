import { describe, it, expect } from "vitest";
import {
  calculateDebt,
  maxDelayInterestRate,
  DEFAULT_NBP_REFERENCE_RATE,
  DEFAULT_MAX_DELAY_RATE,
} from "./debt-collection-math";

// Struktura: kwota na rękę 100 000 + prowizja Finance You 10 000 (część
// oprocentowana = 110 000) + prowizja inwestora 20 000 (bez odsetek).
const base = {
  principalAmount: 110_000, // na rękę + prowizja Finance You (oprocentowane)
  interestExemptPrincipal: 20_000, // prowizja inwestora (bez odsetek)
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

  it("domyślny limit wynika ze wspólnej stopy referencyjnej NBP", () => {
    expect(DEFAULT_MAX_DELAY_RATE).toBe(maxDelayInterestRate(DEFAULT_NBP_REFERENCE_RATE));
  });
});

describe("calculateDebt — limit odsetek maksymalnych faktycznie ogranicza", () => {
  it("umowna stopa za opóźnienie wyższa niż maksymalna zostaje obcięta", () => {
    const cap = maxDelayInterestRate(DEFAULT_NBP_REFERENCE_RATE); // 22,5%
    const r = calculateDebt({
      ...base,
      penaltyAnnualRate: 40, // umowa „lichwiarska" — powyżej limitu
      maxStatutoryRate: cap,
      terminated: true,
      terminationDate: "2025-07-01",
      asOf: "2026-07-01",
    });
    expect(r.effectiveDelayRate).toBe(cap);
    expect(r.penaltyCapped).toBe(true);
    // Odsetki naliczone wg 22,5%, a nie 40%: ~110 000 × 22,5% ≈ 24 750 zł/rok.
    expect(r.delayInterest).toBeGreaterThan(23_000);
    expect(r.delayInterest).toBeLessThan(26_500);
  });

  it("umowna stopa poniżej limitu nie jest zmieniana", () => {
    const r = calculateDebt({
      ...base,
      penaltyAnnualRate: 12,
      maxStatutoryRate: DEFAULT_MAX_DELAY_RATE,
      terminated: true,
      terminationDate: "2025-07-01",
      asOf: "2026-07-01",
    });
    expect(r.effectiveDelayRate).toBe(12);
    expect(r.penaltyCapped).toBe(false);
  });

  it("regresja: podanie tej samej stopy w obu polach (stary błąd) nie ograniczało", () => {
    // Wcześniej penaltyAnnualRate i maxStatutoryRate były zasilane tym samym
    // polem umowy — min(x, x) = x, czyli limit był martwy. Ten test dokumentuje
    // różnicę między starym a poprawnym wywołaniem.
    const buggy = calculateDebt({
      ...base,
      penaltyAnnualRate: 40,
      maxStatutoryRate: 40,
      terminated: true,
      terminationDate: "2025-07-01",
      asOf: "2026-07-01",
    });
    const fixed = calculateDebt({
      ...base,
      penaltyAnnualRate: 40,
      maxStatutoryRate: DEFAULT_MAX_DELAY_RATE,
      terminated: true,
      terminationDate: "2025-07-01",
      asOf: "2026-07-01",
    });
    expect(buggy.effectiveDelayRate).toBe(40);
    expect(fixed.effectiveDelayRate).toBe(DEFAULT_MAX_DELAY_RATE);
    expect(fixed.delayInterest).toBeLessThan(buggy.delayInterest);
  });
});

describe("calculateDebt — prowizja inwestora bez odsetek", () => {
  it("prowizja inwestora jest należna, ale nie wchodzi do podstawy odsetek", () => {
    const r = calculateDebt({
      ...base,
      terminated: true,
      terminationDate: "2025-07-01",
      asOf: "2026-07-01",
    });
    // Podstawa odsetek = część oprocentowana (110 000), bez prowizji inwestora.
    expect(r.delayInterestBase).toBeGreaterThan(109_000);
    expect(r.delayInterestBase).toBeLessThan(111_000);
    // Prowizja inwestora wciąż należna i widoczna osobno.
    expect(r.investorCommissionOutstanding).toBe(20_000);
    // ...i wliczona do sumy do zapłaty.
    expect(r.totalDue).toBeGreaterThan(130_000);
  });
});

describe("calculateDebt — reżim odsetek za opóźnienie", () => {
  it("umowa niewypowiedziana: odsetki tylko od zaległych rat", () => {
    const r = calculateDebt({
      ...base,
      terminated: false,
      overdueInstallmentsAmount: 10_000,
      asOf: "2026-07-01",
    });
    expect(r.delayRegime).toBe("zalegle_raty");
    expect(r.delayInterestBase).toBe(10_000);
    // ~24,5% od 10 000 przez rok ≈ 2 450 zł (a nie od całego kapitału).
    expect(r.delayInterest).toBeGreaterThan(2_300);
    expect(r.delayInterest).toBeLessThan(2_600);
    expect(r.principalOutstanding).toBe(110_000);
  });

  it("umowa wypowiedziana: odsetki od całości oprocentowanej", () => {
    const r = calculateDebt({
      ...base,
      terminated: true,
      terminationDate: "2025-07-01",
      surcharges: 2_000,
      overdueInstallmentsAmount: 10_000, // ignorowane po wypowiedzeniu
      asOf: "2026-07-01",
    });
    expect(r.delayRegime).toBe("calosc_po_wypowiedzeniu");
    // Podstawa ≈ 110 000 + 2 000 dopłat = 112 000.
    expect(r.delayInterestBase).toBeGreaterThan(111_000);
    // ~24,5% od ~112 000 przez rok ≈ 27 000 zł — znacznie więcej niż od rat.
    expect(r.delayInterest).toBeGreaterThan(25_000);
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

  it("wpłata redukuje odsetki i kapitał (art. 451 KC)", () => {
    const r = calculateDebt({
      ...base,
      terminated: true,
      terminationDate: "2025-07-01",
      payments: [{ paid_on: "2025-08-01", amount: 50_000 }],
      asOf: "2026-07-01",
    });
    expect(r.totalPaid).toBe(50_000);
    expect(r.principalOutstanding).toBeLessThan(110_000);
  });
});
