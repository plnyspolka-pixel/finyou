import { describe, it, expect } from "vitest";
import { assessPlotBuildability } from "./plot-buildability";

describe("assessPlotBuildability — prawo zabudowy działki", () => {
  it("zabudowa zagrodowa (RM) — tylko rolnik, wąski krąg nabywców", () => {
    const r = assessPlotBuildability({
      propertyType: "grunt_rolny",
      mpzpInfo: "Teren zabudowy zagrodowej RM",
    });
    expect(r.category).toBe("zagrodowa_siedliskowa");
    expect(r.onlyFarmerCanBuild).toBe(true);
    expect(r.buyerPool).toBe("ograniczony_rolnicy");
    expect(r.saleabilityDelta).toBeLessThan(0);
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('słowo „siedlisko" w opisie także klasyfikuje jako zagrodowa', () => {
    const r = assessPlotBuildability({
      propertyType: "dzialka_zabudowana",
      ocrText: "Działka siedliskowa z budynkiem gospodarczym",
    });
    expect(r.category).toBe("zagrodowa_siedliskowa");
    expect(r.onlyFarmerCanBuild).toBe(true);
  });

  it("grunt rolny bez planu — wycena wg GUS, bez kary za sprzedawalność", () => {
    const r = assessPlotBuildability({ propertyType: "grunt_rolny" });
    expect(r.category).toBe("rolna_bez_zabudowy");
    expect(r.valuationBasis).toBe("rolna_gus");
    expect(r.requiresOdrolnienieOrWz).toBe(true);
    expect(r.saleabilityDelta).toBe(0); // grunt rolny sprzedaje się relatywnie dobrze
    expect(r.buyerPool).toBe("rolniczy");
  });

  it("działka budowlana (MPZP MN) — szeroki krąg nabywców", () => {
    const r = assessPlotBuildability({
      propertyType: "dzialka_budowlana",
      mpzpInfo: "Zabudowa mieszkaniowa jednorodzinna MN",
    });
    expect(r.category).toBe("budowlana");
    expect(r.buyerPool).toBe("szeroki");
    expect(r.saleabilityDelta).toBeGreaterThanOrEqual(0);
  });

  it("odrolnienie podnosi grunt rolny do statusu budowlanego", () => {
    const r = assessPlotBuildability({ propertyType: "grunt_rolny", isOdrolniona: true });
    expect(r.valuationBasis).toBe("budowlana");
    expect(r.buyerPool).toBe("szeroki");
    expect(r.requiresOdrolnienieOrWz).toBe(false);
  });

  it("decyzja WZ łagodzi restrykcje na gruncie rolnym", () => {
    const base = assessPlotBuildability({ propertyType: "grunt_rolny" });
    const wz = assessPlotBuildability({ propertyType: "grunt_rolny", hasWzDecision: true });
    expect(wz.saleabilityDelta).toBeGreaterThan(base.saleabilityDelta);
    expect(wz.buildableForNonFarmer).toBe(true);
  });

  it("mieszkanie/dom — nie dotyczy", () => {
    expect(assessPlotBuildability({ propertyType: "mieszkanie" }).applicable).toBe(false);
    expect(assessPlotBuildability({ propertyType: "dom" }).applicable).toBe(false);
  });

  it("KW mówi R - GRUNTY ORNE: status rolny mimo deklaracji dzialka_budowlana", () => {
    const r = assessPlotBuildability({
      propertyType: "dzialka_budowlana",
      kwLandUse: "R - GRUNTY ORNE",
      landAreaHa: 9.39,
    });
    expect(r.category).toBe("rolna_bez_zabudowy");
    expect(r.valuationBasis).toBe("rolna_gus");
    expect(r.buyerPool).toBe("rolniczy");
    expect(r.warnings.join(" ")).toMatch(/Rozbieżność/);
    expect(r.warnings.join(" ")).toMatch(/UKUR/);
    expect(r.warnings.join(" ")).toMatch(/KOWR/);
  });

  it("KW z użytkiem budowlanym (B - tereny mieszkaniowe) nie zmienia statusu budowlanego", () => {
    const r = assessPlotBuildability({
      propertyType: "dzialka_budowlana",
      kwLandUse: "B - TERENY MIESZKANIOWE",
    });
    expect(r.category).toBe("budowlana");
    expect(r.buyerPool).toBe("szeroki");
  });

  it("grunt rolny <1 ha — bez ostrzeżenia UKUR", () => {
    const r = assessPlotBuildability({
      propertyType: "grunt_rolny",
      kwLandUse: "R - GRUNTY ORNE",
      landAreaHa: 0.5,
    });
    expect(r.category).toBe("rolna_bez_zabudowy");
    expect(r.warnings.join(" ")).not.toMatch(/UKUR/);
  });

  it("odrolnienie wygrywa z użytkiem rolnym w KW", () => {
    const r = assessPlotBuildability({
      propertyType: "dzialka_budowlana",
      kwLandUse: "R - GRUNTY ORNE",
      isOdrolniona: true,
    });
    expect(r.category).toBe("budowlana");
    expect(r.valuationBasis).toBe("budowlana");
  });
});
