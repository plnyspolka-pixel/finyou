/**
 * Przypadki testowe kompletu dokumentów (snapshoty tekstu DOCX).
 *
 * Dane są fikcyjne (poza danymi Pożyczkodawcy ze scenariuszy wzorcowych).
 * Kwoty podane tylko cyframi — słownie, harmonogram i prowizję przy
 * docelowej racie końcowej dolicza silnik (`przetworzSzkic`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const POZYCZKODAWCA = {
  typ: "podmiot_gospodarczy",
  nazwa: "FINANCE YOU",
  forma_prawna: "sp. z o.o.",
  krs: "0000635207",
  nip: "7010611803",
  regon: "365350668",
  adres: "ul. Nowogrodzka 31, 00-511 Warszawa",
  reprezentacja: {
    imie_nazwisko: "Filip Bielak",
    funkcja: "prezes zarządu",
  },
};

// Rachunek spłaty pominięty — silnik wstawia rachunek Finance You (Pożyczkodawca).
const RACHUNKI = {
  wyplata: "25 8011 0008 0010 0150 5299 0002",
};

/**
 * (a) = przypadek końcowy zlecenia: JDG, 25 000 zł, 14,5%, 36 rat, pułap 900 zł,
 * rata końcowa docelowa 25 900 zł, hipoteka 99 000 zł na KR1P/610770/2 (numer
 * bez zer — ma zostać znormalizowany) na kolejnym miejscu (przed nami hipoteka
 * umowna 62 000 zł) z roszczeniem o opróżnione miejsce, 777 do 99 000 zł.
 */
export function przypadekA(): any {
  return {
    meta: { data_umowy: "24.09.2026", miejscowosc: "Krakowie", numer_umowy: "FY/2026/09/001" },
    pozyczkodawca: POZYCZKODAWCA,
    pozyczkobiorca: {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Tomasz Wiśniewski",
      firma: "TW-BUD Tomasz Wiśniewski",
      pesel: "80010112345",
      nip: "6792345678",
      adres: "ul. Długa 5, 30-001 Kraków",
      telefon: "+48 600 100 200",
      email: "tomasz.wisniewski@example.com",
      stan_cywilny: "kawaler_panna",
    },
    porecziciel: null,
    warunki: {
      kwota_pozyczki: { cyframi: "25 000,00" },
      prowizja: { kwota: { cyframi: "0,00" }, model: "nie_potracana_raty" },
      oprocentowanie: "14,5",
      cel: "finansowanie bieżącej działalności gospodarczej (zakup materiałów budowlanych)",
      harmonogram: {
        liczba_rat: 36,
        typ: "balonowy",
        data_pierwszej_raty: "24.10.2026",
        dzien_miesiaca: 24,
        kwota_raty: { cyframi: "900,00" },
        kwota_raty_koncowej_docelowa: { cyframi: "25 900,00" },
      },
      rachunki: RACHUNKI,
    },
    nieruchomosci: [
      {
        nr_kw: "KR1P/610770/2",
        sad: "Sąd Rejonowy dla Krakowa-Podgórza w Krakowie, IV Wydział Ksiąg Wieczystych",
        opis: "lokal mieszkalny nr 12 przy ul. Długiej 5 w Krakowie",
        rodzaj: "lokal",
        wlasciciel_ref: "pozyczkobiorca",
        obciazenia: [
          {
            dzial: "IV",
            rodzaj: "hipoteka_umowna",
            opis: "hipoteka umowna zabezpieczająca kredyt",
            wierzyciel: "Bank Przykładowy S.A.",
            kwota: "62 000,00",
            sposob_usuniecia: "pozostaje_akceptowane",
          },
        ],
        hipoteka: { kwota: { cyframi: "99 000,00" }, pierwszenstwo: "kolejne" },
        roszczenie_oproznione_miejsce: true,
      },
    ],
    zabezpieczenia: {
      egzekucja_777: {
        kwota: { cyframi: "99 000,00" },
        poddaje_sie: ["pozyczkobiorca"],
        data_graniczna: "24.10.2032",
        termin_wezwania_dni: 7,
      },
    },
    wniosek: { pep: false },
  };
}

/** (b) Dwoje pożyczkobiorców solidarnie, współwłasność ułamkowa po 1/2. */
export function przypadekB(): any {
  return {
    meta: { data_umowy: "24.09.2026", miejscowosc: "Lublinie", numer_umowy: "FY/2026/09/002" },
    pozyczkodawca: POZYCZKODAWCA,
    pozyczkobiorca: [
      {
        typ: "osoba_fizyczna",
        imie_nazwisko: "Anna Kowalczyk",
        firma: "AK Handel Anna Kowalczyk",
        pesel: "85020254321",
        nip: "7121234567",
        adres: "ul. Lipowa 3, 20-001 Lublin",
        telefon: "+48 601 200 300",
        email: "anna.kowalczyk@example.com",
        stan_cywilny: "rozwiedziony",
      },
      {
        typ: "osoba_fizyczna",
        imie_nazwisko: "Marek Zieliński",
        pesel: "83030398765",
        adres: "ul. Lipowa 3, 20-001 Lublin",
        telefon: "+48 602 300 400",
        stan_cywilny: "kawaler_panna",
      },
    ],
    porecziciel: null,
    warunki: {
      kwota_pozyczki: { cyframi: "60 000,00" },
      prowizja: { kwota: { cyframi: "18 000,00" }, model: "nie_potracana_raty" },
      oprocentowanie: "15,5",
      cel: "rozwój prowadzonej działalności handlowej",
      harmonogram: {
        liczba_rat: 24,
        typ: "balonowy",
        data_pierwszej_raty: "24.10.2026",
        dzien_miesiaca: 24,
        kwota_raty: { cyframi: "1 600,00" },
      },
      rachunki: RACHUNKI,
    },
    nieruchomosci: [
      {
        nr_kw: "LU1I/00123456/7",
        sad: "Sąd Rejonowy Lublin-Zachód w Lublinie, VI Wydział Ksiąg Wieczystych",
        opis: "nieruchomość zabudowana budynkiem mieszkalnym jednorodzinnym przy ul. Lipowej 3 w Lublinie",
        rodzaj: "dom",
        wlasciciel_ref: "pozyczkobiorca",
        wspolwlasnosc: {
          rodzaj: "ulamkowa",
          wspolwlasciciele: [
            { imie_nazwisko: "Anna Kowalczyk", pesel: "85020254321", udzial: "1/2" },
            { imie_nazwisko: "Marek Zieliński", pesel: "83030398765", udzial: "1/2" },
          ],
        },
        obciazenia: [],
        hipoteka: { kwota: { cyframi: "150 000,00" }, pierwszenstwo: "pierwsze" },
      },
    ],
    zabezpieczenia: {
      egzekucja_777: {
        kwota: { cyframi: "150 000,00" },
        poddaje_sie: ["pozyczkobiorca"],
        data_graniczna: "24.10.2030",
        termin_wezwania_dni: 7,
      },
    },
    protokol_negocjacji: {
      data_od: "10.09.2026",
      data_do: "24.09.2026",
      posrednik: { imie_nazwisko: "Jan Pośrednik", telefon: "600 700 800" },
    },
  };
}

/** (c) Spółka z o.o. z poręczycielem rzeczowym (właścicielem nieruchomości). */
export function przypadekC(): any {
  return {
    meta: { data_umowy: "24.09.2026", miejscowosc: "Warszawie", numer_umowy: "FY/2026/09/003" },
    pozyczkodawca: POZYCZKODAWCA,
    pozyczkobiorca: {
      typ: "podmiot_gospodarczy",
      nazwa: "Przykład Logistyka",
      forma: "sp_z_oo",
      krs: "0000123456",
      nip: "5252123456",
      regon: "146123456",
      adres: "ul. Magazynowa 10, 02-001 Warszawa",
      telefon: "+48 22 100 20 30",
      email: "biuro@przyklad-logistyka.example",
      reprezentacja: [{ imie_nazwisko: "Paweł Nowicki", funkcja: "prezes zarządu" }],
      kapital_zakladowy: { cyframi: "100 000,00" },
      uchwala_zobowiazanie: { wymagana: false },
    },
    porecziciel: {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Paweł Nowicki",
      pesel: "79050512345",
      adres: "ul. Leśna 7, 05-500 Piaseczno",
      stan_cywilny: "zonaty_zamezna",
      ustroj_majatkowy: "rozdzielnosc",
      zakres_odpowiedzialnosci: "rzeczowa",
    },
    warunki: {
      kwota_pozyczki: { cyframi: "120 000,00" },
      prowizja: { kwota: { cyframi: "24 000,00" }, model: "nie_potracana_raty" },
      oprocentowanie: "16,0",
      cel: "finansowanie floty pojazdów dostawczych spółki",
      harmonogram: {
        liczba_rat: 12,
        typ: "rowne_raty",
        data_pierwszej_raty: "24.10.2026",
        dzien_miesiaca: 24,
      },
      rachunki: RACHUNKI,
    },
    nieruchomosci: [
      {
        nr_kw: "WA1M/00123456/3",
        sad: "Sąd Rejonowy dla Warszawy-Mokotowa w Warszawie, XIII Wydział Ksiąg Wieczystych",
        opis: "lokal mieszkalny nr 4 przy ul. Puławskiej 100 w Warszawie",
        rodzaj: "lokal",
        wlasciciel_ref: "porecziciel",
        obciazenia: [],
        hipoteka: { kwota: { cyframi: "300 000,00" }, pierwszenstwo: "pierwsze" },
      },
    ],
    zabezpieczenia: {
      egzekucja_777: {
        kwota: { cyframi: "300 000,00" },
        poddaje_sie: ["pozyczkobiorca", "porecziciel"],
        data_graniczna: "24.10.2029",
        termin_wezwania_dni: 7,
      },
    },
  };
}
