// Czysty parser adresu nieruchomości z Działu I-O księgi wieczystej.
// Bez zależności od React/Supabase — bezpieczny do importu po stronie serwera
// (analiza ryzyka) i klienta (hook w kw-address.ts).
//
// Obsługiwane układy treści:
//  1) Tabela CMD z komórkami class="csDane"/"csBDane":
//     Położenie → "DOLNOŚLĄSKIE, OLEŚNICKI, BIERUTÓW, BIERUTÓW"
//     Ulica | Numer budynku | Numer lokalu → "ZIELONA" | "11" | "5"
//  2) Układ etykietowany EKW (bez dwukropków, wartości CAPS):
//     "Województwo DOLNOŚLĄSKIE Powiat OLEŚNICKI Gmina BIERUTÓW Miejscowość BIERUTÓW
//      Ulica ZIELONA Numer budynku 11 Numer lokalu 5"

export type KwAddress = {
  street?: string | null;
  buildingNumber?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  gmina?: string | null;
  powiat?: string | null;
  voivodeship?: string | null;
  fullAddress: string | null;
};

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Wyciąga treść komórek następujących po podanej etykiecie w danych tabeli KW. */
function cellsAfter(html: string, labelRegex: RegExp, count: number): string[] {
  const m = labelRegex.exec(html);
  if (!m) return [];
  const rest = html.slice(m.index);
  const cells: string[] = [];
  const re = /<td[^>]*class="cs(?:B?)Dane"[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) && cells.length < count) {
    cells.push(stripTags(match[1]));
  }
  return cells;
}

// Wartości w EKW pisane są wersalikami — sekwencja słów CAPS (z myślnikami).
const CAPS_WORD = "[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ-]+";
const CAPS_SEQ = `${CAPS_WORD}(?:[ -]${CAPS_WORD})*`;

function matchCaps(text: string, label: string): string | null {
  const m = text.match(new RegExp(`${label}\\s+(?:\\([^)]*\\)\\s*)?(${CAPS_SEQ})`));
  if (!m) return null;
  const v = m[1].trim();
  // "BRAK" / "BRAK WPISU" itp. to brak danych, nie wartość.
  if (/^BRAK\b/.test(v)) return null;
  return v;
}

function matchNumber(text: string, label: string): string | null {
  const m = text.match(new RegExp(`${label}\\s+(\\d+[A-Za-z]?(?:\\s*/\\s*\\d+[A-Za-z]?)?)`));
  return m ? m[1].replace(/\s+/g, "") : null;
}

/** Fallback: parsowanie po etykietach EKW z czystego tekstu (bez struktury tabeli). */
function parseFromText(text: string): Omit<KwAddress, "fullAddress"> {
  // Grunty: „Położenie (numer porządkowy / miejscowość) Lp. 1. 1 ANDRESPOL" —
  // brak etykiety „Miejscowość", nazwa stoi po liczbie porządkowej.
  const polozenieM = text.match(
    new RegExp(
      `[Pp]o[łl]o[żz]eni\\w*\\s*\\([^)]*miejscowo[śs][ćc][^)]*\\)\\s*(?:Lp\\.?\\s*\\d+\\.?\\s*)?(?:\\d+\\s+)?(${CAPS_SEQ})`,
    ),
  );
  // „Ulica FREDRY 53" — numer budynku bywa doklejony do wartości ulicy,
  // bez osobnej etykiety „Numer budynku".
  const streetWithNoM = text.match(
    new RegExp(`[Uu]lica\\s+(?:\\([^)]*\\)\\s*)?(${CAPS_SEQ})\\s+(\\d+[A-Za-z]?)\\b`),
  );
  return {
    voivodeship: matchCaps(text, "[Ww]ojew[óo]dztwo"),
    powiat: matchCaps(text, "[Pp]owiat"),
    gmina: matchCaps(text, "[Gg]mina"),
    city: matchCaps(text, "[Mm]iejscowo[śs][ćc]") ?? (polozenieM ? polozenieM[1] : null),
    street: matchCaps(text, "[Uu]lica"),
    buildingNumber:
      matchNumber(text, "[Nn]umer budynku") ?? (streetWithNoM ? streetWithNoM[2] : null),
    unitNumber: matchNumber(text, "[Nn]umer lokalu"),
  };
}

export function parseKwAddress(dzial1o: string | null | undefined): KwAddress {
  const empty: KwAddress = { fullAddress: null };
  if (!dzial1o) return empty;

  // 1) Układ tabelaryczny CMD: "Położenie" — komórki [Lp, Nr porz., "WOJ, POWIAT, GMINA, MIEJSC.", ...]
  const posCells = cellsAfter(dzial1o, /Położenie/i, 4);
  let voivodeship: string | null = null;
  let powiat: string | null = null;
  let gmina: string | null = null;
  let city: string | null = null;
  const locCell = posCells.find((c) => /,/.test(c) && !/^Lp\.?/i.test(c) && !/^\d+$/.test(c));
  if (locCell) {
    const parts = locCell
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    [voivodeship, powiat, gmina, city] = [
      parts[0] ?? null,
      parts[1] ?? null,
      parts[2] ?? null,
      parts[3] ?? null,
    ];
  }

  // "Numer lokalu" (ostatnia z trzech etykiet w wierszu) — kolejne 3 komórki to Ulica, Nr bud., Nr lok.
  const addrCells = cellsAfter(dzial1o, /Numer lokalu/i, 3);
  // Puste wartości EKW ("---", "BRAK") traktujemy jak brak danych.
  const cleanCell = (v: string | undefined): string | null =>
    v && !/^[-—\s]*$/.test(v) && !/^BRAK\b/i.test(v) ? v : null;
  let street: string | null = cleanCell(addrCells[0]);
  let buildingNumber: string | null = cleanCell(addrCells[1]);
  let unitNumber: string | null = cleanCell(addrCells[2]);

  // 2) Fallback etykietowy (układ EKW) — uzupełnia brakujące pola.
  const text = stripTags(dzial1o);
  const fb = parseFromText(text);
  voivodeship ||= fb.voivodeship ?? null;
  powiat ||= fb.powiat ?? null;
  gmina ||= fb.gmina ?? null;
  city ||= fb.city ?? null;
  street ||= fb.street ?? null;
  buildingNumber ||= fb.buildingNumber ?? null;
  unitNumber ||= fb.unitNumber ?? null;

  const streetPart = street
    ? `${toTitle(street)}${buildingNumber ? " " + buildingNumber : ""}${unitNumber ? "/" + unitNumber : ""}`
    : buildingNumber && city
      ? `${toTitle(city)} ${buildingNumber}${unitNumber ? "/" + unitNumber : ""}`
      : null;
  const cityPart = city ? toTitle(city) : null;
  const fullAddress = [streetPart, cityPart].filter(Boolean).join(", ") || null;

  return {
    street: street ? toTitle(street) : null,
    buildingNumber,
    unitNumber,
    city: cityPart,
    gmina: gmina ? toTitle(gmina) : null,
    powiat: powiat ? toTitle(powiat) : null,
    voivodeship: voivodeship ? toTitle(voivodeship) : null,
    fullAddress,
  };
}

export function toTitle(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}
