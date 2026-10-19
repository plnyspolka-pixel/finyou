import { describe, expect, it } from "vitest";
import { coverLabels } from "./lesson-cover";

describe("coverLabels", () => {
  it("case study pokazuje samą miejscowość", () => {
    expect(coverLabels("Case study: działka w Żelewie")).toEqual({ eyebrow: "Case study", heading: "Działka w Żelewie" });
    expect(coverLabels("Case study: Lubań")).toEqual({ eyebrow: "Case study", heading: "Lubań" });
  });
  it("usuwa numer z tytułu, bo numer jest osobno", () => {
    expect(coverLabels("9. Lichwa — analiza przepisów i orzecznictwa").heading).toBe(
      "Lichwa — analiza przepisów i orzecznictwa",
    );
  });
});
