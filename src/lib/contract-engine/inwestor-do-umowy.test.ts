// Profil inwestora → Pożyczkodawca w umowie: kreator bierze wszystko,
// co system już wie, i nie wpisuje tego, czego w profilu nie ma.
import { describe, expect, it } from "vitest";
import {
  adresInwestora,
  dolaczProfilInwestoraDoSzkicu,
  inwestorDoProfiluKlienta,
  pozyczkodawcaZProfilu,
  scalPozyczkodawce,
} from "./inwestor-do-umowy";

const spolka = {
  entity_variant: "osoba_prawna",
  company_name: "Kapitał Sp. z o.o.",
  legal_form: "Spółka z ograniczoną odpowiedzialnością",
  krs: "0000123456",
  nip: "123-456-32-18",
  regon: "123456789",
  street: "ul. Przykładowa 1",
  postal_code: "30-001",
  city: "Kraków",
  email: "biuro@kapital.pl",
  phone: "+48 600 100 200",
  representative_first_name: "Anna",
  representative_last_name: "Prezes",
  representative_role: "Prezes Zarządu",
  bank_account: "PL61109010140000071219812874",
};

describe("pozyczkodawcaZProfilu", () => {
  it("osoba prawna: nazwa, forma, identyfikatory, adres, reprezentacja", () => {
    const p = pozyczkodawcaZProfilu(spolka);
    expect(p).toMatchObject({
      typ: "podmiot_gospodarczy",
      nazwa: "Kapitał Sp. z o.o.",
      forma_prawna: "Spółka z ograniczoną odpowiedzialnością",
      forma: "sp_z_oo",
      krs: "0000123456",
      nip: "1234563218", // same cyfry — format schematu
      regon: "123456789",
      adres: "ul. Przykładowa 1, 30-001 Kraków",
      telefon: "+48 600 100 200",
      email: "biuro@kapital.pl",
    });
    expect(p.reprezentacja).toEqual([{ imie_nazwisko: "Anna Prezes", funkcja: "Prezes Zarządu" }]);
  });

  it("osoba fizyczna: imię i nazwisko + PESEL, bez pól firmowych", () => {
    const p = pozyczkodawcaZProfilu({
      entity_variant: "osoba_fizyczna",
      first_name: "Jan",
      last_name: "Inwestor",
      pesel: "80010112345",
      address: "ul. Krótka 2",
      city: "Warszawa",
      postal_code: "00-001",
    });
    expect(p).toEqual({
      typ: "osoba_fizyczna",
      imie_nazwisko: "Jan Inwestor",
      pesel: "80010112345",
      adres: "ul. Krótka 2, 00-001 Warszawa",
    });
  });

  it("JDG: osoba fizyczna z firmą, NIP-em i REGON-em", () => {
    const p = pozyczkodawcaZProfilu({
      entity_variant: "jdg",
      first_name: "Ewa",
      last_name: "Przedsiębiorcza",
      company_name: "Ewa Przedsiębiorcza Finanse",
      nip: "1234563218",
      regon: "12345678901234",
      street: "ul. Długa 5",
      city: "Gdańsk",
    });
    expect(p).toMatchObject({
      typ: "osoba_fizyczna",
      firma: "Ewa Przedsiębiorcza Finanse",
      nip: "1234563218",
      regon: "12345678901234",
      adres: "ul. Długa 5, Gdańsk",
    });
  });

  it("identyfikatory o błędnej długości pomija (zamiast psuć walidację)", () => {
    const p = pozyczkodawcaZProfilu({
      entity_variant: "osoba_prawna",
      company_name: "Spółka",
      nip: "123",
      krs: "12",
      regon: "1",
      street: "ul. A 1",
    });
    expect(p.nip).toBeUndefined();
    expect(p.krs).toBeUndefined();
    expect(p.regon).toBeUndefined();
  });

  it("profil bez nazwy strony → null (nie ma czym wypełniać umowy)", () => {
    expect(pozyczkodawcaZProfilu(null)).toBeNull();
    expect(pozyczkodawcaZProfilu({ entity_variant: "osoba_fizyczna", city: "Łódź" })).toBeNull();
    expect(pozyczkodawcaZProfilu({ entity_variant: "osoba_prawna", city: "Łódź" })).toBeNull();
  });
});

describe("dolaczProfilInwestoraDoSzkicu", () => {
  it("wpisuje Pożyczkodawcę i rachunek do spłaty do pustego szkicu", () => {
    const szkic = dolaczProfilInwestoraDoSzkicu({}, spolka);
    expect(szkic.pozyczkodawca.nazwa).toBe("Kapitał Sp. z o.o.");
    expect(szkic.warunki.rachunki.splata).toBe("PL61109010140000071219812874");
  });

  it("nie nadpisuje rachunku do spłaty wpisanego w rozmowie", () => {
    const szkic = dolaczProfilInwestoraDoSzkicu(
      { warunki: { rachunki: { splata: "PL10105000997603123456789123" } } },
      spolka,
    );
    expect(szkic.warunki.rachunki.splata).toBe("PL10105000997603123456789123");
  });

  it("dane z rozmowy mają pierwszeństwo nad profilem (pole po polu)", () => {
    const szkic = dolaczProfilInwestoraDoSzkicu(
      { pozyczkodawca: { typ: "podmiot_gospodarczy", adres: "ul. Nowa 9, 00-002 Warszawa" } },
      spolka,
    );
    expect(szkic.pozyczkodawca.adres).toBe("ul. Nowa 9, 00-002 Warszawa");
    expect(szkic.pozyczkodawca.nazwa).toBe("Kapitał Sp. z o.o.");
    expect(szkic.pozyczkodawca.krs).toBe("0000123456");
  });

  it("nie modyfikuje przekazanego szkicu", () => {
    const wejscie: Record<string, unknown> = {};
    dolaczProfilInwestoraDoSzkicu(wejscie, spolka);
    expect(wejscie).toEqual({});
  });

  it("pusty profil nic nie zmienia", () => {
    expect(dolaczProfilInwestoraDoSzkicu({}, null)).toEqual({});
    expect(dolaczProfilInwestoraDoSzkicu({}, {})).toEqual({});
  });
});

describe("scalPozyczkodawce", () => {
  const profil = pozyczkodawcaZProfilu({
    entity_variant: "osoba_fizyczna",
    first_name: "Jan",
    last_name: "Inwestor",
    pesel: "80010112345",
    street: "ul. Krótka 2",
  });

  it("inny rodzaj strony w szkicu → nie mieszamy pól (schemat jest strict)", () => {
    const spolkaZeSzkicu = { typ: "podmiot_gospodarczy", nazwa: "Inna Sp. z o.o." };
    expect(scalPozyczkodawce(profil, spolkaZeSzkicu)).toEqual(spolkaZeSzkicu);
    // także gdy szkic nie podał „typ", a ma pola wyłącznie podmiotowe
    expect(scalPozyczkodawce(profil, { nazwa: "Inna Sp. z o.o." })).toEqual({
      nazwa: "Inna Sp. z o.o.",
    });
  });

  it("pusty szkic → sam profil; brak profilu → sam szkic", () => {
    expect(scalPozyczkodawce(profil, undefined)).toEqual(profil);
    expect(scalPozyczkodawce(profil, {})).toEqual(profil);
    expect(scalPozyczkodawce(null, { nazwa: "X" })).toEqual({ nazwa: "X" });
    expect(scalPozyczkodawce(null, undefined)).toBeNull();
  });

  it("puste wartości ze szkicu nie wymazują danych z profilu", () => {
    const out = scalPozyczkodawce(profil, { typ: "osoba_fizyczna", telefon: "" });
    expect(out.imie_nazwisko).toBe("Jan Inwestor");
    expect(out.pesel).toBe("80010112345");
  });
});

describe("inwestorDoProfiluKlienta", () => {
  it("przepisuje wszystkie dostępne dane, pomija puste", () => {
    const inv = inwestorDoProfiluKlienta(spolka);
    expect(inv).toMatchObject({
      companyName: "Kapitał Sp. z o.o.",
      entityVariant: "osoba_prawna",
      nip: "1234563218",
      krs: "0000123456",
      regon: "123456789",
      legalForm: "Spółka z ograniczoną odpowiedzialnością",
      address: "ul. Przykładowa 1, 30-001 Kraków",
      bankAccount: "PL61109010140000071219812874",
      representativeName: "Anna Prezes",
      representativeRole: "Prezes Zarządu",
    });
    expect("fullName" in inv).toBe(false); // spółka nie ma imienia i nazwiska
    expect("pesel" in inv).toBe(false);
  });

  it("brak profilu → brak danych", () => {
    expect(inwestorDoProfiluKlienta(null)).toEqual({});
  });
});

describe("adresInwestora", () => {
  it("składa ulicę z kodem i miastem; braki pomija", () => {
    expect(adresInwestora({ street: "ul. A 1", postal_code: "00-001", city: "Warszawa" })).toBe(
      "ul. A 1, 00-001 Warszawa",
    );
    expect(adresInwestora({ address: "ul. B 2" })).toBe("ul. B 2");
    expect(adresInwestora({ city: "Kraków" })).toBe("Kraków");
    expect(adresInwestora({})).toBe("");
  });
});
