import { describe, expect, it } from "vitest";
import { generateHarmonogram } from "./windykacja-harmonogram";
import {
  emptyWindContract,
  maFormePrawna,
  normalizeNrb,
  ocrData,
  ocrKwota,
  parseOcrJsonText,
  parseWindContractJson,
} from "./windykacja-ocr-parse";

// Poprawny PESEL (suma kontrolna, istniejąca data) i rachunek (mod 97).
const PESEL = "44051401359";
const NRB = "61109010140000071219812874";
const NRB_GRUPY = "61 1090 1014 0000 0712 1981 2874";

describe("parseWindContractJson — wartości domyślne i odporność na błędy", () => {
  it("pusta odpowiedź daje same braki (zgodnie z dotychczasowym kształtem)", () => {
    const d = parseWindContractJson({});
    expect(d).toEqual({
      ...emptyWindContract("ok"),
      typ: "osoba_fizyczna",
    });
    expect(d.ostrzezenia).toEqual([]);
    expect(d.podsumowanie).toBe("");
  });

  it("błędne typy i „brak/null” jako tekst nie wywracają parsera", () => {
    const d = parseWindContractJson({
      imie_nazwisko: ["Jan"],
      pesel: 44051401359,
      nip: "brak",
      email: "null",
      telefon: " - ",
      adres: { ulica: "x" },
      data_umowy: "30.02.2026",
      kwota_pozyczki: "ok. sto tysięcy",
      kwota_calkowita: -5,
      prowizja: Number.NaN,
      termin_splaty: 20260710,
      harmonogram: "brak",
      liczba_rat: "dwanaście",
      oplaty_windykacyjne: "brak",
      rachunek_splaty: Number(NRB), // 26 cyfr jako liczba JSON traci precyzję
      oprocentowanie_roczne: "250%",
      odsetki_za_opoznienie: 0,
      podsumowanie: 42,
    });
    expect(d.reason).toBe("ok");
    expect(d.imie_nazwisko).toBeNull();
    expect(d.pesel).toBeNull();
    expect(d.nip).toBeNull();
    expect(d.email).toBeNull();
    expect(d.telefon).toBeNull();
    expect(d.adres).toBeNull();
    expect(d.data_umowy).toBeNull();
    expect(d.kwota_pozyczki).toBeNull();
    expect(d.kwota_calkowita).toBeNull();
    expect(d.prowizja).toBeNull();
    expect(d.termin_splaty).toBeNull();
    expect(d.harmonogram).toBeNull();
    expect(d.harmonogram_zrodlo).toBeNull();
    expect(d.liczba_rat).toBeNull();
    expect(d.oplaty_windykacyjne).toBeNull();
    expect(d.rachunek_splaty).toBeNull();
    expect(d.oprocentowanie_roczne).toBeNull();
    expect(d.odsetki_za_opoznienie).toBeNull();
    expect(d.podsumowanie).toBe("");
  });

  it("zachowuje dotychczasowe pola (opłaty windykacyjne, stopy, daty)", () => {
    const d = parseWindContractJson({
      imie_nazwisko: "Jan  Kowalski",
      typ: "osoba_fizyczna",
      numer_umowy: "FY/2026/07/001",
      data_umowy: "10.06.2026 r.",
      numer_kw: "WA1M/00012345/6",
      oprocentowanie_roczne: "12,5%",
      odsetki_za_opoznienie: "18,5",
      oplaty_windykacyjne: {
        sms: "10 zł",
        email: 0,
        telefon: null,
        pismo: "50,00",
        brak_oplat: false,
      },
      podsumowanie: "Umowa pożyczki na 12 miesięcy.",
    });
    expect(d.imie_nazwisko).toBe("Jan Kowalski");
    expect(d.numer_umowy).toBe("FY/2026/07/001");
    expect(d.data_umowy).toBe("2026-06-10");
    expect(d.numer_kw).toBe("WA1M/00012345/6");
    expect(d.oprocentowanie_roczne).toBe(12.5);
    expect(d.odsetki_za_opoznienie).toBe(18.5);
    expect(d.oplaty_windykacyjne).toEqual({
      sms: 10,
      email: 0,
      telefon: null,
      pismo: 50,
      brak_oplat: false,
    });
    expect(d.podsumowanie).toBe("Umowa pożyczki na 12 miesięcy.");
    expect(
      parseWindContractJson({ oplaty_windykacyjne: { brak_oplat: true } }).oplaty_windykacyjne,
    ).toEqual({ sms: null, email: null, telefon: null, pismo: null, brak_oplat: true });
  });
});

describe("parseWindContractJson — pożyczkobiorca: osoba fizyczna (JDG) czy firma", () => {
  it("JDG z PESEL i NIP to osoba fizyczna, nawet gdy model wskazał „firma”", () => {
    const d = parseWindContractJson({
      imie_nazwisko:
        "Jan Kowalski prowadzący działalność gospodarczą pod firmą JK-BUD Jan Kowalski",
      typ: "firma",
      pesel: "440514 01359",
      nip: "PL 525-224-84-81",
    });
    expect(d.typ).toBe("osoba_fizyczna");
    expect(d.imie_nazwisko).toBe("Jan Kowalski");
    expect(d.pesel).toBe(PESEL);
    expect(d.nip).toBe("5252248481");
  });

  it("odcina dopiski o działalności, zostawiając nazwiska dwuczłonowe", () => {
    const nazwa = (imie_nazwisko: string) =>
      parseWindContractJson({ imie_nazwisko, pesel: PESEL }).imie_nazwisko;
    expect(nazwa("Anna Nowak-Kowalska, przedsiębiorca")).toBe("Anna Nowak-Kowalska");
    expect(nazwa("Anna Nowak (JDG)")).toBe("Anna Nowak");
    expect(nazwa("Piotr Zieliński działający pod firmą PZ Consulting")).toBe("Piotr Zieliński");
  });

  it("nazwa z formą prawną to firma, także gdy model wskazał osobę fizyczną", () => {
    const d = parseWindContractJson({
      imie_nazwisko: "Budex Sp. z o.o.",
      typ: "osoba_fizyczna",
      pesel: PESEL, // PESEL reprezentanta odczytany przy spółce
      nip: "5252248481",
    });
    expect(d.typ).toBe("firma");
    expect(d.imie_nazwisko).toBe("Budex Sp. z o.o.");
  });

  it("bez poprawnego PESEL zostaje typ z modelu", () => {
    expect(
      parseWindContractJson({ imie_nazwisko: "Kowalski Bud", typ: "firma", pesel: "44051401358" })
        .typ,
    ).toBe("firma");
    // Brak typu: nazwa osoby i NIP → JDG (osoba fizyczna), nie firma.
    expect(parseWindContractJson({ imie_nazwisko: "Jan Kowalski", nip: "5252248481" }).typ).toBe(
      "osoba_fizyczna",
    );
    // Brak typu, nazwy i PESEL, sam NIP → firma (jak dotąd).
    expect(parseWindContractJson({ nip: "5252248481" }).typ).toBe("firma");
  });

  it("rozpoznaje oznaczenia formy prawnej", () => {
    for (const n of [
      "Budex sp. z o.o.",
      "Budex Sp. z o. o.",
      "Alfa S.A.",
      "Alfa SA",
      "Beta sp. k.",
      "Gamma Sp.j.",
      "Delta S.K.A.",
      "Omega s.c. Jan Kowalski, Anna Nowak",
      "Fundacja Dobra",
      "Spółdzielnia Mieszkaniowa Zorza",
      "Alfa Spółka Komandytowa",
      "Acme GmbH",
    ]) {
      expect(maFormePrawna(n), n).toBe(true);
    }
    for (const n of ["Jan Kowalski", "Anna S. Adamska", "Sara Nowak", "Spa-Kowalska Ewa"]) {
      expect(maFormePrawna(n), n).toBe(false);
    }
  });
});

describe("parseWindContractJson — pożyczkodawca, rachunek, zabezpieczenia", () => {
  it("odczytuje pożyczkodawcę, akt 777, kwotę 777 i hipotekę", () => {
    const d = parseWindContractJson({
      pozyczkodawca: "  Finance You  sp. z o.o. ",
      imie_nazwisko: "Jan Kowalski",
      kwota_hipoteki: "150 000,00 zł",
      akt_notarialny_777:
        "Rep. A nr 1234/2026, notariusz Anna Nowak, Kancelaria Notarialna w Krakowie",
      kwota_777: "150.000",
      numer_kw: "KR1P/00123456/7",
    });
    expect(d.pozyczkodawca).toBe("Finance You sp. z o.o.");
    expect(d.kwota_hipoteki).toBe(150000);
    expect(d.akt_notarialny_777).toBe(
      "Rep. A nr 1234/2026, notariusz Anna Nowak, Kancelaria Notarialna w Krakowie",
    );
    expect(d.kwota_777).toBe(150000);
    expect(d.ostrzezenia).toEqual([]);
  });

  it("pożyczkodawca odczytany jak pożyczkobiorca → brak i ostrzeżenie", () => {
    const d = parseWindContractJson({
      pozyczkodawca: "Jan Kowalski",
      imie_nazwisko: "jan kowalski",
    });
    expect(d.pozyczkodawca).toBeNull();
    expect(d.ostrzezenia).toHaveLength(1);
  });

  it("normalizuje rachunek: NRB, IBAN PL, separatory; błędna suma kontrolna → null", () => {
    expect(normalizeNrb(NRB)).toBe(NRB_GRUPY);
    expect(normalizeNrb("PL61 1090 1014 0000 0712 1981 2874")).toBe(NRB_GRUPY);
    expect(normalizeNrb("pl61-1090-1014-0000-0712-1981-2874")).toBe(NRB_GRUPY);
    expect(normalizeNrb(`nr ${NRB_GRUPY}`)).toBe(NRB_GRUPY);
    expect(normalizeNrb("61 1090 1014 0000 0712 1981 2875")).toBeNull(); // suma kontrolna
    expect(normalizeNrb("61 1090 1014 0000 0712 1981 287")).toBeNull(); // 25 cyfr
    expect(normalizeNrb("161109010140000071219812874")).toBeNull(); // 27 cyfr
    expect(normalizeNrb(null)).toBeNull();

    expect(parseWindContractJson({ rachunek_splaty: `PL${NRB}` }).rachunek_splaty).toBe(NRB_GRUPY);
    const zly = parseWindContractJson({ rachunek_splaty: "61 1090 1014 0000 0712 1981 2875" });
    expect(zly.rachunek_splaty).toBeNull();
    expect(zly.ostrzezenia.join(" ")).toMatch(/rachunku/);
  });
});

describe("parseWindContractJson — kwoty pożyczki", () => {
  it("liczy kwotę na rękę i kwotę do zwrotu z odczytanych składników (prowizja w ratach)", () => {
    const d = parseWindContractJson({
      kwota_pozyczki_umowy: "100 000,00",
      prowizja: 5000,
      prowizja_pozyczkodawcy: "8 000 zł",
      prowizja_pozyczkodawcy_potracana: false,
      // Model się pomylił: nie odjął prowizji i dodał odsetki.
      kwota_pozyczki: 100000,
      kwota_calkowita: 131500,
    });
    expect(d.kwota_pozyczki).toBe(95000);
    expect(d.prowizja).toBe(5000);
    expect(d.kwota_calkowita).toBe(108000);
  });

  it("prowizja pożyczkodawcy potrącona z wypłaty mieści się w Kwocie Pożyczki", () => {
    const d = parseWindContractJson({
      kwota_pozyczki_umowy: 100000,
      prowizja_pozyczkodawcy: 8000,
      prowizja_pozyczkodawcy_potracana: "tak",
      kwota_calkowita: 108000,
    });
    expect(d.kwota_pozyczki).toBe(100000);
    expect(d.prowizja).toBeNull();
    expect(d.kwota_calkowita).toBe(100000);
  });

  it("nieznany sposób pobrania prowizji — wartość modelu, gdy zgodna; inaczej prowizja w ratach", () => {
    const base = { kwota_pozyczki_umowy: 100000, prowizja_pozyczkodawcy: 8000 };
    expect(parseWindContractJson({ ...base, kwota_calkowita: 100000 }).kwota_calkowita).toBe(
      100000,
    );
    expect(parseWindContractJson({ ...base, kwota_calkowita: 140000 }).kwota_calkowita).toBe(
      108000,
    );
    expect(parseWindContractJson(base).kwota_calkowita).toBe(108000);
    // Bez prowizji pożyczkodawcy: model (nie mniej niż Kwota Pożyczki) albo sama Kwota Pożyczki.
    const kp = { kwota_pozyczki_umowy: 100000 };
    expect(parseWindContractJson({ ...kp, kwota_calkowita: 106000 }).kwota_calkowita).toBe(106000);
    expect(parseWindContractJson({ ...kp, kwota_calkowita: 90000 }).kwota_calkowita).toBe(100000);
    expect(parseWindContractJson(kp).kwota_calkowita).toBe(100000);
  });

  it("bez Kwoty Pożyczki zostają wartości z modelu", () => {
    const d = parseWindContractJson({
      kwota_pozyczki: "95 000,00 zł",
      kwota_calkowita: "108.000",
      prowizja: "5 000",
    });
    expect(d.kwota_pozyczki).toBe(95000);
    expect(d.kwota_calkowita).toBe(108000);
    expect(d.prowizja).toBe(5000);
  });

  it("ostrzega, gdy obie prowizje mają tę samą kwotę", () => {
    const d = parseWindContractJson({ prowizja: 5000, prowizja_pozyczkodawcy: 5000 });
    expect(d.ostrzezenia.join(" ")).toMatch(/Prowizja Finance You/);
  });
});

describe("parseWindContractJson — harmonogram rat", () => {
  const TABELA = [
    { termin: "10.08.2026", kwota: "7 868,48", odsetki: "906,67", prowizja: "666,67" },
    { termin: "2026-07-10", kwota: "7 868,48", odsetki: "966,67", prowizja: "666,67" },
    ["10.09.2026", "7 868,37", "845,71", "666,66"],
    { termin: null, kwota: "23 605,33" }, // wiersz sumy
    { termin: "2026-08-10", kwota: "7 868,48", odsetki: "906,67", prowizja: "666,67" }, // duplikat
  ];

  it("odczytuje tabelę z polskimi kwotami: sortuje, numeruje, pomija sumę i duplikaty", () => {
    const d = parseWindContractJson({ harmonogram: TABELA });
    expect(d.harmonogram_zrodlo).toBe("tabela");
    expect(d.harmonogram).toEqual([
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: 966.67, prowizja: 666.67 },
      { nr: 2, termin: "2026-08-10", kwota: 7868.48, odsetki: 906.67, prowizja: 666.67 },
      { nr: 3, termin: "2026-09-10", kwota: 7868.37, odsetki: 845.71, prowizja: 666.66 },
    ]);
    // Parametry i termin spłaty wyprowadzone z tabeli.
    expect(d.liczba_rat).toBe(3);
    expect(d.data_pierwszej_raty).toBe("2026-07-10");
    expect(d.kwota_raty).toBe(7868.48);
    expect(d.kwota_ostatniej_raty).toBe(7868.37);
    expect(d.termin_splaty).toBe("2026-09-10");
    expect(d.ostrzezenia).toEqual([]);
  });

  it("przyjmuje wiersze z kapitałem bez kolumny „rata” i tabelę jako tekst JSON", () => {
    const d = parseWindContractJson({
      harmonogram: JSON.stringify({
        raty: [
          { data: "10 lipca 2026 r.", kapital: "6 235,14", odsetki: "966,67", prowizja: "666,67" },
        ],
      }),
    });
    expect(d.harmonogram).toEqual([
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: 966.67, prowizja: 666.67 },
    ]);
  });

  it("termin spłaty z umowy ma pierwszeństwo przed ostatnią ratą", () => {
    const d = parseWindContractJson({ harmonogram: TABELA, termin_splaty: "2026-09-10" });
    expect(d.termin_splaty).toBe("2026-09-10");
  });

  it("ostrzega, gdy tabela ma mniej rat niż podaje umowa", () => {
    const d = parseWindContractJson({ harmonogram: TABELA, liczba_rat: 12 });
    expect(d.harmonogram).toHaveLength(3);
    expect(d.liczba_rat).toBe(12);
    expect(d.ostrzezenia.join(" ")).toMatch(/odczytano 3 rat, a umowa podaje 12/);
  });

  it("bez tabeli generuje harmonogram z parametrów umowy", () => {
    const d = parseWindContractJson({
      harmonogram: null,
      liczba_rat: "12",
      kwota_raty: "7 868,48 zł",
      kwota_ostatniej_raty: "7868,37",
      data_pierwszej_raty: "10.07.2026",
    });
    expect(d.harmonogram_zrodlo).toBe("parametry");
    expect(d.harmonogram).toEqual(
      generateHarmonogram({
        pierwszaRata: "2026-07-10",
        liczbaRat: 12,
        kwotaRaty: 7868.48,
        kwotaOstatniejRaty: 7868.37,
      }),
    );
    expect(d.harmonogram?.[11]).toEqual({ nr: 12, termin: "2027-06-10", kwota: 7868.37 });
    expect(d.termin_splaty).toBe("2027-06-10");
    expect(d.liczba_rat).toBe(12);
    expect(d.kwota_raty).toBe(7868.48);
    expect(d.kwota_ostatniej_raty).toBe(7868.37);
    expect(d.ostrzezenia.join(" ")).toMatch(/wygenerowano z parametrów/);
  });

  it("niepełne parametry bez tabeli — brak harmonogramu", () => {
    for (const p of [
      { liczba_rat: 12, kwota_raty: 1000 },
      { liczba_rat: 12, data_pierwszej_raty: "2026-07-10" },
      { kwota_raty: 1000, data_pierwszej_raty: "2026-07-10" },
      { liczba_rat: 0, kwota_raty: 1000, data_pierwszej_raty: "2026-07-10" },
      { liczba_rat: 1.5, kwota_raty: 1000, data_pierwszej_raty: "2026-07-10" },
      { liczba_rat: 12, kwota_raty: 1000, data_pierwszej_raty: "2026-02-30" },
    ]) {
      const d = parseWindContractJson(p);
      expect(d.harmonogram, JSON.stringify(p)).toBeNull();
      expect(d.harmonogram_zrodlo).toBeNull();
    }
  });

  it("odrzuca sumę rat z odsetkami jako „kwotę do zwrotu” i liczy ją z tabeli", () => {
    const d = parseWindContractJson({ harmonogram: TABELA, kwota_calkowita: "23 605,33" });
    // Suma rat bez odsetek umownych = kapitał + prowizja.
    expect(d.kwota_calkowita).toBe(20886.28);
    expect(d.ostrzezenia.join(" ")).toMatch(/sumą rat z odsetkami/);
  });

  it("z niepełnej tabeli nie wylicza kwoty do zwrotu", () => {
    const d = parseWindContractJson({ harmonogram: TABELA, liczba_rat: 12 });
    expect(d.kwota_calkowita).toBeNull();
  });
});

describe("pomocnicze: JSON, kwoty, daty", () => {
  it("wyciąga obiekt JSON z odpowiedzi modelu", () => {
    expect(parseOcrJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseOcrJsonText('Oto dane:\n{"a": {"b": 2}}\nPozdrawiam')).toEqual({ a: { b: 2 } });
    expect(parseOcrJsonText("[1,2]")).toBeNull();
    expect(parseOcrJsonText("nie umiem")).toBeNull();
    expect(parseOcrJsonText(undefined)).toBeNull();
  });

  it("czyta kwoty w zapisie polskim, z walutą i separatorami tysięcy", () => {
    expect(ocrKwota("7 868,48 zł")).toBe(7868.48);
    expect(ocrKwota("1.234,56")).toBe(1234.56);
    expect(ocrKwota("100.000")).toBe(100000);
    expect(ocrKwota("1,250,000")).toBe(1250000);
    expect(ocrKwota("0.500")).toBe(0.5);
    expect(ocrKwota("ok. 5 000 złotych")).toBe(5000);
    expect(ocrKwota("12 rat po 7 868,48")).toBeNull();
    expect(ocrKwota(7868.484)).toBe(7868.48);
    expect(ocrKwota(Infinity)).toBeNull();
  });

  it("czyta daty: ISO, z kropkami, z nazwą miesiąca; odrzuca nieistniejące", () => {
    expect(ocrData("2026-07-10")).toBe("2026-07-10");
    expect(ocrData("10.07.2026 r.")).toBe("2026-07-10");
    expect(ocrData("1 października 2026 r.")).toBe("2026-10-01");
    expect(ocrData("31 lutego 2026")).toBeNull();
    expect(ocrData("10 foo 2026")).toBeNull();
    expect(ocrData(20260710)).toBeNull();
  });
});
