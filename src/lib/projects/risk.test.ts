import { describe, expect, it } from "vitest";
import { analyzeProjectRisk, computeLtv, ltvBandLabel, type RiskProjectInput } from "./risk";

const BANDS = { conservative: 35, acceptable: 50, elevated: 60 };

const solidProject = (over: Partial<RiskProjectInput> = {}): RiskProjectInput => ({
  amount: 150_000,
  property_type: "mieszkanie",
  city: "Lublin",
  voivodeship: "lubelskie",
  property_value: 500_000,
  valuation_source: "operat szacunkowy",
  valuation_date: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  ltv_percent: null,
  period_months: 24,
  interest_rate_percent: 14,
  security_type: "hipoteka_1 + art. 777",
  mortgage_position: "pierwsze",
  other_encumbrances: null,
  legal_status_note: "stan prawny uregulowany",
  borrower_business_form: "sp. z o.o.",
  borrower_business_since: "2018-01-01",
  repayment_source: "sprzedaż nieruchomości",
  repayment_type: "balonowa",
  borrower_history: "terminowa spłata poprzedniej pożyczki",
  docs_complete: true,
  docs_completeness_note: null,
  missing_information: [],
  additional_conditions: null,
  ...over,
});

describe("computeLtv", () => {
  it("LTV = kwota / wartość × 100%", () => {
    expect(computeLtv(150_000, 500_000)).toBe(30);
    expect(computeLtv(150_000, 0)).toBeNull();
    expect(computeLtv(0, 500_000)).toBeNull();
  });
});

describe("ltvBandLabel (progi konfigurowalne)", () => {
  it("klasyfikuje wg progów", () => {
    expect(ltvBandLabel(30, BANDS)).toBe("bardzo konserwatywne");
    expect(ltvBandLabel(45, BANDS)).toBe("akceptowalne");
    expect(ltvBandLabel(55, BANDS)).toBe("podwyższone");
    expect(ltvBandLabel(70, BANDS)).toBe("wysokie");
  });
});

describe("analyzeProjectRisk", () => {
  it("solidny projekt: niski/umiarkowany poziom, bez czerwonych flag", () => {
    const r = analyzeProjectRisk(solidProject(), BANDS);
    expect(r.redFlags).toHaveLength(0);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(["niski", "umiarkowany"]).toContain(r.level);
    expect(r.factors.map((f) => f.area)).toEqual([
      "nieruchomosc",
      "kw",
      "ltv",
      "pozyczkobiorca",
      "transakcja",
    ]);
  });

  it("brak wyceny → czerwona flaga + pozycja w brakach", () => {
    const r = analyzeProjectRisk(solidProject({ property_value: null }), BANDS);
    expect(r.redFlags.some((f) => f.code === "no_valuation")).toBe(true);
    expect(r.missingInformation.join(" ")).toMatch(/wycen/i);
  });

  it("egzekucja i hipoteka w obciążeniach → flagi i niższy wynik", () => {
    const clean = analyzeProjectRisk(solidProject(), BANDS);
    const dirty = analyzeProjectRisk(
      solidProject({ other_encumbrances: "hipoteka umowna 200 000 zł, egzekucja komornicza" }),
      BANDS,
    );
    expect(dirty.redFlags.some((f) => f.code === "existing_mortgage")).toBe(true);
    expect(dirty.redFlags.some((f) => f.code === "enforcement")).toBe(true);
    expect(dirty.score).toBeLessThan(clean.score);
  });

  it("LTV powyżej limitu inwestora → dedykowana flaga", () => {
    const r = analyzeProjectRisk(solidProject({ amount: 275_000 }), BANDS, 50);
    expect(r.redFlags.some((f) => f.code === "ltv_over_investor_limit")).toBe(true);
  });

  it("niekompletna dokumentacja i brak źródła spłaty → flagi", () => {
    const r = analyzeProjectRisk(
      solidProject({ docs_complete: false, repayment_source: null }),
      BANDS,
    );
    expect(r.redFlags.some((f) => f.code === "incomplete_docs")).toBe(true);
    expect(r.redFlags.some((f) => f.code === "unclear_repayment")).toBe(true);
  });

  it("deklarowane braki projektu trafiają do sekcji „Czego jeszcze nie wiemy”", () => {
    const r = analyzeProjectRisk(
      solidProject({ missing_information: ["Brak dokumentów spółki"] }),
      BANDS,
    );
    expect(r.missingInformation).toContain("Brak dokumentów spółki");
  });

  it("zawiera disclaimer o pomocniczym charakterze", () => {
    const r = analyzeProjectRisk(solidProject(), BANDS);
    expect(r.disclaimer).toMatch(/pomocniczy/);
  });
});
