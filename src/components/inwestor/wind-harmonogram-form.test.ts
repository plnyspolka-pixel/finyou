import { describe, expect, it } from "vitest";
import { computeZaleglosc, generateHarmonogram } from "@/lib/windykacja-harmonogram";
import { windDebtSnapshot } from "@/lib/windykacja-debt";
import {
  EMPTY_GENERATOR,
  borrowerEditPatch,
  borrowerToEditForm,
  formToHarmonogram,
  formatDataPL,
  formatZl,
  generateFromForm,
  generatorFromHarmonogram,
  generatorFromParams,
  harmonogramToForm,
  hasRaty,
  kwotaDoPola,
  liveCaseLite,
  loanEditPatch,
  loanToEditForm,
  nextRataForm,
  rataStatus,
  rozliczenieWplat,
  sameHarmonogram,
  type RataForm,
} from "./wind-harmonogram-form";

const row = (termin: string, kwota: string, odsetki = "", prowizja = ""): RataForm => ({
  key: `${termin}-${kwota}`,
  termin,
  kwota,
  odsetki,
  prowizja,
});

/** Scenariusz testowy z dokumentacji: 12 × 7 868,48 zł od 10.07.2026 (ostatnia 7 868,37). */
const SCENARIUSZ = generateHarmonogram({
  pierwszaRata: "2026-07-10",
  liczbaRat: 12,
  kwotaRaty: 7868.48,
  kwotaOstatniejRaty: 7868.37,
});
const WPLATY = [
  { paid_on: "2026-07-09", amount: 7868.48 },
  { paid_on: "2026-08-12", amount: 4000 },
];

describe("formatowanie", () => {
  it("kwota z groszami i data po polsku", () => {
    expect(formatZl(11956.69).replace(/\s/g, " ")).toBe("11 956,69 zł");
    expect(formatZl(null)).toBe("—");
    expect(formatDataPL("2026-10-06")).toBe("06.10.2026");
    expect(formatDataPL(null)).toBe("—");
    expect(kwotaDoPola(7868.48)).toBe("7868,48");
    expect(kwotaDoPola(null)).toBe("");
  });
});

describe("edytor harmonogramu", () => {
  it("czyta kwoty po polsku, pomija puste wiersze i numeruje raty", () => {
    const { harmonogram, bledy } = formToHarmonogram([
      row("2026-08-10", "7 868,48"),
      row("", ""),
      row("2026-07-10", "7868.48", "1 200,00"),
    ]);
    expect(bledy).toEqual([]);
    expect(harmonogram).toEqual([
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: 1200 },
      { nr: 2, termin: "2026-08-10", kwota: 7868.48 },
    ]);
  });

  it("zgłasza błędne wiersze z numerem raty (bez cichego pomijania)", () => {
    const { harmonogram, bledy } = formToHarmonogram([
      row("2026-07-10", "7868,48"),
      row("2026-08-10", "0"),
      row("10.13.2026", "100"),
      row("2026-09-10", "100", "80", "30"),
    ]);
    expect(harmonogram).toBeNull();
    expect(bledy).toEqual([
      "Rata 2: kwota raty musi być większa od 0.",
      "Rata 3: nieprawidłowy termin płatności (RRRR-MM-DD).",
      "Rata 4: odsetki i prowizja przekraczają kwotę raty.",
    ]);
  });

  it("hasRaty — tylko niepuste wiersze", () => {
    expect(hasRaty([])).toBe(false);
    expect(hasRaty([row("", "")])).toBe(false);
    expect(hasRaty([row("", "100")])).toBe(true);
  });

  it("harmonogram → wiersze → harmonogram bez zmian (z rozbiciem raty)", () => {
    const h = [
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: 1500.5, prowizja: 250 },
      { nr: 2, termin: "2026-08-10", kwota: 7868.48 },
    ];
    const { harmonogram, bledy } = formToHarmonogram(harmonogramToForm(h));
    expect(bledy).toEqual([]);
    expect(harmonogram).toEqual(h);
    expect(sameHarmonogram(harmonogram, h)).toBe(true);
    expect(sameHarmonogram(harmonogram, [h[0]])).toBe(false);
    expect(sameHarmonogram(null, [])).toBe(true);
  });

  it("generator: walidacja parametrów", () => {
    expect(generateFromForm(EMPTY_GENERATOR).blad).toBe("Podaj termin pierwszej raty.");
    expect(
      generateFromForm({ ...EMPTY_GENERATOR, pierwszaRata: "2026-07-10", liczbaRat: "1,5" }).blad,
    ).toBe("Liczba rat: liczba całkowita od 1 do 600.");
    expect(
      generateFromForm({ ...EMPTY_GENERATOR, pierwszaRata: "2026-07-10", liczbaRat: "12" }).blad,
    ).toBe("Podaj kwotę raty większą od 0.");
    expect(
      generateFromForm({
        pierwszaRata: "2026-07-10",
        liczbaRat: "12",
        kwotaRaty: "100",
        kwotaOstatniejRaty: "abc",
      }).blad,
    ).toBe("Kwota ostatniej raty musi być większa od 0 (albo zostaw puste).");
  });

  it("generator: raty miesięczne, ostatnia inna, koniec miesiąca", () => {
    const { raty, blad } = generateFromForm({
      pierwszaRata: "2026-01-31",
      liczbaRat: "3",
      kwotaRaty: "1 000,00",
      kwotaOstatniejRaty: "999,99",
    });
    expect(blad).toBeNull();
    expect(raty).toEqual([
      { nr: 1, termin: "2026-01-31", kwota: 1000 },
      { nr: 2, termin: "2026-02-28", kwota: 1000 },
      { nr: 3, termin: "2026-03-31", kwota: 999.99 },
    ]);
  });

  it("parametry generatora odtworzone z harmonogramu dają ten sam harmonogram", () => {
    const g = generatorFromHarmonogram(SCENARIUSZ);
    expect(g).toEqual({
      pierwszaRata: "2026-07-10",
      liczbaRat: "12",
      kwotaRaty: "7868,48",
      kwotaOstatniejRaty: "7868,37",
    });
    expect(generateFromForm(g).raty).toEqual(SCENARIUSZ);
    expect(generatorFromHarmonogram(null)).toEqual(EMPTY_GENERATOR);
  });

  it("parametry generatora z odczytu umowy", () => {
    expect(
      generatorFromParams({
        data_pierwszej_raty: "10.07.2026",
        liczba_rat: 12,
        kwota_raty: 7868.48,
        kwota_ostatniej_raty: null,
      }),
    ).toEqual({
      pierwszaRata: "2026-07-10",
      liczbaRat: "12",
      kwotaRaty: "7868,48",
      kwotaOstatniejRaty: "",
    });
  });

  it("kolejna rata: miesiąc po ostatniej, ta sama kwota", () => {
    const next = nextRataForm([row("2026-01-31", "500,00")]);
    expect(next.termin).toBe("2026-02-28");
    expect(next.kwota).toBe("500,00");
    expect(nextRataForm([]).termin).toBe("");
  });
});

describe("scenariusz z dokumentacji (generator → kalkulator)", () => {
  it("zaległość 11 744,94, odsetki 211,75, do zapłaty 11 956,69, 57 dni", () => {
    const { raty } = generateFromForm(generatorFromHarmonogram(SCENARIUSZ));
    const w = computeZaleglosc({
      harmonogram: raty,
      payments: WPLATY,
      asOf: "2026-10-06",
      stopaUmowna: 18.5,
    });
    expect(w.zaleglosc).toBe(11744.94);
    expect(w.odsetkiZaOpoznienie).toBe(211.75);
    expect(w.doZaplatyTeraz).toBe(11956.69);
    expect(w.dniOpoznienia).toBe(57);
    expect(rataStatus(w.raty[0])).toBe("zaplacona");
    expect(rataStatus(w.raty[1])).toBe("zalegla");
    expect(rataStatus(w.raty[11])).toBe("przyszla");

    // Rozliczenie wpłat w formularzu zgadza się co do grosza:
    // raty wymagalne − (wpłaty − odsetki i koszty − raty przyszłe − nadpłata).
    const r = rozliczenieWplat(w, [...WPLATY, { paid_on: "2026-12-01", amount: 500 }]);
    expect(r.liczba).toBe(2);
    expect(r.suma).toBe(11868.48);
    expect(r.naRatyPrzyszle).toBe(0);
    expect(r.nadplata).toBe(0);
    expect(r.naOdsetkiIKoszty).toBeGreaterThan(0);
    const zaleglosc = w.sumaWymagalna - (r.suma - r.naOdsetkiIKoszty - r.naRatyPrzyszle);
    expect(Math.round(zaleglosc * 100) / 100).toBe(w.zaleglosc);
  });

  it("wpłata przed terminem pierwszej raty, gdy nic nie jest wymagalne — na raty przyszłe", () => {
    const w = computeZaleglosc({
      harmonogram: SCENARIUSZ,
      payments: [{ paid_on: "2026-07-01", amount: 1000 }],
      asOf: "2026-07-05",
      stopaUmowna: 18.5,
    });
    const r = rozliczenieWplat(w, [{ paid_on: "2026-07-01", amount: 1000 }]);
    expect(w.zaleglosc).toBe(0);
    expect(r.naRatyPrzyszle).toBe(1000);
    expect(r.naOdsetkiIKoszty).toBe(0);
  });
});

describe("podpowiedź procedury z bieżącą migawką", () => {
  it("opóźnienie i kwota z migawki, nie z zapisu przy zakładaniu sprawy", () => {
    const snap = windDebtSnapshot({
      loan: { harmonogram: SCENARIUSZ, stopa_odsetek_max: 18.5, status: "w_zwloce" },
      events: WPLATY.map((p) => ({
        typ: "wplata",
        data_zdarzenia: `${p.paid_on}T12:00:00.000Z`,
        metadata: { kwota: p.amount },
      })),
      asOf: "2026-10-06",
    });
    const lite = liveCaseLite(
      { sciezka: "miekka", etap: "kontakt_wstepny", opoznienie_dni: 0, kwota_zalegla: 94421.65 },
      snap,
    );
    expect(lite.opoznienie_dni).toBe(57);
    expect(lite.kwota_zalegla).toBe(11956.69);
    expect(
      liveCaseLite(
        { sciezka: "miekka", etap: "kontakt_wstepny", opoznienie_dni: 5, kwota_zalegla: 100 },
        null,
      ),
    ).toEqual({
      sciezka: "miekka",
      etap: "kontakt_wstepny",
      opoznienie_dni: 5,
      kwota_zalegla: 100,
    });
  });
});

describe("edycja pożyczki — patch tylko ze zmienionych pól", () => {
  const LOAN = {
    pozyczkodawca: null,
    numer_umowy: "WIND/1",
    data_umowy: "2026-06-01",
    kwota_pozyczki: 80000,
    prowizja: 4000,
    kwota_calkowita: 90000,
    oprocentowanie_roczne: 12,
    stopa_odsetek_max: 18.5,
    termin_splaty: "2027-06-10",
    rachunek_splaty: "PL00 1010 0000 0000 0000 0000 0000",
    numer_kw: "WA1M/00000000/0",
    kwota_hipoteki: null,
    akt_notarialny_777: null,
    kwota_777: null,
    harmonogram: SCENARIUSZ,
  };

  it("bez zmian → pusty patch", () => {
    const form = loanToEditForm(LOAN);
    expect(loanEditPatch(LOAN, form, harmonogramToForm(LOAN.harmonogram))).toEqual({
      patch: {},
      bledy: [],
    });
  });

  it("nowe pola: pożyczkodawca, rachunek (zapis grupowy), akt 777, kwoty po polsku", () => {
    const form = {
      ...loanToEditForm(LOAN),
      pozyczkodawca: "  Finance You sp. z o.o. ",
      rachunek_splaty: "12 1020 1026 0000 0402 0353 2127",
      akt_notarialny_777: "Rep. A nr 1234/2026",
      kwota_777: "135 000,00",
      kwota_hipoteki: "135000",
      kwota_pozyczki: "80 000",
    };
    const { patch, bledy } = loanEditPatch(LOAN, form, harmonogramToForm(LOAN.harmonogram));
    expect(bledy).toEqual([]);
    expect(patch).toEqual({
      pozyczkodawca: "Finance You sp. z o.o.",
      rachunek_splaty: "12 1020 1026 0000 0402 0353 2127",
      akt_notarialny_777: "Rep. A nr 1234/2026",
      kwota_777: 135000,
      kwota_hipoteki: 135000,
    });
  });

  it("błędy walidacji z nazwą pola", () => {
    const form = {
      ...loanToEditForm(LOAN),
      rachunek_splaty: "1234",
      kwota_pozyczki: "abc",
      stopa_odsetek_max: "150",
      data_umowy: "2026-02-30",
    };
    const { bledy } = loanEditPatch(LOAN, form, harmonogramToForm(LOAN.harmonogram));
    expect(bledy).toEqual([
      "Kwota wypłacona (na rękę): nieprawidłowa kwota.",
      "Stopa odsetek za opóźnienie: podaj stopę od 0 do 100% rocznie.",
      "Data umowy: nieprawidłowa data (RRRR-MM-DD).",
      "Rachunek do spłaty: podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL.",
    ]);
  });

  it("puste pola: stopa → null (maksymalne z dnia umowy), kwota NOT NULL → 0, opcjonalna → null", () => {
    const loan = { ...LOAN, kwota_hipoteki: 100000 };
    const form = {
      ...loanToEditForm(loan),
      stopa_odsetek_max: "",
      prowizja: "",
      kwota_hipoteki: "",
      rachunek_splaty: "",
    };
    const { patch } = loanEditPatch(loan, form, harmonogramToForm(loan.harmonogram));
    expect(patch).toEqual({
      stopa_odsetek_max: null,
      prowizja: 0,
      kwota_hipoteki: null,
      rachunek_splaty: null,
    });
  });

  it("zmiana harmonogramu przy nieruszonym terminie → termin spłaty = ostatnia rata", () => {
    const krotszy = SCENARIUSZ.slice(0, 6);
    const { patch, bledy } = loanEditPatch(LOAN, loanToEditForm(LOAN), harmonogramToForm(krotszy));
    expect(bledy).toEqual([]);
    expect(patch.harmonogram).toEqual(krotszy);
    expect(patch.termin_splaty).toBe("2026-12-10");
  });

  it("zmiana harmonogramu i własny termin spłaty → termin z formularza", () => {
    const form = { ...loanToEditForm(LOAN), termin_splaty: "2027-01-15" };
    const { patch } = loanEditPatch(LOAN, form, harmonogramToForm(SCENARIUSZ.slice(0, 6)));
    expect(patch.termin_splaty).toBe("2027-01-15");
  });

  it("dodanie harmonogramu do pożyczki bez harmonogramu i usunięcie harmonogramu", () => {
    const legacy = { ...LOAN, harmonogram: null };
    const dodany = loanEditPatch(legacy, loanToEditForm(legacy), harmonogramToForm(SCENARIUSZ));
    expect(dodany.patch.harmonogram).toEqual(SCENARIUSZ);
    // Termin spłaty już równy ostatniej racie — bez zmiany.
    expect(SCENARIUSZ[11].termin).toBe("2027-06-10");
    expect("termin_splaty" in dodany.patch).toBe(false);
    const staryTermin = { ...legacy, termin_splaty: "2026-12-31" };
    expect(
      loanEditPatch(staryTermin, loanToEditForm(staryTermin), harmonogramToForm(SCENARIUSZ)).patch
        .termin_splaty,
    ).toBe("2027-06-10");
    const usuniety = loanEditPatch(LOAN, loanToEditForm(LOAN), []);
    expect(usuniety.patch).toEqual({ harmonogram: null });
  });

  it("błąd w harmonogramie blokuje zapis", () => {
    const { bledy } = loanEditPatch(LOAN, loanToEditForm(LOAN), [row("2026-07-10", "-5")]);
    expect(bledy).toEqual(["Rata 1: kwota raty musi być większa od 0."]);
  });
});

describe("edycja dłużnika — patch tylko ze zmienionych pól", () => {
  // Stara sprawa: NIP wpisany w pole PESEL (formularz kopiował NIP do PESEL).
  const B = {
    imie_nazwisko: "Jan Kowalski",
    typ: "firma" as const,
    pesel: "5260250274",
    nip: null,
    telefon: "+48500100200",
    email: null,
    adres_zamieszkania: "ul. Prosta 1, Warszawa",
    adres_do_doreczen: "ul. Prosta 1, Warszawa",
  };

  it("nieruszone (nawet błędne) dane z bazy nie blokują zapisu", () => {
    const form = { ...borrowerToEditForm(B), telefon: "+48 500 100 300" };
    expect(borrowerEditPatch(B, form)).toEqual({
      patch: { telefon: "+48 500 100 300" },
      bledy: [],
    });
  });

  it("poprawka JDG: NIP z PESEL do pola NIP, typ osoba fizyczna", () => {
    const form = {
      ...borrowerToEditForm(B),
      typ: "osoba_fizyczna" as const,
      pesel: "80010112345",
      nip: "PL 526-025-02-74",
    };
    expect(borrowerEditPatch(B, form)).toEqual({
      patch: { typ: "osoba_fizyczna", pesel: "80010112345", nip: "5260250274" },
      bledy: [],
    });
  });

  it("walidacja PESEL, NIP, e-mail i nazwy", () => {
    const form = {
      ...borrowerToEditForm(B),
      imie_nazwisko: " ",
      pesel: "123",
      nip: "12345",
      email: "jan@",
    };
    expect(borrowerEditPatch(B, form).bledy).toEqual([
      "Dłużnik: podaj imię i nazwisko albo nazwę dłużnika.",
      "PESEL: PESEL ma 11 cyfr.",
      "NIP: NIP ma 10 cyfr.",
      "E-mail: nieprawidłowy adres e-mail.",
    ]);
  });

  it("wyczyszczenie pola → null", () => {
    const form = { ...borrowerToEditForm(B), adres_do_doreczen: "", pesel: "" };
    expect(borrowerEditPatch(B, form).patch).toEqual({ pesel: null, adres_do_doreczen: null });
  });
});
