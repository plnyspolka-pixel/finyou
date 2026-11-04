import { describe, expect, it } from "vitest";
import { ageBucket, regionalLongevityFrom } from "./regional-longevity";
import { estimateLifeExpectancy } from "./life-expectancy";

describe("regionalny współczynnik dożycia", () => {
  it("wiek → przedział BDL", () => {
    expect(ageBucket(14)).toBe(0);
    expect(ageBucket(55)).toBe(45);
    expect(ageBucket(64)).toBe(60);
    expect(ageBucket(82)).toBe(65);
  });

  it("współczynnik = e(x) regionu / e(x) Polski i korekta e(x)", () => {
    const regional = regionalLongevityFrom({
      unitName: "PODREGION MIASTO KRAKÓW",
      unitLevel: "podregion",
      ageBucket: 65,
      sex: "K",
      regional: { year: "2025", val: 21.73 },
      national: { year: "2025", val: 20.47 },
    });
    expect(regional.factor).toBeCloseTo(1.062, 3);
    const base = estimateLifeExpectancy({ age: 70, sex: "K", loanTermYears: 3 });
    const adj = estimateLifeExpectancy({ age: 70, sex: "K", loanTermYears: 3, regional });
    expect(adj.nationalRemainingYears).toBe(base.remainingYears);
    expect(adj.remainingYears!).toBeGreaterThan(base.remainingYears!);
    expect(adj.summary).toMatch(/korektą regionalną/);
  });

  it("brak danych regionu — bez korekty", () => {
    const r = regionalLongevityFrom({
      unitName: "X",
      unitLevel: "podregion",
      ageBucket: 45,
      sex: "M",
      regional: null,
      national: { year: "2025", val: 32 },
    });
    expect(r.available).toBe(false);
    const le = estimateLifeExpectancy({ age: 50, sex: "M", regional: r });
    expect(le.remainingYears).toBe(le.nationalRemainingYears);
  });
});
