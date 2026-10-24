import { describe, expect, it } from "vitest";
import { INTAKE_PROPERTY_TYPES, buildIntakeChecklistRules } from "./property-intake-checklist";

describe("procedura przyjmowania zgłoszenia", () => {
  const rules = buildIntakeChecklistRules();
  it("zawiera listę dokumentów dla każdego rodzaju zabezpieczenia", () => {
    for (const t of INTAKE_PROPERTY_TYPES) {
      expect(rules).toContain(t.title.toUpperCase());
      for (const d of t.docs) expect(rules).toContain(d);
    }
  });
  it("mieszkanie: tylko KW i zdjęcia; dom: także powierzchnia", () => {
    const m = INTAKE_PROPERTY_TYPES.find((t) => t.key === "mieszkanie")!;
    expect(m.docs).toEqual(["Numer księgi wieczystej", "Zdjęcia każdego pomieszczenia", "Zdjęcia z zewnątrz"]);
    const d = INTAKE_PROPERTY_TYPES.find((t) => t.key === "dom")!;
    expect(d.docs).toContain("Powierzchnia użytkowa");
  });
  it("zakazuje pytania o cel pożyczki i zaczyna od zabezpieczenia", () => {
    expect(rules).toContain("NIE pytasz o cel pożyczki");
    expect(rules.indexOf("ZABEZPIECZENIE")).toBeLessThan(rules.indexOf("LISTA DLA TEGO RODZAJU"));
  });
  it("przez telefon nie przyjmuje wniosku, tylko kieruje na financeyou.pl", () => {
    expect(rules).toContain("NIE PRZYJMUJESZ WNIOSKU PRZEZ TELEFON");
    expect(rules).toContain("financeyou.pl");
  });
});
