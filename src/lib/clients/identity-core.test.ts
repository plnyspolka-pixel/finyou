/**
 * Pkt 3 i 9 zlecenia „przypadki graniczne": nazwisko do umowy z CEIDG,
 * dane wrażliwe z dedykowanych pól kartoteki (fikcyjne dane).
 */
import { describe, expect, it } from "vitest";
import type { CeidgActivity } from "@/lib/risk-assessment/types";
import { dopiszPoprzednieNazwisko, porownajZCeidg } from "./identity-core";
import { scalKartotekeDoUmowy, type KartotekaKlienta } from "./kartoteka-umowy";

const ceidg = (over: Partial<CeidgActivity> = {}): CeidgActivity => ({
  available: true,
  queried: "nip",
  isEntrepreneur: true,
  status: "aktywny",
  matchConfidence: "high",
  activeCount: 1,
  company: {
    name: "ANNA JOPEK",
    nip: "1234563218",
    regon: null,
    startDate: "2026-10-07",
    pkdMain: null,
    ownerFirstName: "ANNA",
    ownerLastName: "JOPEK",
    city: "SŁUPSK",
  },
  note: "",
  ...over,
});

describe("porównanie kartoteki z CEIDG", () => {
  it("pewny wpis po NIP, imię zgodne → zmiana nazwiska do zastosowania", () => {
    const r = porownajZCeidg(
      { first_name: "Anna", last_name: "Żukowska", city: "Słupsk" },
      ceidg(),
    );
    expect(r.zmianaNazwiska).toEqual({ z: "Żukowska", na: "Jopek" });
    expect(r.propozycje).toEqual([{ pole: "last_name", obecnie: "Żukowska", z_ceidg: "Jopek" }]);
  });

  it("dopasowanie po nazwisku (niepewne) albo wykreślony wpis → bez zmian", () => {
    expect(
      porownajZCeidg(
        { first_name: "Anna", last_name: "Żukowska" },
        ceidg({ matchConfidence: "low" }),
      ).zmianaNazwiska,
    ).toBeNull();
    expect(
      porownajZCeidg({ first_name: "Anna", last_name: "Żukowska" }, ceidg({ status: "wykreslony" }))
        .zmianaNazwiska,
    ).toBeNull();
  });

  it("inne imię → tylko propozycja, bez automatycznej zmiany nazwiska", () => {
    const r = porownajZCeidg({ first_name: "Maria", last_name: "Żukowska" }, ceidg());
    expect(r.zmianaNazwiska).toBeNull();
    expect(r.propozycje.map((p) => p.pole)).toEqual(["first_name", "last_name"]);
  });

  it("previous_names bez duplikatów", () => {
    expect(dopiszPoprzednieNazwisko(["Żukowska"], "Żukowska", "Jopek")).toEqual(["Żukowska"]);
    expect(dopiszPoprzednieNazwisko([], "Żukowska", "Jopek")).toEqual(["Żukowska"]);
  });
});

describe("kartoteka klienta → szkic umowy", () => {
  const k: KartotekaKlienta = {
    first_name: "Anna",
    last_name: "Jopek",
    pesel: "44051401441",
    nip: "1234563218",
    id_document: "ABC123456",
    payout_account: "25 8011 0008 0010 0150 5299 0002",
    ceidg: ceidg(),
  };

  it("PESEL, dokument, rachunek, nazwisko z CEIDG i data rozpoczęcia JDG", () => {
    const szkic: any = {
      pozyczkobiorca: { typ: "osoba_fizyczna", imie_nazwisko: "Anna Żukowska" },
      warunki: { rachunki: {} },
    };
    const korekty = scalKartotekeDoUmowy(szkic, k);
    expect(szkic.pozyczkobiorca).toMatchObject({
      imie_nazwisko: "Anna Jopek",
      pesel: "44051401441",
      dokument_tozsamosci: "dowód osobisty nr ABC123456",
      data_rozpoczecia_dzialalnosci: "07.10.2026",
    });
    expect(szkic.warunki.rachunki.wyplata).toBe("25 8011 0008 0010 0150 5299 0002");
    expect(korekty.map((x) => x.sciezka)).toContain("pozyczkobiorca.imie_nazwisko");
  });

  it("podane dane nie są nadpisywane", () => {
    const szkic: any = {
      pozyczkobiorca: { typ: "osoba_fizyczna", imie_nazwisko: "Anna Jopek", pesel: "70010112345" },
      warunki: { rachunki: { wyplata: "11 1111" } },
    };
    scalKartotekeDoUmowy(szkic, k);
    expect(szkic.pozyczkobiorca.pesel).toBe("70010112345");
    expect(szkic.warunki.rachunki.wyplata).toBe("11 1111");
  });
});
