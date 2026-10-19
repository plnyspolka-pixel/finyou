import { describe, expect, it } from "vitest";
import { COMPANY_DATA } from "@/lib/company";
import { checkHardRules, RISK_LINE } from "@/lib/autopilot/compliance-rules";
import { BRAND, contrastRatio, versionLine } from "./brand";

describe("system marki", () => {
  it("dane firmy zgodne z COMPANY_DATA", () => {
    expect(BRAND.company.krs).toBe(COMPANY_DATA.krs);
    expect(BRAND.company.nip).toBe(COMPANY_DATA.nip);
    expect(BRAND.company.email).toBe(COMPANY_DATA.email);
    expect(BRAND.company.address).toBe(COMPANY_DATA.addressFull);
  });
  it("linie ryzyka identyczne z bramką compliance", () => {
    expect(BRAND.mandatory.riskInvestor).toBe(RISK_LINE.inwestor);
    expect(BRAND.mandatory.riskBorrower).toBe(RISK_LINE.pozyczkobiorca);
  });
  it("dozwolone liczby same przechodzą reguły twarde", () => {
    for (const claim of BRAND.allowedClaims) {
      expect(checkHardRules(claim, { track: "oba", kind: "landing" })).toEqual([]);
    }
  });
  it("czytelny kontrast par tekst/tło (WCAG AA ≥ 4.5)", () => {
    const c = BRAND.colors;
    expect(contrastRatio(c.foreground, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.ink, c.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.background, c.gold)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.ink, c.riskBox)).toBeGreaterThanOrEqual(4.5);
  });
  it("linia wersji", () => {
    expect(versionLine(3, "19.10.2026")).toBe("Wersja 3 · 19.10.2026");
  });
});
