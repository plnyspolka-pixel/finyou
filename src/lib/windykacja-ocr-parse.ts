// ════════════════════════════════════════════════════════════════════
// ODCZYT UMOWY POŻYCZKI — parsowanie odpowiedzi modelu (czyste funkcje).
//
// Model wizyjny zwraca JSON z danymi umowy; tu zamieniamy go na
// WindContractData: normalizujemy kwoty, daty, PESEL/NIP, numer rachunku
// i harmonogram rat. Kwoty wyliczane (na rękę, do zwrotu bez odsetek)
// liczymy sami z odczytanych składników — model pewniej przepisuje
// liczby z umowy, niż liczy.
//
// Znaczenie kwot (model jednoterminowy — splitInvestorPrincipal
// w debt-collection-math.ts):
//   • kwota_pozyczki  = kwota wypłacona na rękę = Kwota Pożyczki − prowizja
//                       Finance You potrącana z wypłaty;
//   • prowizja        = WYŁĄCZNIE prowizja Finance You potrącana z wypłaty
//                       (oprocentowana razem z kwotą na rękę);
//   • kwota_calkowita = Kwota Pożyczki + prowizja pożyczkodawcy, gdy nie jest
//                       potrącana z wypłaty — BEZ odsetek umownych.
// ════════════════════════════════════════════════════════════════════

import { detectPolishBankAccount, formatAccountGroups } from "@/lib/polish-bank";
import { parsePesel } from "@/lib/risk-assessment/pesel";
import {
  generateHarmonogram,
  normalizeHarmonogram,
  parseDataISO,
  parseKwota,
  type WindRata,
} from "@/lib/windykacja-harmonogram";

export type WindOcrReason =
  | "ok"
  | "unsupported"
  | "rate_limited"
  | "ai_quota"
  | "ai_error"
  | "no_key";

/**
 * Tabela opłat za czynności windykacyjne odczytana z umowy (zł). Brak
 * kwoty = umowa nie określa opłaty; `brak_oplat` = umowa nie przewiduje
 * żadnych opłat windykacyjnych.
 */
export interface WindContractFees {
  sms: number | null;
  email: number | null;
  telefon: number | null;
  pismo: number | null;
  brak_oplat: boolean;
}

/** Skąd pochodzi harmonogram: z tabeli Zał. 1 czy wygenerowany z parametrów umowy. */
export type WindHarmonogramZrodlo = "tabela" | "parametry";

export interface WindContractData {
  reason: WindOcrReason;
  /** Nazwa pożyczkodawcy z umowy (strona udzielająca pożyczki). */
  pozyczkodawca: string | null;
  imie_nazwisko: string | null;
  /** Osoba prowadząca JDG (PESEL + NIP) to „osoba_fizyczna"; „firma" — spółki i osoby prawne. */
  typ: "osoba_fizyczna" | "firma" | null;
  pesel: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  adres: string | null;
  numer_umowy: string | null;
  data_umowy: string | null; // ISO yyyy-mm-dd
  /** Kwota wypłacona na rękę: Kwota Pożyczki − prowizja Finance You potrącana z wypłaty. */
  kwota_pozyczki: number | null;
  /** Kwota do zwrotu bez odsetek umownych: Kwota Pożyczki + prowizja pożyczkodawcy. */
  kwota_calkowita: number | null;
  /** Wyłącznie prowizja Finance You potrącana z wypłaty (nie prowizja pożyczkodawcy). */
  prowizja: number | null;
  /** Termin ostatniej raty (ISO yyyy-mm-dd). */
  termin_splaty: string | null;
  numer_kw: string | null;
  /** Rachunek do spłaty rat — NRB „NN NNNN NNNN NNNN NNNN NNNN NNNN" (z poprawną sumą kontrolną). */
  rachunek_splaty: string | null;
  kwota_hipoteki: number | null;
  /** Opis aktu notarialnego z poddaniem się egzekucji (art. 777 § 1 pkt 5 k.p.c.). */
  akt_notarialny_777: string | null;
  kwota_777: number | null;
  /** Oprocentowanie roczne kapitałowe (%), gdy umowa je podaje. */
  oprocentowanie_roczne: number | null;
  /**
   * Odsetki za opóźnienie wg umowy (% rocznie) — tylko gdy umowa podaje
   * liczbę; „dwukrotność odsetek ustawowych za opóźnienie" → null
   * (formularz przyjmuje wtedy odsetki maksymalne za opóźnienie).
   */
  odsetki_za_opoznienie: number | null;
  /** Opłaty za czynności windykacyjne wg umowy — podstawa naliczania w rejestrze. */
  oplaty_windykacyjne: WindContractFees | null;
  /** Harmonogram rat (Zał. 1) albo wygenerowany z parametrów; brak → null. */
  harmonogram: WindRata[] | null;
  harmonogram_zrodlo: WindHarmonogramZrodlo | null;
  /** Parametry harmonogramu (z umowy, a gdy ich brak — wyprowadzone z tabeli rat). */
  liczba_rat: number | null;
  kwota_raty: number | null;
  kwota_ostatniej_raty: number | null;
  data_pierwszej_raty: string | null;
  /** Uwagi do sprawdzenia przez inwestora (np. niepełna tabela rat, błędny numer rachunku). */
  ostrzezenia: string[];
  podsumowanie: string;
}

export function emptyWindContract(reason: WindOcrReason): WindContractData {
  return {
    reason,
    pozyczkodawca: null,
    imie_nazwisko: null,
    typ: null,
    pesel: null,
    nip: null,
    email: null,
    telefon: null,
    adres: null,
    numer_umowy: null,
    data_umowy: null,
    kwota_pozyczki: null,
    kwota_calkowita: null,
    prowizja: null,
    termin_splaty: null,
    numer_kw: null,
    rachunek_splaty: null,
    kwota_hipoteki: null,
    akt_notarialny_777: null,
    kwota_777: null,
    oprocentowanie_roczne: null,
    odsetki_za_opoznienie: null,
    oplaty_windykacyjne: null,
    harmonogram: null,
    harmonogram_zrodlo: null,
    liczba_rat: null,
    kwota_raty: null,
    kwota_ostatniej_raty: null,
    data_pierwszej_raty: null,
    ostrzezenia: [],
    podsumowanie: "",
  };
}

// ── Pomocnicze: tekst, liczby, daty ──────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Tolerancja groszowa przy porównywaniu kwot (jak w contract-engine/schedule.ts). */
const TOLERANCJA = 0.05;
/** Górny limit liczby rat (jak w generateHarmonogram). */
const MAX_RAT = 600;

/** Wartości, którymi model oznacza brak danych. */
const PUSTE = new Set([
  "null",
  "undefined",
  "brak",
  "brak danych",
  "nie dotyczy",
  "nieznany",
  "nieznane",
  "n/a",
  "nd",
  "b/d",
  "bd",
  "-",
  "–",
  "—",
]);

/** Tekst z odpowiedzi modelu — bez nadmiarowych spacji; „brak"/„null" → null. */
export function ocrTekst(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || PUSTE.has(s.toLowerCase())) return null;
  return s.slice(0, max);
}

/** Jeden zapis liczbowy („7 868,48 zł", „18,5%") → liczba albo null. */
function liczbaZTekstu(s: string, kwota: boolean): number | null {
  const t = s.replace(/\s/g, "").replace(/zł|pln|%/gi, "");
  // „100.000" / „1,250,000" — w kwocie w złotych to separatory tysięcy
  // (kwota nie ma trzech miejsc po przecinku).
  if (kwota && /^-?[1-9]\d{0,2}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  return parseKwota(t);
}

function ocrNumber(v: unknown, kwota: boolean): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const direct = liczbaZTekstu(v, kwota);
  if (direct != null) return direct;
  // Liczba wpleciona w tekst („ok. 5 000 złotych") — tylko gdy jest jedna.
  const tokens = v.match(/-?\d[\d\s.,]*\d|-?\d/g);
  return tokens && tokens.length === 1 ? liczbaZTekstu(tokens[0], kwota) : null;
}

/** Kwota w złotych (liczba albo tekst po polsku) zaokrąglona do groszy; null, gdy nieczytelna. */
export function ocrKwota(v: unknown): number | null {
  const n = ocrNumber(v, true);
  return n == null ? null : round2(n);
}

/** Liczba (np. stopa procentowa „18,5%") bez zaokrąglania; null, gdy nieczytelna. */
export function ocrLiczba(v: unknown): number | null {
  return ocrNumber(v, false);
}

const dodatnia = (n: number | null) => (n != null && n > 0 ? n : null);
const nieujemna = (n: number | null) => (n != null && n >= 0 ? n : null);

/** Kwota większa od zera (np. kwota wpłaty z potwierdzenia przelewu); inaczej null. */
export function dodatniaKwota(v: unknown): number | null {
  return dodatnia(ocrKwota(v));
}

/** Stopa procentowa w rozsądnym zakresie (0–100% rocznie). */
function stopa(v: unknown, dopuscZero: boolean): number | null {
  const n = ocrLiczba(v);
  if (n == null || n > 100) return null;
  return n > 0 || (dopuscZero && n === 0) ? n : null;
}

const MIESIACE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

/**
 * Data z odpowiedzi modelu → RRRR-MM-DD (tylko istniejące daty).
 * Przyjmuje „2026-07-10", „10.07.2026 r.", „10 lipca 2026 r.".
 */
export function ocrData(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s*r\.?$/i, "");
  const iso = parseDataISO(s);
  if (iso) return iso;
  const m = /^(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})$/i.exec(s);
  if (!m) return null;
  const idx = MIESIACE.indexOf(m[2].toLowerCase());
  if (idx < 0) return null;
  return parseDataISO(`${m[3]}-${String(idx + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
}

/** Wartość logiczna z odpowiedzi modelu (true/false/„tak"/„nie"); inaczej null. */
function ocrBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "tak") return true;
  if (s === "false" || s === "nie") return false;
  return null;
}

/**
 * Tekst odpowiedzi modelu → obiekt JSON. Model bywa „gadatliwy" (blok
 * ```json, zdanie przed lub po), więc w razie potrzeby wycinamy obiekt
 * od pierwszej „{" do ostatniej „}". Nie-obiekt → null.
 */
export function parseOcrJsonText(text: unknown): Record<string, unknown> | null {
  const cleaned = String(text ?? "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v: unknown = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  return a >= 0 && b > a ? tryParse(cleaned.slice(a, b + 1)) : null;
}

// ── Identyfikatory: PESEL, NIP, rachunek ─────────────────────────────

/** PESEL bez spacji i myślników (gdy ma 11 cyfr); inny zapis zostaje do poprawy w formularzu. */
function ocrPesel(v: unknown): string | null {
  const s = ocrTekst(v, 20);
  if (!s) return null;
  const digits = s.replace(/[\s-]/g, "");
  return /^\d{11}$/.test(digits) ? digits : s;
}

/** NIP jako 10 cyfr (bez „PL", spacji i myślników); inny zapis zostaje bez zmian. */
function ocrNip(v: unknown): string | null {
  const s = ocrTekst(v, 20);
  if (!s) return null;
  const digits = s.replace(/[\s-]/g, "").replace(/^PL/i, "");
  return /^\d{10}$/.test(digits) ? digits : s;
}

/**
 * Numer rachunku (NRB albo IBAN PL) → „NN NNNN NNNN NNNN NNNN NNNN NNNN".
 * Numer z błędną sumą kontrolną (mod 97) to na pewno błąd odczytu — nie
 * może trafić do wezwania do zapłaty, więc zwracamy null.
 */
export function normalizeNrb(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.toUpperCase().replace(/[\s.\-–]/g, "");
  const m = /(?:^|\D)(\d{26})(?!\d)/.exec(c);
  if (!m) return null;
  return detectPolishBankAccount(m[1]).success ? formatAccountGroups(m[1]) : null;
}

// ── Pożyczkobiorca: osoba fizyczna (także JDG) czy firma ─────────────

const GRANICA = String.raw`(?=$|[\s,;)"”])`;
const POCZATEK = String.raw`(?:^|[\s,("„])`;
/** Oznaczenia formy prawnej w nazwie (k.s.h. wymaga ich w firmie spółki). */
const FORMY_PRAWNE: RegExp[] = [
  new RegExp(POCZATEK + String.raw`sp\.?\s?z\s?o\.?\s?o\.?` + GRANICA, "i"), // sp. z o.o.
  new RegExp(POCZATEK + String.raw`(?:p\.\s?)?s\.\s?a\.?` + GRANICA, "i"), // S.A., P.S.A.
  new RegExp(POCZATEK + String.raw`(?:p\.?\s?)?SA` + GRANICA), // SA, PSA
  new RegExp(POCZATEK + String.raw`sp\.?\s?[kjp]\.?` + GRANICA, "i"), // sp. k., sp. j., sp. p.
  new RegExp(POCZATEK + String.raw`s\.\s?k\.\s?a\.?` + GRANICA, "i"), // S.K.A.
  new RegExp(POCZATEK + String.raw`s\.\s?c\.?` + GRANICA, "i"), // s.c.
  new RegExp(POCZATEK + String.raw`(?:gmbh|ltd|llc|inc|plc|s\.r\.o)\.?` + GRANICA, "i"),
  new RegExp(
    POCZATEK + "(?:spółk|spolk|fundacj|stowarzyszeni|spółdzielni|spoldzielni|towarzystw)",
    "i",
  ),
];

/** Czy nazwa zawiera oznaczenie formy prawnej (spółka, fundacja, S.A. …). */
export function maFormePrawna(nazwa: string | null | undefined): boolean {
  return !!nazwa && FORMY_PRAWNE.some((re) => re.test(nazwa));
}

/** Dopisek o działalności gospodarczej po imieniu i nazwisku (JDG) — do odcięcia. */
const DOPISEK_JDG =
  /[\s,;(–-]+(?:prowadząc|działając|pod\s+firmą|pod\s+nazwą|przedsiębiorc|właściciel\s+firmy|\(?jdg\b)[\s\S]*$/i;

/** Imię i nazwisko osoby prowadzącej JDG — bez nazwy firmy i dopisku o działalności. */
function imieNazwiskoOsoby(nazwa: string): string {
  const s = nazwa
    .replace(DOPISEK_JDG, "")
    .replace(/[\s,;:–-]+$/, "")
    .trim();
  return s || nazwa;
}

/**
 * Typ pożyczkobiorcy. Osoba prowadząca jednoosobową działalność (ma PESEL
 * i NIP) to osoba fizyczna; „firma" tylko dla spółek i osób prawnych.
 * Nazwa z formą prawną → firma; poprawny PESEL i nazwa bez formy prawnej
 * → osoba fizyczna (nawet gdy model wskazał „firma"); inaczej typ z modelu.
 */
function typPozyczkobiorcy(
  modelTyp: unknown,
  nazwa: string | null,
  pesel: string | null,
  nip: string | null,
): "osoba_fizyczna" | "firma" {
  if (maFormePrawna(nazwa)) return "firma";
  if (pesel && parsePesel(pesel).valid) return "osoba_fizyczna";
  if (modelTyp === "firma" || modelTyp === "osoba_fizyczna") return modelTyp;
  return nip && !nazwa && !pesel ? "firma" : "osoba_fizyczna";
}

// ── Harmonogram rat ──────────────────────────────────────────────────

/** Wiersz tabeli z odpowiedzi modelu → kształt dla normalizeHarmonogram. */
function wierszRaty(r: unknown): Record<string, unknown> | null {
  if (Array.isArray(r)) {
    // Zwięzła postać krotki: [termin, kwota, odsetki?, prowizja?].
    const [termin, kwota, odsetki, prowizja] = r as unknown[];
    return {
      termin: ocrData(termin),
      kwota: ocrKwota(kwota),
      odsetki: ocrKwota(odsetki),
      prowizja: ocrKwota(prowizja),
    };
  }
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const odsetki = ocrKwota(o.odsetki);
  const prowizja = ocrKwota(o.prowizja);
  let kwota = ocrKwota(o.kwota ?? o.rata ?? o.rata_razem);
  if (kwota == null) {
    // Tabela bez kolumny „rata łącznie" — sumujemy części.
    const kapital = ocrKwota(o.kapital);
    if (kapital != null) kwota = round2(kapital + (odsetki ?? 0) + (prowizja ?? 0));
  }
  return { termin: ocrData(o.termin ?? o.data ?? o.termin_platnosci), kwota, odsetki, prowizja };
}

/** Tabela rat z odpowiedzi modelu → WindRata[] (posortowana, bez duplikatów) albo null. */
function harmonogramZTabeli(raw: unknown): WindRata[] | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    v = o.raty ?? o.wiersze ?? o.rows;
  }
  if (!Array.isArray(v)) return null;
  const rows = normalizeHarmonogram(v.slice(0, MAX_RAT * 2).map(wierszRaty));
  if (!rows) return null;
  // Ten sam wiersz odczytany dwa razy (np. na styku stron) — liczymy raz.
  const unikalne = rows.filter((r, i) => {
    const p = rows[i - 1];
    return (
      !p ||
      p.termin !== r.termin ||
      p.kwota !== r.kwota ||
      p.odsetki !== r.odsetki ||
      p.prowizja !== r.prowizja
    );
  });
  return unikalne.slice(0, MAX_RAT).map((r, i) => ({ ...r, nr: i + 1 }));
}

/** Najczęstsza kwota raty (bez ostatniej, która bywa inna) — przy remisie wcześniejsza. */
function typowaRata(raty: WindRata[]): number {
  const bezOstatniej = raty.length > 1 ? raty.slice(0, -1) : raty;
  const ile = new Map<number, number>();
  for (const r of bezOstatniej) ile.set(r.kwota, (ile.get(r.kwota) ?? 0) + 1);
  let best = bezOstatniej[0].kwota;
  for (const r of bezOstatniej) if ((ile.get(r.kwota) ?? 0) > (ile.get(best) ?? 0)) best = r.kwota;
  return best;
}

const suma = (raty: WindRata[], f: (r: WindRata) => number) =>
  round2(raty.reduce((s, r) => s + f(r), 0));

// ── Kwoty pożyczki ───────────────────────────────────────────────────

/**
 * Kwota do zwrotu bez odsetek umownych (kwota_calkowita).
 *   • Model podał sumę rat z odsetkami (zgodną z tabelą) — odrzucamy ją.
 *   • Znana Kwota Pożyczki i prowizja pożyczkodawcy ze sposobem pobrania
 *     → liczymy: KP + prowizja (gdy nie jest potrącana z wypłaty).
 *   • Inaczej — wartość modelu, o ile nie jest mniejsza niż Kwota Pożyczki.
 *   • Bez Kwoty Pożyczki i wartości modelu — z pełnej tabeli rat:
 *     suma rat bez odsetek umownych = kapitał + prowizja.
 */
function kwotaDoZwrotu(a: {
  model: number | null;
  kwotaPozyczkiUmowy: number | null;
  prowizjaPozyczkodawcy: number | null;
  potracana: boolean | null;
  tabela: WindRata[] | null;
  tabelaKompletna: boolean;
  ostrzezenia: string[];
}): number | null {
  let model = a.model;
  if (model != null && a.tabela) {
    const sumaOdsetek = suma(a.tabela, (r) => Number(r.odsetki) || 0);
    if (
      sumaOdsetek > TOLERANCJA &&
      Math.abs(model - suma(a.tabela, (r) => r.kwota)) <= TOLERANCJA
    ) {
      model = null;
      a.ostrzezenia.push(
        "Odczytana „kwota do zwrotu” była sumą rat z odsetkami umownymi — przyjęto kwotę bez odsetek.",
      );
    }
  }

  const kp = a.kwotaPozyczkiUmowy;
  if (kp != null) {
    const prow = a.prowizjaPozyczkodawcy;
    const zProwizja = prow != null && prow > 0 ? round2(kp + prow) : kp;
    // Prowizja potrącona przy wypłacie mieści się w Kwocie Pożyczki.
    if (a.potracana === true || prow === 0) return kp;
    if (prow != null && a.potracana === false) return zProwizja;
    if (model != null && (Math.abs(model - kp) <= 0.01 || Math.abs(model - zProwizja) <= 0.01))
      return model;
    // Model może znać prowizję, której nie wyodrębnił osobno.
    if (model != null && prow == null && model >= kp) return model;
    // Sposób pobrania prowizji nieznany — wzorzec Finance You: prowizja w ratach.
    return zProwizja;
  }
  if (model != null) return model;
  if (a.tabela && a.tabelaKompletna && a.tabela.every((r) => r.odsetki != null)) {
    return suma(a.tabela, (r) => r.kwota - (Number(r.odsetki) || 0));
  }
  return null;
}

/** Tabela opłat z odpowiedzi modelu → WindContractFees (null, gdy nic nie odczytano). */
function parseContractFees(v: unknown): WindContractFees | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const fees: WindContractFees = {
    sms: nieujemna(ocrKwota(o.sms)),
    email: nieujemna(ocrKwota(o.email)),
    telefon: nieujemna(ocrKwota(o.telefon)),
    pismo: nieujemna(ocrKwota(o.pismo)),
    brak_oplat: ocrBool(o.brak_oplat) === true,
  };
  const any =
    fees.brak_oplat || [fees.sms, fees.email, fees.telefon, fees.pismo].some((x) => x != null);
  return any ? fees : null;
}

// ── Główny parser ────────────────────────────────────────────────────

/**
 * Odpowiedź modelu (obiekt JSON) → WindContractData. Czysta funkcja:
 * dowolne braki i błędne typy dają null, nigdy wyjątek.
 */
export function parseWindContractJson(p: Record<string, unknown>): WindContractData {
  const ostrzezenia: string[] = [];

  // ── Strony umowy ──
  const pesel = ocrPesel(p.pesel);
  const nip = ocrNip(p.nip);
  const nazwa = ocrTekst(p.imie_nazwisko);
  const typ = typPozyczkobiorcy(p.typ, nazwa, pesel, nip);
  const imie_nazwisko = nazwa && typ === "osoba_fizyczna" ? imieNazwiskoOsoby(nazwa) : nazwa;
  let pozyczkodawca = ocrTekst(p.pozyczkodawca);
  if (
    pozyczkodawca &&
    imie_nazwisko &&
    pozyczkodawca.toLowerCase() === imie_nazwisko.toLowerCase()
  ) {
    pozyczkodawca = null;
    ostrzezenia.push(
      "Pożyczkodawca i pożyczkobiorca odczytali się tak samo — uzupełnij pożyczkodawcę ręcznie.",
    );
  }

  // ── Harmonogram rat ──
  const liczbaRatModel = ocrLiczba(p.liczba_rat);
  const liczbaRatUmowy =
    liczbaRatModel != null &&
    Number.isInteger(liczbaRatModel) &&
    liczbaRatModel >= 1 &&
    liczbaRatModel <= MAX_RAT
      ? liczbaRatModel
      : null;
  let liczba_rat = liczbaRatUmowy;
  let kwota_raty = dodatnia(ocrKwota(p.kwota_raty));
  let kwota_ostatniej_raty = dodatnia(ocrKwota(p.kwota_ostatniej_raty));
  let data_pierwszej_raty = ocrData(p.data_pierwszej_raty);

  const tabela = harmonogramZTabeli(p.harmonogram);
  let harmonogram: WindRata[] | null = tabela;
  let harmonogram_zrodlo: WindHarmonogramZrodlo | null = tabela ? "tabela" : null;
  if (tabela && liczba_rat != null && liczba_rat !== tabela.length) {
    ostrzezenia.push(
      `Z tabeli harmonogramu odczytano ${tabela.length} rat, a umowa podaje ${liczba_rat} — sprawdź raty.`,
    );
  }
  if (!tabela && data_pierwszej_raty && liczba_rat != null && kwota_raty != null) {
    const gen = generateHarmonogram({
      pierwszaRata: data_pierwszej_raty,
      liczbaRat: liczba_rat,
      kwotaRaty: kwota_raty,
      kwotaOstatniejRaty: kwota_ostatniej_raty,
    });
    if (gen.length > 0) {
      harmonogram = gen;
      harmonogram_zrodlo = "parametry";
      ostrzezenia.push(
        "Nie odczytano tabeli rat — harmonogram wygenerowano z parametrów umowy; porównaj go z Załącznikiem nr 1.",
      );
    }
  }
  if (harmonogram) {
    liczba_rat ??= harmonogram.length;
    data_pierwszej_raty ??= harmonogram[0].termin;
    kwota_raty ??= typowaRata(harmonogram);
    const ostatnia = harmonogram[harmonogram.length - 1].kwota;
    if (kwota_ostatniej_raty == null && harmonogram.length > 1 && ostatnia !== kwota_raty) {
      kwota_ostatniej_raty = ostatnia;
    }
  }

  // ── Kwoty ──
  const kwotaPozyczkiUmowy = dodatnia(ocrKwota(p.kwota_pozyczki_umowy));
  const prowizja = dodatnia(ocrKwota(p.prowizja));
  const prowizjaPozyczkodawcy = nieujemna(ocrKwota(p.prowizja_pozyczkodawcy));
  if (prowizja != null && prowizja === prowizjaPozyczkodawcy) {
    ostrzezenia.push(
      "Prowizja Finance You i prowizja pożyczkodawcy mają tę samą kwotę — sprawdź, czy umowa przewiduje obie.",
    );
  }
  let kwota_pozyczki = dodatnia(ocrKwota(p.kwota_pozyczki));
  if (kwotaPozyczkiUmowy != null) {
    // Na rękę = Kwota Pożyczki − prowizja Finance You potrącana z wypłaty.
    const naReke = round2(kwotaPozyczkiUmowy - (prowizja ?? 0));
    if (naReke > 0) kwota_pozyczki = naReke;
  }
  const kwota_calkowita = kwotaDoZwrotu({
    model: dodatnia(ocrKwota(p.kwota_calkowita)),
    kwotaPozyczkiUmowy,
    prowizjaPozyczkodawcy,
    potracana: ocrBool(p.prowizja_pozyczkodawcy_potracana),
    tabela,
    tabelaKompletna: liczbaRatUmowy == null || liczbaRatUmowy === tabela?.length,
    ostrzezenia,
  });

  // ── Rachunek do spłaty ──
  const rachunekTekst = ocrTekst(p.rachunek_splaty, 80);
  const rachunek_splaty = normalizeNrb(rachunekTekst);
  if (rachunekTekst && !rachunek_splaty) {
    ostrzezenia.push(
      "Numer rachunku do spłaty z umowy jest niepełny albo ma błędną sumę kontrolną — wpisz go ręcznie.",
    );
  }

  return {
    reason: "ok",
    pozyczkodawca,
    imie_nazwisko,
    typ,
    pesel,
    nip,
    email: ocrTekst(p.email, 200),
    telefon: ocrTekst(p.telefon, 40),
    adres: ocrTekst(p.adres, 300),
    numer_umowy: ocrTekst(p.numer_umowy, 80),
    data_umowy: ocrData(p.data_umowy),
    kwota_pozyczki,
    kwota_calkowita,
    prowizja,
    termin_splaty: ocrData(p.termin_splaty) ?? harmonogram?.[harmonogram.length - 1].termin ?? null,
    numer_kw: ocrTekst(p.numer_kw, 40),
    rachunek_splaty,
    kwota_hipoteki: dodatnia(ocrKwota(p.kwota_hipoteki)),
    akt_notarialny_777: ocrTekst(p.akt_notarialny_777, 300),
    kwota_777: dodatnia(ocrKwota(p.kwota_777)),
    oprocentowanie_roczne: stopa(p.oprocentowanie_roczne, true),
    odsetki_za_opoznienie: stopa(p.odsetki_za_opoznienie, false),
    oplaty_windykacyjne: parseContractFees(p.oplaty_windykacyjne),
    harmonogram,
    harmonogram_zrodlo,
    liczba_rat,
    kwota_raty,
    kwota_ostatniej_raty,
    data_pierwszej_raty,
    ostrzezenia,
    podsumowanie: ocrTekst(p.podsumowanie, 500) ?? "",
  };
}
