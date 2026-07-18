import { describe, expect, it } from "vitest";
import { assessWnioskCompleteness, isRealNamePart } from "./auto-risk-rules";

const baseInput = {
  loanAmount: 150_000,
  lead: null,
  client: { first_name: "Jan", last_name: "Kowalski", email: "jan@example.com", phone: "+48600100200" },
  properties: [{ land_register_number: "WL1A/00006862/7", photos: ["a.jpg"] }],
  documentsCount: 0,
};

describe("isRealNamePart", () => {
  it("odrzuca placeholdery z promocji leada", () => {
    expect(isRealNamePart("Klient")).toBe(false);
    expect(isRealNamePart("(brak nazwiska)")).toBe(false);
    expect(isRealNamePart("z leada")).toBe(false);
    expect(isRealNamePart("  ")).toBe(false);
    expect(isRealNamePart(null)).toBe(false);
  });
  it("akceptuje prawdziwe imiona i nazwiska", () => {
    expect(isRealNamePart("Jan")).toBe(true);
    expect(isRealNamePart("Nowak-Kowalska")).toBe(true);
  });
});

describe("assessWnioskCompleteness", () => {
  it("kompletny wniosek → complete", () => {
    const r = assessWnioskCompleteness(baseInput);
    expect(r.complete).toBe(true);
    expect(r.onlyNameMissing).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.kwCandidates).toEqual(["WL1A/00006862/7"]);
  });

  it("placeholderowe nazwisko klienta → onlyNameMissing", () => {
    const r = assessWnioskCompleteness({
      ...baseInput,
      client: { ...baseInput.client, first_name: "Klient", last_name: "(brak nazwiska)" },
    });
    expect(r.complete).toBe(false);
    expect(r.onlyNameMissing).toBe(true);
    expect(r.missing).toEqual(["imię", "nazwisko"]);
  });

  it("imię z leada uzupełnia brak u klienta", () => {
    const r = assessWnioskCompleteness({
      ...baseInput,
      client: { ...baseInput.client, first_name: "Klient", last_name: "(brak nazwiska)" },
      lead: { first_name: "Anna", last_name: "Nowak" },
    });
    expect(r.complete).toBe(true);
  });

  it("brak KW → niekompletny, nie onlyNameMissing", () => {
    const r = assessWnioskCompleteness({
      ...baseInput,
      client: { ...baseInput.client, last_name: "(brak nazwiska)" },
      properties: [{ land_register_number: null, photos: ["a.jpg"] }],
    });
    expect(r.complete).toBe(false);
    expect(r.onlyNameMissing).toBe(false);
    expect(r.missing).toContain("KW");
  });

  it("śmieciowy numer KW (status bota) nie liczy się jako KW", () => {
    const r = assessWnioskCompleteness({
      ...baseInput,
      properties: [{ land_register_number: "PRZESŁANY", photos: ["a.jpg"] }],
    });
    expect(r.hasKw).toBe(false);
  });

  it("kwota i KW z application_data leada; dokument zamiast zdjęć", () => {
    const r = assessWnioskCompleteness({
      loanAmount: null,
      client: null,
      lead: {
        first_name: "Jan",
        last_name: "Kowalski",
        email: "j@k.pl",
        phone_raw: "600100200",
        application_data: { loan_amount: "60000", kw_numbers: ["WL1A/00006862/7"] },
      },
      properties: [],
      documentsCount: 2,
    });
    expect(r.complete).toBe(true);
    expect(r.kwCandidates).toEqual(["WL1A/00006862/7"]);
  });

  it("deduplikuje numery KW z wielu źródeł", () => {
    const r = assessWnioskCompleteness({
      ...baseInput,
      lead: { kw_number: "WL1A/00006862/7", application_data: { kw_numbers: ["WL1A/00006862/7"] } },
    });
    expect(r.kwCandidates).toEqual(["WL1A/00006862/7"]);
  });
});
