/**
 * Test mostka KW: surowe działy HTML → KwExtraction → (mapper) nieruchomość.
 * Domyka łańcuch 3.3.1 + 3.3.2 na danych w formacie EKW/CMD KW Engine.
 */
import { describe, it, expect } from "vitest";
import { kwDocumentToExtraction } from "./kw-extraction";
import { mapujKwDoNieruchomosci } from "./contract-engine/kw-mapper";
import { parsePesel } from "./risk-assessment/pesel";

const PESEL = "44051401359"; // poprawny wg sumy kontrolnej

const doc = {
  kwNumber: null,
  okladka:
    "TREŚĆ KSIĘGI WIECZYSTEJ NR LU1I/00012345/6 prowadzonej przez SĄD REJONOWY W LUBLINIE, X WYDZIAŁ KSIĄG WIECZYSTYCH NIERUCHOMOŚĆ GRUNTOWA",
  dzial_1o:
    "<table>DZIAŁ I-O OZNACZENIE NIERUCHOMOŚCI Numer działki 145/2 Obręb Kalinówka Województwo LUBELSKIE Miejscowość LUBLIN Ulica POLNA Sposób korzystania B - tereny mieszkaniowe Obszar 0,0450 HA</table>",
  dzial_2: `<table>DZIAŁ II WŁAŚCICIEL Imię pierwsze JAN Nazwisko KOWALSKI PESEL ${PESEL} Udział 1/1</table>`,
  dzial_3:
    "<table>DZIAŁ III SŁUŻEBNOŚĆ OSOBISTA na rzecz Anny Nowak dożywotnie prawo mieszkania.</table>",
  dzial_4:
    "<table>DZIAŁ IV Numer hipoteki 1 Rodzaj hipoteki HIPOTEKA UMOWNA Suma 142 350,00 Waluta sumy ZŁ Wierzyciel hipoteczny Nazwa BANK SPÓŁDZIELCZY W LUBLINIE</table>",
};

describe("kwDocumentToExtraction (3.3.1)", () => {
  const kw = kwDocumentToExtraction(doc);

  it("PESEL testowy jest poprawny", () => expect(parsePesel(PESEL).valid).toBe(true));
  it("odczytuje numer KW, sąd i typ księgi", () => {
    expect(kw.kwNumber).toBe("LU1I/00012345/6");
    expect(kw.sadRejonowy).toBe("SĄD REJONOWY W LUBLINIE");
    expect(kw.typKsiegi).toBe("NIERUCHOMOŚĆ GRUNTOWA");
  });
  it("wyciąga właściciela z PESEL-em (dział II)", () => {
    expect(kw.dzial2?.wlasciciele?.[0]).toMatchObject({
      imiePierwsze: "JAN",
      nazwisko: "KOWALSKI",
      pesel: PESEL,
    });
  });
  it("wyciąga działki i lokalizację (dział I-O)", () => {
    expect(kw.dzial1o?.dzialki).toEqual([{ numer: "145/2" }]);
    expect(kw.dzial1o?.miejscowosc).toBe("Lublin");
  });
  it("wyciąga wpis działu III i hipotekę działu IV", () => {
    expect(kw.dzial3?.wpisy?.length).toBe(1);
    const h = kw.dzial4?.hipoteki?.[0];
    expect(h?.sumaKwota).toBe(142350);
    expect(h?.walutaSumy).toBe("PLN");
    expect(h?.wierzyciel).toContain("BANK SPÓŁDZIELCZY");
  });
});

describe("łańcuch most → mapper (3.3.1 + 3.3.2)", () => {
  it("produkuje poprawną nieruchomość silnika", () => {
    const kw = kwDocumentToExtraction(doc);
    const res = mapujKwDoNieruchomosci(kw, {
      id: "N1",
      pozyczkobiorcaPesele: [PESEL],
      poreczicielPesel: null,
    });
    expect(res.odrzucona).toBe(false);
    expect(res.nieruchomosc.wlasciciel_ref).toBe("pozyczkobiorca");
    const dzialy = res.nieruchomosc.obciazenia.map(
      (o: { dzial: string; rodzaj: string }) => `${o.dzial}:${o.rodzaj}`,
    );
    expect(dzialy).toContain("III:sluzebnosc_osobista");
    expect(dzialy).toContain("IV:hipoteka_umowna");
  });
});
