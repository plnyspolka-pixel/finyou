import { describe, it, expect } from "vitest";
import {
  commissionFor,
  commissionSummary,
  pricingRuleForInstitution,
  INSTITUTION_PRICING_RULES,
} from "./institution-pricing";

const novina = INSTITUTION_PRICING_RULES[0];

describe("pricingRuleForInstitution", () => {
  it("rozpoznaje NOVINĘ po nazwie z bazy", () => {
    expect(pricingRuleForInstitution("NOVINA S.A.")?.label).toBe("NOVINA S.A.");
    expect(pricingRuleForInstitution("novina sa")?.label).toBe("NOVINA S.A.");
  });
  it("dla pozostałych instytucji nie ma reguły", () => {
    expect(pricingRuleForInstitution("ASPEKT GROUP sp. z o.o.")).toBeNull();
    expect(pricingRuleForInstitution(null)).toBeNull();
  });
});

describe("commissionFor — skala malejąca, minimum, zaokrąglenie w górę", () => {
  it("155 000 zł: 5%, zaokrąglone w górę do pełnego tysiąca", () => {
    const r = commissionFor(novina, 155_000);
    expect(r.percent).toBe(5);
    expect(r.rawCommission).toBe(7_750);
    expect(r.commission).toBe(8_000); // 7 750 → w górę
    expect(r.financing).toBe(163_000);
  });

  it("500 000 zł: górna granica progu 5%", () => {
    const r = commissionFor(novina, 500_000);
    expect(r.percent).toBe(5);
    expect(r.commission).toBe(25_000);
    expect(r.financing).toBe(525_000);
  });

  it("500 001 zł: wchodzi już stawka 3%", () => {
    expect(commissionFor(novina, 500_001).percent).toBe(3);
  });

  it("900 000 zł: 3%", () => {
    const r = commissionFor(novina, 900_000);
    expect(r.commission).toBe(27_000);
    expect(r.financing).toBe(927_000);
  });

  it("60 000 zł: 7% to za mało, wchodzi minimum 5 000 zł", () => {
    const r = commissionFor(novina, 60_000);
    expect(r.rawCommission).toBe(4_200);
    expect(r.commission).toBe(5_000);
    expect(r.financing).toBe(65_000);
    expect(r.reason).toContain("minimum");
  });

  it("100 000 zł: próg 7% włącznie", () => {
    expect(commissionFor(novina, 100_000).percent).toBe(7);
    expect(commissionFor(novina, 100_001).percent).toBe(5);
  });

  it("prowizja nigdy nie idzie w dół po zaokrągleniu", () => {
    for (const payout of [155_000, 237_400, 612_800, 999_999]) {
      const r = commissionFor(novina, payout);
      expect(r.commission!).toBeGreaterThanOrEqual(r.rawCommission!);
      expect(r.commission! % 1_000).toBe(0);
    }
  });
});

describe("commissionFor — poza zakresem reguły", () => {
  it("poniżej 50 000 zł i powyżej 1 mln: ręcznie", () => {
    expect(commissionFor(novina, 40_000).ok).toBe(false);
    expect(commissionFor(novina, 1_200_000).ok).toBe(false);
    expect(commissionFor(novina, 40_000).reason).toContain("ręcznie");
  });
  it("brak kwoty: bez wyliczenia", () => {
    expect(commissionFor(novina, null).ok).toBe(false);
    expect(commissionFor(novina, 0).ok).toBe(false);
  });
});

describe("commissionSummary", () => {
  it("mówi wprost, że notariusza dolicza instytucja", () => {
    const s = commissionSummary(novina, 155_000);
    expect(s).toContain("prowizja");
    expect(s).toContain("notariusza po stronie instytucji");
  });
});
