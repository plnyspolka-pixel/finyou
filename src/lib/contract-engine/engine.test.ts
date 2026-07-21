/**
 * Testy silnika umów — port z `test_suite.py` (wszystkie asercje).
 *
 * Testy negatywne (grupy D/F/H) są tu ważniejsze od pozytywnych: walidator,
 * który nigdy nie zgłasza problemu, nie chroni przed niczym. Kilka testów
 * pilnuje decyzji biznesowych, które inaczej cicho znikną przy refaktorze:
 *  - A10  — regresja na podmianie tokenów w literałach
 *  - C18c/C18d — oświadczenie poręczyciela jest klauzulą, nie załącznikiem
 *  - G14/G15 — zgoda małżonka NIE jest wymagana, gdy oboje są pożyczkobiorcami
 *  - I1–I12 — weksel, cesja polisy, współwłasność ułamkowa usunięte świadomie
 *  - F3a–F3g — brak zgody małżonka na poręczenie nie znosi poręczenia
 *
 * Uruchomienie: `vitest run` (repo) albo `bun test` (lokalnie, bez instalacji).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { renderuj } from "./renderer";
import { formatuj } from "./formatter";
import { walidujReguly } from "./validator";
import { validateSchema } from "./schema";
import { evalCondition, ConditionError } from "./conditions";
import { odmienDopelniacz, odmienBiernik } from "./facts";
import BIB from "./clauses.json";
import SCHEMA_JSON from "./umowa.schema.json";
import S1 from "./fixtures/scenariusz_01_podstawowy.json";
import S2 from "./fixtures/scenariusz_02_zlozony.json";
import S3 from "./fixtures/scenariusz_03_poreczyciel.json";
import S4 from "./fixtures/scenariusz_04_dwoje_pozyczkobiorcow.json";
import S5 from "./fixtures/scenariusz_05_spolki.json";

const clone = <T>(x: T): T => structuredClone(x);
const norm = (s: string) => s.replace(/\s+/g, " ");
const render = (d: any) => renderuj(clone(d), BIB as any);
const plaskiOf = (doc: any) => doc.sekcje.flatMap((s: any) => s.ustepy.map((u: any) => u.tekst)).join(" ");
const plaski = (d: any) => plaskiOf(render(d));
const komparOpis = (doc: any) => doc.komparycja.strony.map((s: any) => s.opis).join(" | ");
const bledy = (d: any) => walidujReguly(d).filter((p) => p.poziom === "BLAD").map((p) => p.komunikat);
const ostrzezenia = (d: any) => walidujReguly(d).filter((p) => p.poziom === "OSTRZEZENIE").map((p) => p.komunikat);
const tytulSekcji = (d: any, nazwa: string) => render(d).sekcje.find((s: any) => s.nazwa === nazwa)?.tytul ?? null;

/** T(label, fn) — asercja: fn() musi być prawdą. Odpowiednik `sprawdz`. */
const T = (label: string, fn: () => boolean) => it(label, () => expect(fn()).toBe(true));

// ══════════════════════════════════════════════════
//  A. Ewaluacja warunków
// ══════════════════════════════════════════════════
describe("A. Ewaluacja warunków", () => {
  const ctx: any = { a: { b: "x" }, flaga: true, pusty: null, lista: [1, 2] };
  T("A1 warunek True", () => evalCondition(true, ctx));
  T("A2 warunek False", () => !evalCondition(false, ctx));
  T("A3 fakt logiczny", () => evalCondition("flaga", ctx));
  T("A4 porównanie z literałem", () => evalCondition("a.b == 'x'", ctx));
  T("A5 porównanie negatywne", () => !evalCondition("a.b == 'y'", ctx));
  T("A6 null", () => evalCondition("pusty == null", ctx));
  T("A7 koniunkcja", () => evalCondition("flaga and a.b == 'x'", ctx));
  T("A8 negacja", () => !evalCondition("not flaga", ctx));
  T("A9 literał + negacja", () => evalCondition("a.b == 'x' and not pusty", ctx));
  T("A10 literał z podkreśleniami (regresja podmiany tokenów)", () =>
    evalCondition("m == 'nie_potracana_raty'", { m: "nie_potracana_raty" }));
  T("A11 odrzucenie niebezpiecznego wyrażenia", () => {
    try {
      evalCondition("__import__('os').system('echo x')", ctx);
      return false;
    } catch (e) {
      return e instanceof ConditionError || e instanceof Error;
    }
  });
});

// ══════════════════════════════════════════════════
//  B. Scenariusz prosty
// ══════════════════════════════════════════════════
describe("B. Scenariusz prosty", () => {
  const d1 = render(S1);
  const sekcje1 = new Set(d1.sekcje.map((s: any) => s.nazwa));
  const txt1 = formatuj(d1);

  T("B1 brak sekcji poręczenia gdy brak poręczyciela", () => !sekcje1.has("PORECZENIE"));
  T("B2 brak warunków zawieszających w prostym scenariuszu", () => !sekcje1.has("WARUNKI_ZAWIESZAJACE"));
  T("B3 dwie strony w komparycji", () => d1.komparycja.strony.length === 2);
  T("B4 trzy załączniki bazowe", () => d1.zalaczniki.length === 3);
  T("B5 słowo 'Poręczyciel' nie występuje w tekście", () => !txt1.includes("Poręczyciel"));
  T("B6 kwota prowizji obecna", () => norm(txt1).includes("13 236,19"));
  T("B7 model prowizji poprawny", () => norm(txt1).includes("Prowizja nie jest potrącana"));
  T("B8 brak niepodstawionych pól", () => !txt1.includes("{{") && !txt1.includes("}}"));
  it("B9 ciągła numeracja ustępów", () => {
    for (const s of d1.sekcje) {
      const nry = s.ustepy.filter((u: any) => u.poziom === "ustep").map((u: any) => u.numer);
      expect(nry).toEqual(Array.from({ length: nry.length }, (_, i) => i + 1));
    }
  });
});

// ══════════════════════════════════════════════════
//  C. Scenariusz złożony
// ══════════════════════════════════════════════════
describe("C. Scenariusz złożony", () => {
  const d2 = render(S2);
  const sekcje2 = new Set(d2.sekcje.map((s: any) => s.nazwa));
  const txt2 = formatuj(d2);
  const plaski2 = plaskiOf(d2);
  const f2 = d2.fakty;

  T("C1 sekcja poręczenia obecna", () => sekcje2.has("PORECZENIE"));
  T("C2 warunki zawieszające obecne", () => sekcje2.has("WARUNKI_ZAWIESZAJACE"));
  T("C3 cztery strony", () => d2.komparycja.strony.length === 4);
  T("C4 brak niepodstawionych pól", () => !txt2.includes("{{") && !txt2.includes("}}"));
  T("C5 wykryto wiele nieruchomości", () => f2.wiele_nieruchomosci);
  T("C6 wykryto opróżnione miejsce hipoteczne", () => f2.ma_oproznione_miejsce);
  T("C7 wykryto zrzeczenie służebności", () => f2.ma_zrzeczenia);
  T("C8 wykryto wymóg zgody małżonka", () => f2.wymaga_zgody_malzonka);
  T("C9 wykryto właściciela-osobę trzecią", () => f2.ma_wlasciciela_osobe_trzecia);
  T("C10 wykryto spłatę wierzyciela ze środków", () => f2.ma_splaty_wierzycieli);
  T("C11 wykryto wpis egzekucyjny", () => f2.ma_obciazenia_egzekucyjne);
  T("C12 powołano art. 101(1) u.k.w.h.", () => plaski2.includes("art. 101¹"));
  T("C13 powołano art. 37 k.r.o.", () => plaski2.includes("art. 37 § 1 pkt 1 k.r.o."));
  T("C14 klauzula hipoteki łącznej", () => plaski2.toLowerCase().includes("hipoteki mają charakter łączny"));
  T("C15 poprawna odmiana uprawnionej (dopełniacz)", () => plaski2.includes("Haliny Wiśniewskiej"));
  T("C16 uzgodnienie liczby czasownika (mnoga)", () => plaski2.includes("poddadzą się"));
  T("C17 brak klauzul o wekslu (usunięte)", () => !plaski2.toLowerCase().includes("weksel"));
  T("C17b brak klauzul o cesji polisy (usunięte)", () => !plaski2.toLowerCase().includes("polis"));
  T("C18 sześć załączników w scenariuszu złożonym", () => d2.zalaczniki.length === 6);
  T("C18c brak załącznika z oświadczeniem poręczyciela (treść jest w umowie)", () =>
    !d2.zalaczniki.some((z: any) => z.tytul.includes("Oświadczenie Poręczyciela")));
  T("C18d oświadczenie poręczyciela pozostaje jako klauzula umowy", () =>
    plaski2.includes("rozumie zakres i skutki prawne poręczenia"));
  T("C18b osobny załącznik: zgoda małżonka na poręczenie", () =>
    d2.zalaczniki.some((z: any) => z.tytul.includes("Poręczyciela na udzielenie poręczenia")));
  T("C19 dwie transze wypłaty", () => f2.wyplata_transze.length === 2);
  T("C20 kwota spłaty wierzyciela w tekście", () => plaski2.includes("142 350,00"));
  T("C21 powołano podstawę zrzeczenia", () => plaski2.includes("art. 910 § 1 w zw. z art. 246 § 1 k.c."));
  T("C22 umowa odnotowuje, że prawo trwa do chwili wykreślenia", () =>
    plaski2.includes("do chwili wykreślenia prawo pozostaje w mocy"));

  const podpunktyZrzecz = d2.sekcje
    .flatMap((s: any) => s.ustepy)
    .filter((u: any) => u.zrodlo === "WZA_05_zrzeczenie_sluzebnosci")
    .map((u: any) => u.tekst);
  T("C24a jeden podpunkt o zrzeczeniu", () => podpunktyZrzecz.length === 1);
  T("C24b warunek wypłaty = przedłożenie aktu notarialnego (decyzja biznesowa)", () =>
    podpunktyZrzecz.length > 0 && podpunktyZrzecz[0].startsWith("przedłożeniu Pożyczkodawcy wypisu aktu notarialnego"));
  T("C24c oświadczenie obejmuje zgodę na wykreślenie", () =>
    plaski2.includes("wraz ze zgodą na wykreślenie tego prawa"));
  T("C24d obowiązek wykreślenia po wypłacie (ZAB_10)", () =>
    plaski2.includes("doprowadzić do wykreślenia z księgi wieczystej"));
  T("C24e termin na doprowadzenie do wykreślenia", () => plaski2.includes("6 miesięcy od dnia wypłaty"));
  T("C24f sankcja za niewykreślenie", () => plaski2.includes("istotne naruszenie Umowy"));
  T("C25 brak klauzuli o ścieżce alternatywnej (WZA_05b usunięta)", () =>
    !plaski2.includes("odmówi wykreślenia prawa"));
  T("C25b brak odwołania do art. 913 k.c. w treści umowy", () => !plaski2.includes("art. 913"));
  T("C25c brak klauzuli o odstąpieniu (WZA_99 usunięta)", () => !plaski2.includes("odstąpić od Umowy"));

  // charakter hipoteki i zakres w obrębie KW
  T("C26 charakter hipoteki odczytany z danych", () => f2.charakter_hipoteki === "laczna");
  T("C27 hipoteka łączna przy wielu nieruchomościach", () => f2.hipoteka_laczna);
  T("C28 stopka w wariancie łącznym (art. 76 u.k.w.h.)", () =>
    plaski2.includes("z każdej z nieruchomości z osobna"));
  T("C29 wykryto KW z wieloma działkami", () => f2.ma_kw_wielodzialkowe);
  T("C30 klauzula o zakresie obciążenia w obrębie KW", () =>
    plaski2.includes("Obciążenie wybranej działki bez uprzedniego odłączenia"));

  // wariant odrębny
  const zOdr = clone(S2) as any;
  zOdr.zabezpieczenia.charakter_hipoteki = "odrebna";
  zOdr.nieruchomosci[1].hipoteka.kwota.cyframi = "200 000,00";
  const txtOdr = plaskiOf(renderuj(zOdr, BIB as any));
  T("C31 stopka w wariancie odrębnym", () => txtOdr.includes("nie mają charakteru łącznego"));
  T("C32 wariant odrębny nie zawiera treści łącznej", () =>
    !txtOdr.includes("z każdej z nieruchomości z osobna"));
});

// ══════════════════════════════════════════════════
//  D. Walidator — przypadki negatywne
// ══════════════════════════════════════════════════
describe("D. Walidator — przypadki negatywne", () => {
  T("D1 scenariusz prosty bez błędów", () => bledy(S1).length === 0);
  T("D2 scenariusz złożony bez błędów", () => bledy(S2).length === 0);

  T("D3 wykrycie: opróżnione miejsce bez wskazania wpisu", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].hipoteka.oproznione_miejsce_po = null;
    return bledy(z).some((b) => b.includes("oproznione_miejsce_po"));
  });
  T("D4 wykrycie: opróżnione miejsce bez faktycznego wykreślenia", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].obciazenia[0].sposob_usuniecia = "pozostaje_akceptowane";
    return bledy(z).some((b) => b.includes("nie jest oznaczone do wykreślenia"));
  });
  T("D5 wykrycie: właściciel=poręczyciel, a poręczyciela brak", () => {
    const z = clone(S2) as any;
    z.porecziciel = null;
    return bledy(z).some((b) => b.includes("poręczyciel nie został zdefiniowany"));
  });
  T("D6 wykrycie: właściciel-osoba trzecia bez danych", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].wlasciciel_dane = null;
    return bledy(z).some((b) => b.includes("wlasciciel_dane"));
  });
  T("D7 wykrycie: zrzeczenie bez wskazania uprawnionego", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].obciazenia[0].uprawniony_do_zrzeczenia = null;
    return bledy(z).some((b) => b.includes("uprawniony_do_zrzeczenia"));
  });
  T("D8 wykrycie: spłata wierzyciela bez kwoty", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].obciazenia[0].kwota_splaty = null;
    return bledy(z).some((b) => b.includes("kwota_splaty"));
  });
  T("D9 wykrycie: spłaty wierzycieli przekraczają kwotę pożyczki", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].obciazenia[0].kwota_splaty.cyframi = "999 000,00";
    return bledy(z).some((b) => b.includes("przekracza"));
  });
  T("D10 wykrycie: 777 dla nieistniejącego poręczyciela", () => {
    const z = clone(S1) as any;
    z.zabezpieczenia.egzekucja_777.poddaje_sie = ["pozyczkobiorca", "porecziciel"];
    return bledy(z).some((b) => b.includes("nie zdefiniowano poręczyciela"));
  });
  T("D11 wykrycie: deklaracja pierwszego miejsca mimo istniejącej hipoteki", () => {
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
    return bledy(z).some((b) => b.includes("pierwsze miejsce hipoteczne"));
  });
  T("D13 wykrycie: ta sama KW wskazana dwa razy", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].nr_kw = z.nieruchomosci[0].nr_kw;
    return bledy(z).some((b) => b.includes("wielokrotnie"));
  });
  T("D14 wykrycie: harmonogram balonowy bez raty końcowej", () => {
    const z = clone(S1) as any;
    z.warunki.harmonogram.kwota_raty_koncowej = null;
    return bledy(z).some((b) => b.includes("kwota_raty_koncowej"));
  });
  T("D15 ostrzeżenie: dożywocie pozostaje na nieruchomości", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].obciazenia[0].sposob_usuniecia = "pozostaje_akceptowane";
    return ostrzezenia(z).some((o) => o.includes("obniża wartość egzekucyjną"));
  });
  T("D16 ostrzeżenie: hipoteka nie pokrywa kwoty pożyczki", () => {
    const z = clone(S1) as any;
    z.nieruchomosci[0].hipoteka.kwota.cyframi = "10 000,00";
    return ostrzezenia(z).some((o) => o.includes("nie pokrywa kapitału"));
  });
  T("D17 ostrzeżenie: wpis egzekucyjny pozostaje", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].obciazenia[1].sposob_usuniecia = "pozostaje_akceptowane";
    return ostrzezenia(z).some((o) => o.includes("pierwszeństwo przed hipoteką"));
  });
  T("D18 wykrycie: po_odlaczeniu bez wskazania działek", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].zakres = "po_odlaczeniu";
    return bledy(z).some((b) => b.includes("dzialki_do_odlaczenia"));
  });
  T("D19 wykrycie: działka do odłączenia spoza KW", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].zakres = "po_odlaczeniu";
    z.nieruchomosci[1].dzialki_do_odlaczenia = ["999/9"];
    return bledy(z).some((b) => b.includes("nieujawnione w dzialki_w_kw"));
  });
  T("D20 ostrzeżenie: czas trwania postępowania wieczystoksięgowego", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[1].zakres = "po_odlaczeniu";
    z.nieruchomosci[1].dzialki_do_odlaczenia = ["145/3"];
    return ostrzezenia(z).some((o) => o.includes("ok. roku"));
  });
  T("D21 ostrzeżenie: odłączenie z nieruchomości obciążonej hipoteką", () => {
    const z = clone(S2) as any;
    z.nieruchomosci[0].zakres = "po_odlaczeniu";
    z.nieruchomosci[0].dzialki_w_kw = ["10/1", "10/2"];
    z.nieruchomosci[0].dzialki_do_odlaczenia = ["10/2"];
    return ostrzezenia(z).some((o) => o.includes("stanie się łączna"));
  });
  T("D22 ostrzeżenie: KW obejmuje kilka działek", () =>
    ostrzezenia(S2).some((o) => o.includes("hipoteka obciąży je wszystkie")));
  T("D23 ostrzeżenie: hipoteki odrębne o identycznych kwotach", () => {
    const z = clone(S2) as any;
    z.zabezpieczenia.charakter_hipoteki = "odrebna";
    return ostrzezenia(z).some((o) => o.includes("czy nie chodziło o hipotekę łączną"));
  });
});

// ══════════════════════════════════════════════════
//  F. Zakres odpowiedzialności poręczyciela (3 przypadki)
// ══════════════════════════════════════════════════
describe("F. Zakres odpowiedzialności poręczyciela", () => {
  // F1: zgoda niewymagana (rozdzielność) -> pełna odpowiedzialność
  const f1 = (() => {
    const z = clone(S2) as any;
    z.porecziciel.ustroj_majatkowy = "rozdzielnosc";
    z.porecziciel.zgoda_malzonka = null;
    return z;
  })();
  const fz1 = render(f1).fakty;
  T("F1a zgoda niewymagana przy rozdzielności", () => !fz1.porecziciel_wymaga_zgody_malzonka);
  T("F1b pełna odpowiedzialność (rzeczowa+osobista)", () => fz1.porecziciel_pelna_odpowiedzialnosc);
  T("F1c brak klauzuli o ograniczeniu", () => !plaski(f1).includes("art. 41 § 2 k.r.o."));
  T("F1d brak błędów walidacji", () => bledy(f1).length === 0);

  // F2: zgoda wymagana i udzielona -> pełna odpowiedzialność + majątek wspólny
  const f2case = (() => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = { na_hipoteke: true, na_poreczenie: true };
    return z;
  })();
  const fz2 = render(f2case).fakty;
  const p2 = plaski(f2case);
  T("F2a pełna odpowiedzialność przy zgodzie", () => fz2.porecziciel_pelna_odpowiedzialnosc);
  T("F2b brak ograniczenia", () => !fz2.porecziciel_ograniczenie_do_majatku_osobistego);
  T("F2c powołano art. 41 § 1 k.r.o.", () => p2.includes("art. 41 § 1 k.r.o."));
  T("F2d egzekucja także z majątku wspólnego", () => p2.includes("jak i z majątku wspólnego małżonków"));

  // F3: zgoda wymagana, NIE udzielona -> poręczenie zostaje, egzekucja ograniczona
  const f3case = (() => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = { na_hipoteke: true, na_poreczenie: false };
    return z;
  })();
  const fz3 = render(f3case).fakty;
  const p3 = plaski(f3case);
  T("F3a wykryto ograniczenie do majątku osobistego", () => fz3.porecziciel_ograniczenie_do_majatku_osobistego);
  T("F3b poręczenie ZOSTAJE w mocy (wariant B, nie rezygnacja)", () => fz3.porecziciel_odpowiada_osobiscie);
  T("F3c powołano art. 41 § 2 k.r.o.", () => p3.includes("art. 41 § 2 k.r.o."));
  T("F3d poręczenie ważne mimo braku zgody", () => p3.includes("nie powoduje nieważności poręczenia"));
  T("F3e majątek wspólny wyłączony", () => p3.includes("z wyłączeniem majątku wspólnego"));
  T("F3f klauzula poręczenia nadal obecna", () => p3.includes("poręcza za zobowiązania"));
  T("F3g ostrzeżenie walidatora o ograniczeniu egzekucji", () =>
    ostrzezenia(f3case).some((o) => o.includes("art. 41 § 2 k.r.o.")));

  // F4: odpowiedzialność wyłącznie rzeczowa
  const f4case = (() => {
    const z = clone(S2) as any;
    z.porecziciel.zakres_odpowiedzialnosci = "rzeczowa";
    z.porecziciel.zgoda_malzonka = { na_hipoteke: true, na_poreczenie: false };
    return z;
  })();
  const fz4 = render(f4case).fakty;
  const p4 = plaski(f4case);
  T("F4a wykryto odpowiedzialność wyłącznie rzeczową", () => fz4.porecziciel_tylko_rzeczowo);
  T("F4b brak odpowiedzialności osobistej", () => !fz4.porecziciel_odpowiada_osobiscie);
  T("F4c klauzula o braku poręczenia osobistego", () => p4.includes("nie udziela poręczenia osobistego"));
  T("F4d brak klauzuli o solidarności", () => !p4.includes("art. 881 k.c."));
  T("F4e tytuł sekcji dostosowany do wariantu rzeczowego", () =>
    tytulSekcji(f4case, "PORECZENIE") === "ZABEZPIECZENIE RZECZOWE PORĘCZYCIELA");

  T("D24 wykrycie: wspólność ustawowa bez określonych zgód", () => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = null;
    return bledy(z).some((b) => b.includes("zgoda_malzonka"));
  });
  T("D25 wykrycie: brak zgody na hipotekę mimo wnoszonej nieruchomości", () => {
    const z = clone(S2) as any;
    z.porecziciel.zgoda_malzonka = { na_hipoteke: false, na_poreczenie: true };
    return bledy(z).some((b) => b.includes("hipoteka nie powstanie"));
  });
  T("D26 wykrycie: odpowiedzialność rzeczowa bez nieruchomości poręczyciela", () => {
    const z = clone(S3) as any;
    z.porecziciel.zakres_odpowiedzialnosci = "rzeczowa";
    z.nieruchomosci[0].wlasciciel_ref = "pozyczkobiorca";
    return bledy(z).some((b) => b.includes("nie ma z czego prowadzić egzekucji"));
  });
});

// ══════════════════════════════════════════════════
//  G. Wielu pożyczkobiorców (solidarność, art. 366 k.c.)
// ══════════════════════════════════════════════════
describe("G. Wielu pożyczkobiorców", () => {
  const d4 = render(S4);
  const f4 = d4.fakty;
  const p4txt = plaskiOf(d4);

  T("G1 rozpoznano dwóch pożyczkobiorców", () => f4.liczba_pozyczkobiorcow === 2);
  T("G2 flaga wielu pożyczkobiorców", () => f4.wielu_pozyczkobiorcow);
  T("G3 solidarność dłużników", () => f4.dluznicy_solidarni);
  T("G4 powołano art. 366 k.c.", () => p4txt.includes("art. 366 k.c."));
  T("G5 treść klauzuli solidarności", () => p4txt.includes("od każdego z osobna"));

  const stronyPb = d4.komparycja.strony.filter((s: any) => s.grupa === "pozyczkobiorca");
  T("G6 obaj pożyczkobiorcy w komparycji", () => stronyPb.length === 2);
  T("G7 rola w liczbie mnogiej", () => stronyPb.every((s: any) => s.rola === "Pożyczkobiorcami"));

  T("G8 czasownik w liczbie mnogiej", () => p4txt.includes("Pożyczkobiorcy oświadczają"));
  T("G9 orzecznik w liczbie mnogiej", () => p4txt.includes("są przedsiębiorcami"));
  T("G10 zaimek w liczbie mnogiej", () => p4txt.includes("przysługuje im prawo własności"));
  T("G11 poprawny przypadek zaimka", () => p4txt.includes("ma dla nich charakter zawodowy"));
  T("G12 brak błędów przypadka", () => !p4txt.includes("dla im") && !p4txt.includes("przez niego działalnością"));

  T("G13 wykryto małżonków jako współdłużników", () => f4.malzonkowie_oboje_pozyczkobiorcami);
  T("G14 zgoda małżonka NIEwymagana, gdy oboje są pożyczkobiorcami", () => !f4.wymaga_zgody_malzonka);
  T("G15 brak zbędnego załącznika ze zgodą małżonka", () =>
    !d4.zalaczniki.some((z: any) => z.tytul.includes("Zgoda małżonka")));
  T("G16 umowa wyjaśnia, dlaczego zgoda nie jest potrzebna", () =>
    p4txt.includes("nie jest wymagana odrębna zgoda małżonka"));
  T("G17 powołano podstawę", () => p4txt.includes("art. 37 § 1 k.r.o."));

  const d1b = render(S1);
  const f1b = d1b.fakty;
  const p1b = plaskiOf(d1b);
  T("G18 pojedynczy pożyczkobiorca (obiekt)", () => f1b.liczba_pozyczkobiorcow === 1);
  T("G19 brak solidarności przy jednym dłużniku", () => !f1b.dluznicy_solidarni);
  T("G20 brak klauzuli solidarności przy jednym dłużniku", () => !p1b.includes("art. 366 k.c."));
  T("G21 liczba pojedyncza zachowana", () => p1b.includes("Pożyczkobiorca oświadcza"));

  T("G22 tablica jednoelementowa daje identyczny wynik co obiekt", () => {
    const z = clone(S1) as any;
    z.pozyczkobiorca = [z.pozyczkobiorca];
    return plaskiOf(renderuj(z, BIB as any)) === p1b;
  });

  T("D27 zgoda małżonka wymagana, gdy tylko jeden małżonek jest stroną", () => {
    const z = clone(S4) as any;
    z.pozyczkobiorca = [z.pozyczkobiorca[0]];
    return render(z).fakty.wymaga_zgody_malzonka;
  });
  T("D27b flaga poprawnie na False", () => {
    const z = clone(S4) as any;
    z.pozyczkobiorca = [z.pozyczkobiorca[0]];
    return !render(z).fakty.malzonkowie_oboje_pozyczkobiorcami;
  });
  T("G23 scenariusz 04 bez błędów walidacji", () => bledy(S4).length === 0);
});

// ══════════════════════════════════════════════════
//  H. Formy spółek, reprezentacja, uchwały korporacyjne
// ══════════════════════════════════════════════════
describe("H. Formy spółek, reprezentacja, uchwały", () => {
  const d5 = render(S5);
  const f5 = d5.fakty;
  const p5 = plaskiOf(d5);
  const kompar5 = komparOpis(d5);

  T("H1 wykryto strony będące spółkami", () => f5.ma_strone_bedaca_spolka);
  T("H2 wykryto reprezentację łączną", () => f5.ma_reprezentacje_laczna);
  T("H3 dwie uchwały do przedłożenia", () => f5.uchwaly_do_przedlozenia.length === 2);

  T("H4 poprawna odmiana funkcji i nazwiska", () => kompar5.includes("prezesa zarządu Mareka Wiśniewskiego"));
  T("H5 adnotacja o reprezentacji łącznej", () => kompar5.includes("działających łącznie"));
  T("H6 brak błędów odmiany", () => !kompar5.includes("zarządua") && !kompar5.includes("Wiśniewskego"));
  T("H7 spółka jawna: wspólnik", () => kompar5.includes("wspólnika Mareka Wiśniewskiego"));

  T("H8 uchwała z art. 230 k.s.h. w warunkach", () => p5.includes("art. 230 k.s.h."));
  T("H9 uchwała z art. 228 pkt 4 k.s.h. w warunkach", () => p5.includes("art. 228 pkt 4 k.s.h."));
  T("H10 wskazano organ", () => p5.includes("zgromadzenia wspólników"));
  T("H11 wskazano czynność", () => p5.includes("obciążenie nieruchomości hipoteką"));

  T("H12 klauzula o umocowaniu", () => p5.includes("należycie umocowane do ich reprezentowania"));
  T("H13 klauzula o zgodach korporacyjnych", () => p5.includes("art. 228 i art. 230 Kodeksu spółek handlowych"));
  T("H14 klauzula o reprezentacji łącznej", () =>
    p5.includes("oświadczenia woli w imieniu tej strony składają wszystkie osoby"));

  T("H15 dopełniacz -ski", () => odmienDopelniacz("Marek Wiśniewski") === "Mareka Wiśniewskiego");
  T("H16 dopełniacz -ska", () => odmienDopelniacz("Halina Wiśniewska") === "Haliny Wiśniewskiej");
  T("H17 nazwisko kobiety na spółgłoskę nieodmienne", () => odmienDopelniacz("Anna Kowalczyk") === "Anny Kowalczyk");
  T("H18 biernik j.w.", () => odmienBiernik("Anna Kowalczyk") === "Annę Kowalczyk");
  T("H19 nazwisko mężczyzny odmienne", () => odmienDopelniacz("Marek Kowalczyk") === "Mareka Kowalczyka");

  T("D28 wykrycie: spółka cywilna bez wskazania wspólników", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.forma = "spolka_cywilna";
    z.pozyczkobiorca.wspolnicy_sc = null;
    return bledy(z).some((b) => b.includes("wspolnicy_sc"));
  });
  T("D29 wykrycie: spółka bez reprezentacji", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.reprezentacja = null;
    return bledy(z).some((b) => b.includes("osób reprezentujących"));
  });
  T("D30 wykrycie: reprezentacja łączna z jedną osobą", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.reprezentacja = [z.pozyczkobiorca.reprezentacja[0]];
    return bledy(z).some((b) => b.includes("mniej niż dwie osoby"));
  });
  T("D31 wykrycie: brak pola uchwały na obciążenie nieruchomości (art. 228 pkt 4)", () => {
    const z = clone(S5) as any;
    z.nieruchomosci[1].wlasciciel_dane.uchwala_nieruchomosc = null;
    return bledy(z).some((b) => b.includes("NIEWAŻNOŚCIĄ"));
  });
  T("D32 ostrzeżenie: zobowiązanie > 2x kapitał bez uchwały", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie = {
      wymagana: false, podstawa: null, organ: null, przedlozona: false,
      data: null, numer: null, wylaczona_umowa_spolki: false,
    };
    return ostrzezenia(z).some((o) => o.includes("art. 230 k.s.h."));
  });
  T("D32b ostrzeżenie odróżnia art. 230 od art. 228 (brak sankcji nieważności)", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie = {
      wymagana: false, podstawa: null, organ: null, przedlozona: false,
      data: null, numer: null, wylaczona_umowa_spolki: false,
    };
    return ostrzezenia(z).some((o) => o.includes("NIE powoduje nieważności"));
  });
  T("D33 ostrzeżenie: pełnomocnik bez podstawy", () => {
    const z = clone(S5) as any;
    z.pozyczkodawca.reprezentacja[0].podstawa = null;
    return ostrzezenia(z).some((o) => o.includes("podstawy umocowania"));
  });
  T("D34 ostrzeżenie: uchwała bez identyfikacji", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie.przedlozona = true;
    return ostrzezenia(z).some((o) => o.includes("bez daty i numeru"));
  });

  T("H20 przedłożona uchwała nie generuje warunku zawieszającego", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie = {
      ...z.pozyczkobiorca.uchwala_zobowiazanie,
      przedlozona: true, data: "10.11.2026", numer: "3/2026",
    };
    return render(z).fakty.uchwaly_do_przedlozenia.length === 1;
  });
  T("H21 wyłączenie umową spółki znosi wymóg uchwały", () => {
    const z = clone(S5) as any;
    z.pozyczkobiorca.uchwala_zobowiazanie.wylaczona_umowa_spolki = true;
    return render(z).fakty.uchwaly_do_przedlozenia.length === 1;
  });

  // spółka cywilna: stroną są wspólnicy
  const scCase = (() => {
    const z = clone(S5) as any;
    z.pozyczkobiorca = {
      typ: "podmiot_gospodarczy", nazwa: "KOWALSCY s.c.", forma: "spolka_cywilna",
      forma_prawna: "s.c.", krs: null, nip: "7122334455", regon: "061234567",
      adres: "ul. Polna 3, 20-100 Lublin", telefon: null, email: null,
      reprezentacja: null, reprezentacja_laczna: false, kapital_zakladowy: null,
      wspolnicy_sc: [
        { typ: "osoba_fizyczna", imie_nazwisko: "Jan Kowalski", firma: null, pesel: "70010112345", nip: null, regon: null, dokument_tozsamosci: null, adres: "ul. Polna 3, 20-100 Lublin", telefon: null, email: null, stan_cywilny: null, ustroj_majatkowy: null },
        { typ: "osoba_fizyczna", imie_nazwisko: "Piotr Kowalski", firma: null, pesel: "72020254321", nip: null, regon: null, dokument_tozsamosci: null, adres: "ul. Polna 3, 20-100 Lublin", telefon: null, email: null, stan_cywilny: null, ustroj_majatkowy: null },
      ],
    };
    z.nieruchomosci[0].wlasciciel_ref = "porecziciel";
    return z;
  })();
  const dSc = render(scCase);
  const kSc = komparOpis(dSc);
  const pSc = plaskiOf(dSc);
  T("H22 spółka cywilna: wspólnicy w komparycji", () => kSc.includes("wspólnicy spółki cywilnej"));
  T("H23 obaj wspólnicy wymienieni", () => kSc.includes("JAN KOWALSKI") && kSc.includes("PIOTR KOWALSKI"));
  T("H24 klauzula o solidarnej odpowiedzialności wspólników s.c.", () => pSc.includes("art. 864 k.c."));

  T("H25 stara forma reprezentacji (obiekt) nadal poprawna", () => validateSchema(S1).length === 0);
  T("H26 obiekt i tablica jednoelementowa dają ten sam wynik", () => {
    const z = clone(S1) as any;
    z.pozyczkodawca.reprezentacja = [z.pozyczkodawca.reprezentacja];
    return komparOpis(render(S1)) === komparOpis(renderuj(z, BIB as any));
  });
});

// ══════════════════════════════════════════════════
//  I. Regresja: usunięte zabezpieczenia
// ══════════════════════════════════════════════════
describe("I. Regresja: usunięte zabezpieczenia", () => {
  const bibBlob = JSON.stringify(BIB).toLowerCase();
  const schemaBlob = JSON.stringify(SCHEMA_JSON);

  T("I1 brak klauzul o wekslu w bibliotece", () => !bibBlob.includes("weksl") && !bibBlob.includes("wekslow"));
  T("I2 brak klauzul o cesji polisy w bibliotece", () => !bibBlob.includes("cesja_polisy") && !bibBlob.includes("polisy"));
  T("I3 brak weksla w schemacie", () => !schemaBlob.includes("weksel_in_blanco"));
  T("I4 brak cesji polisy w schemacie", () => !schemaBlob.includes("cesja_polisy"));

  T("I5 schemat odrzuca dane z polem weksel_in_blanco", () => {
    const z = clone(S2) as any;
    z.zabezpieczenia.weksel_in_blanco = { wystawca: "pozyczkobiorca" };
    return validateSchema(z).length > 0;
  });

  const scenariusze: Array<[string, any]> = [["S1", S1], ["S2", S2], ["S3", S3], ["S4", S4], ["S5", S5]];
  it("I6 brak treści o wekslu/polisie w scenariuszach", () => {
    for (const [, s] of scenariusze) {
      const t = plaski(s).toLowerCase();
      expect(!t.includes("weksel") && !t.includes("wekslow") && !t.includes("polisy")).toBe(true);
    }
  });

  T("I7 brak wariantu ułamkowego w schemacie", () => !schemaBlob.includes("ulamkowa"));
  T("I8 brak klauzuli o zgodzie współwłaścicieli", () =>
    !bibBlob.includes("wspolwlascicieli") && !bibBlob.includes("współwłaścicieli"));
  T("I9 brak odwołania do art. 199 k.c.", () => !bibBlob.includes("art. 199 k.c."));

  T("I10 schemat odrzuca współwłasność ułamkową", () => {
    const z = clone(S2) as any;
    for (const n of z.nieruchomosci) if (n.wspolwlasnosc) n.wspolwlasnosc.rodzaj = "ulamkowa";
    return validateSchema(z).length > 0;
  });

  it("I11/I12 brak treści i załącznika o zgodzie współwłaścicieli", () => {
    for (const [, s] of scenariusze) {
      const t = plaski(s).toLowerCase();
      expect(t.includes("współwłaścicieli")).toBe(false);
      const z = render(s).zalaczniki;
      expect(z.some((x: any) => x.tytul.includes("współwłaścicieli"))).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════
//  E. Determinizm
// ══════════════════════════════════════════════════
describe("E. Determinizm", () => {
  T("E1 renderowanie deterministyczne (dwa przebiegi identyczne)", () =>
    formatuj(render(S2)) === formatuj(render(S2)));
});
