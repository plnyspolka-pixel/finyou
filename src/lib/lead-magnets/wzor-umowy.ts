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
import {
  umowaBloki,
  zbudujBloki,
  type Blok,
  type Komorka,
  type Run,
} from "@/lib/contract-engine/umowa-docx";
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

/** Rachunki bankowe we wzorze — symbole zamiast cyfr (jak we wzorcu właściciela). */
export const MASKA_RACHUNKU = "XX XXXX XXXX XXXX XXXX XXXX XXXX";
export const MASKA_PESEL = "XXXXXXXXXXX";
export const MASKA_NIP = "XXXXXXXXXX";
export const MASKA_KW = "XX1X/XXXXXXXX/X";

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
      miejscowosc: "Warszawie",
      numer_umowy: "WZÓR/2027",
    },
    // Strony przykładowe — jak we wzorcu właściciela (inwestorka i przedsiębiorca
    // na JDG); PESEL / NIP / KW / rachunki po renderze zastępują symbole X.
    pozyczkodawca: {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Anna Inwestorska",
      pesel: SENTINEL.peselPozyczkodawcy,
      adres: "ul. Inwestorska 2, 00-002 Warszawa",
      dokument_tozsamosci: "dowód osobisty XYZ 000000",
      plec: "K",
    },
    pozyczkobiorca: {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Jan Przykładowy",
      firma: "Jan Przykładowy – Usługi Przykładowe",
      pesel: SENTINEL.peselPozyczkobiorcy,
      nip: SENTINEL.nipPozyczkobiorcy,
      dokument_tozsamosci: "dowód osobisty ABC 000000",
      adres: "ul. Przykładowa 1, 00-001 Warszawa",
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
      cel: "finansowanie bieżącej działalności gospodarczej (zakup materiałów i wyposażenia)",
      harmonogram: {
        liczba_rat: WZOR_PRZYKLAD.liczbaRat,
        typ: "balonowy",
        data_pierwszej_raty: WZOR_PRZYKLAD.pierwszaRata,
        dzien_miesiaca: 15,
        kwota_raty: { cyframi: WZOR_PRZYKLAD.pulapRaty },
      },
      rachunki: {
        wyplata: MASKA_RACHUNKU,
        splata: MASKA_RACHUNKU,
      },
    },
    nieruchomosci: [
      {
        nr_kw: wzorNumerKw(),
        sad: "Sąd Rejonowy dla Warszawy-Mokotowa w Warszawie, VII Wydział Ksiąg Wieczystych",
        opis: "lokal mieszkalny przy ul. Przykładowej 1 w Warszawie",
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
    [SENTINEL.peselPozyczkodawcy, MASKA_PESEL],
    [SENTINEL.peselPozyczkobiorcy, MASKA_PESEL],
    [SENTINEL.nipPozyczkobiorcy, MASKA_NIP],
    [kw, MASKA_KW],
    [kw.replace(/\//g, ""), MASKA_KW.replace(/\//g, "")],
  ];
  if (rFy) out.push([rFy, MASKA_RACHUNKU]);
  return out;
}

function zamien(tekst: string, maski: Array<[string, string]>): string {
  // W blokach kompletu (wniosek, załączniki) zdarzają się komórki liczbowe.
  let t = typeof tekst === "string" ? tekst : tekst == null ? "" : String(tekst);
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

export interface CzescPakietu {
  /** Np. „Załącznik nr 1 — Harmonogram spłat” albo „Wniosek o udzielenie pożyczki pieniężnej”. */
  tytul: string;
  /** Bloki części po zamaskowaniu — do stron-zajawek (rysowane jako paski). */
  bloki: Blok[];
}

/**
 * Części kompletu poza umową — załączniki 1–n (w kolejności) i wniosek na
 * końcu — do stron-zajawek „dostępne w pełnym komplecie dokumentów”.
 */
export function wzorCzesciPakietu(): CzescPakietu[] {
  const w = wzorUmowy();
  const maski = wzorMaski(w.umowa);
  const wszystkie = maskujBloki(zbudujBloki(w.umowa, w.doc), maski);
  const czesci: Blok[][] = [];
  let biezaca: Blok[] = [];
  for (const b of wszystkie) {
    if (b.t === "tytul" && b.nowaStrona && biezaca.length) {
      czesci.push(biezaca);
      biezaca = [];
    }
    biezaca.push(b);
  }
  if (biezaca.length) czesci.push(biezaca);
  // [0] wniosek, [1] umowa, [2..] załączniki.
  const [wniosek, , ...zalaczniki] = czesci;
  const out: CzescPakietu[] = zalaczniki.map((bloki, i) => {
    const z = w.zalaczniki[i];
    return { tytul: z ? `Załącznik nr ${z.nr} — ${z.tytul}` : `Załącznik nr ${i + 1}`, bloki };
  });
  if (wniosek) out.push({ tytul: "Wniosek o udzielenie pożyczki pieniężnej", bloki: wniosek });
  return out;
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
