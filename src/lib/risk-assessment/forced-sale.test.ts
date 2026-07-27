import { describe, it, expect } from "vitest";
import {
  estimateForcedSale,
  auctionOutcomeLabel,
  residentialAuctionBlockRisk,
} from "./forced-sale";

describe("residentialAuctionBlockRisk — art. 952¹ § 2 KPC (próg 5%)", () => {
  it("mieszkanie: pożyczka < 5% wartości → blokada licytacji", () => {
    const r = residentialAuctionBlockRisk({
      propertyType: "mieszkanie",
      loanAmountPln: 30_000,
      propertyValuePln: 800_000,
    });
    expect(r.applicable).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.loanToValuePercent).toBe(3.8);
    expect(r.thresholdPln).toBe(40_000);
  });
  it("dom: pożyczka ≥ 5% → brak blokady", () => {
    const r = residentialAuctionBlockRisk({
      propertyType: "dom",
      loanAmountPln: 60_000,
      propertyValuePln: 500_000,
    });
    expect(r.blocked).toBe(false);
  });
  it("dom: pożyczka < 5% → blokada", () => {
    expect(
      residentialAuctionBlockRisk({
        propertyType: "dom",
        loanAmountPln: 20_000,
        propertyValuePln: 500_000,
      }).blocked,
    ).toBe(true);
  });
  it("grunt rolny: reguła nie dotyczy (nie mieszkaniowa)", () => {
    const r = residentialAuctionBlockRisk({
      propertyType: "grunt_rolny",
      loanAmountPln: 1_000,
      propertyValuePln: 500_000,
    });
    expect(r.applicable).toBe(false);
    expect(r.blocked).toBe(false);
  });
  it("brak wartości → reguła nieokreślona", () => {
    expect(
      residentialAuctionBlockRisk({
        propertyType: "mieszkanie",
        loanAmountPln: 10_000,
        propertyValuePln: null,
      }).applicable,
    ).toBe(false);
  });
});

describe("estimateForcedSale — licytacje komornicze wg KPC", () => {
  it("liczy ceny wywołania 3/4 i 2/3 sumy oszacowania", () => {
    const r = estimateForcedSale({ basisValuePln: 1_000_000, basisSource: "test" });
    expect(r.firstAuctionOpeningPln).toBe(750_000); // 3/4
    expect(r.secondAuctionOpeningPln).toBe(666_667); // 2/3
    expect(r.expectedForcedSaleLowPln).toBe(666_667); // dolna granica = II licytacja
  });

  it("wysoka łatwość sprzedaży → sprzedaż na I licytacji, bezpieczny bufor", () => {
    const r = estimateForcedSale({
      basisValuePln: 1_000_000,
      basisSource: "test",
      saleabilityScore: 80,
      requestedLoanPln: 400_000,
    });
    expect(r.likelyAuctionOutcome).toBe("pierwsza_licytacja");
    // pokrycie liczone od ceny wywołania I licytacji (750k)
    expect(r.loanToForcedSalePercent).toBe(53);
    expect(r.expectedForcedSaleHighPln).toBeGreaterThan(r.secondAuctionOpeningPln!);
  });

  it("niska łatwość sprzedaży → przejęcie wierzyciela, pożyczka > odzysk", () => {
    const r = estimateForcedSale({
      basisValuePln: 1_000_000,
      basisSource: "test",
      saleabilityScore: 20,
      requestedLoanPln: 800_000,
    });
    expect(r.likelyAuctionOutcome).toBe("przejecie_wierzyciela");
    // pokrycie od II licytacji (666 667) → 120%
    expect(r.loanToForcedSalePercent).toBe(120);
  });

  it("umiarkowana łatwość → II licytacja", () => {
    const r = estimateForcedSale({
      basisValuePln: 500_000,
      basisSource: "test",
      saleabilityScore: 45,
    });
    expect(r.likelyAuctionOutcome).toBe("druga_licytacja");
    expect(r.firstAuctionOpeningPln).toBe(375_000);
  });

  it("brak wartości → wynik nieznany", () => {
    const r = estimateForcedSale({ basisValuePln: null, basisSource: "brak" });
    expect(r.likelyAuctionOutcome).toBe("nieznany");
    expect(r.firstAuctionOpeningPln).toBeNull();
  });

  it("etykiety wyników licytacji", () => {
    expect(auctionOutcomeLabel("pierwsza_licytacja")).toBe("I licytacja");
    expect(auctionOutcomeLabel("druga_licytacja")).toBe("II licytacja");
  });
});
