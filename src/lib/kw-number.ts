// JEDYNE źródło prawdy dla numerów ksiąg wieczystych (KW).
//
// Format kanoniczny (przechowywany w bazie i pokazywany w UI):
//   XXXX/DDDDDDDD/C   np. WA1M/00123456/7
//   - XXXX: 4-znakowy kod wydziału sądu (2 litery + cyfra + litera/cyfra),
//   - DDDDDDDD: 8 cyfr numeru księgi (z wiodącymi zerami),
//   - C: cyfra kontrolna.
//
// Moduł CZYSTY (bez zależności) — używany w formularzach (klient), na
// serwerze (normalizacja przy zapisie, pobieranie treści z CMD) i w OCR.
// Wcześniej w kodzie żyły TRZY rozjechane regexy i zero walidacji cyfry
// kontrolnej — stąd literówki w KW wychodziły dopiero przy płatnym
// zapytaniu do CMD/EKW.

/** Wartości znaków w algorytmie cyfry kontrolnej EKW (bez Q i V — nie
 *  występują w kodach wydziałów). */
const KW_CHAR_VALUES: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  X: 10, A: 11, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19,
  J: 20, K: 21, L: 22, M: 23, N: 24, O: 25, P: 26, R: 27, S: 28, T: 29,
  U: 30, W: 31, Y: 32, Z: 33,
};

/** Wagi cyklicznie 1,3,7 dla 12 znaków (kod wydziału + 8 cyfr). */
const KW_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];

/** Zwraca 13-znakową formę zwartą (bez ukośników) lub null gdy kształt zły. */
function toCompact(raw: string): string | null {
  const v = (raw || "").trim().toUpperCase().replace(/[\s]+/g, "").replace(/\//g, "");
  if (!/^[A-Z]{2}\d[A-Z0-9]\d{8}\d$/.test(v)) return null;
  return v;
}

/** Oblicza cyfrę kontrolną dla 12 znaków (kod wydziału + numer). Zwraca -1,
 *  gdy któryś znak nie występuje w tablicy wartości (np. Q/V). */
export function computeKwCheckDigit(courtAndNumber12: string): number {
  if (courtAndNumber12.length !== 12) return -1;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const val = KW_CHAR_VALUES[courtAndNumber12[i]];
    if (val === undefined) return -1;
    sum += val * KW_WEIGHTS[i];
  }
  return sum % 10;
}

/** Czy cyfra kontrolna numeru (dowolny zapis) się zgadza? */
export function kwChecksumValid(raw: string): boolean {
  const compact = toCompact(raw);
  if (!compact) return false;
  const expected = computeKwCheckDigit(compact.slice(0, 12));
  return expected >= 0 && expected === Number(compact[12]);
}

/**
 * Normalizuje numer KW do formatu kanonicznego `XXXX/DDDDDDDD/C`.
 * Akceptuje zapis z/bez ukośników, ze spacjami, małymi literami.
 * Zwraca null, gdy kształt jest niepoprawny (NIE sprawdza cyfry kontrolnej —
 * od tego jest `validateKwNumber`).
 */
export function normalizeKwNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = toCompact(raw);
  if (!compact) return null;
  return `${compact.slice(0, 4)}/${compact.slice(4, 12)}/${compact.slice(12)}`;
}

/** Forma zwarta (13 znaków) — używana wyłącznie w rozmowie z API CMD. */
export function kwToCompact(raw: string): string | null {
  return toCompact(raw);
}

export type KwValidation =
  | { ok: true; kw: string }
  | { ok: false; error: string };

/** Pełna walidacja z komunikatami PL (kształt + cyfra kontrolna). */
export function validateKwNumber(raw: string): KwValidation {
  const v = (raw || "").trim();
  if (!v) return { ok: false, error: "Podaj numer księgi wieczystej." };
  const compact = toCompact(v);
  if (!compact) {
    return {
      ok: false,
      error:
        "Nieprawidłowy format numeru KW. Poprawny to np. WA1M/00123456/7 " +
        "(4-znakowy kod sądu / 8 cyfr / cyfra kontrolna).",
    };
  }
  if (!kwChecksumValid(compact)) {
    return {
      ok: false,
      error:
        "Cyfra kontrolna się nie zgadza — sprawdź, czy numer KW został przepisany bez literówki.",
    };
  }
  return { ok: true, kw: normalizeKwNumber(compact)! };
}

/**
 * Wyciąga wszystkie numery KW z dowolnego tekstu (np. zanieczyszczonych
 * starych rekordów `"WA1M/00123456/7 | KR1P/00098765/4 | Pow. użytkowa: 55 m²"`,
 * treści maila, wyniku OCR). Zwraca znormalizowane, unikalne numery.
 */
export function extractKwNumbers(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.toUpperCase().match(/[A-Z]{2}\d[A-Z0-9]\/?\d{8}\/?\d/g) ?? [];
  const out: string[] = [];
  for (const f of found) {
    const norm = normalizeKwNumber(f);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}
