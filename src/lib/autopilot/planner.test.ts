import { describe, expect, it } from "vitest";
import { IDEA_SCORE_THRESHOLD, decideAbTest, pickHooks, scoreIdea } from "./planner";

const series = ["Bank vs Ty", "3 błędy inwestora", "Czy wiesz, że…"];

describe("scoring pomysłu", () => {
  it("hook-teza z liczbą, stawką i serią przechodzi próg", () => {
    const s = scoreIdea({
      track: "inwestor",
      series: "Bank vs Ty",
      trackSeries: series,
      hook: "Bank pożycza przy LTV 80%, a Ty?",
      thesis: "Niższe LTV to większy zapas, gdy trzeba sprzedać nieruchomość — ale ryzyko zostaje.",
    });
    expect(s.blocked).toBe(false);
    expect(s.total).toBeGreaterThanOrEqual(IDEA_SCORE_THRESHOLD);
  });

  it("zagadka bez liczby i serii — poniżej progu", () => {
    const s = scoreIdea({
      track: "inwestor",
      series: null,
      trackSeries: series,
      hook: "Nie uwierzysz, co się stało",
      thesis: "Ciekawa historia.",
    });
    expect(s.total).toBeLessThan(IDEA_SCORE_THRESHOLD);
    expect(s.reasons).toContain("hook jest zagadką, nie tezą");
  });

  it("obietnica zysku zeruje wynik", () => {
    const s = scoreIdea({
      track: "inwestor",
      series: "Bank vs Ty",
      trackSeries: series,
      hook: "Gwarantowany zysk jak w banku?",
      thesis: "Tak.",
    });
    expect(s.blocked).toBe(true);
    expect(s.total).toBe(0);
  });
});

describe("wybór hooków i A/B", () => {
  it("najlepszy do produkcji, drugi do testu A/B", () => {
    const r = pickHooks(
      {
        track: "pozyczkobiorca",
        series: "Bank odmówił – co dalej?",
        trackSeries: ["Bank odmówił – co dalej?"],
        thesis: "3 kroki po odmowie banku, zanim stracisz kontrakt.",
      },
      [
        "Bank odmówił Twojej firmie? 3 kroki na dziś",
        "Bank odmówił? Zrób to, zanim stracisz kontrakt",
        "Pożyczka bez BIK dla każdego?",
      ],
    );
    expect(r.primary).not.toBeNull();
    expect(r.abVariant).not.toBeNull();
    expect(r.scores.map((s) => s.hook)).not.toContain("Pożyczka bez BIK dla każdego?");
  });

  it("decyzja A/B dopiero po 72 h i przy wyraźnej przewadze", () => {
    const x = { views: 1000, shares: 10, follows: 2, ageHours: 80 };
    expect(decideAbTest(x, { ...x, ageHours: 10 })).toBe("undecided");
    expect(decideAbTest(x, { ...x, views: 300, shares: 1, follows: 0 })).toBe("a");
    expect(decideAbTest(x, { ...x, views: 1050 })).toBe("undecided");
  });
});
