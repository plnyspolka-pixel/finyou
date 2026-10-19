// Kontekst daty dla promptów i strażnik „starego roku” w tytułach.
//
// Przyczyna błędu z artykułami „… 2024”: żaden prompt silnika SEO nie
// podawał modelowi dzisiejszej daty, więc model brał rok ze swoich danych
// treningowych. Naprawa ma dwie warstwy:
//   1. `currentDateContextPl(now)` – wstrzykiwane do każdego promptu, który
//      pisze treść „aktualną” (blog, SEO, social, scenariusze),
//   2. `fixStaleYearInTitle()` – deterministyczna poprawka tytułów/meta,
//      gdyby model mimo to wpisał wcześniejszy rok jako bieżący.
// Czysty moduł – bez I/O.

const WEEKDAYS_PL = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];
const MONTHS_PL_GEN = [
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

/** Data w strefie Europe/Warsaw (rok, miesiąc 1–12, dzień, dzień tygodnia 0–6). */
export function warsawDateParts(now: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: wd < 0 ? 0 : wd,
  };
}

/** „19 października 2026 (poniedziałek)”. */
export function formatDatePl(now: Date): string {
  const p = warsawDateParts(now);
  return `${p.day} ${MONTHS_PL_GEN[p.month - 1]} ${p.year} (${WEEKDAYS_PL[p.weekday]})`;
}

/** Linia do promptu systemowego – bieżąca data i zakaz cofania roku. */
export function currentDateContextPl(now: Date = new Date()): string {
  const p = warsawDateParts(now);
  return (
    `DZISIEJSZA DATA: ${formatDatePl(now)}. Bieżący rok to ${p.year}. ` +
    `Jeśli tytuł, nagłówek lub treść odnosi się do „teraz”, „w tym roku” albo zawiera rok, ` +
    `używaj roku ${p.year}. Wcześniejsze lata podawaj wyłącznie jako fakty historyczne ze źródeł.`
  );
}

const YEAR_RE = /(?<!\d)(20\d{2})(?!\d)/g;

/**
 * Lata z ostatnich `lookback` lat (bez bieżącego) występujące w tekście.
 * Zwraca unikalne, rosnąco.
 */
export function findStaleYears(text: string, now: Date = new Date(), lookback = 6): number[] {
  const cur = warsawDateParts(now).year;
  const found = new Set<number>();
  for (const m of text.matchAll(YEAR_RE)) {
    const y = Number(m[1]);
    if (y < cur && y >= cur - lookback) found.add(y);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Tytuł/meta z dokładnie jednym rokiem, wcześniejszym niż bieżący → bieżący
 * rok. Tytuły z kilkoma latami (np. porównanie „2025 vs 2026”) oraz z rokiem
 * bieżącym zostają bez zmian – to świadome odniesienia historyczne.
 */
export function fixStaleYearInTitle(
  title: string,
  now: Date = new Date(),
): { text: string; changed: boolean; from?: number } {
  const cur = warsawDateParts(now).year;
  const years = [...title.matchAll(YEAR_RE)].map((m) => Number(m[1]));
  if (years.length !== 1) return { text: title, changed: false };
  const y = years[0];
  if (y >= cur || y < cur - 6) return { text: title, changed: false };
  return { text: title.replace(YEAR_RE, String(cur)), changed: true, from: y };
}
