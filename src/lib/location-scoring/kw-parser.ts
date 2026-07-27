// Parser + walidator numeru księgi wieczystej (EKW).
//
// Format elektronicznej KW:  PREFIKS(4) / NUMER-REPERTORYJNY(8) / CYFRA-KONTROLNA(1)
//   PREFIKS  — kod wydziału sądu, 4 znaki: 2 litery, cyfra, znak (litera/cyfra),
//              np. RA1R, WA1M, KR1P.
//   NUMER    — ośmiocyfrowy numer repertoryjny (paddowany zerami).
//   KONTROLNA— cyfra kontrolna wyliczana z 13 znaków (prefiks + 8 cyfr).
//
// Cyfra kontrolna liczona algorytmem stosowanym w numeracji elektronicznych KW:
//   * każdemu znakowi przypisujemy wartość (poniżej),
//   * mnożymy przez wagę z cyklu [1, 3, 7],
//   * sumujemy i bierzemy modulo 10.
// Mapowanie znaków (oficjalny algorytm EKW): cyfry 0–9 → 0–9, X → 10, pozostałe
// litery cyklicznie 1–9 z pominięciem Q, V, X (te nie występują w kodach sądów).
//
// Moduł czysty — bez importów, używalny po stronie klienta i serwera.

import type { ParsedKwNumber } from "./types";

const KW_FULL_RE = /^([A-Z]{2}\d[A-Z0-9])\/(\d{7,8})\/(\d)$/;
const KW_LOOSE_RE = /([A-Z]{2}\d[A-Z0-9])[\s/\\.-]{0,3}(\d{7,8})[\s/\\.-]{0,3}(\d)/;

// Wartości znaków dla cyfry kontrolnej. X=10; litery cyklicznie 1..9,
// pomijając Q, V (oraz X — obsługiwany osobno). Q/V nie występują w prefiksach.
const CHAR_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let d = 0; d <= 9; d++) map[String(d)] = d;
  map["X"] = 10;
  const cycleLetters = "ABCDEFGHIJKLMNOPRSTUWYZ"; // bez Q, V, X
  let counter = 1;
  for (const ch of cycleLetters) {
    map[ch] = counter;
    counter = counter === 9 ? 1 : counter + 1;
  }
  return map;
})();

const WEIGHTS = [1, 3, 7];

/** Znormalizowana surowa postać numeru KW (uppercase, bez spacji). */
export function normalizeKwRaw(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Wylicza cyfrę kontrolną dla prefiksu + ośmiocyfrowego numeru repertoryjnego.
 * Zwraca liczbę 0–9. Algorytm scentralizowany w jednym miejscu (spec §22).
 */
export function computeKwCheckDigit(prefix: string, serialPadded: string): number {
  const chars = `${prefix}${serialPadded}`.split("");
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    const value = CHAR_VALUES[chars[i]];
    if (value === undefined) return -1; // znak spoza dozwolonego zbioru
    sum += value * WEIGHTS[i % WEIGHTS.length];
  }
  return sum % 10;
}

/**
 * Parsuje i waliduje numer KW. Nigdy nie rzuca — zwraca strukturę z flagami
 * `formatValid` / `checkDigitValid` / `isValid`. Numer repertoryjny NIE koduje
 * oficjalnie lokalizacji (spec §3).
 */
export function parseKwNumber(raw: unknown): ParsedKwNumber {
  const rawStr = String(raw ?? "");
  const cleaned = normalizeKwRaw(raw);

  const empty: ParsedKwNumber = {
    raw: rawStr,
    normalized: cleaned,
    prefix: "",
    serialNumber: NaN,
    serialNumberPadded: "",
    checkDigit: NaN,
    formatValid: false,
    checkDigitValid: false,
    isValid: false,
  };

  const m = KW_FULL_RE.exec(cleaned) ?? KW_LOOSE_RE.exec(cleaned);
  if (!m) return empty;

  const prefix = m[1];
  const serialNumber = Number(m[2]);
  const serialNumberPadded = String(serialNumber).padStart(8, "0");
  const checkDigit = Number(m[3]);

  // Numer repertoryjny musi zmieścić się w 8 cyfrach.
  const formatValid = serialNumberPadded.length === 8 && checkDigit >= 0 && checkDigit <= 9;
  if (!formatValid) {
    return { ...empty, prefix, serialNumber, serialNumberPadded, checkDigit, formatValid: false };
  }

  const expected = computeKwCheckDigit(prefix, serialNumberPadded);
  const checkDigitValid = expected >= 0 && expected === checkDigit;

  return {
    raw: rawStr,
    normalized: `${prefix}/${serialNumberPadded}/${checkDigit}`,
    prefix,
    serialNumber,
    serialNumberPadded,
    checkDigit,
    formatValid: true,
    checkDigitValid,
    isValid: formatValid && checkDigitValid,
  };
}

/** Skrócony wynik parsowania — wygodny dla przykładu ze specyfikacji. */
export function describeKw(raw: unknown): {
  prefix: string;
  serialNumber: number;
  serialNumberPadded: string;
  checkDigit: number;
  isValid: boolean;
} {
  const p = parseKwNumber(raw);
  return {
    prefix: p.prefix,
    serialNumber: p.serialNumber,
    serialNumberPadded: p.serialNumberPadded,
    checkDigit: p.checkDigit,
    isValid: p.isValid,
  };
}
