import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

const InputSchema = z.object({
  propertyAddress: z.string().max(500).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  propertyType: z.string().max(50).optional().nullable(),
  kwNumber: z.string().max(60).optional().nullable(),
  loanAmount: z.number().nullable().optional(),
  estimatedPropertyValue: z.number().nullable().optional(),
  forceRefresh: z.boolean().optional(),
});

type Place = { name?: string; vicinity?: string; types?: string[]; distance?: number };

function normalizeAddress(parts: {
  propertyAddress?: string | null;
  city?: string | null;
  postalCode?: string | null;
}) {
  const joined = [parts.propertyAddress, parts.postalCode, parts.city, "Polska"]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .join(", ");
  return joined.replace(/\s+/g, " ").toLowerCase();
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function gmFetch(path: string, init?: RequestInit) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY_MISSING");
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

async function geocode(address: string) {
  const res = await gmFetch(
    `/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=pl&language=pl`,
  );
  if (!res.ok) throw new Error("GOOGLE_MAPS_API_ERROR");
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;
  const r = data.results[0];
  return {
    latitude: r.geometry.location.lat as number,
    longitude: r.geometry.location.lng as number,
    formattedAddress: r.formatted_address as string,
    placeId: r.place_id as string,
  };
}

async function nearby(
  lat: number,
  lng: number,
  radius: number,
  includedTypes: string[],
): Promise<Place[]> {
  const res = await gmFetch(`/places/v1/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.types",
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
      languageCode: "pl",
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.places ?? []).map((p: any) => ({
    name: p.displayName?.text,
    vicinity: p.formattedAddress,
    types: p.types,
    distance: p.location
      ? haversine(lat, lng, p.location.latitude, p.location.longitude)
      : undefined,
  }));
}

const CATEGORY_TYPES: Record<string, string[]> = {
  schools: ["school", "primary_school", "secondary_school"],
  kindergartens: ["preschool"],
  groceryStores: ["supermarket", "grocery_store", "convenience_store"],
  pharmacies: ["pharmacy", "drugstore"],
  clinics: ["doctor", "hospital"],
  publicTransport: ["bus_stop", "transit_station", "train_station", "subway_station"],
  parks: ["park"],
  restaurants: ["restaurant", "cafe"],
  banks: ["bank", "atm"],
  shopping: ["shopping_mall", "department_store"],
};

async function gatherInfrastructure(lat: number, lng: number, radius: number) {
  const result: Record<string, Place[]> = {};
  for (const [key, types] of Object.entries(CATEGORY_TYPES)) {
    result[key] = await nearby(lat, lng, radius, types);
  }
  return result;
}

function classify(score: number) {
  if (score >= 80) return "bardzo dobra lokalizacja";
  if (score >= 60) return "dobra lokalizacja";
  if (score >= 40) return "przeciętna lokalizacja";
  if (score >= 20) return "słaba lokalizacja";
  return "bardzo słaba lokalizacja";
}

function computeScore(r1000: Record<string, Place[]>, r3000: Record<string, Place[]>) {
  const n = (k: string, r = r1000) => r[k]?.length ?? 0;

  const infra = Math.min(
    25,
    Math.min(n("groceryStores"), 5) * 2 +
      Math.min(n("pharmacies"), 4) * 1.5 +
      Math.min(n("clinics"), 4) * 1.5 +
      Math.min(n("schools") + n("kindergartens"), 5) * 1,
  );
  const transport = Math.min(20, Math.min(n("publicTransport"), 10) * 2);
  const attractiveness = Math.min(
    20,
    Math.min(n("parks"), 4) * 2 +
      Math.min(n("restaurants"), 8) * 1 +
      Math.min(n("shopping", r3000), 3) * 2,
  );
  const liquidity = Math.min(
    20,
    Math.round((Math.min(n("groceryStores") + n("restaurants") + n("banks"), 15) / 15) * 20),
  );
  const hasBasics = n("groceryStores") > 0 && n("publicTransport") > 0;
  const risk = hasBasics ? 12 : 5;

  const total = Math.round(infra + transport + attractiveness + liquidity + risk);
  return {
    total: Math.min(100, total),
    category: classify(total),
    infrastructureScore: Math.round(infra),
    transportScore: Math.round(transport),
    attractivenessScore: Math.round(attractiveness),
    liquidityScore: Math.round(liquidity),
    riskScore: Math.round(risk),
  };
}

function buildOfferText(category: string, counts: Record<string, number>) {
  const hasInfra = counts.groceryStoresWithin1000m > 0 && counts.pharmaciesWithin1000m > 0;
  const hasTransport = counts.publicTransportWithin1000m > 0;
  const locationSummary = `Nieruchomość położona jest w lokalizacji ocenionej jako ${category}. W najbliższym otoczeniu ${
    hasInfra
      ? "znajdują się punkty handlowe i usługowe oraz placówki medyczne"
      : "dostęp do podstawowej infrastruktury jest ograniczony"
  }${hasTransport ? ", a dostępność komunikacji publicznej wspiera atrakcyjność lokalizacji" : ""}.`;
  const liquidityComment = hasInfra
    ? "Charakterystyka otoczenia może pozytywnie wpływać na płynność potencjalnej sprzedaży zabezpieczenia."
    : "Ograniczona infrastruktura w okolicy może wpływać na czas potrzebny do zbycia zabezpieczenia.";
  const riskComment =
    "Analiza lokalizacji nie zastępuje wyceny rzeczoznawcy ani analizy stanu prawnego nieruchomości. Ostateczna ocena płynności zabezpieczenia wymaga zestawienia z aktualną wyceną oraz lokalnym popytem transakcyjnym.";
  const shortInvestorBullet = `Lokalizacja: ${category} (${counts.groceryStoresWithin1000m} sklepów, ${counts.publicTransportWithin1000m} przystanków, ${counts.schoolsWithin1000m} szkół w 1 km).`;
  return { locationSummary, liquidityComment, riskComment, shortInvestorBullet };
}

export const analyzePropertyLocation = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const address = (data.propertyAddress ?? "").trim();
      if (!address && !data.city) {
        return {
          success: false,
          errorCode: "MISSING_ADDRESS",
          message: "Brak adresu nieruchomości do analizy lokalizacji.",
        };
      }
      const normalized = normalizeAddress({
        propertyAddress: data.propertyAddress,
        city: data.city,
        postalCode: data.postalCode,
      });
      const propertyType = data.propertyType ?? "inne";

      if (!data.forceRefresh) {
        const { data: cached } = await supabaseAdmin
          .from("property_location_analysis_cache")
          .select("analysis_json,expires_at")
          .eq("normalized_address", normalized)
          .eq("property_type", propertyType)
          .gt("expires_at", new Date().toISOString())
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cached?.analysis_json) {
          return cached.analysis_json;
        }
      }

      const geo = await geocode(
        [address, data.postalCode, data.city, "Polska"].filter(Boolean).join(", "),
      );
      if (!geo) {
        return {
          success: false,
          errorCode: "GEOCODING_FAILED",
          message: "Nie udało się ustalić lokalizacji nieruchomości na mapie.",
        };
      }

      const [r500, r1000, r3000] = await Promise.all([
        gatherInfrastructure(geo.latitude, geo.longitude, 500),
        gatherInfrastructure(geo.latitude, geo.longitude, 1000),
        gatherInfrastructure(geo.latitude, geo.longitude, 3000),
      ]);

      const counts = {
        schoolsWithin1000m: r1000.schools.length,
        groceryStoresWithin1000m: r1000.groceryStores.length,
        pharmaciesWithin1000m: r1000.pharmacies.length,
        publicTransportWithin1000m: r1000.publicTransport.length,
        parksWithin1000m: r1000.parks.length,
        servicesWithin1000m: r1000.restaurants.length + r1000.banks.length + r1000.shopping.length,
      };

      const locationScore = computeScore(r1000, r3000);
      const investmentOfferText = buildOfferText(locationScore.category, counts);

      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${geo.latitude},${geo.longitude}&query_place_id=${geo.placeId}`;

      const result = {
        success: true as const,
        source: "Google Maps Platform",
        property: {
          inputAddress: address,
          formattedAddress: geo.formattedAddress,
          latitude: geo.latitude,
          longitude: geo.longitude,
          placeId: geo.placeId,
          propertyType,
        },
        nearbyInfrastructure: {
          radius500m: r500,
          radius1000m: r1000,
          radius3000m: r3000,
        },
        counts,
        locationScore,
        investmentOfferText,
        map: {
          staticMapUrl: "",
          googleMapsUrl,
        },
      };

      await supabaseAdmin.from("property_location_analysis_cache").insert({
        property_address: data.propertyAddress ?? null,
        city: data.city ?? null,
        postal_code: data.postalCode ?? null,
        normalized_address: normalized,
        latitude: geo.latitude,
        longitude: geo.longitude,
        property_type: propertyType,
        analysis_json: result as any,
      });

      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg === "GOOGLE_MAPS_API_KEY_MISSING") {
        return {
          success: false,
          errorCode: "GOOGLE_MAPS_API_KEY_MISSING",
          message: "Integracja Google Maps nie została skonfigurowana.",
        };
      }
      console.error("property-location-analysis error:", e);
      return {
        success: false,
        errorCode: "GOOGLE_MAPS_API_ERROR",
        message: "Nie udało się pobrać danych lokalizacyjnych.",
      };
    }
  });
