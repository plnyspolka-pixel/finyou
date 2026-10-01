/**
 * Jedyna opłata: Prowizja od Pożyczkobiorcy — 5% Kwoty Udzielonej,
 * min. 5 000 zł, bez VAT, potrącana z wypłaty. Odsetki maksymalne wg daty.
 * LTV maksymalnie 60%.
 */
import { describe, expect, it } from "vitest";
import {
  FY_COMMISSION_LABEL,
  LTV_MAX,
  MAX_INTEREST_TABLE,
  fyCommission,
  kwotaNaReke,
  ltvPercent,
  ltvWithinLimit,
  maxCapitalRate,
  maxDelayRate,
  maxLoanAtLtv,
  maxRateMessage,
  rateExceedsMax,
  splitPayout,
  validateAnnualRate,
} from "./fees";

describe("Prowizja Finance You", () => {
  it("100 000 zł → 5 000 zł dla FY, 95 000 zł dla Klienta", () => {
    expect(fyCommission(100_000)).toBe(5_000);
    expect(kwotaNaReke(100_000)).toBe(95_000);
    expect(splitPayout(100_000)).toEqual({
      kwotaUdzielona: 100_000,
      prowizjaFY: 5_000,
      kwotaWyplaconaKlientowi: 95_000,
    });
  });

  it("minimum 5 000 zł (50 000 zł → 5 000 / 45 000)", () => {
    expect(fyCommission(50_000)).toBe(5_000);
    expect(kwotaNaReke(50_000)).toBe(45_000);
    // próg: 5% ze 100 000 zł = 5 000 zł
    expect(fyCommission(120_000)).toBe(6_000);
  });

  it("brak kwoty → 0; prowizja nigdy nie daje ujemnej wypłaty", () => {
    expect(fyCommission(0)).toBe(0);
    expect(fyCommission(Number.NaN)).toBe(0);
    expect(kwotaNaReke(3_000)).toBe(0);
  });

  it("zaokrąglenie do grosza", () => {
    expect(fyCommission(123_456.78)).toBe(8_641.97);
  });

  it("etykieta: bez VAT, nigdy netto/brutto", () => {
    expect(FY_COMMISSION_LABEL).toContain("bez VAT");
    expect(FY_COMMISSION_LABEL).not.toMatch(/netto|brutto/);
  });
});

describe("odsetki maksymalne — jedna tabela z datami", () => {
  it("od 2026-03-05: 14,5% kapitałowe, 18,5% za opóźnienie", () => {
    expect(maxCapitalRate("2026-03-05")).toBe(14.5);
    expect(maxDelayRate("2026-09-29")).toBe(18.5);
  });

  it("dzień przed zmianą obowiązuje poprzednia stawka", () => {
    expect(maxCapitalRate("2026-03-04")).toBe(15);
    expect(maxCapitalRate("2025-10-09")).toBe(16);
  });

  it("tabela posortowana od najnowszej, bez duplikatów dat", () => {
    const dates = MAX_INTEREST_TABLE.map((e) => e.from);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    for (const e of MAX_INTEREST_TABLE) expect(e.delay - e.capital).toBe(4);
  });

  it("blokada stopy powyżej maksimum z jednym komunikatem", () => {
    expect(rateExceedsMax(14.5, "2026-09-29")).toBe(false);
    expect(rateExceedsMax(14.51, "2026-09-29")).toBe(true);
    expect(validateAnnualRate(14.5, "2026-09-29")).toBeNull();
    expect(validateAnnualRate(21.48, "2026-09-29")).toBe(maxRateMessage("2026-09-29"));
    expect(maxRateMessage("2026-09-29")).toBe(
      "Oprocentowanie przekracza odsetki maksymalne (14,5%)",
    );
  });
});

describe("LTV", () => {
  it("jeden limit 60%", () => {
    expect(LTV_MAX).toBe(60);
    expect(ltvPercent(300_000, 500_000)).toBe(60);
    expect(ltvWithinLimit(60)).toBe(true);
    expect(ltvWithinLimit(60.01)).toBe(false);
    expect(ltvWithinLimit(null)).toBe(false);
  });

  it("uwzględnia istniejące obciążenia", () => {
    expect(ltvPercent(200_000, 500_000, 100_000)).toBe(60);
    expect(maxLoanAtLtv(500_000, 100_000)).toBe(200_000);
    expect(maxLoanAtLtv(0)).toBe(0);
  });
});
