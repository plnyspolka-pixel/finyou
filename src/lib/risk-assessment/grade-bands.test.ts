import { describe, expect, it } from "vitest";
import { GRADE_BANDS, gradeBand, gradeRangeLabel } from "./grade-bands";
import { gradeFromScore } from "./types";
import { scoreColor } from "@/components/risk-assessment/risk-charts";

describe("skala A–E", () => {
  it("klasy pokrywają 0–100 bez luk i nakładania", () => {
    const sorted = [...GRADE_BANDS].sort((a, b) => a.min - b.min);
    expect(sorted[0].min).toBe(0);
    expect(sorted[sorted.length - 1].max).toBe(100);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
  });

  it("progi i kolory zgadzają się z gradeFromScore i scoreColor", () => {
    for (const b of GRADE_BANDS) {
      for (const s of [b.min, b.max]) {
        expect(gradeFromScore(s)).toBe(b.grade);
        expect(scoreColor(s)).toBe(b.color);
      }
    }
  });

  it("zwraca klasę po literze i zakres punktów", () => {
    expect(gradeBand("C").label).toBe("Umiarkowane ryzyko");
    expect(gradeRangeLabel(gradeBand("A"))).toBe("85–100");
  });
});
