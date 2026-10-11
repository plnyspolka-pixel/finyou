// Inwestor jako wierzyciel: rodzaj podmiotu z profilu, oznaczenie strony,
// podpis, braki danych dla pism i wniosków, konflikt z umową, pola DOCX.
import { describe, expect, it } from "vitest";
import {
  buildCreditorParty,
  creditorConflictsWithContract,
  creditorDescription,
  creditorFieldValue,
  creditorMissing,
  creditorMissingMessage,
  creditorNoProfileMessage,
  financeYouCreditor,
  investorEntityVariant,
  type InvestorPartyRow,
} from "./investor-party";
import { extractOrderedFields } from "./document-fields";

const adres = { street: "ul. Polna 5/2", postal_code: "00-001", city: "Warszawa" };

const osoba: InvestorPartyRow = {
  entity_variant: "osoba_fizyczna",
  entity_type: "osoba_fizyczna",
  first_name: "Jan",
  last_name: "Kowalski",
  pesel: "85010112345",
  ...adres,
  email: "jan@example.com",
  phone: "600100200",
  bank_account: "61109010140000071219812874",
};

const jdg: InvestorPartyRow = {
  entity_variant: "jdg",
  first_name: "Anna",
  last_name: "Nowak",
  company_name: "Nowak Finanse",
  nip: "5223456789",
  regon: "123456789",
  ...adres,
};

const spolka: InvestorPartyRow = {
  entity_variant: "osoba_prawna",
  // Wiersz z pipeline'u: kolumna ma DEFAULT 'osoba_fizyczna'.
  entity_type: "osoba_fizyczna",
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
};

describe("buildCreditorParty — rodzaj podmiotu", () => {
  it("osoba fizyczna: imię i nazwisko, adres; PESEL tylko we wnioskach", () => {
    const p = buildCreditorParty(osoba);
    expect(p.kind).toBe("osoba_fizyczna");
    expect(p.source).toBe("investor");
    expect(p.legalName).toBe("Jan Kowalski");
    expect(p.shortName).toBe("Jan Kowalski");
    expect(p.description).toBe("Jan Kowalski, ul. Polna 5/2, 00-001 Warszawa");
    expect(creditorDescription(p, "pismo")).not.toContain("PESEL");
    expect(creditorDescription(p, "wniosek")).toBe(
      "Jan Kowalski, ul. Polna 5/2, 00-001 Warszawa, PESEL 85010112345",
    );
    expect(p.signature).toBe("Jan Kowalski");
    expect(p.headerLines).toEqual(["Jan Kowalski", "ul. Polna 5/2", "00-001 Warszawa"]);
    expect(p.nip).toBeNull();
  });

  it("JDG z właścicielem: „prowadząca działalność gospodarczą pod firmą”, NIP i REGON", () => {
    const p = buildCreditorParty(jdg);
    expect(p.kind).toBe("jdg");
    expect(p.legalName).toBe("Nowak Finanse");
    expect(p.description).toBe(
      "Anna Nowak, prowadząca działalność gospodarczą pod firmą Nowak Finanse, ul. Polna 5/2, 00-001 Warszawa, NIP 5223456789, REGON 123456789",
    );
    expect(p.signature).toBe("Anna Nowak\nwłaściciel\nNowak Finanse");
    expect(p.legalForm).toBe("jednoosobowa działalność gospodarcza");
  });

  it("JDG bez imienia i nazwiska (pipeline ich nie zbiera) — sama firma", () => {
    const p = buildCreditorParty({ ...jdg, first_name: null, last_name: null, regon: null });
    expect(p.description).toBe("Nowak Finanse, ul. Polna 5/2, 00-001 Warszawa, NIP 5223456789");
    expect(p.signature).toBe("Nowak Finanse\nwłaściciel");
    expect(creditorMissing(p, "wniosek")).toEqual([]);
  });

  it("spółka z pipeline'u (entity_type 'osoba_fizyczna', entity_variant 'osoba_prawna')", () => {
    const p = buildCreditorParty(spolka);
    expect(p.kind).toBe("spolka");
    expect(p.legalName).toBe("Kapitał Plus sp. z o.o.");
    expect(p.description).toBe(
      "Kapitał Plus sp. z o.o. z siedzibą w Gdańsku, ul. Długa 1, 80-001 Gdańsk, KRS 0000123456, NIP 7010611803, reprezentowana przez Piotra Zielińskiego (Prezes Zarządu)",
    );
    expect(p.signature).toBe("Piotr Zieliński\nPrezes Zarządu\nKapitał Plus sp. z o.o.");
    expect(p.headerLines).toEqual([
      "Kapitał Plus sp. z o.o.",
      "ul. Długa 1",
      "80-001 Gdańsk",
      "KRS 0000123456",
      "NIP 7010611803",
    ]);
  });

  it("spółka: forma prawna dopisana, gdy nazwa jej nie zawiera; nieznane miasto bez odmiany", () => {
    const p = buildCreditorParty({
      ...spolka,
      company_name: "Kapitał Plus",
      city: "Pcim",
      representative_role:
        "Do reprezentowania spółki uprawniony jest każdy członek zarządu samodzielnie",
    });
    expect(p.description).toMatch(
      /^Kapitał Plus \(spółka z ograniczoną odpowiedzialnością\) z siedzibą w miejscowości Pcim, /,
    );
    // Długi „sposób reprezentacji" z KRS nie trafia do podpisu.
    expect(p.signature).toBe("Piotr Zieliński\nKapitał Plus");
  });

  it("brak entity_variant: firma + KRS → spółka, sama firma → JDG, inaczej osoba fizyczna", () => {
    expect(investorEntityVariant({ company_name: "X sp. z o.o.", krs: "1" })).toBe("osoba_prawna");
    expect(investorEntityVariant({ company_name: "X" })).toBe("jdg");
    expect(investorEntityVariant({ entity_type: "osoba_fizyczna", company_name: "X" })).toBe("jdg");
    expect(investorEntityVariant({ entity_type: "osoba_fizyczna" })).toBe("osoba_fizyczna");
    expect(investorEntityVariant({ entity_type: "firma", krs: "1" })).toBe("osoba_prawna");
    // entity_variant rozstrzyga, nawet gdy w profilu zostały dane firmy.
    expect(investorEntityVariant({ entity_variant: "osoba_fizyczna", company_name: "X" })).toBe(
      "osoba_fizyczna",
    );
  });

  it("starszy profil firmy (entity_type 'firma', bez entity_variant i KRS) — spółka po formie, nazwie, reprezentancie", () => {
    const legacy: InvestorPartyRow = {
      entity_type: "firma",
      entity_variant: null,
      company_name: "ABC sp. z o.o.",
      legal_form: "spółka z ograniczoną odpowiedzialnością",
      representative_first_name: "Jan",
      representative_last_name: "Lis",
      representative_role: "Prezes Zarządu",
      krs: null,
      nip: "5250001009",
      ...adres,
    };
    expect(investorEntityVariant(legacy)).toBe("osoba_prawna");
    const p = buildCreditorParty(legacy);
    expect(p.kind).toBe("spolka");
    expect(p.signature).toBe("Jan Lis\nPrezes Zarządu\nABC sp. z o.o.");
    expect(p.description).toContain("reprezentowana przez Jana Lisa");
    // Wniosek spółki wymaga KRS.
    expect(creditorMissing(p, "wniosek")).toEqual(["numer KRS"]);
    // Każdy sygnał z osobna wystarcza.
    expect(
      investorEntityVariant({ entity_type: "firma", company_name: "Beta Invest sp. z o.o." }),
    ).toBe("osoba_prawna");
    expect(
      investorEntityVariant({
        entity_type: "firma",
        company_name: "Beta",
        legal_form: "spółka akcyjna",
      }),
    ).toBe("osoba_prawna");
    expect(
      investorEntityVariant({
        entity_type: "firma",
        company_name: "Beta",
        representative_last_name: "Lis",
      }),
    ).toBe("osoba_prawna");
    // JDG: forma prawna z GUS albo sama nazwa firmy bez sygnałów spółki.
    expect(
      investorEntityVariant({
        entity_type: "firma",
        company_name: "Usługi Lis",
        legal_form: "Osoba fizyczna prowadząca działalność",
        representative_first_name: "Jan",
      }),
    ).toBe("jdg");
    expect(investorEntityVariant({ entity_type: "firma", company_name: "Usługi Lis" })).toBe("jdg");
  });

  it("spółka nigdy nie niesie PESEL osoby fizycznej (pozostałość po zmianie rodzaju)", () => {
    const p = buildCreditorParty({ ...spolka, pesel: "85010112345" });
    expect(p.pesel).toBeNull();
    const fields = extractOrderedFields("Wierzyciel: [NAZWA WIERZYCIELA], PESEL: [PESEL]");
    expect(fields[1].semantic).toBe("pesel");
    expect(fields.map((f) => creditorFieldValue(f, p))).toEqual(["Kapitał Plus sp. z o.o.", null]);
    // Właściciel JDG to osoba fizyczna — PESEL zostaje.
    const jdgP = buildCreditorParty({ ...jdg, pesel: "85010112345" });
    expect(creditorFieldValue(fields[1], jdgP)).toBe("85010112345");
  });

  it("spółka: skrócona nazwa z pełnej formy prawnej", () => {
    const p = buildCreditorParty({
      ...spolka,
      company_name: "Kapitał Plus spółka z ograniczoną odpowiedzialnością",
    });
    expect(p.shortName).toBe("Kapitał Plus sp. z o.o.");
  });
});

describe("creditorMissing — braki per cel", () => {
  it("pismo: nazwa, ulica, kod, miejscowość; wniosek: PESEL / NIP / KRS", () => {
    const pusty = buildCreditorParty({ entity_variant: "osoba_fizyczna" });
    expect(creditorMissing(pusty, "pismo")).toEqual([
      "imię i nazwisko",
      "ulica i numer",
      "kod pocztowy",
      "miejscowość",
    ]);
    expect(creditorMissing(buildCreditorParty({ ...osoba, pesel: null }), "pismo")).toEqual([]);
    expect(creditorMissing(buildCreditorParty({ ...osoba, pesel: null }), "wniosek")).toEqual([
      "PESEL",
    ]);
    expect(creditorMissing(buildCreditorParty({ ...jdg, nip: null }), "wniosek")).toEqual(["NIP"]);
    expect(
      creditorMissing(buildCreditorParty({ ...spolka, krs: null, nip: null }), "wniosek"),
    ).toEqual(["NIP", "numer KRS"]);
    expect(creditorMissing(buildCreditorParty({ ...spolka, company_name: null }), "pismo")).toEqual(
      ["nazwa firmy"],
    );
  });

  it("komunikat wskazuje zakładkę Profil (ścieżka pomijana, gdy obok jest link)", () => {
    expect(creditorMissingMessage(["kod pocztowy"])).toContain("/inwestor/profil");
    expect(creditorMissingMessage(["kod pocztowy"], false)).toContain("właściciel");
    expect(creditorMissingMessage(["kod pocztowy"], true, false)).toMatch(
      /Uzupełnij je w zakładce Profil\.$/,
    );
    expect(creditorNoProfileMessage(true, false)).not.toContain("/inwestor/profil");
  });
});

describe("financeYouCreditor — sprawy personelu", () => {
  it("dane i reprezentant z COMPANY_DATA", () => {
    const p = financeYouCreditor();
    expect(p.source).toBe("finance_you");
    expect(p.shortName).toBe("Finance You");
    expect(p.legalName).toBe("Finance You sp. z o.o.");
    expect(p.signature).toBe("Filip Bielak\nPrezes Zarządu\nFinance You sp. z o.o.");
    expect(creditorMissing(p, "wniosek")).toEqual([]);
  });
});

describe("creditorConflictsWithContract", () => {
  const p = buildCreditorParty(jdg);
  it("ta sama strona mimo zapisu (wielkość liter, forma prawna, właściciel JDG)", () => {
    expect(creditorConflictsWithContract(p, "")).toBe(false);
    expect(creditorConflictsWithContract(p, "NOWAK FINANSE")).toBe(false);
    expect(creditorConflictsWithContract(p, "Anna Nowak")).toBe(false);
    expect(
      creditorConflictsWithContract(buildCreditorParty(spolka), "Kapitał Plus Spółka z o.o."),
    ).toBe(false);
  });
  it("odwrócona kolejność imienia i nazwiska (umowy, OCR) — ta sama strona", () => {
    const osobaP = buildCreditorParty({ ...osoba, first_name: "Anna", last_name: "Nowak" });
    expect(creditorConflictsWithContract(osobaP, "Nowak Anna")).toBe(false);
    expect(creditorConflictsWithContract(osobaP, "NOWAK ANNA")).toBe(false);
    expect(creditorConflictsWithContract(osobaP, "Nowak Jan")).toBe(true);
  });
  it("inna strona w umowie → konflikt", () => {
    expect(creditorConflictsWithContract(p, "Finance You sp. z o.o.")).toBe(true);
  });
});

describe("creditorFieldValue — pola strony wierzyciela we wzorze DOCX", () => {
  const text =
    "Wierzyciel: [NAZWA WIERZYCIELA], [ADRES WIERZYCIELA], NIP: [NUMER NIP], KRS: [NUMER KRS], REGON: [NUMER REGON], [E-MAIL WIERZYCIELA], [TELEFON WIERZYCIELA], [RACHUNEK WIERZYCIELA]. Dłużnik: [NAZWA DŁUŻNIKA]";
  const fields = extractOrderedFields(text);

  it("spółka: nazwa, adres, NIP, KRS, REGON, e-mail, telefon, rachunek; dłużnik pominięty", () => {
    const p = buildCreditorParty({
      ...spolka,
      email: "biuro@kapital.pl",
      phone: "500600700",
      bank_account: "PL61109010140000071219812874",
    });
    const values = fields.map((f) => creditorFieldValue(f, p));
    expect(values).toEqual([
      "Kapitał Plus sp. z o.o.",
      "ul. Długa 1, 80-001 Gdańsk",
      "7010611803",
      "0000123456",
      "365350668",
      "biuro@kapital.pl",
      "500600700",
      "PL61109010140000071219812874",
      null,
    ]);
  });
});

describe("creditorFieldValue — reprezentant spółki we wzorze DOCX", () => {
  it("długi „sposób reprezentacji” z KRS nie trafia do pola reprezentanta", () => {
    const [, rep] = extractOrderedFields(
      "WIERZYCIEL: [NAZWA WIERZYCIELA], reprezentowana przez [IMIĘ I NAZWISKO REPREZENTANTA]",
    );
    const krotka = buildCreditorParty(spolka);
    expect(creditorFieldValue(rep, krotka)).toBe("Piotr Zieliński — Prezes Zarządu");
    const dluga = buildCreditorParty({
      ...spolka,
      representative_role:
        "Do reprezentowania spółki uprawniony jest każdy członek zarządu samodzielnie",
    });
    expect(creditorFieldValue(rep, dluga)).toBe("Piotr Zieliński");
  });
});
