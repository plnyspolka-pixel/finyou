import { describe, expect, it } from "vitest";
import {
  computeZaleglosc,
  effectiveDueDate,
  generateHarmonogram,
  isNonWorkingDay,
  normalizeHarmonogram,
  parseDataISO,
  parseKwota,
  polishHolidays,
} from "./windykacja-harmonogram";

// Scenariusz testowy z dokumentów dla modułu: 12 rat po 7 868,48 zł od
// 10.07.2026, rata 1 zapłacona przed terminem, rata 2 częściowo (4 000 zł,
// 2 dni po terminie), rata 3 niezapłacona; stan na 06.10.2026, stopa 18,5%.
const RATY = generateHarmonogram({
  pierwszaRata: "2026-07-10",
  liczbaRat: 12,
  kwotaRaty: 7868.48,
  kwotaOstatniejRaty: 7868.37,
});
const WPLATY = [
  { paid_on: "2026-07-09", amount: 7868.48 },
  { paid_on: "2026-08-12", amount: 4000 },
];

describe("harmonogram", () => {
  it("generuje raty miesięczne, z ostatnim dniem miesiąca w krótszych miesiącach", () => {
    expect(RATY).toHaveLength(12);
    expect(RATY[0]).toEqual({ nr: 1, termin: "2026-07-10", kwota: 7868.48 });
    expect(RATY[11]).toEqual({ nr: 12, termin: "2027-06-10", kwota: 7868.37 });
    const koniec = generateHarmonogram({
      pierwszaRata: "2026-01-31",
      liczbaRat: 3,
      kwotaRaty: 100,
    });
    expect(koniec.map((r) => r.termin)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("normalizuje dane z OCR i formularza: polskie kwoty i daty, sortowanie, odrzucanie śmieci", () => {
    const n = normalizeHarmonogram([
      { nr: 2, termin: "10.08.2026", kwota: "7 868,48" },
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: "966,67" },
      { nr: 3, termin: "brak", kwota: 100 },
      { nr: 4, termin: "2026-09-10", kwota: 0 },
    ]);
    expect(n).toEqual([
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: 966.67 },
      { nr: 2, termin: "2026-08-10", kwota: 7868.48 },
    ]);
    expect(normalizeHarmonogram([])).toBeNull();
    expect(normalizeHarmonogram("x")).toBeNull();
  });

  it("parsuje kwoty i daty w polskim formacie", () => {
    expect(parseKwota("1.234,56 zł")).toBe(1234.56);
    expect(parseKwota("7868.48")).toBe(7868.48);
    expect(parseKwota("abc")).toBeNull();
    expect(parseDataISO("5.3.2026")).toBe("2026-03-05");
    expect(parseDataISO("2026-02-30")).toBeNull();
  });
});

describe("art. 115 k.c.", () => {
  it("zna święta ruchome i stałe", () => {
    const h = polishHolidays(2026);
    expect(h.has("2026-04-05")).toBe(true); // Wielkanoc
    expect(h.has("2026-04-06")).toBe(true); // Poniedziałek Wielkanocny
    expect(h.has("2026-06-04")).toBe(true); // Boże Ciało
    expect(h.has("2026-08-15")).toBe(true);
    expect(h.has("2026-12-24")).toBe(true); // Wigilia od 2025 r.
    expect(polishHolidays(2024).has("2024-12-24")).toBe(false);
  });

  it("przesuwa termin z soboty, niedzieli i święta na najbliższy dzień roboczy", () => {
    expect(isNonWorkingDay("2026-10-10")).toBe(true); // sobota
    expect(effectiveDueDate("2026-10-10")).toBe("2026-10-12");
    expect(effectiveDueDate("2026-08-15")).toBe("2026-08-17"); // sobota + święto
    expect(effectiveDueDate("2026-11-11")).toBe("2026-11-12"); // środa, święto
    expect(effectiveDueDate("2026-12-24")).toBe("2026-12-28"); // Wigilia, święta, weekend
    expect(effectiveDueDate("2026-08-10")).toBe("2026-08-10");
  });
});

describe("zaległość z harmonogramu", () => {
  it("scenariusz testowy: dwie zaległe raty, odsetki od każdej raty osobno", () => {
    const z = computeZaleglosc({
      harmonogram: RATY,
      payments: WPLATY,
      asOf: "2026-10-06",
      stopaUmowna: 18.5,
    });
    expect(z.liczbaRatWymagalnych).toBe(3);
    expect(z.sumaWymagalna).toBe(23605.44);
    expect(z.zaleglosc).toBe(11744.94);
    expect(z.odsetkiZaOpoznienie).toBe(211.75);
    expect(z.doZaplatyTeraz).toBe(11956.69);
    expect(z.najstarszaZalegla).toBe("2026-08-10");
    expect(z.dniOpoznienia).toBe(57);
    // Rata 4 (10.10.2026, sobota) jeszcze niewymagalna — skuteczny termin 12.10.
    expect(z.najblizszaRata).toBe("2026-10-10");
    expect(z.raty[3].terminSkuteczny).toBe("2026-10-12");
    expect(z.raty[0].pozostalo).toBe(0);
    expect(z.raty[1].pozostalo).toBe(3876.46);
    expect(z.raty[1].dniOpoznienia).toBe(57);
    expect(z.raty[2].dniOpoznienia).toBe(26);
    expect(z.nadplata).toBe(0);
  });

  it("z rozbiciem raty: bez odsetek od odsetek umownych (art. 482 k.c.) i wpłata wg WIN_04", () => {
    // Raty 1–3 z Zał. 1 silnika umów (kapitał / odsetki / prowizja).
    const zRozbiciem = RATY.map((r, i) =>
      i === 1
        ? { ...r, odsetki: 891.33, prowizja: 666.67 }
        : i === 2
          ? { ...r, odsetki: 815.07, prowizja: 666.67 }
          : r,
    );
    const z = computeZaleglosc({
      harmonogram: zRozbiciem,
      payments: WPLATY,
      asOf: "2026-10-06",
      stopaUmowna: 18.5,
    });
    // Rata 2: 4 000 → prowizja 666,67, odsetki za opóźnienie 7,07 (2 dni od
    // prowizji + kapitału), odsetki umowne 891,33, kapitał 2 434,93.
    expect(z.raty[1].pozostalo).toBe(3875.55);
    expect(z.zaleglosc).toBe(11744.03);
    // 108,04 (reszta kapitału raty 2, 55 dni) + 92,95 (rata 3 bez odsetek umownych, 26 dni)
    expect(z.odsetkiZaOpoznienie).toBe(200.99);
    expect(z.doZaplatyTeraz).toBe(11945.02);
  });

  it("wpłata najpierw na prowizję z rat wymagalnych, dopiero potem na koszty (WIN_04)", () => {
    const z = computeZaleglosc({
      harmonogram: [{ nr: 1, termin: "2026-03-02", kwota: 1000, odsetki: 200, prowizja: 100 }],
      payments: [{ paid_on: "2026-03-02", amount: 120 }],
      fees: [{ action_date: "2026-03-02", fee: 50 }],
      asOf: "2026-03-02",
      stopaMaksymalna: () => 0,
    });
    expect(z.koszty).toBe(30);
    expect(z.zaleglosc).toBe(900);
    expect(z.doZaplatyTeraz).toBe(930);
  });

  it("stopa z umowy wyższa od maksymalnej jest obcinana do odsetek maksymalnych dnia", () => {
    const zawyzona = computeZaleglosc({
      harmonogram: RATY,
      payments: WPLATY,
      asOf: "2026-10-06",
      stopaUmowna: 22.5, // stara domyślna wartość modułu
    });
    expect(zawyzona.odsetkiZaOpoznienie).toBe(211.75);
    // Brak stopy w umowie = odsetki maksymalne za opóźnienie.
    const bezStopy = computeZaleglosc({ harmonogram: RATY, payments: WPLATY, asOf: "2026-10-06" });
    expect(bezStopy.odsetkiZaOpoznienie).toBe(211.75);
  });

  it("bez wpłat i przed pierwszym terminem nie ma zaległości", () => {
    const z = computeZaleglosc({ harmonogram: RATY, payments: [], asOf: "2026-07-01" });
    expect(z.zaleglosc).toBe(0);
    expect(z.dniOpoznienia).toBe(0);
    expect(z.najstarszaZalegla).toBeNull();
    expect(z.najblizszaRata).toBe("2026-07-10");
  });

  it("wpłata najpierw pokrywa koszty windykacyjne i odsetki, potem najstarszą ratę", () => {
    const z = computeZaleglosc({
      harmonogram: [
        { nr: 1, termin: "2026-03-02", kwota: 1000 },
        { nr: 2, termin: "2026-04-02", kwota: 1000 },
      ],
      payments: [{ paid_on: "2026-04-03", amount: 1100 }],
      fees: [{ action_date: "2026-03-20", fee: 50 }],
      asOf: "2026-04-03",
      stopaMaksymalna: () => 36.5, // 0,1% dziennie — łatwe liczby
    });
    // Rata 1: 32 dni po 1 zł (3.03–3.04) = 32 zł; rata 2: 1 dzień = 1 zł.
    // 1100 → koszty 50, odsetki 33, rata 1 1000, rata 2 17.
    expect(z.koszty).toBe(0);
    expect(z.odsetkiZaOpoznienie).toBe(0);
    expect(z.raty[0].pozostalo).toBe(0);
    expect(z.raty[1].pozostalo).toBe(983);
    expect(z.zaleglosc).toBe(983);
  });

  it("nadpłata ponad cały harmonogram jest wykazana osobno", () => {
    const z = computeZaleglosc({
      harmonogram: [{ nr: 1, termin: "2026-03-02", kwota: 100 }],
      payments: [{ paid_on: "2026-03-01", amount: 150 }],
      asOf: "2026-03-10",
    });
    expect(z.zaleglosc).toBe(0);
    expect(z.nadplata).toBe(50);
  });

  it("wypowiedzenie przyspiesza raty przyszłe bez przyszłych odsetek umownych", () => {
    const z = computeZaleglosc({
      harmonogram: [
        { nr: 1, termin: "2026-03-02", kwota: 1100, odsetki: 100 },
        { nr: 2, termin: "2026-04-02", kwota: 1080, odsetki: 80 },
        { nr: 3, termin: "2026-05-04", kwota: 1060, odsetki: 60 },
      ],
      payments: [],
      asOf: "2026-03-20",
      dataWypowiedzenia: "2026-03-16",
      stopaMaksymalna: () => 0,
    });
    expect(z.liczbaRatWymagalnych).toBe(3);
    // Rata 1 w całości (termin minął), raty 2–3 bez części odsetkowej.
    expect(z.zaleglosc).toBe(1100 + 1000 + 1000);
    expect(z.raty[2].terminSkuteczny).toBe("2026-03-16");
  });
});
