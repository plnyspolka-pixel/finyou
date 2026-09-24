import { describe, expect, it } from "vitest";
import {
  compactKwNumber,
  containsValidKw,
  formatKwNumber,
  kwCheckDigit,
  kwCheckDigitError,
  normalizeKwNumber,
  normalizeKwNumbersInText,
  validateKwNumber,
} from "./kw";

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

  it("dopełnia numer repertoryjny zerami do 8 cyfr", () => {
    expect(normalizeKwNumber("KR1P/610770/2")).toBe("KR1P/00610770/2");
    expect(normalizeKwNumber("kr1p 610770 2")).toBe("KR1P/00610770/2");
    expect(normalizeKwNumber("LU1I/86478/5")).toBe("LU1I/00086478/5");
    expect(normalizeKwNumber("KA1L/0008967/5")).toBe("KA1L/00008967/5");
  });

  it("odrzuca numery o złej strukturze", () => {
    expect(normalizeKwNumber("1234567")).toBeNull();
    expect(normalizeKwNumber("KR1P/ABC/2")).toBeNull();
  });
});

describe("compactKwNumber — forma z kw_documents", () => {
  it("kompaktuje formę z ukośnikami do 13 znaków", () => {
    expect(compactKwNumber("WL1A/00006862/7")).toBe("WL1A000068627");
    expect(compactKwNumber("wl1a 00006862 7")).toBe("WL1A000068627");
  });
  it("akceptuje formę już kompaktową", () => {
    expect(compactKwNumber("WL1A000068627")).toBe("WL1A000068627");
  });
  it("dopełnia 7-cyfrowe numery zerem (starsze księgi)", () => {
    expect(compactKwNumber("KA1L/0008967/5")).toBe("KA1L000089675");
  });
  it("zwraca null dla śmieci", () => {
    expect(compactKwNumber("PRZESŁANY")).toBeNull();
    expect(compactKwNumber(null)).toBeNull();
  });
});

describe("formatKwNumber — forma z ukośnikami do wyświetlania", () => {
  it("formatuje formę kompaktową z kw_documents", () => {
    expect(formatKwNumber("WL1A000068627")).toBe("WL1A/00006862/7");
  });
  it("zachowuje formę z ukośnikami", () => {
    expect(formatKwNumber("WL1A/00006862/7")).toBe("WL1A/00006862/7");
  });
  it("zwraca null dla śmieci", () => {
    expect(formatKwNumber("nie mam")).toBeNull();
  });
});

describe("containsValidKw", () => {
  it("wykrywa numer KW wewnątrz tekstu", () => {
    expect(containsValidKw("TB1M/00065977/7,TB1M/00065978/4")).toBe(true);
    expect(containsValidKw("PRZESŁANY")).toBe(false);
    expect(containsValidKw(null)).toBe(false);
  });
});

describe("kwCheckDigit — algorytm EKW", () => {
  it("zgadza się z rzeczywistymi księgami", () => {
    for (const kw of [
      "ZA1H/00062683/4",
      "KR1P/00610770/2",
      "WL1A/00006862/7",
      "OL1M/00025761/4",
      "TB1M/00065977/7",
      "TB1M/00065978/4",
      "WR1E/00097423/1",
      "KA1L/00008967/5",
      "KS1J/00009044/5",
      "WA1N/00019868/3",
    ]) {
      const [court, num, check] = kw.split("/");
      expect(kwCheckDigit(court, num), kw).toBe(Number(check));
    }
  });
  it("dopełnia numer do 8 cyfr przed liczeniem", () => {
    expect(kwCheckDigit("KR1P", "610770")).toBe(2);
  });
  it("zwraca null dla znaku spoza alfabetu EKW", () => {
    expect(kwCheckDigit("KQ1P", "00610770")).toBeNull();
  });
});

describe("validateKwNumber — ścisła walidacja na wejściu", () => {
  it("normalizuje KR1P/610770/2 → KR1P/00610770/2 i akceptuje", () => {
    expect(validateKwNumber("KR1P/610770/2")).toEqual({
      ok: true,
      value: "KR1P/00610770/2",
      compact: "KR1P006107702",
      changed: true,
    });
  });
  it("numer już poprawny — changed=false", () => {
    const r = validateKwNumber("KR1P/00610770/2");
    expect(r.ok && r.changed).toBe(false);
  });
  it("błędna cyfra kontrolna → CHECK_DIGIT z oczekiwaną cyfrą", () => {
    const r = validateKwNumber("KR1P/610770/3");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("CHECK_DIGIT");
      expect(r.value).toBe("KR1P/00610770/3");
      expect(r.expected).toBe(2);
    }
  });
  it("śmieci → FORMAT, pusty → EMPTY", () => {
    expect(validateKwNumber("przesłany")).toMatchObject({ ok: false, code: "FORMAT" });
    expect(validateKwNumber("  ")).toMatchObject({ ok: false, code: "EMPTY" });
  });
});

describe("numery KW w tekście formularza", () => {
  it("normalizuje każdy numer, zostawia dopiski", () => {
    expect(normalizeKwNumbersInText("kr1p/610770/2 | KR1P/00054321/9 | Pow. użytkowa: 80 m²")).toBe(
      "KR1P/00610770/2 | KR1P/00054321/9 | Pow. użytkowa: 80 m²",
    );
    expect(normalizeKwNumbersInText("nie znam")).toBe("nie znam");
    expect(normalizeKwNumbersInText(null)).toBeNull();
  });
  it("wskazuje numer z błędną cyfrą kontrolną", () => {
    expect(kwCheckDigitError("KR1P/610770/2")).toBeNull();
    expect(kwCheckDigitError("KR1P/610770/2 | KR1P/610770/5")).toContain("KR1P/00610770/5");
    expect(kwCheckDigitError("nie mam numeru")).toBeNull();
  });
});
