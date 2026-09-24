// Parser + walidator numeru księgi wieczystej (EKW).
//
// Format elektronicznej KW:  PREFIKS(4) / NUMER-REPERTORYJNY(8) / CYFRA-KONTROLNA(1)
//   PREFIKS  — kod wydziału sądu, 4 znaki: 2 litery, cyfra, znak (litera/cyfra),
//              np. RA1R, WA1M, KR1P.
//   NUMER    — ośmiocyfrowy numer repertoryjny (paddowany zerami).
//   KONTROLNA— cyfra kontrolna wyliczana z 13 znaków (prefiks + 8 cyfr).
//
// Cyfra kontrolna: jeden algorytm dla całej platformy — `kwCheckDigit` z
// `@/lib/kw` (wartości: cyfry 0–9, X = 10, litery bez Q i V kolejno od 11;
// wagi 1-3-7). Wcześniejsza lokalna mapa liter (cyklicznie 1–9) dawała błędny
// wynik dla rzeczywistych ksiąg.
//
// Moduł czysty — używalny po stronie klienta i serwera.

import type { ParsedKwNumber } from "./types";
import { kwCheckDigit } from "../kw";

// Numer repertoryjny 1–8 cyfr — krótszy zapis (bez zer wiodących, np.
// "KR1P/610770/2") jest dopełniany zerami, a nie odrzucany jako INVALID_KW.
const KW_FULL_RE = /^([A-Z]{2}\d[A-Z0-9])\/(\d{1,8})\/(\d)$/;
const KW_LOOSE_RE = /([A-Z]{2}\d[A-Z0-9])[\s/\\.-]{0,3}(\d{7,8})[\s/\\.-]{0,3}(\d)/;

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
  return kwCheckDigit(prefix, serialPadded) ?? -1; // -1: znak spoza dozwolonego zbioru
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
