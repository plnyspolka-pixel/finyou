// Maskowanie numeru KW — dane wrażliwe (spec §22).
//
// Numeru KW nie pokazujemy w logach, narzędziach analitycznych ani komunikatach
// błędów. Maskujemy środek numeru repertoryjnego: RA1R/00****56/7.

import type { ParsedKwNumber } from "./types";

/** Maskuje numer KW zachowując prefiks, początek/koniec repertorium i kontrolną. */
export function maskKwNumber(parsed: ParsedKwNumber): string {
  if (!parsed.prefix || !parsed.serialNumberPadded) {
    return "(zamaskowany numer KW)";
  }
  const s = parsed.serialNumberPadded; // 8 znaków
  const head = s.slice(0, 2);
  const tail = s.slice(-2);
  const masked = `${head}****${tail}`;
  const cd = Number.isFinite(parsed.checkDigit) ? parsed.checkDigit : "*";
  return `${parsed.prefix}/${masked}/${cd}`;
}

/** Maskuje surowy numer (do logów) — bez pełnego parsowania. */
export function maskKwRaw(raw: string): string {
  const m = /([A-Z0-9]{4})\/?(\d{6,8})\/?(\d)?/i.exec(String(raw ?? "").toUpperCase());
  if (!m) return "(zamaskowany numer KW)";
  const s = m[2];
  const head = s.slice(0, 2);
  const tail = s.slice(-2);
  return `${m[1]}/${head}****${tail}/${m[3] ?? "*"}`;
}
