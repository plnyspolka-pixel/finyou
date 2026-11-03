import { describe, expect, it } from "vitest";
import { isBuildingPropertyType, resolveBuildingArea } from "./building-area";

describe("resolveBuildingArea", () => {
  it("dom bez powierzchni użytkowej — powierzchnia nieznana, nie działka", () => {
    const r = resolveBuildingArea({ propertyType: "dom", landAreaM2: 717 });
    expect(r.areaM2).toBeNull();
    expect(r.note).toMatch(/Powierzchnia domu nieznana/);
  });

  it("odrzuca area_sqm równe obszarowi działki z KW (stary backfill)", () => {
    const r = resolveBuildingArea({ propertyType: "dom", recordAreaM2: 717, landAreaM2: 717 });
    expect(r.areaM2).toBeNull();
    expect(r.discardedLandArea).toBe(true);
  });

  it("rozpoznaje działkę podaną w ha", () => {
    const r = resolveBuildingArea({ propertyType: "dom", recordAreaM2: 1200, landAreaHa: 0.12 });
    expect(r.areaM2).toBeNull();
  });

  it("powierzchnia użytkowa z KW ma pierwszeństwo", () => {
    expect(
      resolveBuildingArea({
        propertyType: "dom",
        kwUsableAreaM2: 142,
        recordAreaM2: 717,
        landAreaM2: 717,
      }).areaM2,
    ).toBe(142);
  });

  it("powierzchnia z wniosku inna niż działka zostaje", () => {
    const r = resolveBuildingArea({ propertyType: "dom", recordAreaM2: 160, landAreaM2: 900 });
    expect(r.areaM2).toBe(160);
    expect(r.note).toBeNull();
  });

  it("typy budynkowe", () => {
    expect(isBuildingPropertyType("dom")).toBe(true);
    expect(isBuildingPropertyType("mieszkanie")).toBe(true);
    expect(isBuildingPropertyType("dzialka_budowlana")).toBe(false);
  });
});
