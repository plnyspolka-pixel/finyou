// Wzór umowy pożyczki (lead magnet UMOWA) — SAMA umowa z zatwierdzonej
// biblioteki klauzul silnika umów (contract-engine), bez załączników.
// Zgodnie z briefem 5.4 AI nie pisze tekstu prawnego: wzór powstaje tym samym
// potokiem co prawdziwa umowa (przetworzSzkic → renderuj → umowaBloki) na
// przykładowych warunkach, a dane stron, PESEL, NIP, rachunki i numer księgi
// są zamaskowane polami w nawiasach kwadratowych. Spis załączników zostaje
// w treści (§ „Załączniki”) — komplet z Zał. 1–4 daje pakiet dokumentów.
// Czysty moduł — bez I/O.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { przetworzSzkic } from "@/lib/contract-engine/umowa-agent-core";
import { renderuj, type Dokument } from "@/lib/contract-engine/renderer";
import { umowaBloki, type Blok, type Komorka, type Run } from "@/lib/contract-engine/umowa-docx";
import { CZESCI_KOMPLETU, WERSJA_BIBLIOTEKI } from "@/lib/contract-engine/komplet";
import type { Problem } from "@/lib/contract-engine/validator";
import { kwCheckDigit } from "@/lib/kw";

export { WERSJA_BIBLIOTEKI };

/** Wartości-wartowniki (muszą przejść schemat zod), zamieniane po renderze na pola do wypełnienia. */
const SENTINEL = {
  peselPozyczkodawcy: "00000000000",
  peselPozyczkobiorcy: "11111111111",
  nipPozyczkobiorcy: "1111111111",
  /** Kod wydziału spoza rejestru sądów; cyfra kontrolna liczona algorytmem EKW. */
  kwSad: "WZ9R",
  kwNumer: "00000000",
} as const;

export function wzorNumerKw(): string {
  return `${SENTINEL.kwSad}/${SENTINEL.kwNumer}/${kwCheckDigit(SENTINEL.kwSad, SENTINEL.kwNumer)}`;
}

/** Przykładowe warunki wzoru — widoczne w treści (kwoty, terminy, oprocentowanie). */
export const WZOR_PRZYKLAD = {
  kwota: "100 000,00",
  prowizjaInwestora: "10 000,00",
  oprocentowanie: "14,5",
  liczbaRat: 12,
  pulapRaty: "2 100,00",
  hipoteka: "260 000,00",
  dataUmowy: "15.01.2027",
  pierwszaRata: "15.02.2027",
  dataGraniczna777: "15.01.2033",
} as const;

/** Szkic umowy (wejście `przetworzSzkic`): dane stron jako pola, warunki przykładowe. */
export function wzorUmowySzkic(): any {
  return {
    meta: {
      data_umowy: WZOR_PRZYKLAD.dataUmowy,
      miejscowosc: "[miejscowość]",
      numer_umowy: "[numer umowy]",
    },
    pozyczkodawca: {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Imię Nazwisko Pożyczkodawcy",
      pesel: SENTINEL.peselPozyczkodawcy,
      adres: "[adres zamieszkania Pożyczkodawcy]",
      dokument_tozsamosci: "[rodzaj, seria i numer dokumentu tożsamości]",
      plec: "M",
    },
    pozyczkobiorca: {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Imię Nazwisko Pożyczkobiorcy",
      firma: "[firma Pożyczkobiorcy – nazwa działalności z CEIDG]",
      pesel: SENTINEL.peselPozyczkobiorcy,
      nip: SENTINEL.nipPozyczkobiorcy,
      adres: "[adres siedziby / zamieszkania Pożyczkobiorcy]",
      plec: "M",
    },
    porecziciel: null,
    warunki: {
      kwota_pozyczki: { cyframi: WZOR_PRZYKLAD.kwota },
      prowizja: {
        kwota: { cyframi: WZOR_PRZYKLAD.prowizjaInwestora },
        model: "nie_potracana_raty",
      },
      oprocentowanie: WZOR_PRZYKLAD.oprocentowanie,
      cel: "[cel gospodarczy – np. zakup maszyny na potrzeby prowadzonej działalności gospodarczej]",
      harmonogram: {
        liczba_rat: WZOR_PRZYKLAD.liczbaRat,
        typ: "balonowy",
        data_pierwszej_raty: WZOR_PRZYKLAD.pierwszaRata,
        dzien_miesiaca: 15,
        kwota_raty: { cyframi: WZOR_PRZYKLAD.pulapRaty },
      },
      rachunki: {
        wyplata: "[numer rachunku bankowego Pożyczkobiorcy]",
        splata: "[numer rachunku bankowego Pożyczkodawcy]",
      },
    },
    nieruchomosci: [
      {
        nr_kw: wzorNumerKw(),
        sad: "Sąd Rejonowy w [miejscowość], [numer] Wydział Ksiąg Wieczystych",
        opis: "[opis nieruchomości – np. lokal mieszkalny nr … przy ul. … w …]",
        rodzaj: "lokal",
        wlasciciel_ref: "pozyczkobiorca",
        obciazenia: [],
        hipoteka: { kwota: { cyframi: WZOR_PRZYKLAD.hipoteka }, pierwszenstwo: "pierwsze" },
      },
    ],
    zabezpieczenia: {
      egzekucja_777: {
        kwota: { cyframi: WZOR_PRZYKLAD.hipoteka },
        poddaje_sie: ["pozyczkobiorca"],
        data_graniczna: WZOR_PRZYKLAD.dataGraniczna777,
        termin_wezwania_dni: 7,
      },
    },
    wniosek: { pep: false },
  };
}

/** Zamiany po renderze: wartowniki → pola do wypełnienia. Kolejność: dłuższe najpierw. */
export function wzorMaski(umowa: any): Array<[string, string]> {
  const kw = String(umowa?.nieruchomosci?.[0]?.nr_kw ?? wzorNumerKw());
  const rFy = String(umowa?.warunki?.rachunki?.finance_you ?? "");
  const out: Array<[string, string]> = [
    ["IMIĘ NAZWISKO POŻYCZKODAWCY", "[IMIĘ I NAZWISKO POŻYCZKODAWCY]"],
    ["IMIĘ NAZWISKO POŻYCZKOBIORCY", "[IMIĘ I NAZWISKO POŻYCZKOBIORCY]"],
    ["Imię Nazwisko Pożyczkodawcy", "[imię i nazwisko Pożyczkodawcy]"],
    ["Imię Nazwisko Pożyczkobiorcy", "[imię i nazwisko Pożyczkobiorcy]"],
    [`PESEL ${SENTINEL.peselPozyczkodawcy}`, "PESEL [numer PESEL]"],
    [`PESEL ${SENTINEL.peselPozyczkobiorcy}`, "PESEL [numer PESEL]"],
    [`NIP ${SENTINEL.nipPozyczkobiorcy}`, "NIP [numer NIP]"],
    [SENTINEL.peselPozyczkodawcy, "[numer PESEL]"],
    [SENTINEL.peselPozyczkobiorcy, "[numer PESEL]"],
    [SENTINEL.nipPozyczkobiorcy, "[numer NIP]"],
    [kw, "[numer księgi wieczystej]"],
    [kw.replace(/\//g, ""), "[numer księgi wieczystej]"],
  ];
  if (rFy) out.push([rFy, "[numer rachunku Finance You – w pakiecie dokumentów]"]);
  return out;
}

function zamien(tekst: string, maski: Array<[string, string]>): string {
  let t = tekst;
  for (const [od, na] of maski) if (od) t = t.split(od).join(na);
  return t;
}

function maskujRun(r: Run, maski: Array<[string, string]>): Run {
  return { ...r, tekst: zamien(r.tekst, maski) };
}

function maskujKomorke(k: Komorka, maski: Array<[string, string]>): Komorka {
  return {
    ...k,
    tekst:
      typeof k.tekst === "string"
        ? zamien(k.tekst, maski)
        : k.tekst.map((r) => maskujRun(r, maski)),
  };
}

/** Maskowanie danych we wszystkich blokach (akapity, tabele, tytuły, podpisy). */
export function maskujBloki(bloki: Blok[], maski: Array<[string, string]>): Blok[] {
  return bloki.map((b): Blok => {
    switch (b.t) {
      case "tytul":
      case "podtytul":
      case "naglowek":
        return { ...b, tekst: zamien(b.tekst, maski) };
      case "akapit":
        return { ...b, runs: b.runs.map((r) => maskujRun(r, maski)) };
      case "tabela":
        return {
          ...b,
          wiersze: b.wiersze.map((w) => ({
            ...w,
            komorki: w.komorki.map((k) => maskujKomorke(k, maski)),
          })),
        };
      case "podpisy":
        return {
          ...b,
          osoby: b.osoby.map((o) => ({
            ...o,
            nazwa: o.nazwa ? zamien(o.nazwa, maski) : o.nazwa,
            wImieniu: o.wImieniu?.map((x) => zamien(x, maski)),
          })),
        };
    }
  });
}

export interface WzorUmowy {
  /** Dane po przetworzeniu (słownie, harmonogram, rozliczenie Finance You). */
  umowa: any;
  doc: Dokument;
  /** Bloki samej umowy po zamaskowaniu danych. */
  bloki: Blok[];
  /** Załączniki z treści umowy (nr + tytuł) — w pakiecie dokumentów. */
  zalaczniki: Array<{ nr: number; tytul: string }>;
  problemy: Problem[];
  wersjaBiblioteki: string;
}

let cache: WzorUmowy | null = null;

/**
 * Wzór umowy: szkic → przetworzSzkic (uzupełnienia + walidacja) → renderuj
 * → bloki umowy → maskowanie. Błąd BLAD walidacji = wyjątek (test pilnuje).
 */
export function wzorUmowy(): WzorUmowy {
  if (cache) return cache;
  const { umowa, problemy } = przetworzSzkic(wzorUmowySzkic());
  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  if (bledy.length) {
    throw new Error(
      `Wzór umowy nie przechodzi walidacji silnika: ${bledy
        .map((b) => `${b.sciezka}: ${b.komunikat}`)
        .join("; ")}`,
    );
  }
  const doc = renderuj(umowa);
  const bloki = maskujBloki(umowaBloki(umowa, doc), wzorMaski(umowa));
  cache = {
    umowa,
    doc,
    bloki,
    zalaczniki: (doc.zalaczniki ?? []).map((z: any) => ({
      nr: Number(z.nr),
      tytul: String(z.tytul),
    })),
    problemy,
    wersjaBiblioteki: WERSJA_BIBLIOTEKI,
  };
  return cache;
}

/** Tekst bloków (do testów: brak wartowników, danych osobowych, znaków spoza fontu). */
export function tekstBlokow(bloki: Blok[]): string {
  const out: string[] = [];
  for (const b of bloki) {
    switch (b.t) {
      case "tytul":
      case "podtytul":
      case "naglowek":
        out.push(b.tekst);
        break;
      case "akapit":
        out.push((b.etykieta ? `${b.etykieta} ` : "") + b.runs.map((r) => r.tekst).join(""));
        break;
      case "tabela":
        for (const w of b.wiersze)
          out.push(
            w.komorki
              .map((k) =>
                typeof k.tekst === "string" ? k.tekst : k.tekst.map((r) => r.tekst).join(""),
              )
              .join(" | "),
          );
        break;
      case "podpisy":
        for (const o of b.osoby)
          out.push([o.rola, o.nazwa, ...(o.wImieniu ?? [])].filter(Boolean).join(" "));
        break;
    }
  }
  return out.join("\n");
}

export function wzorUmowyTekst(): string {
  return tekstBlokow(wzorUmowy().bloki);
}

/** Opis załączników kompletu (do strony „Załączniki – w pakiecie dokumentów”). */
export const ZALACZNIKI_OPIS: Record<number, string> = {
  1: "Tabela rat z terminami, kapitałem, odsetkami i prowizją oraz sumami — liczona silnikiem do grosza, z autonaprawą zaokrągleń w racie końcowej.",
  2: "Potwierdzenie, że warunki umowy (kwota, prowizja, oprocentowanie, zabezpieczenia) zostały indywidualnie wynegocjowane — dowód, że Pożyczkobiorca nie działał jako konsument.",
  3: "Stawki opłat za czynności windykacyjne (wezwania, monity, wizyty) — jedno źródło konfiguracji dla wszystkich umów.",
  4: "Dyspozycja Pożyczkobiorcy, by prowizję Finance You potrącić z wypłaty i przelać na rachunek Finance You, a resztę na rachunek Pożyczkobiorcy.",
};

/** Nazwy części kompletu poza umową (wniosek + załączniki) — z silnika. */
export function czesciPakietu(): string[] {
  return CZESCI_KOMPLETU.filter((c) => c !== "Umowa pożyczki");
}
