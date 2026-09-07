// Walidacja numeru księgi wieczystej. Format: KOD SĄDU (4 znaki, np. WA1M)
// / numer (7-8 cyfr) / cyfra kontrolna. Plik bez importów — używany zarówno
// po stronie klienta (UI), jak i serwera (bot, promocja leada).

/** Pełne dopasowanie znormalizowanego numeru KW, np. "WL1A/00006862/7". */
export const KW_FULL_RE = /^[A-Z0-9]{2}\d[A-Z0-9]\/\d{7,8}\/\d$/;

/** Wyszukiwanie numeru KW wewnątrz dłuższego tekstu (separatory: / \ . - spacja). */
const KW_SEARCH_RE =
  /\b([A-ZŁŃŚŻŹĄĆĘÓ0-9]{2}\d[A-Z0-9])[\s\/\\.-]{0,3}(\d{7,8})[\s\/\\.-]{0,3}(\d)\b/;

/**
 * Normalizuje surowy zapis numeru KW do postaci "XXXX/NNNNNNNN/C".
 * Zwraca null, gdy tekst nie zawiera poprawnego numeru — np. gdy bot
 * zapisał status w rodzaju "przesłany" zamiast właściwego numeru.
 */
export function normalizeKwNumber(raw: unknown): string | null {
  const text = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!text) return null;
  if (KW_FULL_RE.test(text)) return text;
  const m = KW_SEARCH_RE.exec(text);
  if (!m) return null;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/** Czy tekst zawiera poprawny numer KW (choćby jako fragment)? */
export function containsValidKw(raw: unknown): boolean {
  return normalizeKwNumber(raw) !== null;
}

/**
 * Naprawia format wszystkich numerów KW wewnątrz dłuższego tekstu, zachowując
 * pozostałą treść (np. "Pow. użytkowa: 140 m²" po separatorze " | ").
 * Każde wystąpienie sprowadza do postaci "XXXX/NNNNNNNN/C" (kod sądu wielkimi
 * literami, numer dopełniony zerami do 8 cyfr). Tekst bez numerów KW wraca
 * bez zmian; pusta wartość → null.
 */
export function normalizeKwNumbersInText(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const all = new RegExp(KW_SEARCH_RE.source, "gi");
  return text.replace(all, (_full, court: string, num: string, check: string) => {
    return `${court.toUpperCase()}/${num.padStart(8, "0")}/${check}`;
  });
}

export interface KwValidationResult {
  ok: boolean;
  /** Kanoniczna forma "XXXX/NNNNNNNN/C" — tylko gdy ok. */
  normalized: string | null;
  error: string | null;
  hint: string | null;
}

/**
 * Całe wejście formularza musi być jednym numerem KW — dopuszczamy jedynie
 * spacje/kropki/myślniki zamiast ukośników i 7 cyfr (starsze księgi).
 * W przeciwieństwie do KW_SEARCH_RE jest zakotwiczone, więc nie „naprawi"
 * wejścia przez obcięcie nadmiarowych cyfr.
 */
const KW_INPUT_RE = /^([A-Z0-9]{2}\d[A-Z0-9])[\s/\\.-]{0,3}(\d{7,8})[\s/\\.-]{0,3}(\d)$/;

/**
 * Walidacja pola formularza z numerem KW. Toleruje drobne odstępstwa
 * (spacje/kropki/myślniki zamiast ukośników, 7 cyfr w starszych księgach,
 * małe litery) i zwraca formę kanoniczną; dla wartości nie do naprawienia
 * zwraca konkretny komunikat po polsku, co jest nie tak.
 */
export function validateKwInput(raw: unknown): KwValidationResult {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!value) {
    return {
      ok: false,
      normalized: null,
      error: "Wpisz numer księgi wieczystej.",
      hint: "Format: WA1M/00123456/7",
    };
  }

  const m = KW_INPUT_RE.exec(value);
  if (m) {
    return {
      ok: true,
      normalized: `${m[1]}/${m[2].padStart(8, "0")}/${m[3]}`,
      error: null,
      hint: null,
    };
  }

  // Diagnostyka — numer nie daje się naprawić automatycznie.
  const parts = value.split(/[\s/\\.-]+/).filter(Boolean);
  if (parts.length !== 3) {
    return {
      ok: false,
      normalized: null,
      error: "Numer KW składa się z trzech części: kod sądu / numer księgi / cyfra kontrolna.",
      hint: "Przykład: WA1M/00123456/7",
    };
  }
  const [court, digits, control] = parts;
  if (court.length !== 4 || !/^[A-Z0-9]{2}\d[A-Z0-9]$/.test(court)) {
    return {
      ok: false,
      normalized: null,
      error: `Kod sądu „${court}” jest nieprawidłowy — musi mieć dokładnie 4 znaki (litery i cyfry, bez polskich znaków).`,
      hint: "np. WA1M, GD1G, KR2K",
    };
  }
  if (!/^\d{7,8}$/.test(digits)) {
    return {
      ok: false,
      normalized: null,
      error: `Numer księgi musi mieć 8 cyfr (wpisano: „${digits}”).`,
      hint: "Krótszy numer uzupełnij zerami z przodu, np. 00123456",
    };
  }
  if (!/^\d$/.test(control)) {
    return {
      ok: false,
      normalized: null,
      error: "Cyfra kontrolna musi być jedną cyfrą (0–9) — ostatni znak numeru z odpisu KW.",
      hint: "np. WA1M/00123456/7 — cyfra kontrolna to 7",
    };
  }
  return {
    ok: false,
    normalized: null,
    error: "Numer KW ma nieprawidłowy format.",
    hint: "Format: WA1M/00123456/7",
  };
}

/**
 * Kompaktowa forma numeru KW (13 znaków, bez ukośników), np. "WL1A000068627".
 * DOKŁADNIE w tej formie kw_documents.kw_number przechowuje numery (tak wymaga
 * CMD KW Engine) — każdy odczyt z tej tabeli musi używać tej funkcji.
 * Numery 7-cyfrowe (starsze księgi) dopełniamy zerem do 8 cyfr, jak EKW.
 */
export function compactKwNumber(raw: unknown): string | null {
  const norm = normalizeKwNumber(raw);
  if (!norm) return null;
  const [court, num, check] = norm.split("/");
  return `${court}${num.padStart(8, "0")}${check}`;
}

/**
 * Forma z ukośnikami do wyświetlania i zapisu w polach formularzy
 * (properties.land_register_number), np. "WL1A/00006862/7".
 * Przyjmuje dowolny zapis (także kompaktowy 13-znakowy z kw_documents).
 */
export function formatKwNumber(raw: unknown): string | null {
  const compact = compactKwNumber(raw);
  if (!compact) return null;
  return `${compact.slice(0, 4)}/${compact.slice(4, 12)}/${compact.slice(12)}`;
}
