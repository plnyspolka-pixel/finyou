import { describe, expect, it } from "vitest";
import { containsValidKw, normalizeKwNumber } from "./kw";

describe("normalizeKwNumber", () => {
  it("akceptuje poprawny numer KW", () => {
    expect(normalizeKwNumber("WL1A/00006862/7")).toBe("WL1A/00006862/7");
    expect(normalizeKwNumber("wr1e/00097423/1")).toBe("WR1E/00097423/1");
  });

  it("normalizuje separatory i wyciąga numer z dłuższego tekstu", () => {
    expect(normalizeKwNumber("WL1A 00006862 7")).toBe("WL1A/00006862/7");
    expect(normalizeKwNumber("OL1M/00025761/4 | Pow. użytkowa: 140 m²")).toBe("OL1M/00025761/4");
  });

  it("odrzuca statusy zapisane przez bota zamiast numeru", () => {
    expect(normalizeKwNumber("PRZESŁANY")).toBeNull();
    expect(normalizeKwNumber("przesłany")).toBeNull();
    expect(normalizeKwNumber("na zdjęciu")).toBeNull();
    expect(normalizeKwNumber("")).toBeNull();
    expect(normalizeKwNumber(null)).toBeNull();
  });

  it("odrzuca numery o złej strukturze", () => {
    expect(normalizeKwNumber("LU1I/86478/5")).toBeNull(); // 5 cyfr zamiast 7-8
    expect(normalizeKwNumber("1234567")).toBeNull();
  });
});

describe("containsValidKw", () => {
  it("wykrywa numer KW wewnątrz tekstu", () => {
    expect(containsValidKw("TB1M/00065977/7,TB1M/00065978/4")).toBe(true);
    expect(containsValidKw("PRZESŁANY")).toBe(false);
    expect(containsValidKw(null)).toBe(false);
  });
});
