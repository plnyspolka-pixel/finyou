// Daty w treściach generowanych przez AI — czysta logika (testy: dates.test.ts).
//
// Problem z bloga (wrzesień–październik 2026): model bez bieżącej daty w
// prompcie pisał „W co inwestować w 2024?” i sam wymyślał ramkę przeglądu
// tygodnia („13-19.05.2024”). Datę i ramkę liczymy deterministycznie i
// podajemy w prompcie, a tytuł z nieaktualnym rokiem zatrzymujemy.

const TZ = "Europe/Warsaw";

/** Data kalendarzowa w Warszawie: { y, m, d } (m: 1–12). */
export function warsawParts(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** „19.10.2026” */
export function formatPlDate(now: Date): string {
  const { y, m, d } = warsawParts(now);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** ISO „2026-10-19” w strefie Warszawy. */
export function warsawIsoDate(now: Date): string {
  const { y, m, d } = warsawParts(now);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Ramka „ostatnich 7 dni” do przeglądu tygodnia: od (dziś − 6 dni) do dziś,
 * np. „13.10–19.10.2026” albo „29.12.2026–04.01.2027” przy zmianie roku.
 */
export function lastSevenDaysLabel(now: Date): string {
  const end = warsawParts(now);
  const startDate = new Date(Date.UTC(end.y, end.m - 1, end.d) - 6 * 86_400_000);
  const s = {
    y: startDate.getUTCFullYear(),
    m: startDate.getUTCMonth() + 1,
    d: startDate.getUTCDate(),
  };
  const endLabel = `${pad(end.d)}.${pad(end.m)}.${end.y}`;
  const startLabel = s.y === end.y ? `${pad(s.d)}.${pad(s.m)}` : `${pad(s.d)}.${pad(s.m)}.${s.y}`;
  return `${startLabel}–${endLabel}`;
}

/** Lata wcześniejsze niż bieżący (2000+) wymienione w tekście — np. „2024” w tytule. */
export function findStaleYears(text: string, now: Date): number[] {
  const year = warsawParts(now).y;
  const found = new Set<number>();
  for (const m of (text ?? "").matchAll(/(?<!\d)(20\d{2})(?!\d)/g)) {
    const y = Number(m[1]);
    if (y < year) found.add(y);
  }
  return [...found].sort();
}

/** Czy wiadomość z RSS mieści się w oknie świeżości (z zapasem jednego dnia). */
export function isWithinDays(
  publishedAt: string | null | undefined,
  days: number,
  now: Date,
): boolean {
  if (!publishedAt) return true; // brak daty w RSS — nie odrzucamy, model dostaje „b.d.”
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t <= (days + 1) * 86_400_000 && t <= now.getTime() + 86_400_000;
}
