/**
 * Oświadczenie o źródle pochodzenia środków — walidacja i ocena ryzyka.
 */
import { describe, it, expect } from "vitest";
import {
  SOF_DECLARATION_TEXT,
  SOF_DECLARATION_TEXT_VERSION,
  SOF_STATEMENTS,
  SOURCE_OF_FUNDS_CATEGORIES,
  SourceOfFundsInput,
  assessSourceOfFunds,
  categoriesForVariant,
  emptySourceOfFunds,
  sourceOfFundsError,
  type SourceOfFundsDraft,
} from "./source-of-funds";

const complete: SourceOfFundsDraft = {
  ...emptySourceOfFunds(),
  sources: ["wynagrodzenie", "oszczednosci"],
  description: "Oszczędności z wynagrodzenia z lat 2018–2025.",
  planned_scale: "100k_500k",
  statements: {
    srodki_wlasne: true,
    legalne_pochodzenie: true,
    dokumenty_i_aktualizacja: true,
  },
  truth_confirmed: true,
};

describe("oświadczenie o źródle środków — walidacja", () => {
  it("pusty szkic nie przechodzi, kompletny przechodzi", () => {
    expect(sourceOfFundsError(emptySourceOfFunds())).toMatch(/co najmniej jedno źródło/);
    expect(sourceOfFundsError(complete)).toBeNull();
  });

  it("wymaga zaznaczenia każdego z oświadczeń i potwierdzenia prawdziwości", () => {
    expect(
      sourceOfFundsError({
        ...complete,
        statements: { ...complete.statements, legalne_pochodzenie: false },
      }),
    ).toMatch(/legalne pochodzenie/);
    expect(sourceOfFundsError({ ...complete, truth_confirmed: false })).toMatch(/prawdziwość/);
  });

  it("„inne” wymaga opisu, środki obce — wyjaśnienia", () => {
    expect(sourceOfFundsError({ ...complete, sources: ["inne"], other_description: "" })).toMatch(
      /Opisz inne źródło/,
    );
    expect(
      sourceOfFundsError({ ...complete, sources: ["kredyt_pozyczka"], description: "krótko" }),
    ).toMatch(/środków obcych/);
    expect(
      sourceOfFundsError({
        ...complete,
        sources: ["kredyt_pozyczka"],
        description: "Kredyt inwestycyjny w banku X, umowa z 2026 r., 300 000 zł na 5 lat.",
      }),
    ).toBeNull();
  });

  it("kod kraju jest normalizowany do wielkich liter i musi mieć dwie litery", () => {
    expect(SourceOfFundsInput.parse({ ...complete, funds_country: "pl" }).funds_country).toBe("PL");
    expect(sourceOfFundsError({ ...complete, funds_country: "Polska" })).toMatch(/kod kraju/);
  });

  it("odrzuca powtórzone i nieznane źródła", () => {
    expect(sourceOfFundsError({ ...complete, sources: ["oszczednosci", "oszczednosci"] })).toMatch(
      /powtarzać/,
    );
    expect(sourceOfFundsError({ ...complete, sources: ["bitcoin"] })).not.toBeNull();
  });

  it("treść oświadczenia zawiera podstawę prawną, wszystkie punkty i wersję", () => {
    expect(SOF_DECLARATION_TEXT).toMatch(/art\. 34 ust\. 1 pkt 4 lit\. b/);
    expect(SOF_DECLARATION_TEXT).toMatch(/art\. 41/);
    for (const s of SOF_STATEMENTS) expect(SOF_DECLARATION_TEXT).toContain(s.label);
    expect(SOF_DECLARATION_TEXT_VERSION).toBe("sof-2026-10-v1");
    expect(emptySourceOfFunds().declaration_text_version).toBe(SOF_DECLARATION_TEXT_VERSION);
  });

  it("spółka nie widzi wynagrodzenia ani spadku, osoba fizyczna nie widzi kapitału spółki", () => {
    const spolka = categoriesForVariant("osoba_prawna").map((c) => c.code);
    expect(spolka).not.toContain("wynagrodzenie");
    expect(spolka).not.toContain("darowizna_spadek");
    expect(spolka).toContain("kapital_spolki");
    const osoba = categoriesForVariant("osoba_fizyczna").map((c) => c.code);
    expect(osoba).toContain("wynagrodzenie");
    expect(osoba).not.toContain("kapital_spolki");
    expect(categoriesForVariant(null)).toHaveLength(SOURCE_OF_FUNDS_CATEGORIES.length);
  });
});

describe("oświadczenie o źródle środków — ocena ryzyka", () => {
  it("typowe źródła z Polski w małej skali zamykają krok automatycznie", () => {
    expect(assessSourceOfFunds(complete)).toEqual({ status: "zlozone", flags: [] });
  });

  it("„inne” i środki obce kierują do analizy compliance", () => {
    expect(assessSourceOfFunds({ ...complete, sources: ["inne"] })).toEqual({
      status: "do_weryfikacji",
      flags: ["inne_zrodlo"],
    });
    expect(assessSourceOfFunds({ ...complete, sources: ["kredyt_pozyczka"] }).flags).toContain(
      "srodki_obce",
    );
  });

  it("środki spoza EOG/CH/GB i skala od 1 mln zł to sygnały podwyższonego ryzyka", () => {
    expect(assessSourceOfFunds({ ...complete, funds_country: "DE" }).flags).toEqual([]);
    expect(assessSourceOfFunds({ ...complete, funds_country: "GB" }).flags).toEqual([]);
    expect(assessSourceOfFunds({ ...complete, funds_country: "AE" }).flags).toEqual([
      "kraj_podwyzszonego_ryzyka",
    ]);
    expect(assessSourceOfFunds({ ...complete, planned_scale: "500k_1m" }).flags).toEqual([]);
    expect(assessSourceOfFunds({ ...complete, planned_scale: "1m_5m" })).toEqual({
      status: "do_weryfikacji",
      flags: ["wysoka_skala"],
    });
  });

  it("kilka sygnałów naraz daje komplet flag w stałej kolejności", () => {
    const a = assessSourceOfFunds({
      sources: ["inne", "kredyt_pozyczka"],
      funds_country: "US",
      planned_scale: "powyzej_5m",
    });
    expect(a.status).toBe("do_weryfikacji");
    expect(a.flags).toEqual([
      "inne_zrodlo",
      "srodki_obce",
      "kraj_podwyzszonego_ryzyka",
      "wysoka_skala",
    ]);
  });
});
