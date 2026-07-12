import { describe, it, expect } from "vitest";
import { parsePesel, computeAge } from "./pesel";
import { estimateLifeExpectancy } from "./life-expectancy";

// Referencyjny dzień do stabilnego wyliczania wieku w testach.
const REF = new Date("2026-07-12T00:00:00Z");

describe("parsePesel", () => {
  it("dekoduje mężczyznę urodzonego w 1944 r.", () => {
    const r = parsePesel("44051401359", REF);
    expect(r.valid).toBe(true);
    expect(r.birthDate).toBe("1944-05-14");
    expect(r.sex).toBe("M");
    expect(r.age).toBe(82);
  });

  it("dekoduje kobietę urodzoną w 1990 r.", () => {
    const r = parsePesel("90010123480", REF);
    expect(r.valid).toBe(true);
    expect(r.birthDate).toBe("1990-01-01");
    expect(r.sex).toBe("K");
    expect(r.age).toBe(36);
  });

  it("obsługuje kodowanie stulecia 2000+ (miesiąc +20)", () => {
    const r = parsePesel("05312011113", REF);
    expect(r.valid).toBe(true);
    expect(r.birthDate).toBe("2005-11-20");
    expect(r.sex).toBe("M");
    expect(r.age).toBe(20);
  });

  it("odrzuca błędną cyfrę kontrolną", () => {
    const r = parsePesel("44051401358", REF);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/kontroln/);
  });

  it("odrzuca zły format", () => {
    expect(parsePesel("123").valid).toBe(false);
    expect(parsePesel("").valid).toBe(false);
    expect(parsePesel(null).valid).toBe(false);
  });

  it("odrzuca nieistniejącą datę", () => {
    // miesiąc 13 nie mapuje się na żadne stulecie
    const r = parsePesel("44131401357", REF);
    expect(r.valid).toBe(false);
  });
});

describe("computeAge", () => {
  it("nie zalicza roku przed urodzinami", () => {
    expect(computeAge("1990-12-31", REF)).toBe(35);
    expect(computeAge("1990-07-12", REF)).toBe(36);
  });
});

describe("estimateLifeExpectancy", () => {
  it("zwraca e(x) z tablic GUS dla mężczyzny 70 lat", () => {
    const r = estimateLifeExpectancy({ age: 70, sex: "M" });
    expect(r.available).toBe(true);
    expect(r.remainingYears).toBeCloseTo(12.5, 1);
    expect(r.projectedAgeAtDeath).toBeCloseTo(82.5, 1);
    expect(r.longevityRiskBand).toBe("podwyzszone");
  });

  it("interpoluje między węzłami (kobieta 43 lata)", () => {
    const r = estimateLifeExpectancy({ age: 43, sex: "K" });
    // między 40 (42.1) a 45 (37.4)
    expect(r.remainingYears! < 42.1 && r.remainingYears! > 37.4).toBe(true);
  });

  it("dla horyzontu pożyczki wyznacza pasmo względem tenoru", () => {
    const low = estimateLifeExpectancy({ age: 40, sex: "K", loanTermYears: 10 });
    expect(low.longevityRiskBand).toBe("niskie");
    expect(low.survivalProbabilityOverTerm).not.toBeNull();

    const high = estimateLifeExpectancy({ age: 88, sex: "M", loanTermYears: 15 });
    expect(high.longevityRiskBand).toBe("wysokie");
  });

  it("brak danych właściciela → nieznane ryzyko", () => {
    const r = estimateLifeExpectancy({ age: null, sex: null });
    expect(r.available).toBe(false);
    expect(r.longevityRiskBand).toBe("nieznane");
  });
});
