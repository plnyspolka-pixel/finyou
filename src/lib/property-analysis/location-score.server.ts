// Scoring lokalizacji i geokodowanie — OpenStreetMap (Nominatim + Overpass).
// Do 22.07.2026 przez konektor Google Maps; po jego odłączeniu w Lovable
// geokodowanie zwracało pustkę. Interfejs bez zmian (geocode, locationScore),
// więc analiza zabezpieczenia, benchmark GUS i ryzyko powodziowe korzystają
// z OSM bez własnych zmian.
import type { LocationScoreResult } from "./types";
import { osmGeocode, osmNearby } from "@/lib/osm.server";

/** Kategorie punktów w scoringu zabezpieczenia (promień 1,5 km, maks. 20 na kategorię). */
const SCORE_CATEGORIES: Record<string, string> = {
  schools: "szkoły",
  groceryStores: "sklepy spożywcze",
  pharmacies: "apteki",
  publicTransport: "przystanki komunikacji",
  parks: "parki",
  clinics: "przychodnie i szpitale",
};

export async function locationScore(args: {
  lat: number | null;
  lng: number | null;
  address?: string | null;
  city?: string | null;
}): Promise<LocationScoreResult> {
  const { lat, lng } = args;
  if (lat == null || lng == null) {
    return {
      score: 50,
      available: false,
      summary: "Nie ustalono położenia (geokodowanie) — lokalizacji nie oceniono.",
      liquidityComment: "Płynność trudna do oceny bez geolokalizacji.",
    };
  }
  const nearby = await osmNearby(lat, lng, 1500, Object.keys(SCORE_CATEGORIES), 20).catch(
    () => null,
  );
  if (!nearby) {
    return {
      score: 50,
      available: false,
      summary: "Nie pobrano punktów w okolicy (OpenStreetMap) — lokalizacji nie oceniono.",
      liquidityComment: "Wymagana ręczna weryfikacja lokalizacji.",
    };
  }
  const counts: Record<string, number> = {};
  for (const key of Object.keys(SCORE_CATEGORIES)) counts[key] = nearby[key]?.length ?? 0;
  // Skala jak przy Google Places: 6 kategorii × maks. 20, pełny wynik od 60 punktów.
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round((total / 60) * 100)));
  const quality =
    score >= 70 ? "bardzo dobra" : score >= 50 ? "dobra" : score >= 30 ? "przeciętna" : "słaba";
  const detail = Object.entries(SCORE_CATEGORIES)
    .map(([k, label]) => `${label}: ${counts[k] >= 20 ? "20+" : counts[k]}`)
    .join(", ");
  return {
    score,
    available: true,
    summary: `Dostępność infrastruktury: ${quality}. Łącznie ${total} punktów w promieniu 1,5 km (OpenStreetMap — ${detail}).`,
    liquidityComment:
      score >= 50
        ? "Lokalizacja sprzyja płynności rynkowej."
        : "Lokalizacja może obniżać płynność rynkową.",
    poiCounts: counts,
  };
}

/**
 * Geokodowanie z ponowieniami: pełny adres → adres bez numeru lokalu
 * („Komandosów 12/61" → „Komandosów 12") → sama miejscowość (przybliżenie,
 * `approximate: true`). Przy podanej miejscowości/województwie wynik musi do
 * nich pasować — inaczej ulica o tej samej nazwie w innym mieście.
 */
export async function geocode(
  address: string,
  opts?: {
    expectedCity?: string | null;
    expectedVoivodeship?: string | null;
    /** Ostatnia próba: sama miejscowość (współrzędne centrum). */
    cityFallback?: boolean;
  },
): Promise<{ lat: number; lng: number; approximate?: boolean } | null> {
  if (!address?.trim()) return null;
  const match = {
    expectedCity: opts?.expectedCity ?? null,
    expectedVoivodeship: opts?.expectedVoivodeship ?? null,
  };
  const once = async (q: string) => {
    const g = await osmGeocode(q, match).catch(() => null);
    return g ? { lat: g.lat, lng: g.lng, approximate: g.approximate || undefined } : null;
  };
  const exact = await once(address);
  if (exact) return exact;
  const withoutUnit = address.replace(/(\d+[a-z]?)\s*\/\s*\d+[a-z]?/gi, "$1");
  if (withoutUnit !== address) {
    const retry = await once(withoutUnit);
    if (retry) return retry;
  }
  if (opts?.cityFallback && opts.expectedCity) {
    const city = await once(
      [opts.expectedCity, opts.expectedVoivodeship].filter(Boolean).join(", "),
    );
    if (city) return { ...city, approximate: true };
  }
  return null;
}
