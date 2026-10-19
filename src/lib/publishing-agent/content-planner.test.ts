import { describe, expect, it } from "vitest";
import {
  classifyQuestionBank,
  IDEA_THRESHOLD,
  pickHooks,
  scoreIdea,
  SERIES,
  weeklySplit,
} from "./content-planner";

describe("bank pytań na dwa tory", () => {
  it("klasyfikuje 250 pytań: 130 pożyczkobiorca, 120 inwestor", () => {
    const r = classifyQuestionBank();
    expect(r.items).toHaveLength(250);
    expect(r.byTrack).toEqual({ pozyczkobiorca: 130, inwestor: 120 });
    // każde pytanie ma serię swojego toru
    for (const i of r.items) {
      expect(SERIES.find((s) => s.id === i.seriesId)?.track).toBe(i.track);
    }
    // pytania do przepisania są nieliczne i opisane
    expect(r.needsRewrite.length).toBeLessThan(15);
    for (const n of r.needsRewrite) expect(n.reasons.length).toBeGreaterThan(0);
  });
});

describe("scoring i hooki", () => {
  it("teza z liczbą, stawką i wrogiem wygrywa z ogólnikiem", () => {
    const good = scoreIdea(
      "Czy wiesz, że bank zarabia na kredycie więcej, niż płaci Ci na lokacie?",
      {
        track: "inwestor",
        seriesId: "inv-bank-vs-ty",
      },
    );
    const weak = scoreIdea("Zainwestuj mądrze", { track: "inwestor" });
    expect(good.score).toBeGreaterThanOrEqual(IDEA_THRESHOLD);
    expect(weak.score).toBeLessThan(IDEA_THRESHOLD);
  });

  it("naruszenie compliance = blokada", () => {
    expect(scoreIdea("Gwarantowany zysk 12% rocznie?", { track: "inwestor" }).blocked).toBe(true);
  });

  it("wybiera najlepszy hook i wariant A/B", () => {
    const r = pickHooks(
      [
        "Zainwestuj mądrze",
        "Ile musiałoby spaść mieszkanie warte 1 mln zł, żeby inwestor stracił? Policzmy?",
        "Czy wiesz, kto traci pierwszy, gdy pożyczka pod hipotekę idzie źle, a bank już nie?",
        "Pewny zysk bez ryzyka?",
      ],
      { track: "inwestor", seriesId: "inv-czy-wiesz" },
    );
    expect(r.primary).not.toBeNull();
    expect(r.abVariant).not.toBeNull();
    expect(r.scored.find((s) => s.hook.startsWith("Pewny"))).toBeUndefined();
  });

  it("podział tygodnia", () => {
    expect(weeklySplit(12, 50)).toEqual({ pozyczkobiorca: 6, inwestor: 6 });
    expect(weeklySplit(12, 60)).toEqual({ pozyczkobiorca: 7, inwestor: 5 });
  });
});
