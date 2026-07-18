import { describe, expect, it } from "vitest";
import { renderKwSections, formatKwAmount, type KwExtraction } from "./kw-render";
import { parseKwAddress } from "./kw-address-core";
import {
  extractKwOwnerPersons,
  extractKwOwnerPesels,
  parseMortgages,
} from "./risk-assessment/kw-parser.server";

// Pełna ekstrakcja przykładowej KW — jak z OCR screenów przeglądarki EKW.
const FULL: KwExtraction = {
  kwNumber: "WR1E/00012345/6",
  typKsiegi: "LOKAL STANOWIĄCY ODRĘBNĄ NIERUCHOMOŚĆ",
  sadRejonowy: "SĄD REJONOWY W OLEŚNICY",
  dzial1o: {
    wojewodztwo: "DOLNOŚLĄSKIE",
    powiat: "OLEŚNICKI",
    gmina: "BIERUTÓW",
    miejscowosc: "BIERUTÓW",
    ulica: "ZIELONA",
    numerBudynku: "11",
    numerLokalu: "5",
    obszar: "45,5000 M2",
    kondygnacja: 2,
    liczbaKondygnacji: 4,
  },
  dzial2: {
    wlasciciele: [
      {
        imiePierwsze: "MICHAŁ",
        imieDrugie: "JAN",
        nazwisko: "SZPAK",
        imieOjca: "ANDRZEJ",
        imieMatki: "EWA",
        pesel: "44051401359", // poprawny PESEL testowy
        udzial: "1/1",
      },
    ],
  },
  dzial3: { brakWpisu: true, wpisy: [] },
  dzial4: {
    brakWpisu: false,
    hipoteki: [
      {
        numer: "1",
        rodzaj: "HIPOTEKA UMOWNA",
        sumaKwota: 300000,
        walutaSumy: "ZŁ",
        wierzyciel: "BANK SPÓŁDZIELCZY W OLEŚNICY",
        tresc: "Zabezpieczenie kredytu mieszkaniowego",
      },
    ],
  },
};

describe("renderKwSections — round-trip przez parsery kw_documents", () => {
  const sections = renderKwSections(FULL);

  it("adres z działu I-O czyta się parserem kw-address (jak treść z CMD)", () => {
    const a = parseKwAddress(sections.dzial_1o);
    expect(a.city).toBe("Bierutów");
    expect(a.voivodeship).toBe("Dolnośląskie");
    expect(a.fullAddress).toBe("Zielona 11/5, Bierutów");
  });

  it("właściciel i PESEL z działu II czytają się parserami działu II", () => {
    expect(extractKwOwnerPersons(sections.dzial_2)).toEqual([
      { firstName: "MICHAŁ", lastName: "SZPAK" },
    ]);
    expect(extractKwOwnerPesels(sections.dzial_2)).toEqual([
      { pesel: "44051401359", ownerName: "MICHAŁ SZPAK" },
    ]);
  });

  it("hipoteka z działu IV czyta się parserem hipotek (kwota, waluta, wierzyciel)", () => {
    const m = parseMortgages(sections.dzial_4);
    expect(m).toHaveLength(1);
    expect(m[0].amount).toBe(300000);
    expect(m[0].currency).toBe("PLN");
    expect(m[0].creditor).toContain("BANK SPÓŁDZIELCZY");
  });

  it("pusty dział III renderuje się jako BRAK WPISU (bez hipotek-widmo)", () => {
    expect(sections.dzial_3).toContain("BRAK WPISU");
    expect(parseMortgages(sections.dzial_3)).toEqual([]);
  });

  it("okładka oznacza źródło OCR", () => {
    expect(sections.okladka).toContain("OCR");
    expect(sections.okladka).toContain("WR1E/00012345/6");
  });
});

describe("renderKwSections — sekcje nieobjęte screenami", () => {
  it("brakujący dział zostaje null i generuje ostrzeżenie (a nie 'brak wpisów')", () => {
    const s = renderKwSections({ kwNumber: "WR1E/00012345/6", dzial2: FULL.dzial2 });
    expect(s.dzial_4).toBeNull();
    expect(s.dzial_1o).toBeNull();
    expect(s.warnings.join(" ")).toMatch(/działu IV/);
    expect(s.warnings.join(" ")).toMatch(/działu I-O/);
  });

  it("dział IV z 'brakWpisu' renderuje BRAK WPISU zamiast null", () => {
    const s = renderKwSections({ dzial4: { brakWpisu: true } });
    expect(s.dzial_4).toContain("BRAK WPISU");
  });
});

describe("formatKwAmount", () => {
  it("formatuje kwoty w konwencji EKW", () => {
    expect(formatKwAmount(300000)).toBe("300 000,00");
    expect(formatKwAmount(1234567.5)).toBe("1 234 567,50");
  });
});
