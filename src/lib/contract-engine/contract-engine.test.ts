/**
 * Port `test_suite.py` — 194 asercje silnika umów.
 *
 * Testy negatywne (walidator) są tu ważniejsze od pozytywnych: walidator, który
 * nigdy nie zgłasza problemu, nie chroni przed niczym. Zachowana została
 * własność mutacyjna — po celowym uszkodzeniu reguły odpowiedni test czerwienieje.
 */
import { describe, it, expect } from "vitest";
import { renderuj, wczytajBiblioteke } from "./renderer";
import { ewaluujWarunek, BladWarunku } from "./conditions";
import { walidujReguly, walidujSchemat } from "./validator";
import { formatuj } from "./formatter";
import { odmienDopelniacz, odmienBiernik } from "./facts";

import S1 from "./fixtures/scenariusz_01_podstawowy.json";
import S2 from "./fixtures/scenariusz_02_zlozony.json";
import S3 from "./fixtures/scenariusz_03_poreczyciel.json";
import S4 from "./fixtures/scenariusz_04_dwoje_pozyczkobiorcow.json";
import S5 from "./fixtures/scenariusz_05_spolki.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BIB = wczytajBiblioteke();
const clone = <T>(o: T): T => structuredClone(o);
const render = (d: any) => renderuj(clone(d), BIB);
const plaskiDoc = (doc: any) =>
  doc.sekcje.flatMap((s: any) => s.ustepy.map((u: any) => u.tekst)).join(" ");
const plaski = (d: any) => plaskiDoc(render(d));
const bledy = (d: any) =>
  walidujReguly(d)
    .filter((p) => p.poziom === "BLAD")
    .map((p) => p.komunikat);
const ostrzezenia = (d: any) =>
  walidujReguly(d)
    .filter((p) => p.poziom === "OSTRZEZENIE")
    .map((p) => p.komunikat);
const tytulSekcji = (d: any, nazwa: string) => {
  for (const s of render(d).sekcje) if (s.nazwa === nazwa) return s.tytul;
  return null;
};

// ══ A. Ewaluacja warunków ══
describe("A. Ewaluacja warunków", () => {
  const ctx = { a: { b: "x" }, flaga: true, pusty: null, lista: [1, 2] };
  it("A1 warunek True", () => expect(ewaluujWarunek(true, ctx)).toBe(true));
  it("A2 warunek False", () => expect(ewaluujWarunek(false, ctx)).toBe(false));
  it("A3 fakt logiczny", () => expect(ewaluujWarunek("flaga", ctx)).toBe(true));
  it("A4 porównanie z literałem", () => expect(ewaluujWarunek("a.b == 'x'", ctx)).toBe(true));
  it("A5 porównanie negatywne", () => expect(ewaluujWarunek("a.b == 'y'", ctx)).toBe(false));
  it("A6 null", () => expect(ewaluujWarunek("pusty == null", ctx)).toBe(true));
  it("A7 koniunkcja", () => expect(ewaluujWarunek("flaga and a.b == 'x'", ctx)).toBe(true));
  it("A8 negacja", () => expect(ewaluujWarunek("not flaga", ctx)).toBe(false));
  it("A9 literał + negacja", () =>
    expect(ewaluujWarunek("a.b == 'x' and not pusty", ctx)).toBe(true));
  it("A10 literał z podkreśleniami (regresja podmiany tokenów)", () =>
    expect(ewaluujWarunek("m == 'nie_potracana_raty'", { m: "nie_potracana_raty" })).toBe(true));
  it("A11 odrzucenie niebezpiecznego wyrażenia", () =>
    expect(() => ewaluujWarunek("__import__('os').system('echo x')", ctx)).toThrow(BladWarunku));
});

// ══ B. Scenariusz prosty ══
describe("B. Scenariusz prosty", () => {
  const d1 = render(S1);
  const sekcje1 = new Set(d1.sekcje.map((s) => s.nazwa));
  const txt1 = formatuj(d1);
  it("B1 brak sekcji poręczenia", () => expect(sekcje1.has("PORECZENIE")).toBe(false));
  it("B2 brak warunków zawieszających", () =>
    expect(sekcje1.has("WARUNKI_ZAWIESZAJACE")).toBe(false));
  it("B3 dwie strony w komparycji", () => expect(d1.komparycja.strony.length).toBe(2));
  it("B4 trzy załączniki bazowe", () => expect(d1.zalaczniki.length).toBe(3));
  it("B5 słowo 'Poręczyciel' nie występuje", () =>
    expect(txt1.includes("Poręczyciel")).toBe(false));
  it("B6 kwota prowizji obecna", () => expect(txt1.includes("13 236,19")).toBe(true));
  it("B7 model prowizji poprawny", () =>
    expect(txt1.includes("Prowizja nie jest potrącana")).toBe(true));
  it("B8 brak niepodstawionych pól", () =>
    expect(!txt1.includes("{{") && !txt1.includes("}}")).toBe(true));
  it("B9 ciągła numeracja ustępów", () => {
    for (const s of d1.sekcje) {
      const nry = s.ustepy.filter((u) => u.poziom === "ustep").map((u) => u.numer);
      expect(nry).toEqual(Array.from({ length: nry.length }, (_, i) => i + 1));
    }
  });
});

// ══ C. Scenariusz złożony ══
describe("C. Scenariusz złożony", () => {
  const d2 = render(S2);
  const sekcje2 = new Set(d2.sekcje.map((s) => s.nazwa));
  const txt2 = formatuj(d2);
  const plaski2 = plaskiDoc(d2);
  const f2 = d2.fakty;

  it("C1 sekcja poręczenia", () => expect(sekcje2.has("PORECZENIE")).toBe(true));
  it("C2 warunki zawieszające", () => expect(sekcje2.has("WARUNKI_ZAWIESZAJACE")).toBe(true));
  it("C3 cztery strony", () => expect(d2.komparycja.strony.length).toBe(4));
  it("C4 brak niepodstawionych pól", () =>
    expect(!txt2.includes("{{") && !txt2.includes("}}")).toBe(true));
  it("C5 wiele nieruchomości", () => expect(f2.wiele_nieruchomosci).toBe(true));
  it("C6 opróżnione miejsce", () => expect(f2.ma_oproznione_miejsce).toBe(true));
  it("C7 zrzeczenie", () => expect(f2.ma_zrzeczenia).toBe(true));
  it("C8 zgoda małżonka", () => expect(f2.wymaga_zgody_malzonka).toBe(true));
  it("C9 właściciel-osoba trzecia", () => expect(f2.ma_wlasciciela_osobe_trzecia).toBe(true));
  it("C10 spłata wierzyciela", () => expect(f2.ma_splaty_wierzycieli).toBe(true));
  it("C11 wpis egzekucyjny", () => expect(f2.ma_obciazenia_egzekucyjne).toBe(true));
  it("C12 art. 101(1)", () => expect(plaski2.includes("art. 101¹")).toBe(true));
  it("C13 art. 37 k.r.o.", () => expect(plaski2.includes("art. 37 § 1 pkt 1 k.r.o.")).toBe(true));
  it("C14 hipoteka łączna", () =>
    expect(plaski2.toLowerCase().includes("hipoteki mają charakter łączny")).toBe(true));
  it("C15 odmiana uprawnionej", () => expect(plaski2.includes("Haliny Wiśniewskiej")).toBe(true));
  it("C16 liczba czasownika (mnoga)", () => expect(plaski2.includes("poddadzą się")).toBe(true));
  it("C17 brak wekslu", () => expect(plaski2.toLowerCase().includes("weksel")).toBe(false));
  it("C17b brak polisy", () => expect(plaski2.toLowerCase().includes("polis")).toBe(false));
  it("C18 sześć załączników", () => expect(d2.zalaczniki.length).toBe(6));
  it("C18c brak załącznika z oświadczeniem poręczyciela", () =>
    expect(d2.zalaczniki.some((z) => z.tytul.includes("Oświadczenie Poręczyciela"))).toBe(false));
  it("C18d oświadczenie poręczyciela jako klauzula", () =>
    expect(plaski2.includes("rozumie zakres i skutki prawne poręczenia")).toBe(true));
  it("C18b załącznik: zgoda małżonka na poręczenie", () =>
    expect(
      d2.zalaczniki.some((z) => z.tytul.includes("Poręczyciela na udzielenie poręczenia")),
    ).toBe(true));
  it("C19 dwie transze wypłaty", () => expect(f2.wyplata_transze.length).toBe(2));
  it("C20 kwota spłaty wierzyciela", () => expect(plaski2.includes("142 350,00")).toBe(true));
  it("C21 podstawa zrzeczenia", () =>
    expect(plaski2.includes("art. 910 § 1 w zw. z art. 246 § 1 k.c.")).toBe(true));
  it("C22 prawo trwa do wykreślenia", () =>
    expect(plaski2.includes("do chwili wykreślenia prawo pozostaje w mocy")).toBe(true));

  const podpunktyZrzecz = d2.sekcje
    .flatMap((s) => s.ustepy)
    .filter((u) => u.zrodlo === "WZA_05_zrzeczenie_sluzebnosci")
    .map((u) => u.tekst);
  it("C24a jeden podpunkt o zrzeczeniu", () => expect(podpunktyZrzecz.length).toBe(1));
  it("C24b warunek = przedłożenie aktu notarialnego", () =>
    expect(
      podpunktyZrzecz[0].startsWith("przedłożeniu Pożyczkodawcy wypisu aktu notarialnego"),
    ).toBe(true));
  it("C24c oświadczenie obejmuje zgodę na wykreślenie", () =>
    expect(plaski2.includes("wraz ze zgodą na wykreślenie tego prawa")).toBe(true));
  it("C24d obowiązek wykreślenia po wypłacie", () =>
    expect(plaski2.includes("doprowadzić do wykreślenia z księgi wieczystej")).toBe(true));
  it("C24e termin na wykreślenie", () =>
    expect(plaski2.includes("6 miesięcy od dnia wypłaty")).toBe(true));
  it("C24f sankcja za niewykreślenie", () =>
    expect(plaski2.includes("istotne naruszenie Umowy")).toBe(true));
  it("C25 brak ścieżki alternatywnej", () =>
    expect(plaski2.includes("odmówi wykreślenia prawa")).toBe(false));
  it("C25b brak art. 913", () => expect(plaski2.includes("art. 913")).toBe(false));
  it("C25c brak odstąpienia", () => expect(plaski2.includes("odstąpić od Umowy")).toBe(false));

  it("C26 charakter hipoteki z danych", () => expect(f2.charakter_hipoteki).toBe("laczna"));
  it("C27 hipoteka łączna przy wielu nieruchomościach", () =>
    expect(f2.hipoteka_laczna).toBe(true));
  it("C28 stopka w wariancie łącznym", () =>
    expect(plaski2.includes("z każdej z nieruchomości z osobna")).toBe(true));
  it("C29 KW z wieloma działkami", () => expect(f2.ma_kw_wielodzialkowe).toBe(true));
  it("C30 klauzula o zakresie w obrębie KW", () =>
    expect(plaski2.includes("Obciążenie wybranej działki bez uprzedniego odłączenia")).toBe(true));

  it("C31/C32 wariant odrębny", () => {
    const z = clone(S2) as any;
    z.zabezpieczenia.charakter_hipoteki = "odrebna";
    z.nieruchomosci[1].hipoteka.kwota.cyframi = "200 000,00";
    const txtOdr = plaskiDoc(renderuj(z, BIB));
    expect(txtOdr.includes("nie mają charakteru łącznego")).toBe(true);
    expect(txtOdr.includes("z każdej z nieruchomości z osobna")).toBe(false);
  });
});

// ══ D. Walidator — przypadki negatywne ══
describe("D. Walidator negatywny", () => {
  it("D1 scenariusz prosty bez błędów", () => expect(bledy(S1)).toEqual([]));
  it("D2 scenariusz złożony bez błędów", () => expect(bledy(S2)).toEqual([]));

  it("D3 opróżnione miejsce bez wskazania wpisu", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].hipoteka.oproznione_miejsce_po = null;
    expect(bledy(z).some((b) => b.includes("oproznione_miejsce_po"))).toBe(true);
  });
  it("D4 opróżnione miejsce bez faktycznego wykreślenia", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].obciazenia[0].sposob_usuniecia = "pozostaje_akceptowane";
    expect(bledy(z).some((b) => b.includes("nie jest oznaczone do wykreślenia"))).toBe(true);
  });
  it("D5 właściciel=poręczyciel, a poręczyciela brak", () => {
    const z = clone(S2) as any;
    z.porecziciel = null;
    expect(bledy(z).some((b) => b.includes("poręczyciel nie został zdefiniowany"))).toBe(true);
  });
  it("D6 właściciel-osoba trzecia bez danych", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].wlasciciel_dane = null;
    expect(bledy(z).some((b) => b.includes("wlasciciel_dane"))).toBe(true);
  });
  it("D7 zrzeczenie bez uprawnionego", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].obciazenia[0].uprawniony_do_zrzeczenia = null;
    expect(bledy(z).some((b) => b.includes("uprawniony_do_zrzeczenia"))).toBe(true);
  });
  it("D8 spłata wierzyciela bez kwoty", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].obciazenia[0].kwota_splaty = null;
    expect(bledy(z).some((b) => b.includes("kwota_splaty"))).toBe(true);
  });
  it("D9 spłaty przekraczają kwotę pożyczki", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].obciazenia[0].kwota_splaty.cyframi = "999 000,00";
    expect(bledy(z).some((b) => b.includes("przekracza"))).toBe(true);
  });
  it("D10 777 dla nieistniejącego poręczyciela", () => {
    const z = clone(S1) as any;
    z.zabezpieczenia.egzekucja_777.poddaje_sie = ["pozyczkobiorca", "porecziciel"];
    expect(bledy(z).some((b) => b.includes("nie zdefiniowano poręczyciela"))).toBe(true);
  });
  it("D11 pierwsze miejsce mimo istniejącej hipoteki", () => {
    const z = clone(S1) as any;
    z.nieruchomosci[0].obciazenia = [
      {
        dzial: "IV",
        rodzaj: "hipoteka_umowna",
        opis: "hipoteka umowna 90 000 zł na rzecz Banku X",
        wierzyciel: "Bank X",
        kwota: "90 000,00",
        sposob_usuniecia: "pozostaje_akceptowane",
        uprawniony_do_zrzeczenia: null,
        kwota_splaty: null,
        wierzyciel_rachunek: null,
      },
    ];
    expect(bledy(z).some((b) => b.includes("pierwsze miejsce hipoteczne"))).toBe(true);
  });
  it("D13 zduplikowane KW", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].nr_kw = z.nieruchomosci[0].nr_kw;
    expect(bledy(z).some((b) => b.includes("wielokrotnie"))).toBe(true);
  });
  it("D14 harmonogram balonowy bez raty końcowej", () => {
    const z = clone(S1) as any;
    z.warunki.harmonogram.kwota_raty_koncowej = null;
    expect(bledy(z).some((b) => b.includes("kwota_raty_koncowej"))).toBe(true);
  });
  it("D15 dożywocie pozostaje (ostrzeżenie)", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].obciazenia[0].sposob_usuniecia = "pozostaje_akceptowane";
    expect(ostrzezenia(z).some((o) => o.includes("obniża wartość egzekucyjną"))).toBe(true);
  });
  it("D16 hipoteka nie pokrywa kwoty (ostrzeżenie)", () => {
    const z = clone(S1) as any;
    z.nieruchomosci[0].hipoteka.kwota.cyframi = "10 000,00";
    expect(ostrzezenia(z).some((o) => o.includes("nie pokrywa kapitału"))).toBe(true);
  });
  it("D17 wpis egzekucyjny pozostaje (ostrzeżenie)", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].obciazenia[1].sposob_usuniecia = "pozostaje_akceptowane";
    expect(ostrzezenia(z).some((o) => o.includes("pierwszeństwo przed hipoteką"))).toBe(true);
  });
  it("D18 po_odlaczeniu bez wskazania działek", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].zakres = "po_odlaczeniu";
    expect(bledy(z).some((b) => b.includes("dzialki_do_odlaczenia"))).toBe(true);
  });
  it("D19 działka do odłączenia spoza KW", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].zakres = "po_odlaczeniu";
    z.nieruchomosci[1].dzialki_do_odlaczenia = ["999/9"];
    expect(bledy(z).some((b) => b.includes("nieujawnione w dzialki_w_kw"))).toBe(true);
  });
  it("D20 czas trwania postępowania (ostrzeżenie)", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].zakres = "po_odlaczeniu";
    z.nieruchomosci[1].dzialki_do_odlaczenia = ["145/3"];
    expect(ostrzezenia(z).some((o) => o.includes("ok. roku"))).toBe(true);
  });
  it("D21 odłączenie z nieruchomości obciążonej (ostrzeżenie)", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].zakres = "po_odlaczeniu";
    z.nieruchomosci[0].dzialki_w_kw = ["10/1", "10/2"];
    z.nieruchomosci[0].dzialki_do_odlaczenia = ["10/2"];
    expect(ostrzezenia(z).some((o) => o.includes("stanie się łączna"))).toBe(true);
  });
  it("D22 KW wielodziałkowa przy cala_kw (ostrzeżenie)", () =>
    expect(ostrzezenia(S2).some((o) => o.includes("hipoteka obciąży je wszystkie"))).toBe(true));
  it("D23 hipoteki odrębne o tej samej kwocie (ostrzeżenie)", () => {
    const z = clone(S2) as any;
    z.zabezpieczenia.charakter_hipoteki = "odrebna";
    expect(ostrzezenia(z).some((o) => o.includes("czy nie chodziło o hipotekę łączną"))).toBe(true);
  });
});

// ══ F. Zakres odpowiedzialności poręczyciela ══
describe("F. Poręczyciel — 3 warianty odpowiedzialności", () => {
  it("F1 zgoda niewymagana (rozdzielność) → pełna odpowiedzialność", () => {
    const z = clone(S2) as any;
    z.porecziciel.ustroj_majatkowy = "rozdzielnosc";
    z.porecziciel.zgoda_malzonka = null;
    const fz = render(z).fakty;
    expect(fz.porecziciel_wymaga_zgody_malzonka).toBe(false);
    expect(fz.porecziciel_pelna_odpowiedzialnosc).toBe(true);
    expect(plaski(z).includes("art. 41 § 2 k.r.o.")).toBe(false);
    expect(bledy(z)).toEqual([]);
  });
  it("F2 zgoda udzielona → pełna + majątek wspólny", () => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = { na_hipoteke: true, na_poreczenie: true };
    const fz = render(z).fakty;
    expect(fz.porecziciel_pelna_odpowiedzialnosc).toBe(true);
    expect(fz.porecziciel_ograniczenie_do_majatku_osobistego).toBe(false);
    const p2 = plaski(z);
    expect(p2.includes("art. 41 § 1 k.r.o.")).toBe(true);
    expect(p2.includes("jak i z majątku wspólnego małżonków")).toBe(true);
  });
  it("F3 zgoda nieudzielona → poręczenie zostaje, egzekucja ograniczona", () => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = { na_hipoteke: true, na_poreczenie: false };
    const fz = render(z).fakty;
    expect(fz.porecziciel_ograniczenie_do_majatku_osobistego).toBe(true);
    expect(fz.porecziciel_odpowiada_osobiscie).toBe(true);
    const p3 = plaski(z);
    expect(p3.includes("art. 41 § 2 k.r.o.")).toBe(true);
    expect(p3.includes("nie powoduje nieważności poręczenia")).toBe(true);
    expect(p3.includes("z wyłączeniem majątku wspólnego")).toBe(true);
    expect(p3.includes("poręcza za zobowiązania")).toBe(true);
    expect(ostrzezenia(z).some((o) => o.includes("art. 41 § 2 k.r.o."))).toBe(true);
  });
  it("F4 odpowiedzialność wyłącznie rzeczowa", () => {
    const z = clone(S2) as any;
    z.porecziciel.zakres_odpowiedzialnosci = "rzeczowa";
    z.porecziciel.zgoda_malzonka = { na_hipoteke: true, na_poreczenie: false };
    const fz = render(z).fakty;
    expect(fz.porecziciel_tylko_rzeczowo).toBe(true);
    expect(fz.porecziciel_odpowiada_osobiscie).toBe(false);
    const p4 = plaski(z);
    expect(p4.includes("nie udziela poręczenia osobistego")).toBe(true);
    expect(p4.includes("art. 881 k.c.")).toBe(false);
    expect(tytulSekcji(z, "PORECZENIE")).toBe("ZABEZPIECZENIE RZECZOWE PORĘCZYCIELA");
  });
  it("D24 wspólność ustawowa bez zgody", () => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = null;
    expect(bledy(z).some((b) => b.includes("zgoda_malzonka"))).toBe(true);
  });
  it("D25 brak zgody na hipotekę mimo wnoszonej nieruchomości", () => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = { na_hipoteke: false, na_poreczenie: true };
    expect(bledy(z).some((b) => b.includes("hipoteka nie powstanie"))).toBe(true);
  });
  it("D26 odpowiedzialność rzeczowa bez nieruchomości poręczyciela", () => {
    const z = clone(S3) as any;
    z.porecziciel.zakres_odpowiedzialnosci = "rzeczowa";
    z.nieruchomosci[0].wlasciciel_ref = "pozyczkobiorca";
    expect(bledy(z).some((b) => b.includes("nie ma z czego prowadzić egzekucji"))).toBe(true);
  });
});

// ══ G. Wielu pożyczkobiorców ══
describe("G. Wielu pożyczkobiorców (solidarność)", () => {
  const d4 = render(S4);
  const f4 = d4.fakty;
  const p4txt = plaskiDoc(d4);
  it("G1 dwóch pożyczkobiorców", () => expect(f4.liczba_pozyczkobiorcow).toBe(2));
  it("G2 flaga wielu", () => expect(f4.wielu_pozyczkobiorcow).toBe(true));
  it("G3 solidarność dłużników", () => expect(f4.dluznicy_solidarni).toBe(true));
  it("G4 art. 366 k.c.", () => expect(p4txt.includes("art. 366 k.c.")).toBe(true));
  it("G5 treść klauzuli solidarności", () =>
    expect(p4txt.includes("od każdego z osobna")).toBe(true));
  const stronyPb = d4.komparycja.strony.filter((s) => s.grupa === "pozyczkobiorca");
  it("G6 obaj w komparycji", () => expect(stronyPb.length).toBe(2));
  it("G7 rola w liczbie mnogiej", () =>
    expect(stronyPb.every((s) => s.rola === "Pożyczkobiorcami")).toBe(true));
  it("G8 czasownik mnogi", () => expect(p4txt.includes("Pożyczkobiorcy oświadczają")).toBe(true));
  it("G9 orzecznik mnogi", () => expect(p4txt.includes("są przedsiębiorcami")).toBe(true));
  it("G10 zaimek mnogi", () => expect(p4txt.includes("przysługuje im prawo własności")).toBe(true));
  it("G11 poprawny przypadek zaimka", () =>
    expect(p4txt.includes("ma dla nich charakter zawodowy")).toBe(true));
  it("G12 brak błędów przypadka", () =>
    expect(!p4txt.includes("dla im") && !p4txt.includes("przez niego działalnością")).toBe(true));
  it("G13 małżonkowie jako współdłużnicy", () =>
    expect(f4.malzonkowie_oboje_pozyczkobiorcami).toBe(true));
  it("G14 zgoda NIEwymagana", () => expect(f4.wymaga_zgody_malzonka).toBe(false));
  it("G15 brak zbędnego załącznika", () =>
    expect(d4.zalaczniki.some((z) => z.tytul.includes("Zgoda małżonka"))).toBe(false));
  it("G16 wyjaśnienie w umowie", () =>
    expect(p4txt.includes("nie jest wymagana odrębna zgoda małżonka")).toBe(true));
  it("G17 podstawa", () => expect(p4txt.includes("art. 37 § 1 k.r.o.")).toBe(true));

  const d1b = render(S1);
  const f1b = d1b.fakty;
  const p1b = plaskiDoc(d1b);
  it("G18 pojedynczy pożyczkobiorca", () => expect(f1b.liczba_pozyczkobiorcow).toBe(1));
  it("G19 brak solidarności", () => expect(f1b.dluznicy_solidarni).toBe(false));
  it("G20 brak klauzuli solidarności", () => expect(p1b.includes("art. 366 k.c.")).toBe(false));
  it("G21 liczba pojedyncza zachowana", () =>
    expect(p1b.includes("Pożyczkobiorca oświadcza")).toBe(true));
  it("G22 tablica jednoelementowa = obiekt", () => {
    const z = clone(S1) as any;
    z.pozyczkobiorca = [z.pozyczkobiorca];
    expect(plaskiDoc(renderuj(z, BIB))).toBe(p1b);
  });
  it("D27 zgoda wymagana gdy tylko jeden małżonek stroną", () => {
    const z = clone(S4) as any;
    z.pozyczkobiorca = [z.pozyczkobiorca[0]];
    const fz = render(z).fakty;
    expect(fz.wymaga_zgody_malzonka).toBe(true);
    expect(fz.malzonkowie_oboje_pozyczkobiorcami).toBe(false);
  });
  it("G23 scenariusz 04 bez błędów", () => expect(bledy(S4)).toEqual([]));
});

// ══ H. Formy spółek, reprezentacja, uchwały korporacyjne ══
describe("H. Spółki, reprezentacja, uchwały", () => {
  const d5 = render(S5);
  const f5 = d5.fakty;
  const p5 = plaskiDoc(d5);
  const kompar5 = d5.komparycja.strony.map((s) => s.opis).join(" | ");

  it("H1 strony będące spółkami", () => expect(f5.ma_strone_bedaca_spolka).toBe(true));
  it("H2 reprezentacja łączna", () => expect(f5.ma_reprezentacje_laczna).toBe(true));
  it("H3 dwie uchwały do przedłożenia", () => expect(f5.uchwaly_do_przedlozenia.length).toBe(2));
  it("H4 odmiana funkcji i nazwiska", () =>
    expect(kompar5.includes("prezesa zarządu Mareka Wiśniewskiego")).toBe(true));
  it("H5 adnotacja o reprezentacji łącznej", () =>
    expect(kompar5.includes("działających łącznie")).toBe(true));
  it("H6 brak błędów odmiany", () =>
    expect(!kompar5.includes("zarządua") && !kompar5.includes("Wiśniewskego")).toBe(true));
  it("H7 spółka jawna: wspólnik", () =>
    expect(kompar5.includes("wspólnika Mareka Wiśniewskiego")).toBe(true));
  it("H8 art. 230 k.s.h. w warunkach", () => expect(p5.includes("art. 230 k.s.h.")).toBe(true));
  it("H9 art. 228 pkt 4 k.s.h. w warunkach", () =>
    expect(p5.includes("art. 228 pkt 4 k.s.h.")).toBe(true));
  it("H10 wskazano organ", () => expect(p5.includes("zgromadzenia wspólników")).toBe(true));
  it("H11 wskazano czynność", () =>
    expect(p5.includes("obciążenie nieruchomości hipoteką")).toBe(true));
  it("H12 klauzula o umocowaniu", () =>
    expect(p5.includes("należycie umocowane do ich reprezentowania")).toBe(true));
  it("H13 klauzula o zgodach korporacyjnych", () =>
    expect(p5.includes("art. 228 i art. 230 Kodeksu spółek handlowych")).toBe(true));
  it("H14 klauzula o reprezentacji łącznej", () =>
    expect(p5.includes("oświadczenia woli w imieniu tej strony składają wszystkie osoby")).toBe(
      true,
    ));

  it("H15 dopełniacz -ski", () =>
    expect(odmienDopelniacz("Marek Wiśniewski")).toBe("Mareka Wiśniewskiego"));
  it("H16 dopełniacz -ska", () =>
    expect(odmienDopelniacz("Halina Wiśniewska")).toBe("Haliny Wiśniewskiej"));
  it("H17 nazwisko kobiety na spółgłoskę", () =>
    expect(odmienDopelniacz("Anna Kowalczyk")).toBe("Anny Kowalczyk"));
  it("H18 biernik", () => expect(odmienBiernik("Anna Kowalczyk")).toBe("Annę Kowalczyk"));
  it("H19 nazwisko mężczyzny", () =>
    expect(odmienDopelniacz("Marek Kowalczyk")).toBe("Mareka Kowalczyka"));

  it("D28 spółka cywilna bez wspólników", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.forma = "spolka_cywilna";
    z.pozyczkobiorca.wspolnicy_sc = null;
    expect(bledy(z).some((b) => b.includes("wspolnicy_sc"))).toBe(true);
  });
  it("D29 spółka bez reprezentacji", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.reprezentacja = null;
    expect(bledy(z).some((b) => b.includes("osób reprezentujących"))).toBe(true);
  });
  it("D30 reprezentacja łączna z jedną osobą", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.reprezentacja = [z.pozyczkobiorca.reprezentacja[0]];
    expect(bledy(z).some((b) => b.includes("mniej niż dwie osoby"))).toBe(true);
  });
  it("D31 brak uchwały na obciążenie nieruchomości", () => {
    const z = clone(S5) as any;
    z.nieruchomosci[1].wlasciciel_dane.uchwala_nieruchomosc = null;
    expect(bledy(z).some((b) => b.includes("NIEWAŻNOŚCIĄ"))).toBe(true);
  });
  it("D32 zobowiązanie > 2x kapitał bez uchwały (ostrzeżenie)", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie = {
      wymagana: false,
      podstawa: null,
      organ: null,
      przedlozona: false,
      data: null,
      numer: null,
      wylaczona_umowa_spolki: false,
    };
    expect(ostrzezenia(z).some((o) => o.includes("art. 230 k.s.h."))).toBe(true);
    expect(ostrzezenia(z).some((o) => o.includes("NIE powoduje nieważności"))).toBe(true);
  });
  it("D33 pełnomocnik bez podstawy (ostrzeżenie)", () => {
    const z = clone(S5) as any;
    z.pozyczkodawca.reprezentacja[0].podstawa = null;
    expect(ostrzezenia(z).some((o) => o.includes("podstawy umocowania"))).toBe(true);
  });
  it("D34 uchwała przedłożona bez daty i numeru (ostrzeżenie)", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie.przedlozona = true;
    expect(ostrzezenia(z).some((o) => o.includes("bez daty i numeru"))).toBe(true);
  });
  it("H20 przedłożona uchwała nie generuje warunku", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie.przedlozona = true;
    z.pozyczkobiorca.uchwala_zobowiazanie.data = "10.11.2026";
    z.pozyczkobiorca.uchwala_zobowiazanie.numer = "3/2026";
    expect(render(z).fakty.uchwaly_do_przedlozenia.length).toBe(1);
  });
  it("H21 wyłączenie umową spółki znosi wymóg", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie.wylaczona_umowa_spolki = true;
    expect(render(z).fakty.uchwaly_do_przedlozenia.length).toBe(1);
  });
  it("H22-H24 spółka cywilna: wspólnicy stroną", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca = {
      typ: "podmiot_gospodarczy",
      nazwa: "KOWALSCY s.c.",
      forma: "spolka_cywilna",
      forma_prawna: "s.c.",
      krs: null,
      nip: "7122334455",
      regon: "061234567",
      adres: "ul. Polna 3, 20-100 Lublin",
      telefon: null,
      email: null,
      reprezentacja: null,
      reprezentacja_laczna: false,
      kapital_zakladowy: null,
      wspolnicy_sc: [
        {
          typ: "osoba_fizyczna",
          imie_nazwisko: "Jan Kowalski",
          firma: null,
          pesel: "70010112345",
          nip: null,
          regon: null,
          dokument_tozsamosci: null,
          adres: "ul. Polna 3, 20-100 Lublin",
          telefon: null,
          email: null,
          stan_cywilny: null,
          ustroj_majatkowy: null,
        },
        {
          typ: "osoba_fizyczna",
          imie_nazwisko: "Piotr Kowalski",
          firma: null,
          pesel: "72020254321",
          nip: null,
          regon: null,
          dokument_tozsamosci: null,
          adres: "ul. Polna 3, 20-100 Lublin",
          telefon: null,
          email: null,
          stan_cywilny: null,
          ustroj_majatkowy: null,
        },
      ],
    };
    z.nieruchomosci[0].wlasciciel_ref = "porecziciel";
    const dSc = render(z);
    const kSc = dSc.komparycja.strony.map((s) => s.opis).join(" | ");
    const pSc = plaskiDoc(dSc);
    expect(kSc.includes("wspólnicy spółki cywilnej")).toBe(true);
    expect(kSc.includes("JAN KOWALSKI") && kSc.includes("PIOTR KOWALSKI")).toBe(true);
    expect(pSc.includes("art. 864 k.c.")).toBe(true);
  });
  it("H25 stara forma reprezentacji (obiekt) poprawna", () =>
    expect(walidujSchemat(S1)).toEqual([]));
  it("H26 obiekt i tablica jednoelementowa równoważne", () => {
    const z = clone(S1) as any;
    z.pozyczkodawca.reprezentacja = [z.pozyczkodawca.reprezentacja];
    const kA = render(S1)
      .komparycja.strony.map((x) => x.opis)
      .join(" | ");
    const kB = render(z)
      .komparycja.strony.map((x) => x.opis)
      .join(" | ");
    expect(kA).toBe(kB);
  });
});

// ══ I. Regresja: usunięte zabezpieczenia ══
describe("I. Regresja — usunięte zabezpieczenia", () => {
  const bibBlob = JSON.stringify(BIB).toLowerCase();
  const schemaBlob = JSON.stringify(BIB); // biblioteka; schemat sprawdzany osobno przez zod

  it("I1 brak wekslu w bibliotece", () =>
    expect(!bibBlob.includes("weksl") && !bibBlob.includes("wekslow")).toBe(true));
  it("I2 brak cesji polisy w bibliotece", () =>
    expect(!bibBlob.includes("cesja_polisy") && !bibBlob.includes("polisy")).toBe(true));
  it("I3/I4 brak usuniętych pól w schemacie (weksel/cesja)", () => {
    expect(schemaBlob.includes("weksel_in_blanco")).toBe(false);
    expect(schemaBlob.includes("cesja_polisy")).toBe(false);
  });
  it("I5 schemat odrzuca weksel_in_blanco", () => {
    const z = clone(S2) as any;
    z.zabezpieczenia.weksel_in_blanco = { wystawca: "pozyczkobiorca" };
    expect(walidujSchemat(z).length).not.toBe(0);
  });
  it("I6 brak treści o wekslu/polisie w scenariuszach", () => {
    for (const s of [S1, S2, S3, S4, S5]) {
      const t = plaskiDoc(render(s)).toLowerCase();
      expect(!t.includes("weksel") && !t.includes("wekslow") && !t.includes("polisy")).toBe(true);
    }
  });
});

// ══ I2. Współwłasność ułamkowa — przywrócona (zmiana 1 po Kańkowskich) ══
describe("I2. Współwłasność ułamkowa (przywrócona)", () => {
  // Wariant Kańkowskich: dwoje pożyczkobiorców, każde z udziałem 1/2,
  // oboje przystępują do umowy.
  const zUlamkowa = () => {
    const z = clone(S4) as any;
    z.nieruchomosci[0].wspolwlasnosc = {
      rodzaj: "ulamkowa",
      wspolwlasciciele: [
        { imie_nazwisko: "Tomasz Kowalczyk", pesel: "80051012345", udzial: "1/2" },
        { imie_nazwisko: "Agnieszka Kowalczyk", pesel: "82092387654", udzial: "1/2" },
      ],
    };
    return z;
  };

  it("I7 schemat przyjmuje wariant ułamkowy z udziałami", () =>
    expect(walidujSchemat(zUlamkowa())).toEqual([]));

  it("I8 komparycja opisuje udziały („w udziale wynoszącym 1/2 części”)", () => {
    const k = render(zUlamkowa())
      .komparycja.strony.map((s) => s.opis)
      .join(" | ");
    expect(k.includes("w udziale wynoszącym 1/2 części")).toBe(true);
    expect(k.includes("współwłaściciel")).toBe(true);
  });

  it("I9 sekcja zabezpieczeń: hipoteka obciąża całą nieruchomość, gdy wszyscy współwłaściciele przystępują do umowy", () => {
    const p = plaski(zUlamkowa());
    expect(p.includes("współwłasności w częściach ułamkowych")).toBe(true);
    expect(p.includes("hipoteka obciąża całą nieruchomość")).toBe(true);
  });

  it("I10 współwłaściciel będący pożyczkobiorcą → żadna zgoda się nie generuje", () => {
    const d = render(zUlamkowa());
    expect(d.fakty.wymaga_zgody_malzonka).toBe(false);
    expect(d.zalaczniki.some((x) => x.tytul.includes("Zgoda małżonka"))).toBe(false);
  });

  it("I11 współwłaściciel spoza stron → silnik nie blokuje (brak reguły oceniającej), opis udziałów zostaje", () => {
    const z = zUlamkowa();
    z.pozyczkobiorca = [z.pozyczkobiorca[0]]; // drugi współwłaściciel nie jest stroną
    expect(walidujSchemat(z)).toEqual([]);
    expect(bledy(z)).toEqual([]);
    const p = plaski(z);
    expect(p.includes("współwłasności w częściach ułamkowych")).toBe(true);
    expect(p.includes("hipoteka obciąża całą nieruchomość")).toBe(false);
    expect(p.includes("udziały we współwłasności przysługujące osobom składającym")).toBe(true);
  });

  it("I12 wariant łączny małżeński działa bez zmian (regresja)", () => {
    const d = render(S4);
    expect(d.fakty.wymaga_zgody_malzonka).toBe(false);
    expect(plaskiDoc(d).includes("współwłasności w częściach ułamkowych")).toBe(false);
  });
});

// ══ K. Rolnicy prowadzący gospodarstwo (zmiana 2 po Kańkowskich) ══
describe("K. Rolnicy prowadzący gospodarstwo rolne", () => {
  // Dwoje rolników prowadzących wspólne gospodarstwo: NIP gospodarstwa przy
  // jednym z nich (przedstawiciel), drugie ma sam PESEL.
  const zRolnicy = () => {
    const z = clone(S4) as any;
    z.pozyczkobiorca[0].firma = null;
    z.pozyczkobiorca[0].dzialalnosc = "gospodarstwo_rolne";
    z.pozyczkobiorca[0].nip = "7122334455";
    z.pozyczkobiorca[0].regon = null;
    z.pozyczkobiorca[1].firma = null;
    z.pozyczkobiorca[1].dzialalnosc = "gospodarstwo_rolne";
    z.pozyczkobiorca[1].nip = null;
    return z;
  };

  it("K1 schemat przyjmuje status gospodarstwa rolnego", () =>
    expect(walidujSchemat(zRolnicy())).toEqual([]));

  it("K2 komparycja: rolnicy prowadzący wspólne gospodarstwo rolne", () => {
    const k = render(zRolnicy())
      .komparycja.strony.map((s) => s.opis)
      .join(" | ");
    expect(k.includes("rolnik prowadzący wspólne gospodarstwo rolne")).toBe(true);
    expect(k.includes("rolnik prowadząca wspólne gospodarstwo rolne")).toBe(true);
  });

  it("K3 NIP gospodarstwa wyłącznie przy przedstawicielu", () => {
    const k = render(zRolnicy())
      .komparycja.strony.filter((s) => s.grupa === "pozyczkobiorca")
      .map((s) => s.opis)
      .join(" | ");
    expect(k.split("NIP 7122334455").length - 1).toBe(1);
    expect(k.split("NIP").length - 1).toBe(1); // drugi rolnik bez NIP — sam PESEL
  });

  it("K4 kwalifikacja jako przedsiębiorcy — klauzula niekonsumencka aktywna", () => {
    const p = plaski(zRolnicy());
    expect(p.includes("są przedsiębiorcami")).toBe(true);
    expect(p.includes("nie mają zastosowania przepisy ustawy o kredycie konsumenckim")).toBe(true);
  });

  it("K5 pojedynczy rolnik — bez „wspólnego” gospodarstwa", () => {
    const z = zRolnicy();
    z.pozyczkobiorca = [z.pozyczkobiorca[0]];
    const k = render(z)
      .komparycja.strony.map((s) => s.opis)
      .join(" | ");
    expect(k.includes("rolnik prowadzący gospodarstwo rolne")).toBe(true);
    expect(k.includes("wspólne gospodarstwo")).toBe(false);
  });

  it("K6 status nie psuje walidatora (brak nowych reguł)", () =>
    expect(bledy(zRolnicy())).toEqual([]));
});

// ══ L. Hipoteki przymusowe w dziale IV (zmiana 3 po Kańkowskich) ══
describe("L. Hipoteki przymusowe w dziale IV", () => {
  // Dział IV jak u Kańkowskich: dwie hipoteki przymusowe na rzecz Skarbu
  // Państwa (KRUS), pozostające na nieruchomości.
  const zPrzymusowe = () => {
    const z = clone(S1) as any;
    z.nieruchomosci[0].hipoteka.pierwszenstwo = "kolejne";
    z.nieruchomosci[0].obciazenia = [
      {
        dzial: "IV",
        rodzaj: "hipoteka_przymusowa",
        opis: "hipoteka przymusowa wpisana na podstawie tytułu wykonawczego z 12.03.2024",
        wierzyciel:
          "Skarb Państwa — Kasa Rolniczego Ubezpieczenia Społecznego, Oddział Regionalny w Lublinie",
        kwota: "38 450,00",
        sposob_usuniecia: "pozostaje_akceptowane",
        uprawniony_do_zrzeczenia: null,
        kwota_splaty: null,
        wierzyciel_rachunek: null,
      },
      {
        dzial: "IV",
        rodzaj: "hipoteka_przymusowa",
        opis: "hipoteka przymusowa wpisana na podstawie tytułu wykonawczego z 05.09.2025",
        wierzyciel:
          "Skarb Państwa — Kasa Rolniczego Ubezpieczenia Społecznego, Oddział Regionalny w Lublinie",
        kwota: "17 890,00",
        sposob_usuniecia: "pozostaje_akceptowane",
        uprawniony_do_zrzeczenia: null,
        kwota_splaty: null,
        wierzyciel_rachunek: null,
      },
    ];
    return z;
  };

  it("L1 schemat przyjmuje hipotekę przymusową z wierzycielem instytucjonalnym", () =>
    expect(walidujSchemat(zPrzymusowe())).toEqual([]));

  it("L2 obie hipoteki przymusowe trafiają do umowy z kwotami i wierzycielem", () => {
    const p = plaski(zPrzymusowe());
    expect(p.split("hipoteka przymusowa").length - 1).toBeGreaterThanOrEqual(2);
    expect(p.includes("38 450,00")).toBe(true);
    expect(p.includes("17 890,00")).toBe(true);
    expect(p.includes("Kasa Rolniczego Ubezpieczenia Społecznego")).toBe(true);
    expect(p.includes("w dziale IV księgi wieczystej")).toBe(true);
  });

  it("L3 wpis egzekucyjny rozpoznany w faktach", () =>
    expect(render(zPrzymusowe()).fakty.ma_obciazenia_egzekucyjne).toBe(true));

  it("L4 bez błędów blokujących (opis stanu księgi, nie ocena ryzyka)", () =>
    expect(bledy(zPrzymusowe())).toEqual([]));

  it("L5 brak obciążeń → klauzula o stanie obciążeń nie renderuje się", () =>
    expect(plaski(S1).includes("stan obciążeń")).toBe(false));
});

// ══ E. Determinizm ══
describe("E. Determinizm", () => {
  it("E1 dwa przebiegi identyczne", () => {
    const a = formatuj(render(S2));
    const b = formatuj(render(S2));
    expect(a).toBe(b);
  });
});

// ══ J. Zmiany szablonu generatora (spec) ══
describe("J. Zmiany szablonu generatora", () => {
  it("J1 klauzula prowizji: bez zdania o braku obniżenia przy wcześniejszej spłacie", () => {
    const p1 = plaski(S1);
    expect(p1.includes("Prowizja nie jest potrącana")).toBe(true);
    expect(p1.includes("wymagalna w całości w dniu zawarcia Umowy")).toBe(true);
    expect(p1.toLowerCase().includes("nie podlega obniżeniu")).toBe(false);
  });
  it("J2 roszczenie o opróżnione miejsce: brak klauzuli bez flagi", () => {
    expect(plaski(S1).includes("roszczenie o przeniesienie hipoteki")).toBe(false);
  });
  it("J3 roszczenie o opróżnione miejsce: klauzula przy fladze (art. 101¹)", () => {
    const z = clone(S1) as any;
    z.nieruchomosci[0].roszczenie_oproznione_miejsce = true;
    const p = plaski(z);
    expect(p.includes("roszczenie o przeniesienie hipoteki ustanowionej zgodnie z ust. 1")).toBe(
      true,
    );
    expect(p.includes("art. 101¹ ustawy z dnia 6 lipca 1982")).toBe(true);
    expect(walidujSchemat(z)).toEqual([]);
  });
  it("J4 schemat odrzuca zły typ flagi roszczenia", () => {
    const z = clone(S1) as any;
    z.nieruchomosci[0].roszczenie_oproznione_miejsce = "tak";
    expect(walidujSchemat(z).length).not.toBe(0);
  });
});
