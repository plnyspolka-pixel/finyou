import { describe, it, expect } from "vitest";
import {
  normalizeKwNumber,
  validateKwNumber,
  kwChecksumValid,
  computeKwCheckDigit,
  kwToCompact,
  extractKwNumbers,
} from "./kw-number";

/** Buduje poprawny numer KW z zadanego kodu sądu i numeru (dokleja cyfrę kontrolną). */
function makeValidKw(court: string, number8: string): string {
  const d = computeKwCheckDigit(`${court}${number8}`);
  return `${court}/${number8}/${d}`;
}

describe("kw-number", () => {
  it("normalizuje różne zapisy do formatu kanonicznego", () => {
    expect(normalizeKwNumber("wa1m00123456 7".replace(" ", ""))).toBe("WA1M/00123456/7");
    expect(normalizeKwNumber(" WA1M/00123456/7 ")).toBe("WA1M/00123456/7");
    expect(normalizeKwNumber("wa1m/00123456/7")).toBe("WA1M/00123456/7");
    expect(normalizeKwNumber("WA1M0012345")).toBeNull(); // za krótki
    expect(normalizeKwNumber("1A1M/00123456/7")).toBeNull(); // kod sądu od cyfry
    expect(normalizeKwNumber("")).toBeNull();
    expect(normalizeKwNumber(null)).toBeNull();
  });

  it("cyfra kontrolna: poprawna przechodzi, przekłamana cyfra numeru nie", () => {
    const kw = makeValidKw("WA1M", "00123456");
    expect(kwChecksumValid(kw)).toBe(true);
    expect(validateKwNumber(kw)).toEqual({ ok: true, kw });
    // zmiana dowolnej cyfry numeru psuje sumę kontrolną
    const broken = kw.replace("/00123456/", "/00123457/");
    expect(kwChecksumValid(broken)).toBe(false);
    const res = validateKwNumber(broken);
    expect(res.ok).toBe(false);
  });

  it("cyfra kontrolna: działa dla różnych kodów sądów (litery i cyfry w kodzie)", () => {
    for (const court of ["WA1M", "KR1P", "GD1G", "PO2H", "SZ1S", "LU1A"]) {
      const kw = makeValidKw(court, "00045678");
      expect(kwChecksumValid(kw)).toBe(true);
      // każda inna cyfra kontrolna jest odrzucana
      const d = Number(kw.slice(-1));
      const wrong = `${kw.slice(0, -1)}${(d + 1) % 10}`;
      expect(kwChecksumValid(wrong)).toBe(false);
    }
  });

  it("walidacja daje polskie komunikaty", () => {
    const empty = validateKwNumber("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatch(/Podaj numer/);
    const badShape = validateKwNumber("ABC123");
    expect(badShape.ok).toBe(false);
    if (!badShape.ok) expect(badShape.error).toMatch(/format/i);
  });

  it("kwToCompact zwraca 13 znaków dla API CMD", () => {
    expect(kwToCompact("WA1M/00123456/7")).toBe("WA1M001234567");
    expect(kwToCompact("nonsens")).toBeNull();
  });

  it("extractKwNumbers wyciąga wszystkie numery z zanieczyszczonego pola", () => {
    const dirty = "WA1M/00123456/7 | KR1P/00098765/4 | Pow. użytkowa: 55 m²";
    expect(extractKwNumbers(dirty)).toEqual(["WA1M/00123456/7", "KR1P/00098765/4"]);
    expect(extractKwNumbers("brak KW, dostarczę akt")).toEqual([]);
    // deduplikacja i normalizacja małych liter
    expect(extractKwNumbers("wa1m/00123456/7 oraz WA1M001234567")).toEqual(["WA1M/00123456/7"]);
  });
});
