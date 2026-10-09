/**
 * Regresja „przypadków granicznych" z wniosku słupskiego (KW SL1S/00061444/8,
 * październik 2026): pusty dział III („Wpisy | BRAK WPISU") nie może dawać
 * fantomowego obciążenia, a brak sądu w treści KW uzupełnia słownik kodów
 * wydziałów. Dane osobowe w teście są fikcyjne.
 */
import { describe, expect, it } from "vitest";
import { renderKwSections, type KwExtraction } from "./kw-render";
import { kwDocumentToExtraction } from "./kw-extraction";
import { easyMkwJsonToExtraction } from "./kw-easymkw-map";
import { mapujKwDoNieruchomosci } from "./contract-engine/kw-mapper";
import { jestBrakWpisu, parseEncumbrances, parseMortgages } from "./risk-assessment/kw-parse-core";
import { KW_COURT_CODES, kodWydzialuKw, sadZKodu } from "./kw-court-codes";

const PESEL = "44051401359";

const slupsk: KwExtraction = {
  kwNumber: "SL1S/00061444/8",
  typKsiegi: "LOKAL STANOWIĄCY ODRĘBNĄ NIERUCHOMOŚĆ",
  sadRejonowy: null,
  dzial1o: {
    wojewodztwo: "pomorskie",
    miejscowosc: "Słupsk",
    ulica: "Powstańców Warszawskich",
    numerBudynku: "1",
    numerLokalu: "7",
    przeznaczenie: "lokal mieszkalny",
    obszar: "30,60 M2",
  },
  dzial2: { wlasciciele: [{ imiePierwsze: "Anna", nazwisko: "Testowa", pesel: PESEL }] },
  dzial3: { brakWpisu: true, wpisy: [] },
  dzial4: { brakWpisu: true, hipoteki: [] },
};

describe("jestBrakWpisu — wspólna normalizacja pustego działu", () => {
  it.each([
    "Wpisy | BRAK WPISU",
    "<table><tr><td>Wpisy</td><td>BRAK WPISU</td></tr></table>",
    "brak wpisu",
    "BRAK WPISÓW",
    "---",
    "",
    "TREŚĆ KSIĘGI WIECZYSTEJ NR SL1S/00061444/8 DZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA Wpisy BRAK WPISU",
    "DZIAŁ IV - HIPOTEKA Lp. BRAK WPISU",
  ])("%j → pusty", (t) => expect(jestBrakWpisu(t)).toBe(true));

  it.each([
    "SŁUŻEBNOŚĆ OSOBISTA na rzecz Anny Nowak",
    "Numer hipoteki 1 Rodzaj hipoteki HIPOTEKA UMOWNA Suma 100 000,00",
    "Wpisy BRAK WPISU; ostrzeżenie o niezgodności",
  ])("%j → wpis", (t) => expect(jestBrakWpisu(t)).toBe(false));

  it("parsery działów III i IV nie tworzą wpisów z „BRAK WPISU”", () => {
    expect(parseEncumbrances("Wpisy | BRAK WPISU").encumbrances).toEqual([]);
    expect(parseMortgages("<td>Wpisy</td><td>BRAK WPISU</td>")).toEqual([]);
  });
});

describe("SL1S/00061444/8 — pusty dział III i brak sądu", () => {
  const html = renderKwSections(slupsk);
  const ekstrakcja = kwDocumentToExtraction({ kwNumber: slupsk.kwNumber, ...html });

  it("dział III pusty, brakWpisu = true", () => {
    expect(ekstrakcja.dzial3?.brakWpisu).toBe(true);
    expect(ekstrakcja.dzial3?.wpisy).toEqual([]);
    expect(ekstrakcja.dzial4?.brakWpisu).toBe(true);
  });

  it("mapper umowy: brak fantomowego obciążenia i ostrzeżenia o nierozpoznanym wpisie", () => {
    const r = mapujKwDoNieruchomosci(ekstrakcja, {
      id: "N1",
      pozyczkobiorcaPesele: [PESEL],
    });
    expect(r.nieruchomosc.obciazenia).toEqual([]);
    expect(r.ostrzezenia.join("\n")).not.toMatch(/Nierozpoznany rodzaj wpisu/);
  });

  it("stara ekstrakcja z wpisem „Wpisy BRAK WPISU” nie daje obciążenia", () => {
    const r = mapujKwDoNieruchomosci(
      {
        ...slupsk,
        dzial3: {
          brakWpisu: false,
          wpisy: [{ rodzaj: "Wpisy BRAK WPISU", tresc: "Wpisy BRAK WPISU" }],
        },
      },
      { id: "N1", pozyczkobiorcaPesele: [PESEL] },
    );
    expect(r.nieruchomosc.obciazenia).toEqual([]);
    expect(r.ostrzezenia.join("\n")).not.toMatch(/Nierozpoznany/);
  });

  it("EasyMKW: wpis „BRAK WPISU” w JSON-ie to pusty dział", () => {
    const x = easyMkwJsonToExtraction({
      nrKsiegiWieczystej: "SL1S/00061444/8",
      dzial3: { wpisy: [{ rodzajWpisu: "BRAK WPISU" }] },
    });
    expect(x.dzial3).toEqual({ brakWpisu: true, wpisy: [] });
  });

  it("sąd: okładka EasyMKW z wierszem „Sąd rejonowy” jest odczytywana", () => {
    const z = renderKwSections({ ...slupsk, sadRejonowy: "Sąd Rejonowy w Słupsku" });
    const x = kwDocumentToExtraction({ kwNumber: slupsk.kwNumber, ...z });
    expect(x.sadRejonowy).toBe("Sąd Rejonowy w Słupsku");
  });
});

describe("słownik kodów wydziałów KW (kw_court_codes)", () => {
  it("pełny wykaz z rozporządzenia (345 kodów)", () => {
    expect(Object.keys(KW_COURT_CODES)).toHaveLength(345);
  });
  it("SL1S → Sąd Rejonowy w Słupsku, LU1I → Lublin-Zachód", () => {
    expect(sadZKodu("SL1S/00061444/8")).toBe("Sąd Rejonowy w Słupsku");
    expect(sadZKodu("lu1i/00012345/6")).toBe("Sąd Rejonowy Lublin-Zachód w Lublinie");
  });
  it("wydział zamiejscowy dopisany po przecinku; nieznany kod → null", () => {
    expect(sadZKodu("GD2I/00000001/1")).toBe(
      "Sąd Rejonowy w Kwidzynie, Wydział Zamiejscowy z siedzibą w Sztumie",
    );
    expect(sadZKodu("XX9X/00000001/1")).toBeNull();
    expect(kodWydzialuKw("  wa4m/1/1")).toBe("WA4M");
  });
});
