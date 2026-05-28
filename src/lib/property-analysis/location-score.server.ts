// Scoring lokalizacji — wykorzystuje istniejącą funkcję property-location-analysis,
// a w razie braku danych zwraca neutralny wynik (40/100).
import type { LocationScoreResult } from "./types";
import { fetchWithTimeout } from "./cache.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export async function locationScore(args: {
  lat: number | null;
  lng: number | null;
  address?: string | null;
  city?: string | null;
}): Promise<LocationScoreResult> {
  const { lat, lng } = args;
  if (lat == null || lng == null) {
    return { score: 35, summary: "Brak współrzędnych — ograniczona analiza lokalizacji.", liquidityComment: "Płynność trudna do oceny bez geolokalizacji." };
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) {
    return { score: 45, summary: "Brak konfiguracji Google Maps — wynik szacunkowy.", liquidityComment: "Wymagana ręczna weryfikacja lokalizacji." };
  }
  const categories = ["school", "supermarket", "pharmacy", "bus_station", "park", "hospital"];
  const counts: Record<string, number> = {};
  try {
    for (const type of categories) {
      const res = await fetchWithTimeout(`${GATEWAY}/places/v1/places:searchNearby`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({
          includedTypes: [type],
          maxResultCount: 20,
          locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 1500 } },
        }),
      }, 12_000);
      if (res.ok) {
        const j = (await res.json()) as { places?: unknown[] };
        counts[type] = (j.places ?? []).length;
      } else {
        counts[type] = 0;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const score = Math.max(0, Math.min(100, Math.round((total / 60) * 100)));
    const quality = score >= 70 ? "bardzo dobra" : score >= 50 ? "dobra" : score >= 30 ? "przeciętna" : "słaba";
    return {
      score,
      summary: `Dostępność infrastruktury: ${quality}. Łącznie ${total} punktów POI w promieniu 1,5 km.`,
      liquidityComment: score >= 50 ? "Lokalizacja sprzyja płynności rynkowej." : "Lokalizacja może obniżać płynność rynkową.",
      poiCounts: counts,
    };
  } catch {
    return { score: 40, summary: "Błąd pobierania danych Google Maps — wynik szacunkowy.", liquidityComment: "Wymagana ręczna weryfikacja." };
  }
}

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey || !address) return null;
  try {
    const res = await fetchWithTimeout(`${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }> };
    const loc = j.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch { return null; }
}
