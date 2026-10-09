import { describe, expect, it } from "vitest";
import { renderKwSections } from "@/lib/kw-render";
import { propertyFillFromKw } from "./kw-fill";

const html = renderKwSections({
  kwNumber: "SL1S/00061444/8",
  dzial1o: {
    wojewodztwo: "pomorskie",
    powiat: "Słupsk",
    gmina: "Słupsk",
    miejscowosc: "Słupsk",
    ulica: "Powstańców Warszawskich",
    numerBudynku: "1",
    numerLokalu: "7",
    przeznaczenie: "lokal mieszkalny",
    obszar: "30,60 M2",
  },
}).dzial_1o;

describe("properties ← dział I-O KW (pkt 4)", () => {
  it("puste pola uzupełnione z KW, adres do geokodowania", () => {
    const r = propertyFillFromKw({}, html, "SL1S/00061444/8");
    expect(r.patch).toMatchObject({
      street: "Powstańców Warszawskich",
      building_number: "1",
      unit_number: "7",
      address: "Powstańców Warszawskich 1/7, Słupsk",
      city: "Słupsk",
      area_sqm: 30.6,
    });
    expect(r.addressChanged).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it("pole wpisane ręcznie nie jest nadpisywane — konflikt jako ostrzeżenie", () => {
    const r = propertyFillFromKw({ city: "Ustka", area_sqm: 30.6 }, html);
    expect(r.patch.city).toBeUndefined();
    expect(r.conflicts).toEqual([{ field: "city", current: "Ustka", kw: "Słupsk" }]);
    expect(r.filled).not.toContain("area_sqm");
  });
});
