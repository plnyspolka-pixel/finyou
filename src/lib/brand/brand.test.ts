import { describe, expect, it } from "vitest";
import { BRAND, brandFooter } from "./brand";
import { checkHardRules } from "@/lib/publishing-agent/compliance-rules";

describe("brand", () => {
  it("ma dane firmy i kolory w HEX", () => {
    expect(BRAND.legal.krs).toBe("0000635207");
    for (const [k, v] of Object.entries(BRAND.colors)) {
      if (Array.isArray(v)) continue;
      expect(v, k).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
  it("stopka zawiera KRS, wersję, ryzyko i oznaczenie AI", () => {
    const f = brandFooter({
      version: "1.0",
      date: new Date("2026-10-19"),
      aiAssisted: true,
      riskLine: "Ryzyko.",
    });
    expect(f).toContain("KRS 0000635207");
    expect(f).toContain("Wersja 1.0");
    expect(f).toContain("AI");
  });
  it("dozwolone liczby marki przechodzą bramkę", () => {
    expect(checkHardRules(BRAND.claims.allowed.join(". "), { kind: "caption" })).toEqual([]);
  });
});
