import { describe, expect, it } from "vitest";
import { findStaleYears, formatPlDate, isWithinDays, lastSevenDaysLabel } from "./dates";

const now = new Date("2026-10-19T04:00:00Z");

describe("daty w treściach AI", () => {
  it("formatuje dzisiejszą datę w Warszawie", () => {
    expect(formatPlDate(now)).toBe("19.10.2026");
    // 23:30 UTC 31.12 to już 1.01 w Warszawie.
    expect(formatPlDate(new Date("2026-12-31T23:30:00Z"))).toBe("01.01.2027");
  });
  it("ramka ostatnich 7 dni", () => {
    expect(lastSevenDaysLabel(now)).toBe("13.10–19.10.2026");
    expect(lastSevenDaysLabel(new Date("2027-01-02T10:00:00Z"))).toBe("27.12.2026–02.01.2027");
  });
  it("wykrywa nieaktualny rok w tytule (prawdziwe tytuły z bloga)", () => {
    expect(findStaleYears("W co inwestować pieniądze w 2024? Porównanie", now)).toEqual([2024]);
    expect(findStaleYears("Przegląd tygodnia 13-19.05.2024: Rynek", now)).toEqual([2024]);
    expect(findStaleYears("Przegląd tygodnia 13.10–19.10.2026", now)).toEqual([]);
    expect(findStaleYears("Raport 2027", now)).toEqual([]);
  });
  it("okno świeżości RSS", () => {
    expect(isWithinDays("2026-10-18T10:00:00Z", 1, now)).toBe(true);
    expect(isWithinDays("2024-05-13T10:00:00Z", 7, now)).toBe(false);
    expect(isWithinDays(null, 7, now)).toBe(true);
  });
});
