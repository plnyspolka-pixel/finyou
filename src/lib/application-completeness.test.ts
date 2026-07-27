// Testy jednostkowe jedynego źródła prawdy dla kompletności wniosku.
import { describe, it, expect } from "vitest";
import {
  evaluateApplicationCore,
  hasRealClientName,
  isApplicationCoreComplete,
  missingLabels,
  type CompletenessInput,
} from "@/lib/application-completeness";

const COMPLETE: CompletenessInput = {
  loan_amount: 250000,
  client: {
    first_name: "Jan",
    last_name: "Kowalski",
    phone: "+48500600700",
    email: "jan@example.com",
  },
  properties: [{ land_register_number: "WA1M/00123456/7", photos: ["a.jpg"] }],
  docCount: 0,
};

describe("evaluateApplicationCore", () => {
  it("uznaje wniosek z kompletem danych za kompletny", () => {
    const r = evaluateApplicationCore(COMPLETE);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
    expect(isApplicationCoreComplete(COMPLETE)).toBe(true);
  });

  it("wykrywa brak prawdziwego imienia i nazwiska (placeholder ze stuba leada)", () => {
    const r = evaluateApplicationCore({
      ...COMPLETE,
      client: { first_name: "Lead", last_name: "—", phone: "500600700" },
    });
    expect(r.complete).toBe(false);
    expect(r.missing).toContain("name");
  });

  it("wymaga kontaktu — telefon LUB e-mail", () => {
    const noContact = evaluateApplicationCore({
      ...COMPLETE,
      client: { first_name: "Jan", last_name: "Kowalski" },
    });
    expect(noContact.missing).toContain("contact");
    const emailOnly = evaluateApplicationCore({
      ...COMPLETE,
      client: { first_name: "Jan", last_name: "Kowalski", email: "j@x.pl" },
    });
    expect(emailOnly.missing).not.toContain("contact");
  });

  it("wymaga kwoty pożyczki większej od zera", () => {
    expect(evaluateApplicationCore({ ...COMPLETE, loan_amount: null }).missing).toContain("amount");
    expect(evaluateApplicationCore({ ...COMPLETE, loan_amount: 0 }).missing).toContain("amount");
    expect(evaluateApplicationCore({ ...COMPLETE, loan_amount: "250000" }).missing).not.toContain(
      "amount",
    );
  });

  it("odrzuca śmieć w polu KW, ale akceptuje poprawny numer", () => {
    expect(
      evaluateApplicationCore({
        ...COMPLETE,
        properties: [{ land_register_number: "PRZESŁANY", photos: ["a.jpg"] }],
      }).missing,
    ).toContain("kw");
    expect(
      evaluateApplicationCore({
        ...COMPLETE,
        properties: [{ land_register_number: "WA1M/00123456/7", photos: ["a.jpg"] }],
      }).missing,
    ).not.toContain("kw");
  });

  it("akceptuje media jako zdjęcia ALBO dokumenty", () => {
    const docsOnly = evaluateApplicationCore({
      ...COMPLETE,
      properties: [{ land_register_number: "WA1M/00123456/7", photos: [] }],
      docCount: 2,
    });
    expect(docsOnly.missing).not.toContain("media");
    const noMedia = evaluateApplicationCore({
      ...COMPLETE,
      properties: [{ land_register_number: "WA1M/00123456/7", photos: [] }],
      docCount: 0,
    });
    expect(noMedia.missing).toContain("media");
  });

  it("zbiera wszystkie braki dla gołego stuba leada", () => {
    const r = evaluateApplicationCore({
      loan_amount: null,
      client: { first_name: "Lead", last_name: "—" },
      properties: [],
      docCount: 0,
    });
    expect(r.complete).toBe(false);
    expect(r.missing.sort()).toEqual(["amount", "contact", "kw", "media", "name"].sort());
    expect(missingLabels(r.missing).length).toBe(5);
  });
});

describe("hasRealClientName", () => {
  it("odrzuca placeholdery i puste wartości", () => {
    expect(hasRealClientName({ first_name: "Lead", last_name: "—" })).toBe(false);
    expect(hasRealClientName({ first_name: "Jan", last_name: "" })).toBe(false);
    expect(hasRealClientName(null)).toBe(false);
    expect(hasRealClientName({ first_name: "z leada", last_name: "Nowak" })).toBe(false);
  });
  it("akceptuje prawdziwe imię i nazwisko", () => {
    expect(hasRealClientName({ first_name: "Anna", last_name: "Nowak" })).toBe(true);
  });
});
