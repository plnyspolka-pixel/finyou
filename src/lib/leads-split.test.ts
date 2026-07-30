import { describe, expect, it } from "vitest";
import { patchStartsApplication } from "./leads-split";

describe("patchStartsApplication", () => {
  it("nie startuje wniosku od samych danych kontaktowych", () => {
    expect(patchStartsApplication({})).toBe(false);
    expect(patchStartsApplication(null)).toBe(false);
    expect(
      patchStartsApplication({
        first_name: "Jan",
        last_name: "Kowalski",
        email: "jan@example.com",
        phone: "600100200",
        city: "Warszawa",
      }),
    ).toBe(false);
  });

  it("startuje wniosek od merytoryki: kwota / KW / nieruchomość / cel", () => {
    expect(patchStartsApplication({ loan_amount: 150000 })).toBe(true);
    expect(patchStartsApplication({ numer_kw: "WA1M/00123456/7" })).toBe(true);
    expect(patchStartsApplication({ kw_numbers: ["WA1M/00123456/7"] })).toBe(true);
    expect(patchStartsApplication({ status_numeru_kw: "przesłany na zdjęciu" })).toBe(true);
    expect(patchStartsApplication({ typ_nieruchomosci: "dom" })).toBe(true);
    expect(patchStartsApplication({ property_value: 600000 })).toBe(true);
    expect(patchStartsApplication({ purpose: "spłata chwilówek" })).toBe(true);
  });

  it("ignoruje wartości puste", () => {
    expect(patchStartsApplication({ loan_amount: null, numer_kw: "", kw_numbers: [] })).toBe(false);
    expect(patchStartsApplication({ typ_nieruchomosci: "   " })).toBe(false);
    expect(patchStartsApplication({ loan_amount: Number.NaN })).toBe(false);
  });
});
