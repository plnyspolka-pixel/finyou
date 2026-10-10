// Pisma windykacyjne w imieniu inwestora: nagłówek, treść i podpis z profilu
// wierzyciela; Finance You wyłącznie jako wierzyciel spraw personelu.
import { describe, expect, it } from "vitest";
import { buildWindDocument, windCreditorPurpose, type DocContext } from "./windykacja-documents";
import { buildCreditorParty, financeYouCreditor } from "./investor-party";
import type { WindDocumentType } from "./windykacja-procedure";

const TYPES: WindDocumentType[] = [
  "wezwanie",
  "wypowiedzenie",
  "wniosek_klauzula",
  "wniosek_komornik",
  "aneks",
  "porozumienie",
  "ugoda",
  "zawiadomienie_286",
  "zawiadomienie_297",
  "notatka",
];

const osoba = buildCreditorParty({
  entity_variant: "osoba_fizyczna",
  first_name: "Jan",
  last_name: "Kowalski",
  pesel: "85010112345",
  street: "ul. Polna 5/2",
  postal_code: "30-001",
  city: "Kraków",
});

const spolka = buildCreditorParty({
  entity_variant: "osoba_prawna",
  company_name: "Kapitał Plus sp. z o.o.",
  krs: "0000123456",
  nip: "7010611803",
  representative_first_name: "Piotr",
  representative_last_name: "Zieliński",
  representative_role: "Prezes Zarządu",
  street: "ul. Długa 1",
  postal_code: "80-001",
  city: "Gdańsk",
});

const ctx = (over: Partial<DocContext> = {}): DocContext => ({
  wierzyciel: osoba,
  dluznik: "Adam Dłużnik",
  adres: "ul. Krótka 2, 00-002 Warszawa",
  numer_umowy: "FY/2026/0042",
  data_umowy: "2026-03-01",
  kwota_zalegla: 4000,
  saldo_pozostale: 72000,
  data: "2026-10-06T10:00:00Z",
  ...over,
});

describe("buildWindDocument — wierzyciel z profilu inwestora", () => {
  it.each(TYPES)("%s: bez Finance You i bez podpisu zarządu Finance You", (typ) => {
    const { tresc } = buildWindDocument(typ, ctx());
    expect(tresc).not.toMatch(/Finance You|Bielak/);
    expect(tresc).toContain("Wierzyciel: Jan Kowalski");
    expect(tresc.startsWith("Kraków, dnia 06.10.2026")).toBe(true);
  });

  it("osoba fizyczna: „Działając jako pożyczkodawca”, podpis imieniem i nazwiskiem", () => {
    const { tresc } = buildWindDocument("wezwanie", ctx());
    expect(tresc).toContain("Działając jako pożyczkodawca, w związku z umowy pożyczki nr");
    expect(tresc.endsWith("Z poważaniem,\n\nJan Kowalski")).toBe(true);
    // PESEL wierzyciela nie trafia do pisma do dłużnika.
    expect(tresc).not.toContain("85010112345");
  });

  it("wnioski i zawiadomienia identyfikują wierzyciela (osoba fizyczna z PESEL)", () => {
    const klauzula = buildWindDocument("wniosek_klauzula", ctx()).tresc;
    expect(klauzula).toContain(
      "Wnioskodawca (wierzyciel): Jan Kowalski, ul. Polna 5/2, 30-001 Kraków, PESEL 85010112345.",
    );
    expect(buildWindDocument("wniosek_komornik", ctx()).tresc).toContain(
      "Wierzyciel: Jan Kowalski, ul. Polna 5/2, 30-001 Kraków, PESEL 85010112345.",
    );
    const z286 = buildWindDocument("zawiadomienie_286", ctx()).tresc;
    expect(z286).toContain("Pokrzywdzony: Jan Kowalski, ul. Polna 5/2");
    expect(z286).toContain("na szkodę Jan Kowalski.");
  });

  it("spółka: „Działając w imieniu …”, podpis reprezentanta, strony ugody", () => {
    const wez = buildWindDocument("wezwanie", ctx({ wierzyciel: spolka })).tresc;
    expect(wez).toContain("Działając w imieniu Kapitał Plus sp. z o.o., w związku z");
    expect(wez).toContain("KRS 0000123456\nNIP 7010611803");
    expect(wez.endsWith("Piotr Zieliński\nPrezes Zarządu\nKapitał Plus sp. z o.o.")).toBe(true);
    expect(buildWindDocument("ugoda", ctx({ wierzyciel: spolka })).tresc).toContain(
      "Strony: Kapitał Plus sp. z o.o. (wierzyciel) oraz Adam Dłużnik (dłużnik)",
    );
  });

  it("Finance You tylko jako wierzyciel sprawy personelu (reprezentant z COMPANY_DATA)", () => {
    const { tresc } = buildWindDocument("wezwanie", ctx({ wierzyciel: financeYouCreditor() }));
    expect(tresc).toContain("Działając w imieniu Finance You sp. z o.o.");
    expect(tresc.startsWith("Warszawa, dnia")).toBe(true);
    expect(tresc.endsWith("Filip Bielak\nPrezes Zarządu\nFinance You sp. z o.o.")).toBe(true);
  });

  it("brak miejscowości w profilu → miejscowość z kontekstu albo Warszawa", () => {
    const bezMiasta = { ...osoba, city: "" };
    expect(buildWindDocument("notatka", ctx({ wierzyciel: bezMiasta })).tresc).toMatch(
      /^Warszawa, dnia/,
    );
    expect(
      buildWindDocument("notatka", ctx({ wierzyciel: bezMiasta, miejscowosc: "Łódź" })).tresc,
    ).toMatch(/^Łódź, dnia/);
  });
});

describe("windCreditorPurpose", () => {
  it("wnioski i zawiadomienia — „wniosek”, notatka — bez wymagań, reszta — „pismo”", () => {
    expect(windCreditorPurpose("wniosek_klauzula")).toBe("wniosek");
    expect(windCreditorPurpose("wniosek_komornik")).toBe("wniosek");
    expect(windCreditorPurpose("zawiadomienie_286")).toBe("wniosek");
    expect(windCreditorPurpose("zawiadomienie_297")).toBe("wniosek");
    expect(windCreditorPurpose("notatka")).toBeNull();
    expect(windCreditorPurpose("wezwanie")).toBe("pismo");
    expect(windCreditorPurpose("ugoda")).toBe("pismo");
  });
});
