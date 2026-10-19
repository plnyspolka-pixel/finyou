import { describe, it, expect } from "vitest";
import {
  currentDateContextPl,
  findStaleYears,
  fixStaleYearInTitle,
  formatDatePl,
  warsawDateParts,
} from "./date-context";

const NOW = new Date("2026-10-19T10:00:00Z");

describe("date-context", () => {
  it("formatuje datę po polsku w strefie Warszawy", () => {
    expect(formatDatePl(NOW)).toBe("19 października 2026 (poniedziałek)");
    // 31.12 23:30 UTC to już 1.01 w Warszawie
    expect(warsawDateParts(new Date("2026-12-31T23:30:00Z")).year).toBe(2027);
  });

  it("kontekst promptu zawiera bieżący rok", () => {
    expect(currentDateContextPl(NOW)).toContain("Bieżący rok to 2026");
  });

  it("wykrywa stare lata", () => {
    expect(findStaleYears("Ranking lokat 2024 i stopy z 2025 r.", NOW)).toEqual([2024, 2025]);
    expect(findStaleYears("Ranking 2026", NOW)).toEqual([]);
    expect(findStaleYears("ustawa z 1997 r.", NOW)).toEqual([]);
  });

  it("poprawia jeden stary rok w tytule", () => {
    expect(fixStaleYearInTitle("Pożyczka pod zastaw 2024 – przewodnik", NOW)).toEqual({
      text: "Pożyczka pod zastaw 2026 – przewodnik",
      changed: true,
      from: 2024,
    });
  });

  it("nie rusza porównań i roku bieżącego", () => {
    expect(fixStaleYearInTitle("Stopy NBP 2025 vs 2026", NOW).changed).toBe(false);
    expect(fixStaleYearInTitle("Przegląd tygodnia 2026", NOW).changed).toBe(false);
    expect(fixStaleYearInTitle("Bez roku", NOW).changed).toBe(false);
  });
});
