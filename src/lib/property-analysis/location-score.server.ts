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
    return {
      score: 35,
      summary: "Brak współrzędnych — ograniczona analiza lokalizacji.",
      liquidityComment: "Płynność trudna do oceny bez geolokalizacji.",
    };
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) {
    return {
      score: 45,
      summary: "Brak konfiguracji Google Maps — wynik szacunkowy.",
      liquidityComment: "Wymagana ręczna weryfikacja lokalizacji.",
    };
  }
  const categories = ["school", "supermarket", "pharmacy", "bus_station", "park", "hospital"];
  const counts: Record<string, number> = {};
  try {
    for (const type of categories) {
      const res = await fetchWithTimeout(
        `${GATEWAY}/places/v1/places:searchNearby`,
        {
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
            locationRestriction: {
              circle: { center: { latitude: lat, longitude: lng }, radius: 1500 },
            },
          }),
        },
        12_000,
      );
      if (res.ok) {
        const j = (await res.json()) as { places?: unknown[] };
        counts[type] = (j.places ?? []).length;
      } else {
        counts[type] = 0;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const score = Math.max(0, Math.min(100, Math.round((total / 60) * 100)));
    const quality =
      score >= 70 ? "bardzo dobra" : score >= 50 ? "dobra" : score >= 30 ? "przeciętna" : "słaba";
    return {
      score,
      summary: `Dostępność infrastruktury: ${quality}. Łącznie ${total} punktów POI w promieniu 1,5 km.`,
      liquidityComment:
        score >= 50
          ? "Lokalizacja sprzyja płynności rynkowej."
          : "Lokalizacja może obniżać płynność rynkową.",
      poiCounts: counts,
    };
  } catch {
    return {
      score: 40,
      summary: "Błąd pobierania danych Google Maps — wynik szacunkowy.",
      liquidityComment: "Wymagana ręczna weryfikacja.",
    };
  }
}

type GeocodeResult = {
  geometry?: { location?: { lat: number; lng: number }; location_type?: string };
  formatted_address?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  partial_match?: boolean;
  types?: string[];
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export async function geocode(
  address: string,
  opts?: { expectedCity?: string | null; expectedVoivodeship?: string | null },
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey || !address) return null;
  try {
    // Bias do Polski, dodatkowo doklej "Polska" jeśli adres tego nie zawiera.
    const q = /polska|poland/i.test(address) ? address : `${address}, Polska`;
    const params = new URLSearchParams({
      address: q,
      region: "pl",
      language: "pl",
      components: "country:PL",
    });
    const res = await fetchWithTimeout(`${GATEWAY}/maps/api/geocode/json?${params.toString()}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": apiKey },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: GeocodeResult[]; status?: string };
    const results = j.results ?? [];
    if (!results.length) return null;

    const expCity = opts?.expectedCity ? norm(opts.expectedCity) : null;
    const expVoi = opts?.expectedVoivodeship ? norm(opts.expectedVoivodeship) : null;

    // Wybierz pierwszy wynik, który pasuje do oczekiwanego miasta/województwa.
    // Jeśli nie ma oczekiwań — bierz pierwszy. Jeśli są — odrzuć partial_match
    // oraz dopasowania, w których city/voivodeship nie zgadza się z oczekiwanym.
    const pick = results.find((r) => {
      if (!expCity && !expVoi) return true;
      const comps = r.address_components ?? [];
      const cityComp = comps.find(
        (c) =>
          c.types.includes("locality") ||
          c.types.includes("postal_town") ||
          c.types.includes("administrative_area_level_3"),
      );
      const voiComp = comps.find((c) => c.types.includes("administrative_area_level_1"));
      const cityOk = expCity ? cityComp && norm(cityComp.long_name).includes(expCity) : true;
      const voiOk = expVoi ? voiComp && norm(voiComp.long_name).includes(expVoi) : true;
      // Odrzucamy partial_match jeśli mamy oczekiwane miasto, a ono się nie zgadza
      if (r.partial_match && !cityOk) return false;
      return cityOk && voiOk;
    });

    const chosen = pick ?? (expCity ? null : results[0]);
    const loc = chosen?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}
