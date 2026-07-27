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
