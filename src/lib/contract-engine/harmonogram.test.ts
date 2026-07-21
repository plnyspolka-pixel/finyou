/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { walidujHarmonogram } from "./harmonogram";

function daneZHarmonogramem(raty: any[], nadpisz: any = {}): any {
  return {
    warunki: {
      kwota_pozyczki: { cyframi: "1 000,00", slownie: "tysiąc złotych 00/100" },
      prowizja: { kwota: { cyframi: "100,00", slownie: "sto złotych 00/100" }, model: "nie_potracana_raty" },
      harmonogram: {
        liczba_rat: raty.length,
        typ: "rowne_raty",
        data_pierwszej_raty: "05.02.2026",
        dzien_miesiaca: 5,
        raty,
        ...nadpisz,
      },
    },
  };
}

const RATY_OK = [
  { nr: 1, termin: "05.02.2026", kapital: "500,00", odsetki: "10,00", prowizja: "50,00", rata_razem: "560,00", saldo: "500,00" },
  { nr: 2, termin: "05.03.2026", kapital: "500,00", odsetki: "5,00", prowizja: "50,00", rata_razem: "555,00", saldo: "0,00" },
];

const bledy = (d: any) => walidujHarmonogram(d).map((p) => p.komunikat);
const T = (label: string, fn: () => boolean) => it(label, () => expect(fn()).toBe(true));

describe("Walidacja harmonogramu (§3.2)", () => {
  T("H-OK poprawny harmonogram nie generuje błędów", () => bledy(daneZHarmonogramem(RATY_OK)).length === 0);
  T("H-brak tabeli: nic do sprawdzenia", () => bledy(daneZHarmonogramem([])).length === 0);

  T("H-liczba: liczba wierszy != liczba_rat", () =>
    bledy(daneZHarmonogramem(RATY_OK, { liczba_rat: 3 })).some((b) => b.includes("wierszy")));

  T("H-kapital: suma kapitału != Kwota Pożyczki", () => {
    const r = structuredClone(RATY_OK);
    r[0].kapital = "400,00";
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("Suma kapitału"));
  });

  T("H-prowizja: suma prowizji != §2", () => {
    const r = structuredClone(RATY_OK);
    r[0].prowizja = "10,00";
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("Suma prowizji"));
  });

  T("H-razem: suma rat != kapitał+prowizja+odsetki", () => {
    const r = structuredClone(RATY_OK);
    r[0].rata_razem = "999,00";
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("Suma rat"));
  });

  T("H-saldo-monotoniczne: saldo nie maleje o kapitał", () => {
    const r = structuredClone(RATY_OK);
    r[0].saldo = "600,00"; // powinno być 500
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("pomniejszonemu o kapitał"));
  });

  T("H-saldo-koncowe: ostatnie saldo != 0", () => {
    const r = structuredClone(RATY_OK);
    r[1].saldo = "50,00";
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("powinno wynosić 0,00"));
  });

  T("H-termin-pierwszy: pierwszy termin != data_pierwszej_raty", () => {
    const r = structuredClone(RATY_OK);
    r[0].termin = "06.02.2026";
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("data_pierwszej_raty"));
  });

  T("H-termin-rosnacy: terminy nie rosną", () => {
    const r = structuredClone(RATY_OK);
    r[1].termin = "05.02.2026"; // taki sam jak pierwszy
    return bledy(daneZHarmonogramem(r)).some((b) => b.includes("nie jest późniejszy"));
  });

  T("H-tolerancja: różnica groszowa (0,03) mieści się w tolerancji", () => {
    const r = structuredClone(RATY_OK);
    r[0].kapital = "500,02";
    r[1].kapital = "499,98"; // suma nadal 1000,00 — ale saldo r0 = 1000-500,02
    r[0].saldo = "499,98";
    return bledy(daneZHarmonogramem(r)).length === 0;
  });

  T("H-balon: ostatnia rata != kwota_raty_koncowej", () => {
    const r = structuredClone(RATY_OK);
    const d = daneZHarmonogramem(r, { typ: "balonowy", kwota_raty_koncowej: { cyframi: "900,00", slownie: "dziewięćset złotych 00/100" } });
    return bledy(d).some((b) => b.includes("balonowa"));
  });
});
