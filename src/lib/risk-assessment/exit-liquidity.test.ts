import { describe, it, expect } from "vitest";
import { classifySellability, categoryLabel } from "./exit-liquidity";

const noCity = {
  nearestCityPopulation: null,
  nearestCityDistanceKm: null,
  largeCityWithin50km: false,
};

describe("classifySellability — kategoria zbywalności A–E", () => {
  it("mieszkanie w wielkim mieście (>200 tys.) = A", () => {
    const r = classifySellability({
      propertyType: "mieszkanie",
      localityPopulation: 750_000,
      ...noCity,
    });
    expect(r.category).toBe("A");
    expect(r.label).toContain("wielkim mieście");
  });

  it("mieszkanie w dużym mieście (100–200 tys.) = A", () => {
    const r = classifySellability({
      propertyType: "mieszkanie",
      localityPopulation: 120_000,
      ...noCity,
    });
    expect(r.category).toBe("A");
  });

  it("dom w okolicach dużego miasta (20 km od miasta 300 tys.) = B", () => {
    const r = classifySellability({
      propertyType: "dom",
      localityPopulation: 8_000,
      nearestCityPopulation: 300_000,
      nearestCityDistanceKm: 20,
      largeCityWithin50km: true,
    });
    expect(r.category).toBe("B");
    expect(r.label).toContain("okolicach dużego miasta");
  });

  it("dom w wielkim mieście = A", () => {
    const r = classifySellability({
      propertyType: "dom",
      localityPopulation: 400_000,
      ...noCity,
    });
    expect(r.category).toBe("A");
  });

  it("mieszkanie w małej miejscowości bez zaplecza miasta = D", () => {
    const r = classifySellability({
      propertyType: "mieszkanie",
      localityPopulation: 9_000,
      nearestCityPopulation: 60_000,
      nearestCityDistanceKm: 60,
      largeCityWithin50km: false,
    });
    expect(r.category).toBe("D");
  });

  it("dom peryferyjny (mała wieś, >80 km od miasta) = E", () => {
    const r = classifySellability({
      propertyType: "dom",
      localityPopulation: 900,
      nearestCityPopulation: 70_000,
      nearestCityDistanceKm: 95,
      largeCityWithin50km: false,
    });
    expect(r.category).toBe("E");
  });

  it("grunt rolny — kategoria C niezależnie od wielkości miejscowości", () => {
    const r = classifySellability({
      propertyType: "grunt_rolny",
      localityPopulation: 400,
      ...noCity,
    });
    expect(r.category).toBe("C");
  });

  it("grunt rolny przy dużym mieście = B", () => {
    const r = classifySellability({
      propertyType: "grunt_rolny",
      localityPopulation: 2_000,
      nearestCityPopulation: 250_000,
      nearestCityDistanceKm: 15,
      largeCityWithin50km: true,
    });
    expect(r.category).toBe("B");
  });

  it("kotwice scoringu malejące monotonicznie A > B > C > D > E", () => {
    const a = classifySellability({
      propertyType: "mieszkanie",
      localityPopulation: 500_000,
      ...noCity,
    });
    const b = classifySellability({
      propertyType: "dom",
      localityPopulation: 5_000,
      nearestCityPopulation: 200_000,
      nearestCityDistanceKm: 15,
      largeCityWithin50km: true,
    });
    const c = classifySellability({
      propertyType: "mieszkanie",
      localityPopulation: 30_000,
      ...noCity,
    });
    const d = classifySellability({
      propertyType: "dom",
      localityPopulation: 6_000,
      ...noCity,
    });
    const e = classifySellability({
      propertyType: "dom",
      localityPopulation: 800,
      nearestCityPopulation: null,
      nearestCityDistanceKm: 120,
      largeCityWithin50km: false,
    });
    expect(a.baseScore).toBeGreaterThan(b.baseScore);
    expect(b.baseScore).toBeGreaterThan(c.baseScore);
    expect(c.baseScore).toBeGreaterThan(d.baseScore);
    expect(d.baseScore).toBeGreaterThan(e.baseScore);
  });

  it("typ nietypowy (inna) poza dużym miastem = D", () => {
    const r = classifySellability({
      propertyType: "inna",
      localityPopulation: 40_000,
      ...noCity,
    });
    expect(r.category).toBe("D");
  });

  it("categoryLabel opisuje wszystkie kategorie", () => {
    for (const c of ["A", "B", "C", "D", "E"] as const) {
      expect(categoryLabel(c)).toContain(c);
    }
  });
});
