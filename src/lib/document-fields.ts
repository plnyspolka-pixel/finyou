// ════════════════════════════════════════════════════════════════════
// Silnik pól wzorów DOCX — czyste funkcje (bez zależności serwerowych).
//
// Wzory z pakietu B2B używają placeholderów w nawiasach kwadratowych `[KLUCZ]`,
// które:
//  • powtarzają się wielokrotnie dla różnych stron i pozycji (np. `[KWOTA]` 5×,
//    `[ADRES]` 2× — raz dla pożyczkobiorcy, raz dla pożyczkodawcy),
//  • bywają rozbite przez tagi XML wewnątrz jednego słowa,
//  • czasem zawierają instrukcje/opcje, a nie realne pole (np. `[☐ ... / ☐ ...]`).
//
// Dlatego pracujemy POZYCYJNIE: każde wystąpienie `[...]` to osobne pole z własnym
// indeksem. Klient buduje formularz z `extractOrderedFields(text)`, a serwer
// podstawia wartości po tym samym indeksie wystąpienia (`replaceByOccurrence`).
// Kolejność tokenów w `xmlToPlainText(normalizePlaceholders(xml))` jest identyczna
// jak w `normalizePlaceholders(xml)`, więc indeksy są spójne między podglądem
// a generowaniem — bez zmiany treści dokumentu.
// ════════════════════════════════════════════════════════════════════

import { amountToWordsPLN } from "@/lib/amount-to-words-pl";

// ─────────────────────────────────────────────────────────────────────
// Normalizacja XML / tekst
// ─────────────────────────────────────────────────────────────────────

/**
 * Skleja placeholdery `[KLUCZ]` rozbite przez tagi XML w jeden ciągły token.
 * Działa niezależnie od listy znanych kluczy: dopasowuje `[` … `]`, gdzie środek
 * to dowolny mix tagów i znaków innych niż nawiasy kwadratowe (non-greedy, więc
 * nie przeskakuje przez zagnieżdżone `[`), po czym usuwa tagi ze środka.
 */
export function normalizePlaceholders(xml: string): string {
  return xml.replace(/\[(?:<[^>]+>|[^[\]])*?\]/g, (m) => m.replace(/<[^>]+>/g, ""));
}

/** Zamiana XML Worda na czytelny tekst z zachowaniem struktury akapitów/tabel. */
export function xmlToPlainText(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Token placeholdera: `[` + dowolne znaki poza `[]` / nową linią / tabem + `]`. */
const TOKEN_RE = /\[([^[\]\n\t]{1,160})\]/g;

function escapeXml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Podstawia wartości pod N-te wystąpienie placeholdera (indeks globalny w
 * kolejności dokumentu). Puste wartości NIE są podstawiane — token `[KLUCZ]`
 * zostaje nietknięty, dzięki czemu nie usuwamy treści/opcji z dokumentu.
 *
 * `values` to mapa: indeks wystąpienia (jako string) → wartość.
 */
export function replaceByOccurrence(normalizedXml: string, values: Record<string, string>): string {
  let i = -1;
  return normalizedXml.replace(TOKEN_RE, (whole) => {
    i += 1;
    const raw = values[String(i)];
    if (raw == null) return whole;
    const val = String(raw).trim();
    if (!val) return whole;
    // płaszczymy ewentualne nowe linie, by nie psuć struktury <w:t>
    return escapeXml(val.replace(/\s*\n\s*/g, ", "));
  });
}

// ─────────────────────────────────────────────────────────────────────
// Typy pól
// ─────────────────────────────────────────────────────────────────────

export type FieldSemantic =
  | "name"
  | "address"
  | "idLine"
  | "nip"
  | "regon"
  | "krs"
  | "pesel"
  | "bank"
  | "phone"
  | "email"
  | "legalForm"
  | "representative"
  | "amount"
  | "amountWords"
  | "date"
  | "months"
  | "interest"
  | "kw"
  | "number"
  | "choice"
  | "instruction"
  | "text";

export type FieldInput = "text" | "textarea" | "amount" | "date" | "number" | "choice";

/** Rodzaj grupy — decyduje m.in. o tym, czy pokazać autouzupełnianie z GUS/KRS. */
export type PartyKind = "company" | "person-or-company" | "recipient" | "place" | "terms" | "other";

export interface DocField {
  /** Indeks globalny wystąpienia (string) — klucz wartości w formularzu i przy generowaniu. */
  id: string;
  occ: number;
  /** Surowa treść placeholdera (bez nawiasów). */
  key: string;
  /** Czytelna etykieta pola (z kontekstu + klucza). */
  label: string;
  /** Krótki fragment tekstu poprzedzający placeholder. */
  context: string;
  semantic: FieldSemantic;
  input: FieldInput;
  options?: string[];
  /** Klucz grupy (np. "pozyczkodawca", "kwoty", "miejsce-data"). */
  groupKey: string;
  /** Nazwa grupy do wyświetlenia. */
  groupLabel: string;
  partyKind: PartyKind;
  /** Czy pole może być uzupełnione z danych firmowych (GUS/KRS/bank). */
  autofill: boolean;
}

export interface FieldGroup {
  key: string;
  label: string;
  partyKind: PartyKind;
  fields: DocField[];
  /** Kolejność pierwszego pola — do sortowania grup wg dokumentu. */
  order: number;
}

// ─────────────────────────────────────────────────────────────────────
// Wykrywanie strony (party) i grupy
// ─────────────────────────────────────────────────────────────────────

interface PartyDef {
  /** kanoniczny klucz grupy */
  key: string;
  /** etykieta do UI */
  label: string;
  /** rdzenie do dopasowania (lowercase — JS poprawnie obsługuje polskie znaki) */
  stems: string[];
  kind: PartyKind;
  /**
   * Czy strona może być wykrywana z TEKSTU (nagłówki sekcji, etykiety, „zwanym
   * dalej…"). Odbiorcy (sąd/komornik/notariusz) — false, bo ich nazwy bywają
   * częścią zwykłej prozy ("postępowania sądowego") i dawały fałszywe trafienia;
   * wykrywamy ich wyłącznie z treści KLUCZA placeholdera.
   */
  prose: boolean;
}

// Kolejność ma znaczenie: bardziej szczegółowe najpierw.
const PARTIES: PartyDef[] = [
  {
    key: "pozyczkodawca",
    label: "Pożyczkodawca / Wierzyciel",
    stems: ["pożyczkodawc", "pozyczkodawc", "wierzyciel"],
    kind: "company",
    prose: true,
  },
  {
    key: "pozyczkobiorca",
    label: "Pożyczkobiorca / Dłużnik",
    stems: ["pożyczkobiorc", "pozyczkobiorc", "dłużnik", "dluznik", "wnioskodawc"],
    kind: "person-or-company",
    prose: true,
  },
  {
    key: "poreczyciel",
    label: "Poręczyciel",
    stems: ["poręczyciel", "poreczyciel"],
    kind: "person-or-company",
    prose: true,
  },
  {
    key: "cedent",
    label: "Cedent (zbywca wierzytelności)",
    stems: ["cedent"],
    kind: "company",
    prose: true,
  },
  {
    key: "cesjonariusz",
    label: "Cesjonariusz (nabywca wierzytelności)",
    stems: ["cesjonariusz"],
    kind: "person-or-company",
    prose: true,
  },
  {
    key: "administrator",
    label: "Administrator danych",
    stems: ["administrator"],
    kind: "company",
    prose: true,
  },
  {
    key: "posrednik",
    label: "Pośrednik",
    stems: ["pośrednik", "posrednik"],
    kind: "company",
    prose: true,
  },
  { key: "komornik", label: "Komornik", stems: ["komornik"], kind: "recipient", prose: false },
  {
    key: "notariusz",
    label: "Notariusz / Kancelaria",
    stems: ["notariusz", "kancelari"],
    kind: "recipient",
    prose: false,
  },
];

/** Pierwsza strona wykryta w treści KLUCZA (dowolna, łącznie z odbiorcami). */
function findPartyInKey(keyLower: string): PartyDef | null {
  for (const p of PARTIES) {
    if (p.stems.some((s) => keyLower.includes(s))) return p;
  }
  return null;
}

/** Pierwsza strona „prozą" (nagłówek/etykieta) w danym fragmencie. */
function firstProseParty(text: string): PartyDef | null {
  const t = text.toLowerCase();
  let best: { p: PartyDef; idx: number } | null = null;
  for (const p of PARTIES) {
    if (!p.prose) continue;
    for (const s of p.stems) {
      const idx = t.indexOf(s);
      if (idx >= 0 && (!best || idx < best.idx)) best = { p, idx };
    }
  }
  return best?.p ?? null;
}

/** Ostatnia strona „prozą" w danym fragmencie (do śledzenia bieżącej sekcji). */
function lastProseParty(text: string): PartyDef | null {
  const t = text.toLowerCase();
  let best: { p: PartyDef; idx: number } | null = null;
  for (const p of PARTIES) {
    if (!p.prose) continue;
    for (const s of p.stems) {
      const idx = t.lastIndexOf(s);
      if (idx >= 0 && (!best || idx > best.idx)) best = { p, idx };
    }
  }
  return best?.p ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Klasyfikacja pojedynczego klucza
// ─────────────────────────────────────────────────────────────────────

const ID_WORDS = [
  "nazwa",
  "firma",
  "imię",
  "imie",
  "nazwisko",
  "krs",
  "nip",
  "regon",
  "pesel",
  "ceidg",
  "pełnomocnik",
  "pelnomocnik",
  "dłużnik",
  "dluznik",
];

function looksLikeIdentifier(keyLower: string): boolean {
  return ID_WORDS.some((w) => keyLower.includes(w));
}

interface KeyClass {
  semantic: FieldSemantic;
  input: FieldInput;
  options?: string[];
}

/** Klasyfikuje surowy klucz placeholdera na typ semantyczny + typ pola. */
export function classifyKey(rawKey: string): KeyClass {
  const key = rawKey.trim();
  const k = key.toLowerCase();

  // 1) Instrukcje / notatki autorskie / puste — nie traktujemy jak zwykłe pole.
  if (
    key === "" ||
    /^[.…/\s]+$/.test(key) || // "...", ".../ROK" itp.
    k === "nawiasach" ||
    k.startsWith("np.") ||
    k.startsWith("opcjonalnie") ||
    k.startsWith("ewentualnie") ||
    k.startsWith("strony ustaliły") ||
    k.startsWith("strony nie")
  ) {
    return { semantic: "instruction", input: "text" };
  }

  // 2) Pola wyboru z checkboxami `☐`.
  if (key.includes("☐")) {
    const opts = key
      .split("/")
      .map((s) => s.replace(/☐/g, "").trim())
      .filter(Boolean);
    return { semantic: "choice", input: "choice", options: opts.length >= 2 ? opts : undefined };
  }

  // 3) Wybór prostych wariantów: "Cywilny / Gospodarczy", "dni / miesięcy", "% LUB ZŁ".
  if (
    !looksLikeIdentifier(k) &&
    /\s\/\s|\slub\s/i.test(key) &&
    key.length <= 40 &&
    !/adres|rachun/.test(k)
  ) {
    const opts = key
      .split(/\s\/\s|\slub\s/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (opts.length >= 2 && opts.every((o) => o.length <= 18)) {
      return { semantic: "choice", input: "choice", options: opts };
    }
  }

  // 4) Kwoty słownie.
  if (/słownie|slownie/.test(k)) return { semantic: "amountWords", input: "amount" };

  // 5) Kwoty cyframi / wartości pieniężne.
  if (
    /kwota|wysokość|wysokosc|cena|suma|wartość|wartosc|kapitał|kapital|prowizj|gotówk|gotowk|przelew/.test(
      k,
    )
  ) {
    return { semantic: "amount", input: "amount" };
  }

  // 6) Daty.
  if (/dd\.mm\.rrrr|^data|\sdata|termin|dnia/.test(k)) return { semantic: "date", input: "date" };

  // 7) Rachunek bankowy / bank.
  if (/rachun/.test(k)) return { semantic: "bank", input: "text" };
  if (/nazwa banku|^bank$/.test(k)) return { semantic: "text", input: "text" };

  // 8) Numer KW.
  if (/\bkw\b|księg|ksieg|wieczyst/.test(k)) return { semantic: "kw", input: "text" };

  // 9) Identyfikatory.
  if (/numer krs|^krs$/.test(k)) return { semantic: "krs", input: "text" };
  if (/numer nip|^nip$/.test(k)) return { semantic: "nip", input: "text" };
  if (/numer regon|^regon$/.test(k)) return { semantic: "regon", input: "text" };
  if (/^pesel$/.test(k)) return { semantic: "pesel", input: "text" };
  // złożone linie identyfikacyjne: "KRS / NIP / REGON", "PESEL / NIP", "CEIDG / NIP / REGON"
  if (/(krs|nip|regon|pesel|ceidg)/.test(k) && /\//.test(k))
    return { semantic: "idLine", input: "text" };

  // 10) Kontakt.
  if (/e-?mail/.test(k)) return { semantic: "email", input: "text" };
  if (/telefon|tel\./.test(k)) return { semantic: "phone", input: "text" };

  // 11) Forma prawna.
  if (/forma prawna/.test(k)) return { semantic: "legalForm", input: "text" };

  // 12) Oprocentowanie / odsetki.
  if (/oprocentowanie|odsetk|%/.test(k)) return { semantic: "interest", input: "text" };

  // 13) Liczba miesięcy / liczba.
  if (/liczba miesięcy|liczba miesiecy/.test(k)) return { semantic: "months", input: "number" };
  if (/^liczba$/.test(k)) return { semantic: "number", input: "number" };

  // 14) Reprezentant / osoba podpisująca.
  if (/funkcja|reprezent|pełnomocnik|pelnomocnik|zarząd|zarzad/.test(k))
    return { semantic: "representative", input: "text" };
  if (/imię i nazwisko|imie i nazwisko|imię nazwisko|imie nazwisko/.test(k)) {
    // może być nazwa firmy ALBO osoba — traktujemy jako name (autofill nazwą), ale to często osoba
    if (/firma/.test(k)) return { semantic: "name", input: "text" };
    return { semantic: "representative", input: "text" };
  }

  // 15) Nazwa / firma.
  if (/nazwa|firma/.test(k)) return { semantic: "name", input: "text" };

  // 16) Adres.
  if (/adres/.test(k)) {
    const long = /siedzib|kancelari/.test(k);
    return { semantic: "address", input: long ? "textarea" : "text" };
  }

  // 17) Dłuższe pola opisowe.
  if (
    /warunki|opis|stanowisko|uwagi|określenie|okreslenie|tytuł wykonawczy|tytul wykonawczy/.test(k)
  ) {
    return { semantic: "text", input: "textarea" };
  }

  // 18) Domyślnie tekst.
  return { semantic: "text", input: "text" };
}

// ─────────────────────────────────────────────────────────────────────
// Budowanie etykiety
// ─────────────────────────────────────────────────────────────────────

const PRETTY_LABELS: Record<string, string> = {
  MIEJSCOWOŚĆ: "Miejscowość",
  "DD.MM.RRRR": "Data",
  "DATA UMOWY": "Data umowy",
  "NR KW": "Numer księgi wieczystej (KW)",
  "KWOTA SŁOWNIE": "Kwota słownie",
};

function titleCasePl(s: string): string {
  const lower = s.toLocaleLowerCase("pl-PL");
  return lower.charAt(0).toLocaleUpperCase("pl-PL") + lower.slice(1);
}

function buildLabel(key: string, context: string, cls: KeyClass): string {
  if (PRETTY_LABELS[key]) return PRETTY_LABELS[key];

  // Z kontekstu wyłuskujemy krótki, sensowny opis (np. "Koszty windykacyjne", "rata za").
  const ctx = context
    .replace(/\s+/g, " ")
    .replace(/[•|–-]\s*$/, "")
    .trim();
  const tail =
    ctx
      .split(/[.;:]\s*/)
      .pop()
      ?.trim() ?? "";

  // Dla kwot/dat kontekst jest najważniejszy (rozróżnia powtarzające się pola).
  if (
    (cls.semantic === "amount" || cls.semantic === "date") &&
    tail &&
    tail.length >= 3 &&
    tail.length <= 60
  ) {
    return titleCasePl(tail);
  }

  // Czytelna wersja samego klucza.
  const niceKey = titleCasePl(key.replace(/\s*\/\s*/g, " / "));
  if (tail && tail.length >= 4 && tail.length <= 48 && !/^[\d\s]+$/.test(tail)) {
    return `${niceKey} — ${tail}`.slice(0, 80);
  }
  return niceKey;
}

// ─────────────────────────────────────────────────────────────────────
// Ekstrakcja uporządkowanych pól z tekstu wzoru
// ─────────────────────────────────────────────────────────────────────

// Semantyki traktowane jako „dane strony" (idą do grupy konkretnej strony).
const PARTY_FIELD_SEMANTICS: FieldSemantic[] = [
  "name",
  "address",
  "idLine",
  "nip",
  "regon",
  "krs",
  "pesel",
  "bank",
  "phone",
  "email",
  "legalForm",
  "representative",
];

const TERMS_GROUP = { key: "kwoty", label: "Kwoty, warunki i terminy", kind: "terms" as PartyKind };

/**
 * Buduje uporządkowaną listę pól z tekstu wzoru (po normalizacji).
 * Każde wystąpienie placeholdera = jedno pole z indeksem globalnym.
 *
 * Strategia wykrywania strony:
 *  • z treści KLUCZA (np. „…POŻYCZKODAWCY") — najpewniejsza,
 *  • z wzorca „…, zwanym dalej „X"" tuż po polu (umowa/cesja),
 *  • z bieżącej SEKCJI — ostatniej wzmianki o stronie w tekście poprzedzającym
 *    (nagłówki typu „DANE WNIOSKODAWCY", etykiety „Pożyczkobiorca:" itd.).
 * Pola niestronowe (kwoty, daty, liczby) NIE są przypisywane do stron.
 */
export function extractOrderedFields(text: string): DocField[] {
  const fields: DocField[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let occ = -1;
  let prevEnd = 0;
  let sectionParty: PartyDef | null = null;

  while ((m = TOKEN_RE.exec(text)) !== null) {
    occ += 1;
    const key = m[1].trim();
    const start = m.index;
    const end = start + m[0].length;

    // Aktualizujemy bieżącą sekcję z tekstu między poprzednim a tym polem
    // (łapie nagłówki sekcji oraz etykiety „Pożyczkobiorca:").
    const gap = text.slice(prevEnd, start);
    const gapParty = lastProseParty(gap);
    if (gapParty) sectionParty = gapParty;

    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const before = text.slice(Math.max(lineStart, start - 90), start);
    const after = text.slice(end, end + 100);

    const cls = classifyKey(key);
    const keyLower = key.toLowerCase();
    const isPartyField = PARTY_FIELD_SEMANTICS.includes(cls.semantic);

    // Strona pola: klucz → „zwanym dalej X" po polu → bieżąca sekcja.
    const partyFromKey = findPartyInKey(keyLower);
    let party: PartyDef | null = partyFromKey;
    if (!party && /zwan[ya]m?\s+dalej/i.test(after)) party = firstProseParty(after);
    if (partyFromKey?.prose) sectionParty = partyFromKey;
    if (!party && isPartyField) party = sectionParty;

    // Przypisanie do grupy.
    let groupKey = "inne";
    let groupLabel = "Pozostałe pola";
    let partyKind: PartyKind = "other";

    if (cls.semantic === "instruction" || cls.semantic === "choice") {
      groupKey = "instrukcje";
      groupLabel = "Opcje i pola do ręcznego wyboru";
      partyKind = "other";
    } else if (key === "MIEJSCOWOŚĆ" || key === "DD.MM.RRRR") {
      groupKey = "miejsce-data";
      groupLabel = "Miejsce i data";
      partyKind = "place";
    } else if (isPartyField && party) {
      groupKey = party.key;
      groupLabel = party.label;
      partyKind = party.kind;
    } else if (isPartyField) {
      groupKey = "strona";
      groupLabel = "Dane strony";
      partyKind = "person-or-company";
    } else if (
      cls.semantic === "amount" ||
      cls.semantic === "amountWords" ||
      cls.semantic === "interest" ||
      cls.semantic === "months" ||
      cls.semantic === "number" ||
      cls.semantic === "kw" ||
      cls.semantic === "date"
    ) {
      groupKey = TERMS_GROUP.key;
      groupLabel = TERMS_GROUP.label;
      partyKind = TERMS_GROUP.kind;
    }

    const autofill =
      (partyKind === "company" || partyKind === "person-or-company") &&
      [
        "name",
        "address",
        "idLine",
        "nip",
        "regon",
        "krs",
        "bank",
        "phone",
        "email",
        "legalForm",
        "representative",
      ].includes(cls.semantic);

    fields.push({
      id: String(occ),
      occ,
      key,
      label: buildLabel(key, before, cls),
      context: before.replace(/\s+/g, " ").trim().slice(-80),
      semantic: cls.semantic,
      input: cls.input,
      options: cls.options,
      groupKey,
      groupLabel,
      partyKind,
      autofill,
    });

    prevEnd = end;
  }
  TOKEN_RE.lastIndex = 0;
  return fields;
}

/** Grupuje pola zachowując kolejność występowania w dokumencie. */
export function groupFields(fields: DocField[]): FieldGroup[] {
  const map = new Map<string, FieldGroup>();
  fields.forEach((f, i) => {
    let g = map.get(f.groupKey);
    if (!g) {
      g = { key: f.groupKey, label: f.groupLabel, partyKind: f.partyKind, fields: [], order: i };
      map.set(f.groupKey, g);
    }
    g.fields.push(f);
  });
  // Kolejność: miejsce-data, strony (wg dokumentu), kwoty, inne, instrukcje na końcu.
  const weight = (k: string) =>
    k === "miejsce-data"
      ? 0
      : k === "kwoty"
        ? 50
        : k === "inne"
          ? 80
          : k === "instrukcje"
            ? 100
            : 10;
  return [...map.values()].sort((a, b) => weight(a.key) - weight(b.key) || a.order - b.order);
}

// ─────────────────────────────────────────────────────────────────────
// Mapowanie danych firmowych (GUS/KRS/bank) na pola
// ─────────────────────────────────────────────────────────────────────

export interface CompanyBundle {
  name?: string;
  nip?: string;
  regon?: string;
  krs?: string;
  legalForm?: string;
  addressFull?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  representativeName?: string;
  representativeRole?: string;
}

function composeIdLine(key: string, b: CompanyBundle): string {
  const k = key.toLowerCase();
  const parts: string[] = [];
  if (/krs/.test(k) && b.krs) parts.push(`KRS ${b.krs}`);
  if (/nip/.test(k) && b.nip) parts.push(`NIP ${b.nip}`);
  if ((/regon/.test(k) || /ceidg/.test(k)) && b.regon) parts.push(`REGON ${b.regon}`);
  // gdy nic nie pasuje, a jest NIP — podaj NIP (np. "PESEL / NIP" dla firmy)
  if (parts.length === 0 && b.nip) parts.push(`NIP ${b.nip}`);
  return parts.join(", ");
}

/** Zwraca wartość dla pola z danych firmowych albo null, jeśli nie ma czym uzupełnić. */
export function companyValueForField(field: DocField, b: CompanyBundle): string | null {
  switch (field.semantic) {
    case "name":
      return b.name || null;
    case "address":
      return b.addressFull || null;
    case "nip":
      return b.nip || null;
    case "regon":
      return b.regon || null;
    case "krs":
      return b.krs || null;
    case "legalForm":
      return b.legalForm || null;
    case "phone":
      return b.phone || null;
    case "email":
      return b.email || null;
    case "bank":
      return b.bankAccount || null;
    case "representative":
      return b.representativeName
        ? b.representativeRole
          ? `${b.representativeName} — ${b.representativeRole}`
          : b.representativeName
        : null;
    case "idLine": {
      const line = composeIdLine(field.key, b);
      return line || null;
    }
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mapowanie wyników kalkulatora na pola
// ─────────────────────────────────────────────────────────────────────

export interface CalculatorOutputs {
  /** kwota nominalna pożyczki (netto + prowizja kredytowana) */
  nominal: number;
  /** kwota netto dla klienta */
  net: number;
  /** prowizja */
  commission: number;
  /** suma zobowiązania klienta */
  total: number;
  annualInterestPercent: number;
  months: number;
  payoutDateDDMM: string;
}

const PL_NUM = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.round((n ?? 0) * 100) / 100,
  );

/** Dobiera odpowiednią kwotę dla pola na podstawie jego klucza (netto/brutto/prowizja/łączna). */
function amountForKey(key: string, c: CalculatorOutputs): number {
  const k = key.toLowerCase();
  if (/prowizj/.test(k)) return c.commission;
  if (/netto/.test(k)) return c.net;
  if (/brutto/.test(k)) return c.nominal;
  if (/łączn|laczn|razem|suma|całkow|calkow|zobowiąz|zobowiaz/.test(k)) return c.total;
  // domyślnie kwota nominalna pożyczki
  return c.nominal;
}

/**
 * Zwraca wartość dla pola na podstawie wyników kalkulatora — tylko dla pól
 * finansowych (kwoty, słownie, oprocentowanie, liczba miesięcy, data wypłaty).
 */
export function calculatorValueForField(field: DocField, c: CalculatorOutputs): string | null {
  switch (field.semantic) {
    case "amount":
      return PL_NUM(amountForKey(field.key, c));
    case "amountWords":
      return amountToWordsPLN(amountForKey(field.key, c));
    case "interest":
      return field.key.includes("%")
        ? `${PL_NUM(c.annualInterestPercent)}`
        : `${PL_NUM(c.annualInterestPercent)}%`;
    case "months":
      return String(c.months);
    default:
      return null;
  }
}
