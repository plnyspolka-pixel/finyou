/**
 * Dzisiejsza data dla promptów AI. Bez niej modele „żyją” w roku swojego
 * treningu — autopilot bloga publikował tytuły z 2024 r. w październiku 2026.
 */
export function currentDateContext(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric" }).format(now),
  );
  return `DZISIAJ JEST ${date} (rok ${year}). Jeśli w tytule, treści lub slugu pada rok, to wyłącznie ${year} (albo ${year + 1} przy planach na przyszły rok) — nigdy wcześniejszy, chyba że chodzi o fakt historyczny podany w źródłach. Daty wydarzeń bierz tylko ze źródeł.`;
}
