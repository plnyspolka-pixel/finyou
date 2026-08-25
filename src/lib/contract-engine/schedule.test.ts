/**
 * Testy walidacji harmonogramu (pkt 3.2) i adaptera z kalkulatora.
 * Każda mutacja psująca niezmiennik musi dać błąd blokujący.
 */
import { describe, it, expect } from "vitest";
import {
  walidujHarmonogram,
  autonaprawHarmonogram,
  payloadDoRaty,
  formatKwotaPL,
  parseKwota,
} from "./schedule";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T>(o: T): T => structuredClone(o);

// poprawny harmonogram w modelu silnika: K=1000, prowizja=100, 2 raty
function warunkiOk(): any {
  return {
    kwota_pozyczki: { cyframi: "1 000,00", slownie: "tysiąc złotych 00/100" },
    prowizja: {
      kwota: { cyframi: "100,00", slownie: "sto złotych 00/100" },
      model: "nie_potracana_raty",
    },
    harmonogram: {
      liczba_rat: 2,
      typ: "rowne_raty",
      data_pierwszej_raty: "15.02.2026",
      dzien_miesiaca: 15,
      raty: [
        {
          nr: 1,
          termin: "15.02.2026",
          kapital: "500,00",
          odsetki: "10,00",
          prowizja: "50,00",
          rata_razem: "560,00",
          saldo: "500,00",
        },
        {
          nr: 2,
          termin: "15.03.2026",
          kapital: "500,00",
          odsetki: "5,00",
          prowizja: "50,00",
          rata_razem: "555,00",
          saldo: "0,00",
        },
      ],
    },
  };
}
const bledy = (w: any) => walidujHarmonogram(w).map((p) => p.komunikat);

describe("Walidacja harmonogramu (3.2)", () => {
  it("poprawny harmonogram — bez błędów", () => expect(bledy(warunkiOk())).toEqual([]));

  it("pusty harmonogram — nic do sprawdzenia", () => {
    const w = warunkiOk();
    w.harmonogram.raty = [];
    expect(bledy(w)).toEqual([]);
  });

  it("R1 liczba wierszy ≠ liczba_rat", () => {
    const w = warunkiOk();
    w.harmonogram.liczba_rat = 3;
    expect(bledy(w).some((b) => b.includes("różni się od liczba_rat"))).toBe(true);
  });

  it("R2 suma kapitału ≠ Kwota Pożyczki", () => {
    const w = warunkiOk();
    w.harmonogram.raty[0].kapital = "400,00";
    w.harmonogram.raty[0].rata_razem = "460,00";
    w.harmonogram.raty[0].saldo = "600,00"; // utrzymaj monotoniczność, złam tylko sumę
    w.harmonogram.raty[1].saldo = "100,00";
    expect(bledy(w).some((b) => b.includes("Suma kapitału"))).toBe(true);
  });

  it("R3 suma prowizji ≠ kwota prowizji z §2", () => {
    const w = warunkiOk();
    w.harmonogram.raty[0].prowizja = "40,00";
    w.harmonogram.raty[0].rata_razem = "550,00";
    expect(bledy(w).some((b) => b.includes("Suma prowizji"))).toBe(true);
  });

  it("R4 rata_razem ≠ kapitał+odsetki+prowizja", () => {
    const w = warunkiOk();
    w.harmonogram.raty[0].rata_razem = "999,00";
    expect(bledy(w).some((b) => b.includes("rata_razem"))).toBe(true);
  });

  it("R5 saldo ostatniej raty ≠ 0", () => {
    const w = warunkiOk();
    w.harmonogram.raty[1].saldo = "10,00";
    expect(bledy(w).some((b) => b.includes("Saldo po ostatniej racie"))).toBe(true);
  });

  it("R6 saldo nie maleje monotonicznie o kapitał", () => {
    const w = warunkiOk();
    w.harmonogram.raty[0].saldo = "480,00"; // ≠ 1000-500
    expect(bledy(w).some((b) => b.includes("poprzednie saldo − kapitał"))).toBe(true);
  });

  it("R7a pierwszy termin ≠ data_pierwszej_raty", () => {
    const w = warunkiOk();
    w.harmonogram.raty[0].termin = "16.02.2026";
    expect(bledy(w).some((b) => b.includes("data_pierwszej_raty"))).toBe(true);
  });

  it("R7b terminy nie rosną", () => {
    const w = warunkiOk();
    w.harmonogram.raty[1].termin = "15.01.2026";
    expect(bledy(w).some((b) => b.includes("Terminy rat nie rosną"))).toBe(true);
  });

  it("R8 balonowy: ostatnia rata ≠ kwota_raty_koncowej", () => {
    const w = warunkiOk();
    w.harmonogram.typ = "balonowy";
    w.harmonogram.kwota_raty_koncowej = { cyframi: "900,00", slownie: "x" };
    expect(bledy(w).some((b) => b.includes("Rata końcowa"))).toBe(true);
  });

  it("tolerancja groszowa nie zgłasza drobnych zaokrągleń", () => {
    const w = warunkiOk();
    w.harmonogram.raty[0].odsetki = "10,03"; // +0,03
    w.harmonogram.raty[0].rata_razem = "560,03";
    // suma odsetek nie jest sprawdzana wprost; rata_razem wciąż spójna → brak błędu
    expect(bledy(w)).toEqual([]);
  });
});

// Harmonogram balonowy „po Kańkowskich": rata balonowa niższa o rozjazd
// z zaokrągleń niż suma jej składników (kapitał + odsetki + prowizja).
function warunkiBalonoweZRozjazdem(rozjazd: number): any {
  const w = warunkiOk();
  w.harmonogram.typ = "balonowy";
  // składniki ostatniej raty: 500 + 5 + 50 = 555; rata_razem zaniżona o rozjazd
  const zle = 555 - rozjazd;
  w.harmonogram.raty[1].rata_razem = formatKwotaPL(zle);
  w.harmonogram.kwota_raty_koncowej = {
    cyframi: formatKwotaPL(zle),
    slownie: "x",
  };
  return w;
}

describe("Autonaprawa rozjazdu groszowego (zmiana 4)", () => {
  it("rozjazd 1 zł na racie balonowej → skorygowany, walidacja przechodzi", () => {
    const w = warunkiBalonoweZRozjazdem(1);
    expect(bledy(w).length).toBeGreaterThan(0); // przed autonaprawą: błąd spójności
    const korekty = autonaprawHarmonogram(w);
    expect(korekty.length).toBeGreaterThan(0);
    expect(w.harmonogram.raty[1].rata_razem).toBe("555,00");
    expect(w.harmonogram.kwota_raty_koncowej.cyframi).toBe("555,00");
    expect(bledy(w)).toEqual([]); // fundament „suma rat = suma składników" przechodzi
  });

  it("korekta jest odnotowana w wyniku (o ile i gdzie)", () => {
    const w = warunkiBalonoweZRozjazdem(1);
    const korekty = autonaprawHarmonogram(w);
    expect(korekty[0].kwota).toBeCloseTo(1);
    expect(korekty[0].sciezka).toContain("raty[1].rata_razem");
    expect(korekty[0].komunikat).toContain("Autonaprawa zaokrągleń");
  });

  it("rozjazd 500 zł → ZA DUŻY na zaokrąglenie, błąd konstrukcyjny zostaje", () => {
    const w = warunkiBalonoweZRozjazdem(500);
    const korekty = autonaprawHarmonogram(w);
    expect(korekty).toEqual([]);
    expect(bledy(w).length).toBeGreaterThan(0);
  });

  it("rozjazd w granicach tolerancji groszowej (≤ 5 gr) → nic do domykania", () => {
    const w = warunkiBalonoweZRozjazdem(0.05);
    expect(autonaprawHarmonogram(w)).toEqual([]);
    expect(bledy(w)).toEqual([]);
  });

  it("rozjazd we wcześniejszej racie → nie domykamy (to nie zaokrąglenie)", () => {
    const w = warunkiBalonoweZRozjazdem(1);
    w.harmonogram.raty[0].rata_razem = "559,00"; // składniki: 560
    expect(autonaprawHarmonogram(w)).toEqual([]);
    expect(bledy(w).length).toBeGreaterThan(0);
  });

  it("pusty harmonogram → brak korekt", () => {
    const w = warunkiOk();
    w.harmonogram.raty = [];
    expect(autonaprawHarmonogram(w)).toEqual([]);
  });
});

describe("Adapter LoanCalcPayload → raty", () => {
  const payload = {
    schedule: [
      { idx: 1, date: "15.02.2026", rata: 510, kap: 500, ods: 10, saldo: 500 },
      { idx: 2, date: "15.03.2026", rata: 505, kap: 500, ods: 5, saldo: 0 },
    ],
  } as any;

  it("mapuje pola i dolicza prowizję jako łączną kwotę", () => {
    const raty = payloadDoRaty(payload, 100);
    expect(raty).toHaveLength(2);
    expect(raty[0]).toMatchObject({
      nr: 1,
      termin: "15.02.2026",
      kapital: "500,00",
      odsetki: "10,00",
      prowizja: "50,00",
      rata_razem: "560,00",
      saldo: "500,00",
    });
    expect(raty[1].prowizja).toBe("50,00");
  });

  it("przyjmuje prowizję per rata (tablica)", () => {
    const raty = payloadDoRaty(payload, [30, 70]);
    expect(raty[0].prowizja).toBe("30,00");
    expect(raty[1].prowizja).toBe("70,00");
    expect(raty[1].rata_razem).toBe("575,00"); // 500+5+70
  });

  it("wynik adaptera przechodzi walidację harmonogramu", () => {
    const raty = payloadDoRaty(payload, 100);
    const w = {
      kwota_pozyczki: { cyframi: "1 000,00" },
      prowizja: { kwota: { cyframi: "100,00" } },
      harmonogram: { liczba_rat: 2, typ: "rowne_raty", data_pierwszej_raty: "15.02.2026", raty },
    };
    expect(walidujHarmonogram(w)).toEqual([]);
  });
});

describe("Formatowanie/parsowanie kwot", () => {
  it("formatKwotaPL", () => {
    expect(formatKwotaPL(1234.5)).toBe("1 234,50");
    expect(formatKwotaPL(1000000)).toBe("1 000 000,00");
    expect(formatKwotaPL(0)).toBe("0,00");
  });
  it("parseKwota", () => {
    expect(parseKwota("1 234,56")).toBeCloseTo(1234.56);
    expect(parseKwota("1234.56")).toBeCloseTo(1234.56);
  });
});
