import { describe, expect, it } from "vitest";
import {
  compactKwNumber,
  containsValidKw,
  formatKwNumber,
  normalizeKwNumber,
  normalizeKwNumbersInText,
  validateKwInput,
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

  it("odrzuca numery o złej strukturze", () => {
    expect(normalizeKwNumber("LU1I/86478/5")).toBeNull(); // 5 cyfr zamiast 7-8
    expect(normalizeKwNumber("1234567")).toBeNull();
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

describe("normalizeKwNumbersInText — naprawa formatu w dłuższym tekście", () => {
  it("naprawia separatory i wielkość liter, zachowując resztę tekstu", () => {
    expect(normalizeKwNumbersInText("OL1M 00025761 4 | Pow. użytkowa: 140 m²")).toBe(
      "OL1M/00025761/4 | Pow. użytkowa: 140 m²",
    );
    expect(normalizeKwNumbersInText("wa1m-00123456-7")).toBe("WA1M/00123456/7");
  });

  it("naprawia wszystkie numery w polu z wieloma KW", () => {
    expect(normalizeKwNumbersInText("TB1M 00065977 7 | tb1m.00065978.4")).toBe(
      "TB1M/00065977/7 | TB1M/00065978/4",
    );
  });

  it("dopełnia 7-cyfrowe numery zerem wiodącym", () => {
    expect(normalizeKwNumbersInText("KA1L/0008967/5")).toBe("KA1L/00008967/5");
  });

  it("zostawia tekst bez numerów KW bez zmian; pusta wartość → null", () => {
    expect(normalizeKwNumbersInText("PRZESŁANY")).toBe("PRZESŁANY");
    expect(normalizeKwNumbersInText("")).toBeNull();
    expect(normalizeKwNumbersInText(null)).toBeNull();
  });
});

describe("validateKwInput — walidacja pola formularza", () => {
  it("akceptuje i normalizuje poprawne numery (auto-naprawa drobnych odstępstw)", () => {
    expect(validateKwInput("WA1M/00123456/7")).toMatchObject({
      ok: true,
      normalized: "WA1M/00123456/7",
    });
    expect(validateKwInput("wa1m 00123456 7")).toMatchObject({
      ok: true,
      normalized: "WA1M/00123456/7",
    });
    expect(validateKwInput("KA1L/0008967/5")).toMatchObject({
      ok: true,
      normalized: "KA1L/00008967/5",
    });
  });

  it("odrzuca pustą wartość i śmieci z konkretnym komunikatem", () => {
    expect(validateKwInput("")).toMatchObject({ ok: false });
    expect(validateKwInput("PRZESŁANY").ok).toBe(false);
    expect(validateKwInput("PRZESŁANY").error).toBeTruthy();
  });

  it("wskazuje zepsutą część numeru", () => {
    expect(validateKwInput("WARSZAWA/00123456/7").error).toMatch(/[Kk]od sądu/);
    expect(validateKwInput("WA1M/123/4").error).toMatch(/8 cyfr/);
    expect(validateKwInput("WA1M/00123456/77").error).toMatch(/kontroln/);
  });
});

describe("containsValidKw", () => {
  it("wykrywa numer KW wewnątrz tekstu", () => {
    expect(containsValidKw("TB1M/00065977/7,TB1M/00065978/4")).toBe(true);
    expect(containsValidKw("PRZESŁANY")).toBe(false);
    expect(containsValidKw(null)).toBe(false);
  });
});
