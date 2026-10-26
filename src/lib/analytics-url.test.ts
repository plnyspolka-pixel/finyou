import { it, expect } from "vitest";
import { analyticsPageUrl } from "./analytics-url";
it("removes the free-lesson token but preserves campaign attribution", () => {
  expect(analyticsPageUrl("https://financeyou.pl/pobierz/darmowa-lekcja?t=private&utm_source=email")).toBe("https://financeyou.pl/pobierz/darmowa-lekcja?utm_source=email");
  expect(analyticsPageUrl("https://financeyou.pl/dla-klienta?kwota=500000")).toBe("https://financeyou.pl/dla-klienta?kwota=500000");
});