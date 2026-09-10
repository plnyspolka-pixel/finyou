import { describe, it, expect } from "vitest";
import { buildClientLeadPayload } from "./meta-leads-client-forward.server";
import { extractPhone, cleanName, extractField, normPhone, splitName } from "./meta-lead-fields";

describe("odczyt pól formularza Meta", () => {
  it("wyciąga telefon z pola telefonu", () => {
    const fd = [{ name: "phone_number", values: ["+48 600 100 200"] }];
    expect(extractPhone(fd)).toBe("+48 600 100 200");
  });

  it("znajduje telefon wklejony w imię, gdy nie ma pola telefonu", () => {
    const fd = [{ name: "full_name", values: ["Gadek 691586905"] }];
    expect(extractPhone(fd)).toBe("691586905");
  });

  it("czyści numer wklejony w nazwisko", () => {
    expect(cleanName("Gadek691586905")).toBe("Gadek");
  });

  it("dopasowuje pole po fragmencie nazwy", () => {
    const fd = [{ name: "email_address", values: ["jan@example.pl"] }];
    expect(extractField(fd, ["email"])).toBe("jan@example.pl");
    expect(extractField(fd, ["telefon"])).toBeNull();
  });

  it("normalizuje polski numer do formatu międzynarodowego", () => {
    expect(normPhone("600100200")).toBe("+48600100200");
    expect(normPhone("+48600100200")).toBe("+48600100200");
  });

  it("rozdziela imię i nazwisko", () => {
    expect(splitName("Jan Kowalski")).toEqual({ first: "Jan", last: "Kowalski" });
    expect(splitName("")).toEqual({ first: "Lead", last: "Meta" });
  });
});

describe("lead dla panelu klienta", () => {
  const lead = {
    id: 123456789,
    created_time: "2026-09-10T12:00:00+0000",
    form_id: "form-1",
    campaign_id: "camp-1",
    ad_id: "ad-1",
    field_data: [
      { name: "full_name", values: ["Jan Kowalski"] },
      { name: "phone_number", values: ["600100200"] },
      { name: "email", values: ["jan@example.pl"] },
    ],
  };

  it("przenosi imię, kontakt i identyfikatory kampanii", () => {
    const p = buildClientLeadPayload(lead);
    expect(p.meta_lead_id).toBe("123456789");
    expect(p.imie).toBe("Jan Kowalski");
    expect(p.telefon).toBe("600100200");
    expect(p.email).toBe("jan@example.pl");
    expect(p.kampania_id).toBe("camp-1");
    expect(p.reklama_id).toBe("ad-1");
    expect(p.formularz_id).toBe("form-1");
  });

  it("dokłada komplet odpowiedzi z formularza", () => {
    const p = buildClientLeadPayload(lead);
    expect(p.pola).toEqual([
      { nazwa: "full_name", wartosc: "Jan Kowalski" },
      { nazwa: "phone_number", wartosc: "600100200" },
      { nazwa: "email", wartosc: "jan@example.pl" },
    ]);
  });

  it("radzi sobie z leadem bez odpowiedzi", () => {
    const p = buildClientLeadPayload({ id: "1" });
    expect(p.imie).toBeNull();
    expect(p.telefon).toBeNull();
    expect(p.email).toBeNull();
    expect(p.pola).toEqual([]);
    expect(p.utworzono).toBeTruthy();
  });
});
