import { describe, expect, it } from "vitest";
import { computeOfferEconomics } from "./offer-economics";
import { financeYouFeePctFor, financeYouFeePlnFor } from "./finance-you-fee";

/** Harmonogram jak zapisuje go kalkulator inwestora: prowizja = inwestora + Finance You. */
function schedule(
  months: number,
  opts: { odsetki: number; prowizja: number; kapital: number },
): Array<{
  idx: number;
  date: string;
  rata: number;
  kapital: number;
  odsetki: number;
  prowizja: number;
  saldo: number;
}> {
  return Array.from({ length: months }, (_, i) => ({
    idx: i + 1,
    date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
    rata: opts.kapital + opts.odsetki + opts.prowizja,
    kapital: opts.kapital,
    odsetki: opts.odsetki,
    prowizja: opts.prowizja,
    saldo: opts.kapital * (months - i - 1),
  }));
}

describe("financeYouFeePctFor", () => {
  it("skala liniowa 10% → 4% między 20 000 a 1 000 000 zł", () => {
    expect(financeYouFeePctFor(20_000)).toBe(10);
    expect(financeYouFeePctFor(510_000)).toBe(7);
    expect(financeYouFeePctFor(1_000_000)).toBe(4);
  });

  it("poza skalą przycina do krańców", () => {
    expect(financeYouFeePctFor(5_000)).toBe(10);
    expect(financeYouFeePctFor(3_000_000)).toBe(4);
  });

  it("kwota w złotych to pełne złote", () => {
    expect(financeYouFeePlnFor(250_000)).toBe(
      Math.round((250_000 * financeYouFeePctFor(250_000)) / 100),
    );
    expect(financeYouFeePlnFor(0)).toBe(0);
  });
});

describe("computeOfferEconomics", () => {
  it("zwraca null bez kwoty albo okresu", () => {
    expect(computeOfferEconomics({ proposed_amount: 0, period_months: 12 })).toBeNull();
    expect(computeOfferEconomics({ proposed_amount: 100_000, period_months: null })).toBeNull();
  });

  it("odczytuje prowizję Finance You z harmonogramu jako nadwyżkę ponad prowizję inwestora", () => {
    const months = 24;
    const investorCommission = 25_000;
    const financeYouFee = 22_000;
    const eco = computeOfferEconomics({
      proposed_amount: 250_000,
      period_months: months,
      expected_yearly_yield: 14.5,
      commission: investorCommission,
      estimated_monthly_payment: 5_000,
      schedule: schedule(months, {
        odsetki: 1_500,
        prowizja: (investorCommission + financeYouFee) / months,
        kapital: 250_000 / months,
      }),
    });
    expect(eco).not.toBeNull();
    expect(eco!.interest).toBe(1_500 * months);
    expect(eco!.investorCommission).toBe(investorCommission);
    expect(eco!.financeYouFee).toBe(financeYouFee);
    expect(eco!.financeYouFeeEstimated).toBe(false);
    expect(eco!.investorProfit).toBe(1_500 * months + investorCommission);
    expect(eco!.investorCommissionPct).toBe(10);
    expect(eco!.financeYouFeePct).toBe(8.8);
  });

  it("szacuje prowizję Finance You ze skali, gdy harmonogram nie ma tego składnika", () => {
    const months = 12;
    const investorCommission = 12_000;
    const eco = computeOfferEconomics({
      proposed_amount: 120_000,
      period_months: months,
      expected_yearly_yield: 12,
      commission: investorCommission,
      schedule: schedule(months, {
        odsetki: 800,
        prowizja: investorCommission / months,
        kapital: 10_000,
      }),
    });
    expect(eco!.financeYouFeeEstimated).toBe(true);
    expect(eco!.financeYouFee).toBe(financeYouFeePlnFor(120_000));
    expect(eco!.investorProfit).toBe(800 * months + investorCommission);
  });

  it("bez harmonogramu odtwarza odsetki silnikiem i szacuje prowizję Finance You", () => {
    const eco = computeOfferEconomics({
      proposed_amount: 300_000,
      period_months: 36,
      expected_yearly_yield: 10.5,
      commission: 30_000,
      schedule: null,
    });
    expect(eco).not.toBeNull();
    expect(eco!.interest).toBeGreaterThan(0);
    expect(eco!.investorCommission).toBe(30_000);
    expect(eco!.financeYouFeeEstimated).toBe(true);
    expect(eco!.financeYouFee).toBe(financeYouFeePlnFor(300_000));
    expect(eco!.investorProfit).toBe(Math.round((eco!.interest + 30_000) * 100) / 100);
    expect(eco!.totalToRepay).toBeGreaterThan(300_000);
  });
});
