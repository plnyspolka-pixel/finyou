import { describe, expect, it } from "vitest";
import {
  evaluateCalculator,
  formatCalculatorValue,
  validateCalculatorConfig,
} from "./calculator-engine";
import { CALCULATOR_CONFIGS } from "./calculator-configs";
import { checkHardRules } from "@/lib/publishing-agent/compliance-rules";

describe("startowe kalkulatory", () => {
  for (const cfg of CALCULATOR_CONFIGS) {
    it(`${cfg.slug}: konfiguracja i przypadki testowe są poprawne`, () => {
      const v = validateCalculatorConfig(cfg);
      expect(v.issues).toEqual([]);
      expect(v.ok).toBe(true);
    });
    it(`${cfg.slug}: teksty przechodzą bramkę compliance`, () => {
      const text = [cfg.title, cfg.promise, ...cfg.assumptions, cfg.disclaimer].join("\n");
      expect(checkHardRules(text, { kind: "lead_magnet", track: cfg.track })).toEqual([]);
      expect(cfg.disclaimer).toContain("KRS 0000635207");
    });
  }
  it("słowa-hasła są unikalne", () => {
    const k = CALCULATOR_CONFIGS.map((c) => c.keyword);
    expect(new Set(k).size).toBe(k.length);
  });
});

describe("silnik", () => {
  const ile = CALCULATOR_CONFIGS[0];
  it("pokazuje teaser przed zapisem i pełny wynik po", () => {
    const r = evaluateCalculator(ile, { propertyValue: 1000000, encumbrances: 200000 });
    expect(r.ok).toBe(true);
    expect(r.teaser.map((t) => t.id)).toEqual(["maxLoan"]);
    expect(r.full.map((t) => t.id)).toEqual(["maxLoan", "freeEquity", "ltvAtMax"]);
  });
  it("waliduje pola", () => {
    const r = evaluateCalculator(ile, { propertyValue: 100 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/minimum/);
  });
  it("odrzuca nieznaną formułę i referencję (brak dowolnego kodu)", () => {
    const bad = { ...ile, outputs: [{ ...ile.outputs[0], fn: "eval" }] };
    expect(validateCalculatorConfig(bad).ok).toBe(false);
    const badRef = { ...ile, outputs: [{ ...ile.outputs[0], args: ["nieMa"] }] };
    expect(validateCalculatorConfig(badRef).issues[0].message).toMatch(/Nieznany argument/);
  });
  it("formatuje po polsku", () => {
    expect(formatCalculatorValue(400000, "money")).toMatch(/400\s000 zł/);
    expect(formatCalculatorValue(60, "percent")).toBe("60%");
  });
});
