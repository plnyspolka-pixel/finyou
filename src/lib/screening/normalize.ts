// Normalizacja nazw osób i podmiotów na potrzeby screeningu PEP / sankcji.
// Czysta logika (bez I/O) — używana przez importery (budowa kluczy indeksu)
// i silnik dopasowania (klucze podmiotu). Jedno źródło prawdy po obu stronach.
//
// Kroki: małe litery → usunięcie tytułów i interpunkcji → rozbicie nazwisk
// dwuczłonowych → transliteracja (polskie znaki i inne diakrytyki do ASCII,
// cyrylica w trzech wariantach: polskim, angielskim i ISO 9) → klucze.

/** Tytuły, zwroty grzecznościowe i stopnie usuwane z nazw. */
const TITLES = new Set([
  "dr", "dra", "hab", "inz", "prof", "mgr", "lek", "med", "pan", "pani", "panna", "ks", "ksiadz",
  "mr", "mrs", "ms", "miss", "sir", "dame", "lord", "lady", "dott", "ing", "phd", "md", "msc", "bsc",
  "jr", "sr", "jun", "sen", "gen", "plk", "pplk", "mjr", "kpt", "adm", "col", "maj", "capt", "hon",
  "sheikh", "shaikh", "haji", "hajji", "mullah", "imam", "esq", "herr", "frau", "monsieur", "madame",
  "senor", "senora", "gospodin", "gospozha",
]);

/** Formy prawne pomijane przy porównaniu nazw podmiotów. */
const LEGAL_FORMS = new Set([
  "sp", "z", "o", "oo", "spolka", "zoo", "sa", "sk", "ska", "spk", "spj", "sc",
  "llc", "ltd", "limited", "inc", "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "kg",
  "ooo", "oao", "zao", "pao", "ao", "jsc", "pjsc", "cjsc", "ojsc", "tov", "pat", "llp", "lp", "bv", "nv",
  "srl", "sarl", "spa", "fze", "fzco", "fzc", "the",
]);

const LATIN_SPECIAL: Record<string, string> = {
  ł: "l", Ł: "L", ß: "ss", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ø: "o", Ø: "o", đ: "d", Đ: "d",
  ð: "d", þ: "th", ı: "i", ħ: "h", ŧ: "t", ĸ: "k", ŋ: "n", ʹ: "", ʺ: "", "'": "", "’": "", "`": "",
};

/** Usuwa diakrytyki (ą→a, ł→l, é→e, ž→z, ŝ→s…) i zwraca ASCII + spacje. */
export function asciiFold(input: string): string {
  let s = "";
  for (const ch of input) s += LATIN_SPECIAL[ch] ?? ch;
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// --- Cyrylica -------------------------------------------------------------

type CyrMap = Record<string, string>;

const CYR_COMMON: CyrMap = {
  а: "a", б: "b", д: "d", з: "z", к: "k", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", ъ: "", ь: "",
};

/** Transliteracja polska (zwyczajowa, PN/ISO-R 9 w wersji polskiej). */
const CYR_PL: CyrMap = {
  ...CYR_COMMON, в: "w", г: "g", е: "e", ё: "io", ж: "ż", и: "i", й: "j", л: "l", х: "ch",
  ц: "c", ч: "cz", ш: "sz", щ: "szcz", ы: "y", э: "e", ю: "iu", я: "ia",
  і: "i", ї: "ji", є: "je", ґ: "g", ў: "u",
};

/** Transliteracja angielska (BGN/PCGS w uproszczeniu). */
const CYR_EN: CyrMap = {
  ...CYR_COMMON, в: "v", г: "g", е: "e", ё: "yo", ж: "zh", и: "i", й: "y", л: "l", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ы: "y", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "yi", є: "ye", ґ: "g", ў: "w",
};

/** ISO 9:1995 (po złożeniu do ASCII: ž→z, č→c, š→s, ŝ→s, û→u, â→a, ë→e). */
const CYR_ISO9: CyrMap = {
  ...CYR_COMMON, в: "v", г: "g", е: "e", ё: "ë", ж: "ž", и: "i", й: "j", л: "l", х: "h",
  ц: "c", ч: "č", ш: "š", щ: "ŝ", ы: "y", э: "è", ю: "û", я: "â",
  і: "ì", ї: "ï", є: "ê", ґ: "g̀", ў: "ŭ",
};

/** Ukraińskie „г” to h; w wariancie EN/PL dodajemy oba warianty przez osobny klucz. */
const CYR_UK_OVERRIDES: CyrMap = { г: "h" };

const CYRILLIC_RE = /[Ѐ-ӿ]/;

export function hasCyrillic(s: string): boolean {
  return CYRILLIC_RE.test(s);
}

function translitWith(input: string, map: CyrMap): string {
  let out = "";
  for (const ch of input.toLowerCase()) out += map[ch] ?? ch;
  return out;
}

export type TranslitScheme = "pl" | "en" | "iso9" | "uk";

/** Warianty transliteracji nazwy zapisanej cyrylicą (polska, angielska, ISO 9, ukr. „h”). */
export function cyrillicVariants(input: string): Record<TranslitScheme, string> {
  return {
    pl: translitWith(input, CYR_PL),
    en: translitWith(input, CYR_EN),
    iso9: translitWith(input, CYR_ISO9),
    uk: translitWith(input, { ...CYR_EN, ...CYR_UK_OVERRIDES }),
  };
}

// --- Tokeny ------------------------------------------------------------------

/**
 * Tokeny znormalizowanej nazwy: ASCII, małe litery, bez tytułów i interpunkcji,
 * nazwiska dwuczłonowe rozbite na człony („Nowak-Jeziorańska” → nowak, jezioranska).
 */
export function nameTokens(input: string, opts: { entity?: boolean } = {}): string[] {
  const folded = asciiFold(input.toLowerCase())
    .replace(/[-‐‑‒–—_/]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ");
  const out: string[] = [];
  for (const t of folded.split(/\s+/)) {
    if (!t) continue;
    if (TITLES.has(t)) continue;
    if (opts.entity && LEGAL_FORMS.has(t)) continue;
    out.push(t);
  }
  return out;
}

/** Pełna znormalizowana nazwa (tokeny w oryginalnej kolejności, spacje). */
export function normalizeName(input: string, opts: { entity?: boolean } = {}): string {
  return nameTokens(input, opts).join(" ");
}

/**
 * „Szkielet” fonetyczny tokenu — zbliża zapisy tej samej wymowy w różnych
 * konwencjach (Łukaszenko / Lukashenko / Lukasenko, Szewczenko / Shevchenko).
 * Stosowany tylko jako drugi, lekko zdyskontowany sposób porównania.
 */
export function skeleton(token: string): string {
  return token
    .replace(/szcz|shch|sch/g, "s")
    .replace(/sz|sh|zh|rz|zs/g, "s")
    .replace(/tsch|tch|cz|ch|kh|ts|tz|c/g, "k")
    .replace(/ph/g, "f")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/[yj]/g, "i")
    .replace(/ck|q/g, "k")
    .replace(/(.)\1+/g, "$1")
    .replace(/h/g, "")
    .replace(/s/g, "z");
}

export interface NameVariant {
  /** Znormalizowana pełna nazwa (ASCII). */
  key: string;
  /** Tokeny wariantu. */
  tokens: string[];
  /** Skąd wariant pochodzi (oryginał, transliteracja, alias). */
  origin: string;
}

/**
 * Wszystkie warianty nazwy do indeksu i porównania: zapis oryginalny
 * (po złożeniu do ASCII) oraz — dla cyrylicy — transliteracje PL/EN/ISO 9/UK.
 * Duplikaty są usuwane.
 */
export function nameVariants(input: string, opts: { entity?: boolean; origin?: string } = {}): NameVariant[] {
  const origin = opts.origin ?? "name";
  const raw: Array<[string, string]> = [];
  if (hasCyrillic(input)) {
    const v = cyrillicVariants(input);
    raw.push([v.pl, `${origin}:translit_pl`], [v.en, `${origin}:translit_en`],
      [v.iso9, `${origin}:translit_iso9`], [v.uk, `${origin}:translit_uk`]);
  } else {
    raw.push([input, origin]);
  }
  const seen = new Set<string>();
  const out: NameVariant[] = [];
  for (const [text, o] of raw) {
    const tokens = nameTokens(text, opts);
    if (tokens.length === 0) continue;
    const key = tokens.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, tokens, origin: o });
  }
  return out;
}

/**
 * Klucze indeksu trigramowego dla nazwy: pełne imię i nazwisko w obu
 * kolejnościach oraz „nazwisko + inicjał”. `surnames` — znane człony nazwiska.
 */
export function indexKeys(
  fullName: string,
  opts: { entity?: boolean; surname?: string | null; aliases?: string[] } = {},
): { nameKey: string; surnameKey: string | null }[] {
  const out = new Map<string, string | null>();
  const sources = [fullName, ...(opts.aliases ?? [])];
  const surnameVariants = opts.surname ? nameVariants(opts.surname, opts) : [];
  for (const src of sources) {
    for (const v of nameVariants(src, opts)) {
      const surnameKey = guessSurnameKey(v.tokens, surnameVariants, opts.entity);
      out.set(v.key, surnameKey);
      if (!opts.entity && v.tokens.length >= 2) {
        const rev = [...v.tokens.slice(1), v.tokens[0]].join(" ");
        if (!out.has(rev)) out.set(rev, surnameKey);
        // nazwisko + inicjał imienia (np. „kowalski j”)
        if (surnameKey) {
          const initial = v.tokens.find((t) => !surnameKey.split(" ").includes(t))?.[0];
          if (initial) {
            const k = `${surnameKey} ${initial}`;
            if (!out.has(k)) out.set(k, surnameKey);
          }
        }
      }
    }
  }
  return [...out.entries()].map(([nameKey, surnameKey]) => ({ nameKey, surnameKey }));
}

function guessSurnameKey(tokens: string[], surnameVariants: NameVariant[], entity?: boolean): string | null {
  if (entity) return null;
  for (const sv of surnameVariants) {
    if (sv.tokens.every((t) => tokens.includes(t))) return sv.key;
  }
  if (surnameVariants.length > 0) return surnameVariants[0].key;
  // Bez znanego nazwiska: ostatni token (konwencja „Imię Nazwisko”).
  return tokens.length >= 2 ? tokens[tokens.length - 1] : null;
}

// --- Daty i kraje -------------------------------------------------------------

export interface PartialDate {
  /** Pełna data YYYY-MM-DD, gdy znana. */
  date: string | null;
  year: number | null;
}

/** Parsuje datę w formatach spotykanych w źródłach: ISO, DD.MM.YYYY, sam rok, ISO z czasem. */
export function parsePartialDate(raw: unknown): PartialDate {
  if (raw == null) return { date: null, year: null };
  const s = String(raw).trim();
  if (!s) return { date: null, year: null };
  let m = s.match(/^[+]?(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    // Wikidata koduje precyzję „rok” jako YYYY-01-01 (precyzja przekazywana osobno).
    return { date: `${y}-${mo}-${d}`, year: Number(y) };
  }
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return { date: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, year: Number(y) };
  }
  m = s.match(/^(\d{4})$/);
  if (m) return { date: null, year: Number(m[1]) };
  m = s.match(/(\d{4})/);
  return { date: null, year: m ? Number(m[1]) : null };
}

const POLISH_MONTHS: Record<string, string> = {
  stycznia: "01", lutego: "02", marca: "03", kwietnia: "04", maja: "05", czerwca: "06",
  lipca: "07", sierpnia: "08", wrzesnia: "09", pazdziernika: "10", listopada: "11", grudnia: "12",
};

/** „urodzony 5 października 1973 r.” → 1973-10-05 (lista MSWiA). */
export function parsePolishTextDate(text: string): PartialDate {
  const f = asciiFold(text.toLowerCase());
  const m = f.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && POLISH_MONTHS[m[2]]) {
    return { date: `${m[3]}-${POLISH_MONTHS[m[2]]}-${m[1].padStart(2, "0")}`, year: Number(m[3]) };
  }
  const y = f.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return { date: null, year: y ? Number(y[1]) : null };
}

/** Kody krajów: ISO alpha-2 wielkimi literami; nazwy popularnych krajów mapowane. */
const COUNTRY_NAMES: Record<string, string> = {
  polska: "PL", poland: "PL", polish: "PL", rosja: "RU", russia: "RU", "russian federation": "RU",
  russian: "RU", bialorus: "BY", belarus: "BY", belarusian: "BY", ukraina: "UA", ukraine: "UA",
  ukrainian: "UA", niemcy: "DE", germany: "DE", german: "DE", iran: "IR", "iran (islamic republic of)": "IR",
  syria: "SY", "syrian arab republic": "SY", "korea, democratic people's republic of": "KP",
  "democratic people's republic of korea": "KP", "north korea": "KP", china: "CN", chiny: "CN",
  "united states": "US", usa: "US", "united kingdom": "GB", "wielka brytania": "GB", kazakhstan: "KZ",
  litwa: "LT", lithuania: "LT", lotwa: "LV", latvia: "LV", estonia: "EE", czechy: "CZ", "czech republic": "CZ",
  slowacja: "SK", slovakia: "SK", afghanistan: "AF", iraq: "IQ", libya: "LY", sudan: "SD", yemen: "YE",
  venezuela: "VE", cuba: "CU", myanmar: "MM", somalia: "SO", mali: "ML", lebanon: "LB",
};

export function normalizeCountry(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const k = asciiFold(s.toLowerCase()).replace(/\s+/g, " ");
  return COUNTRY_NAMES[k] ?? null;
}
