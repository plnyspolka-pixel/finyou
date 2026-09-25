import { describe, expect, it } from "vitest";
import { KW_CHECK_STEPS, kwCheckStepStatus, type KwCheckItem } from "./types";

function item(patch: Partial<KwCheckItem>): KwCheckItem {
  return {
    id: "c1",
    kwNumber: "WA1M/00012345/6",
    label: null,
    propertyType: "mieszkanie",
    loanAmount: null,
    propertyValue: null,
    periodMonths: null,
    status: "running",
    steps: {},
    error: null,
    kwAnalysisStatus: null,
    createdAt: "2026-09-25T10:00:00Z",
    finishedAt: null,
    ...patch,
  };
}

describe("szybka analiza KW — stan kroków", () => {
  it("obejmuje cztery kroki, łącznie z oceną ryzyka", () => {
    expect(KW_CHECK_STEPS.map((s) => s.key)).toEqual(["kw", "coowners", "kw_analysis", "risk"]);
  });

  it("w trwającym przebiegu „w toku” jest pierwszy nierozstrzygnięty krok", () => {
    const i = item({ steps: { kw: { status: "done" }, coowners: { status: "error" } } });
    expect(kwCheckStepStatus(i, "kw")).toBe("done");
    expect(kwCheckStepStatus(i, "coowners")).toBe("error");
    expect(kwCheckStepStatus(i, "kw_analysis")).toBe("running");
    expect(kwCheckStepStatus(i, "risk")).toBe("pending");
  });

  it("ocena ryzyka czekająca na automat jest „w toku” po krokach 1–3", () => {
    const i = item({
      steps: {
        kw: { status: "done" },
        coowners: { status: "done" },
        kw_analysis: { status: "done" },
        risk: { status: "pending" },
      },
    });
    expect(kwCheckStepStatus(i, "risk")).toBe("running");
  });

  it("zakończone sprawdzenie nie pokazuje kroków „w toku”", () => {
    const i = item({ status: "error", steps: { kw: { status: "error" } } });
    expect(kwCheckStepStatus(i, "kw")).toBe("error");
    expect(kwCheckStepStatus(i, "risk")).toBe("pending");
  });
});
