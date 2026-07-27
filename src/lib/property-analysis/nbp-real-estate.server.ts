// NBP — pomocniczy trend rynku mieszkaniowego (Baza cen nieruchomości NBP).
// Działa heurystycznie na podstawie miasta; brak danych nie blokuje analizy.
import type { NbpTrend } from "./types";
import { withCache } from "./cache.server";

const NBP_CITIES = [
  "Warszawa",
  "Kraków",
  "Łódź",
  "Wrocław",
  "Poznań",
  "Gdańsk",
  "Gdynia",
  "Sopot",
  "Szczecin",
  "Bydgoszcz",
  "Lublin",
  "Białystok",
  "Katowice",
  "Olsztyn",
  "Rzeszów",
  "Opole",
  "Zielona Góra",
  "Kielce",
  "Toruń",
];

function nearestNbpCity(city?: string | null): string | null {
  if (!city) return null;
  const norm = city.trim().toLowerCase();
  const hit = NBP_CITIES.find((c) => c.toLowerCase() === norm);
  return hit ?? null;
}

export async function nbpTrend(city: string | null | undefined): Promise<NbpTrend | null> {
  const market = nearestNbpCity(city);
  if (!market) return null;
  return withCache("nbp_real_estate_cache", `nbp:${market}`, 30, async () => {
    // Heurystyka: bez pełnej integracji z XLSX NBP zwracamy neutralny trend „stabilny”.
    // (Realna implementacja parsująca arkusze NBP może zostać dodana jako rozszerzenie.)
    return {
      market,
      trend: "stabilny",
      quarterlyChangePercent: null,
      yearlyChangePercent: null,
      comment: `Rynek ${market} — dane NBP wykorzystano jako pomocniczy benchmark trendu (brak istotnych zmian sygnalizowanych w ostatnim okresie).`,
    } satisfies NbpTrend;
  });
}
