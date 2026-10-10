// Auto-uzupełnianie wzorów DOCX danymi sprawy: strona wierzyciela z profilu
// inwestora (nazwa, forma, reprezentant, adres, identyfikatory, kontakt,
// rachunek), strona dłużnika ze sprawy.
import { describe, expect, it } from "vitest";
import { buildWindTemplateValues, type WindFillContext } from "./windykacja-docfill";
import { extractOrderedFields } from "./document-fields";
import { buildCreditorParty } from "./investor-party";

const TEXT =
  "WIERZYCIEL: [NAZWA], forma prawna: [FORMA PRAWNA], reprezentowana przez [IMIĘ I NAZWISKO REPREZENTANTA], " +
  "adres: [ADRES], NIP: [NUMER NIP], REGON: [NUMER REGON], KRS: [NUMER KRS], e-mail: [E-MAIL], " +
  "telefon: [TELEFON], rachunek: [RACHUNEK]. " +
  "DŁUŻNIK: [NAZWA DŁUŻNIKA], [ADRES DŁUŻNIKA]. Kwota: [KWOTA] zł.";

const spolka = buildCreditorParty({
  entity_variant: "osoba_prawna",
  company_name: "Kapitał Plus sp. z o.o.",
  legal_form: "spółka z ograniczoną odpowiedzialnością",
  krs: "0000123456",
  nip: "7010611803",
  regon: "365350668",
  representative_first_name: "Piotr",
  representative_last_name: "Zieliński",
  representative_role: "Prezes Zarządu",
  street: "ul. Długa 1",
  postal_code: "80-001",
  city: "Gdańsk",
  email: "biuro@kapital.pl",
  phone: "500600700",
  bank_account: "PL61109010140000071219812874",
});

const base: WindFillContext = {
  dluznik: "Adam Dłużnik",
  adres: "ul. Krótka 2, 00-002 Warszawa",
  kwota_zalegla: 4000,
  saldo: 72000,
  dataISO: "2026-10-06",
};

function filled(ctx: WindFillContext): Record<string, string> {
  const fields = extractOrderedFields(TEXT);
  const values = buildWindTemplateValues(fields, ctx);
  return Object.fromEntries(fields.map((f) => [f.key, values[f.id] ?? ""]));
}

describe("buildWindTemplateValues — wierzyciel z profilu inwestora", () => {
  it("wszystkie pola wierzyciela z profilu; dłużnik i kwoty ze sprawy", () => {
    const v = filled({ ...base, wierzyciel: spolka });
    expect(v).toMatchObject({
      NAZWA: "Kapitał Plus sp. z o.o.",
      "FORMA PRAWNA": "spółka z ograniczoną odpowiedzialnością",
      "IMIĘ I NAZWISKO REPREZENTANTA": "Piotr Zieliński — Prezes Zarządu",
      ADRES: "ul. Długa 1, 80-001 Gdańsk",
      "NUMER NIP": "7010611803",
      "NUMER REGON": "365350668",
      "NUMER KRS": "0000123456",
      "E-MAIL": "biuro@kapital.pl",
      TELEFON: "500600700",
      RACHUNEK: "PL61109010140000071219812874",
      "NAZWA DŁUŻNIKA": "Adam Dłużnik",
      "ADRES DŁUŻNIKA": "ul. Krótka 2, 00-002 Warszawa",
      KWOTA: "4000,00",
    });
    expect(Object.values(v).join(" ")).not.toMatch(/Finance You|Bielak/);
  });

  it("rachunek do spłaty z umowy sprawy ma pierwszeństwo przed profilem", () => {
    const v = filled({ ...base, wierzyciel: spolka, rachunek: "61 1090 1014 0000 0712 1981 2874" });
    expect(v.RACHUNEK).toBe("61 1090 1014 0000 0712 1981 2874");
  });

  it("bez wierzyciela pola strony wierzyciela zostają puste (nie Finance You)", () => {
    const v = filled(base);
    expect(v.NAZWA).toBe("");
    expect(v["FORMA PRAWNA"]).toBe("");
    expect(v["IMIĘ I NAZWISKO REPREZENTANTA"]).toBe("");
    expect(v["NAZWA DŁUŻNIKA"]).toBe("Adam Dłużnik");
  });
});
