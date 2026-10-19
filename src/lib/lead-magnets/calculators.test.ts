import { describe, expect, it } from "vitest";
import { checkHardRules } from "@/lib/autopilot/compliance-rules";
import {
  STARTER_CALCULATORS,
  evaluateCalculator,
  formatValue,
  validateCalculator,
} from "./calculators";

describe("silnik kalkulatorów z konfiguracji", () => {
  it("startowe kalkulatory przechodzą walidację i własne testy", () => {
    for (const cfg of STARTER_CALCULATORS) {
      expect(validateCalculator(cfg)).toEqual({ ok: true, config: cfg });
    }
  });

  it("teksty startowych kalkulatorów przechodzą bramkę compliance", () => {
    for (const cfg of STARTER_CALCULATORS) {
      const text = [cfg.title, cfg.intro, ...cfg.assumptions].join("\n");
      expect(checkHardRules(text, { track: cfg.track, kind: "landing" })).toEqual([]);
    }
  });

  it("dzieli wynik na część widoczną i wysyłaną po zapisie", () => {
    const r = evaluateCalculator(STARTER_CALCULATORS[0], { wartosc: 800000, obciazenia: 0 });
    expect(r.ok).toBe(true);
    expect(r.teaser.map((x) => x.id)).toEqual(["max_kwota"]);
    expect(r.teaser[0].value).toBe(480000);
    expect(r.gated.map((x) => x.id)).toEqual(["kwota_ostrozna", "ltv_ostrozne"]);
  });

  it("waliduje zakres pól", () => {
    const r = evaluateCalculator(STARTER_CALCULATORS[1], { kwota: 5, wartosc: "abc" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(["kwota", "wartosc"]);
    expect(r.teaser[0].formatted).toBe("—");
  });

  it("odrzuca konfigurację z nieznaną funkcją, polem albo bez teasera", () => {
    const base = STARTER_CALCULATORS[1];
    const badFn = { ...base, outputs: [{ ...base.outputs[0], fn: "eval" }] };
    expect(validateCalculator(badFn).ok).toBe(false);
    const badArg = {
      ...base,
      outputs: [{ ...base.outputs[0], args: ["x", "wartosc", "obciazenia"] }, base.outputs[1]],
    };
    expect(validateCalculator(badArg).ok).toBe(false);
    const noTeaser = { ...base, outputs: base.outputs.map((o) => ({ ...o, teaser: false })) };
    expect(validateCalculator(noTeaser).ok).toBe(false);
  });

  it("wykrywa błędną formułę na przypadku testowym", () => {
    const base = STARTER_CALCULATORS[1];
    const wrong = {
      ...base,
      tests: [{ inputs: { kwota: 300000, wartosc: 1000000, obciazenia: 0 }, expect: { ltv: 99 } }],
    };
    const v = validateCalculator(wrong);
    expect(v.ok).toBe(false);
  });

  it("limit LTV z konfiguracji nie przekracza progu systemu", () => {
    const base = STARTER_CALCULATORS[0];
    const greedy = {
      ...base,
      outputs: [{ ...base.outputs[0], args: ["wartosc", "obciazenia", 95] }, base.outputs[1]],
      tests: [{ inputs: { wartosc: 1000000, obciazenia: 0 }, expect: { max_kwota: 600000 } }],
    };
    expect(validateCalculator(greedy).ok).toBe(true);
  });

  it("formatowanie po polsku", () => {
    expect(formatValue(480000, "pln")).toBe("480 000 zł");
    expect(formatValue(40, "percent")).toBe("40%");
  });
});
