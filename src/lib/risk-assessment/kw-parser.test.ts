import { describe, expect, it } from "vitest";
import {
  extractKwOwnerPersons,
  extractKwOwnerPesels,
  parseMortgages,
  parseKwPropertyParams,
} from "./kw-parser.server";

describe("parseKwPropertyParams — dział I-O KW", () => {
  it("czyta lokal mieszkalny: powierzchnia użytkowa, liczba izb, rodzaj", () => {
    const html =
      "<table><tr><td>Przeznaczenie lokalu</td><td>LOKAL MIESZKALNY</td></tr>" +
      "<tr><td>Pole powierzchni użytkowej lokalu</td><td>45,50 m2</td></tr>" +
      "<tr><td>Liczba izb</td><td>3</td></tr></table>";
    const p = parseKwPropertyParams(html);
    expect(p.usableAreaM2).toBe(45.5);
    expect(p.roomCount).toBe(3);
    expect(p.kind).toContain("lokal mieszkalny");
  });

  it("czyta działkę: obszar w ha i sposób korzystania", () => {
    const html =
      "<table><tr><td>Obszar</td><td>0,4500 HA</td></tr>" +
      "<tr><td>Sposób korzystania</td><td>B - tereny mieszkaniowe</td></tr></table>";
    const p = parseKwPropertyParams(html);
    expect(p.landAreaHa).toBe(0.45);
    expect(p.landAreaM2).toBe(4500);
    expect(p.landUse).toContain("tereny mieszkaniowe");
  });

  // Regresja: realny układ EKW (KW z Bierutowa) — długa etykieta powierzchni
  // („wraz z powierzchnią pomieszczeń przynależnych"), rodzaj przed „Opis lokalu",
  // liczba pokoi tylko w opisie izb. Wcześniej: usableAreaM2 = null → wycena no_data.
  it("czyta lokal z długą etykietą powierzchni i opisem izb (układ EKW)", () => {
    const html =
      "Przeznaczenie lokalu LOKAL MIESZKALNY " +
      "Opis lokalu (rodzaj izby - liczba) POKÓJ - 3, KUCHNIA - 1, ŁAZIENKA - 1, PRZEDPOKÓJ - 1, GARDEROBA - 1 " +
      "Opis pomieszczeń przynależnych (rodzaj pomieszczenia - liczba) KOMÓRKA LOK. NR 19 O POW. 4,29 M2 - 1 " +
      "Kondygnacja 3,0 " +
      "Odrębność (lokal stanowi odrębną nieruchomość) TAK " +
      "Pole powierzchni użytkowej lokalu wraz z powierzchnią pomieszczeń przynależnych 64,5100 M2";
    const p = parseKwPropertyParams(html);
    expect(p.usableAreaM2).toBe(64.51);
    expect(p.kind).toBe("lokal mieszkalny");
    expect(p.roomCount).toBe(3);
  });

  it("pusty/brakujący dział I-O daje puste parametry", () => {
    const p = parseKwPropertyParams(null);
    expect(p).toEqual({
      kind: null,
      usableAreaM2: null,
      landAreaM2: null,
      landAreaHa: null,
      roomCount: null,
      landUse: null,
    });
  });
});

describe("extractKwOwnerPersons — dział II KW", () => {
  it("czyta układ etykietowany EKW: Imię przed Nazwiskiem", () => {
    const html =
      "<table><tr><td>Imię pierwsze:</td><td>JAN</td></tr>" +
      "<tr><td>Nazwisko:</td><td>KOWALSKI</td></tr></table>";
    expect(extractKwOwnerPersons(html)).toEqual([{ firstName: "JAN", lastName: "KOWALSKI" }]);
  });

  it("czyta układ odwrotny: Nazwisko przed Imieniem", () => {
    const html = "<div>Nazwisko: NOWAK-KOWALSKA</div><div>Imię: ANNA</div>";
    expect(extractKwOwnerPersons(html)).toEqual([
      { firstName: "ANNA", lastName: "NOWAK-KOWALSKA" },
    ]);
  });

  it("deduplikuje tę samą osobę z obu układów", () => {
    const html = "Imię: JAN Nazwisko: KOWALSKI ... Nazwisko: KOWALSKI Imię: JAN";
    expect(extractKwOwnerPersons(html)).toHaveLength(1);
  });

  it("fallback: para pisana mieszaną wielkością liter to Imię Nazwisko", () => {
    expect(extractKwOwnerPersons("Właściciel: Jan Kowalski, udział 1/1")).toEqual([
      { firstName: "Jan", lastName: "Kowalski" },
    ]);
  });

  it("pomija słowa-etykiety KW (nie bierze 'Księga Wieczysta' za osobę)", () => {
    const persons = extractKwOwnerPersons("Księga Wieczysta prowadzona dla nieruchomości");
    expect(persons).toEqual([]);
  });

  it("pusty/brakujący dział II daje pustą listę", () => {
    expect(extractKwOwnerPersons(null)).toEqual([]);
    expect(extractKwOwnerPersons("")).toEqual([]);
  });

  it("czyta układ EKW bez dwukropków: 'Imię pierwsze … Nazwisko / pierwszy człon…'", () => {
    const text =
      "Imię pierwsze MICHAŁ Imię drugie JAN " +
      "Nazwisko / pierwszy człon nazwiska złożonego SZPAK Imię ojca ANDRZEJ Imię matki EWA";
    expect(extractKwOwnerPersons(text)).toEqual([{ firstName: "MICHAŁ", lastName: "SZPAK" }]);
  });
});

describe("extractKwOwnerPesels — PESEL z działu II KW", () => {
  // 44051401359 — poprawny PESEL testowy (M, 1944-05-14).
  const dzial2 =
    "<table><tr><td>Imię pierwsze</td><td>MICHAŁ</td></tr>" +
    "<tr><td>Nazwisko / pierwszy człon nazwiska złożonego</td><td>SZPAK</td></tr>" +
    "<tr><td>Imię ojca</td><td>ANDRZEJ</td></tr><tr><td>Imię matki</td><td>EWA</td></tr>" +
    "<tr><td>PESEL</td><td>44051401359</td></tr></table>";

  it("wyciąga PESEL wraz z przypisanym właścicielem", () => {
    expect(extractKwOwnerPesels(dzial2)).toEqual([
      { pesel: "44051401359", ownerName: "MICHAŁ SZPAK" },
    ]);
  });

  it("odrzuca ciągi 11 cyfr niebędące poprawnym PESEL", () => {
    expect(extractKwOwnerPesels("PESEL 12345678901")).toEqual([]);
  });

  it("pusty dział II daje pustą listę", () => {
    expect(extractKwOwnerPesels(null)).toEqual([]);
  });
});

describe("parseMortgages — dział IV KW", () => {
  const dzial4Ekw =
    "<div>DZIAŁ IV - HIPOTEKA</div>" +
    "<div>Numer hipoteki (roszczenia) 1</div>" +
    "<div>Rodzaj hipoteki (roszczenia) HIPOTEKA UMOWNA</div>" +
    "<div>Suma 300 000,00</div><div>Suma słownie trzysta tysięcy</div>" +
    "<div>Waluta sumy ZŁ</div>" +
    "<div>Wierzyciel hipoteczny Osoba prawna Nazwa BANK SPÓŁDZIELCZY W OLEŚNICY Siedziba OLEŚNICA</div>" +
    "<div>Wzmianka w dziale IV brak wpisu</div>";

  it("nie gubi hipoteki, gdy 'brak wpisu' występuje w podpolu (np. wzmianki)", () => {
    const m = parseMortgages(dzial4Ekw);
    expect(m).toHaveLength(1);
    expect(m[0].amount).toBe(300000);
    expect(m[0].currency).toBe("PLN");
    expect(m[0].creditor).toContain("BANK SPÓŁDZIELCZY");
  });

  it("pusty dział IV ('BRAK WPISU') daje pustą listę", () => {
    expect(parseMortgages("<div>DZIAŁ IV - HIPOTEKA</div><div>BRAK WPISU</div>")).toEqual([]);
    expect(parseMortgages(null)).toEqual([]);
  });

  it("rozdziela wiele hipotek po polu 'Numer hipoteki'", () => {
    const html =
      "Numer hipoteki (roszczenia) 1 Rodzaj hipoteki (roszczenia) HIPOTEKA UMOWNA Suma 200 000,00 Waluta sumy ZŁ " +
      "Numer hipoteki (roszczenia) 2 Rodzaj hipoteki (roszczenia) HIPOTEKA PRZYMUSOWA Suma 50 000,00 Waluta sumy ZŁ";
    const m = parseMortgages(html);
    expect(m).toHaveLength(2);
    expect(m[0].amount).toBe(200000);
    expect(m[1].amount).toBe(50000);
  });

  it("czyta walutę z pola 'Waluta sumy' (EUR)", () => {
    const m = parseMortgages("Rodzaj hipoteki HIPOTEKA UMOWNA Suma 100 000,00 Waluta sumy EUR");
    expect(m).toHaveLength(1);
    expect(m[0].amount).toBe(100000);
    expect(m[0].currency).toBe("EUR");
  });

  it("obsługuje starszy układ z kwotą przy jednostce", () => {
    const m = parseMortgages(
      "Hipoteka umowna zwykła w kwocie 250 000,00 zł na rzecz Banku PKO BP SA.",
    );
    expect(m).toHaveLength(1);
    expect(m[0].amount).toBe(250000);
    expect(m[0].currency).toBe("PLN");
  });
});
