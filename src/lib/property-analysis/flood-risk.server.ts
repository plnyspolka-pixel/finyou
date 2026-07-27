// Klient WFS ISOK / Wody Polskie (MZP/MRP) — sprawdzenie zagrożenia powodziowego.
// Działa bez klucza API. Bezpieczne fallbacki: jeśli serwis nie odpowiada — zwraca unknown.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { geocode } from "./location-score.server";

export type FloodRiskLevel = "none" | "low" | "medium" | "high" | "very_high" | "unknown";

export interface FloodRiskResult {
  riskLevel: FloodRiskLevel;
  scenario10Percent: boolean;
  scenario1Percent: boolean;
  scenario02Percent: boolean;
  specialFloodHazardArea: boolean;
  waterDepth: number | null;
  flowVelocity: number | null;
  riskMapIntersection: boolean;
  score: number; // 0..10
}

export interface FloodAnalysisInput {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  voivodeship?: string | null;
  geometry?: unknown;
  propertyId?: string | null;
}

export interface FloodAnalysisOutput {
  success: boolean;
  errorCode?: "MISSING_LOCATION" | "FLOOD_WFS_ERROR" | "NO_FLOOD_DATA";
  message?: string;
  source: "ISOK / Wody Polskie / Hydroportal";
  method: "WFS intersection";
  property: {
    latitude: number | null;
    longitude: number | null;
    geometryUsed: "point" | "parcel_geometry" | "address_geocoding";
  };
  floodRisk: FloodRiskResult;
  alerts: string[];
  raw: Record<string, any>;
}

const WFS_BASE = "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WFS";
const WMS_BASE = "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS";
const FETCH_TIMEOUT_MS = 12_000;

function unknownResult(): FloodRiskResult {
  return {
    riskLevel: "unknown",
    scenario10Percent: false,
    scenario1Percent: false,
    scenario02Percent: false,
    specialFloodHazardArea: false,
    waterDepth: null,
    flowVelocity: null,
    riskMapIntersection: false,
    score: 5,
  };
}

export function scoreForRiskLevel(r: FloodRiskLevel): number {
  switch (r) {
    case "none":
      return 10;
    case "low":
      return 7;
    case "medium":
      return 4;
    case "high":
      return 1;
    case "very_high":
      return 0;
    default:
      return 5;
  }
}

export function buildAlerts(r: FloodRiskResult, ok: boolean): string[] {
  const alerts: string[] = [];
  if (!ok) {
    alerts.push(
      "Nie udało się automatycznie zweryfikować zagrożenia powodziowego. Wymagana ręczna weryfikacja w Hydroportalu.",
    );
    return alerts;
  }
  if (r.scenario10Percent)
    alerts.push(
      "Uwaga: nieruchomość znajduje się na obszarze wysokiego zagrożenia powodziowego według map ISOK/Wody Polskie.",
    );
  if (r.scenario1Percent)
    alerts.push(
      "Nieruchomość znajduje się na obszarze zagrożenia powodziowego dla scenariusza 1%.",
    );
  if (r.scenario02Percent)
    alerts.push(
      "Nieruchomość znajduje się na obszarze zagrożenia powodziowego dla scenariusza 0,2%.",
    );
  if (!r.scenario02Percent && !r.scenario1Percent && !r.scenario10Percent) {
    alerts.push(
      "Nie stwierdzono przecięcia lokalizacji nieruchomości z obszarami zagrożenia powodziowego w dostępnych warstwach MZP.",
    );
  }
  return alerts;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "lovable-flood-risk/1.0" },
    });
  } finally {
    clearTimeout(t);
  }
}

// Pobiera GetCapabilities WFS i wyciąga nazwy typów warstw.
async function fetchWfsTypeNames(): Promise<string[]> {
  const url = `${WFS_BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`WFS GetCapabilities ${res.status}`);
  const xml = await res.text();
  // bardzo proste wyciągnięcie wszystkich <Name>...</Name> z FeatureType
  const names: string[] = [];
  const re = /<(?:\w+:)?FeatureType[^>]*>[\s\S]*?<(?:\w+:)?Name>([^<]+)<\/(?:\w+:)?Name>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    names.push(m[1].trim());
  }
  return names;
}

// Heurystyka: dopasuj warstwy do scenariuszy 10/1/0.2 i ryzyka.
function classifyLayers(names: string[]): {
  scenario10: string[];
  scenario1: string[];
  scenario02: string[];
  risk: string[];
} {
  const out = {
    scenario10: [] as string[],
    scenario1: [] as string[],
    scenario02: [] as string[],
    risk: [] as string[],
  };
  for (const n of names) {
    const low = n.toLowerCase();
    const isHazard = low.includes("zagroz") || low.includes("hazard") || low.includes("mzp");
    const isRisk = low.includes("ryzyk") || low.includes("risk") || low.includes("mrp");
    // wykrycie scenariusza po liczbach / oznaczeniach
    const has10 = /(?:^|[^0-9])(10|q10|0?10p|wysok)/i.test(low);
    const has1 = /(?:^|[^0-9.])(1p|q100|sredn|średn|100l)/i.test(low) && !has10;
    const has02 = /(0[.,]?2|q500|nisk|500l)/i.test(low);
    if (isHazard && has10) out.scenario10.push(n);
    else if (isHazard && has1) out.scenario1.push(n);
    else if (isHazard && has02) out.scenario02.push(n);
    if (isRisk) out.risk.push(n);
  }
  return out;
}

async function wfsHasFeaturesInBbox(typeName: string, lat: number, lng: number): Promise<boolean> {
  // mały bbox ~ ±50m: 0.0005 stopnia szer., dla dł. korygujemy cos(lat)
  const dLat = 0.0005;
  const dLng = 0.0005 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const minLat = lat - dLat,
    maxLat = lat + dLat;
  const minLng = lng - dLng,
    maxLng = lng + dLng;
  // WFS 2.0 BBOX SRS = urn:ogc:def:crs:EPSG::4326 (axis y,x)
  const bbox = `${minLat},${minLng},${maxLat},${maxLng},urn:ogc:def:crs:EPSG::4326`;
  const url =
    `${WFS_BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=${encodeURIComponent(typeName)}&COUNT=1&BBOX=${encodeURIComponent(bbox)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return false;
    const xml = await res.text();
    if (!xml) return false;
    if (/<(?:\w+:)?Exception/i.test(xml)) return false;
    if (/numberReturned="(\d+)"/i.test(xml)) {
      const m = xml.match(/numberReturned="(\d+)"/i);
      return !!m && Number(m[1]) > 0;
    }
    return /<(?:\w+:)?member[\s>]/i.test(xml) || /<gml:featureMember/i.test(xml);
  } catch {
    return false;
  }
}

async function anyLayerHit(layers: string[], lat: number, lng: number): Promise<boolean> {
  for (const t of layers) {
    if (await wfsHasFeaturesInBbox(t, lat, lng)) return true;
  }
  return false;
}

export function buildWmsPreviewUrl(lat: number, lng: number, w = 600, h = 400): string {
  // poglądowy obrazek WMS — wszystkie warstwy domyślne
  const dLat = 0.01,
    dLng = 0.015;
  const bbox = `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
  return (
    `${WMS_BASE}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&LAYERS=&STYLES=&CRS=EPSG:4326&BBOX=${bbox}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/png&TRANSPARENT=true`
  );
}

export async function analyzeFloodRisk(input: FloodAnalysisInput): Promise<FloodAnalysisOutput> {
  let lat = input.latitude ?? null;
  let lng = input.longitude ?? null;
  let geometryUsed: "point" | "parcel_geometry" | "address_geocoding" = "point";

  if (input.geometry) geometryUsed = "parcel_geometry";

  if ((lat == null || lng == null) && (input.address || input.city)) {
    const q = [input.address, input.city, input.voivodeship].filter(Boolean).join(", ");
    const g = await geocode(q);
    if (g) {
      lat = g.lat;
      lng = g.lng;
      geometryUsed = "address_geocoding";
    }
  }

  if (lat == null || lng == null) {
    return {
      success: false,
      errorCode: "MISSING_LOCATION",
      message: "Brak lokalizacji nieruchomości do sprawdzenia ryzyka powodziowego.",
      source: "ISOK / Wody Polskie / Hydroportal",
      method: "WFS intersection",
      property: { latitude: null, longitude: null, geometryUsed },
      floodRisk: unknownResult(),
      alerts: buildAlerts(unknownResult(), false),
      raw: {},
    };
  }

  // Cache lookup (90 dni)
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  try {
    const { data: cached } = await supabaseAdmin
      .from("flood_risk_cache")
      .select("*")
      .eq("geometry_hash", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached) {
      const fr: FloodRiskResult = {
        riskLevel: (cached.risk_level as FloodRiskLevel) ?? "unknown",
        scenario10Percent: !!cached.scenario_10_percent,
        scenario1Percent: !!cached.scenario_1_percent,
        scenario02Percent: !!cached.scenario_02_percent,
        specialFloodHazardArea: !!cached.special_flood_hazard_area,
        waterDepth: cached.water_depth as number | null,
        flowVelocity: cached.flow_velocity as number | null,
        riskMapIntersection: false,
        score:
          cached.score ?? scoreForRiskLevel((cached.risk_level as FloodRiskLevel) ?? "unknown"),
      };
      return {
        success: true,
        source: "ISOK / Wody Polskie / Hydroportal",
        method: "WFS intersection",
        property: { latitude: lat, longitude: lng, geometryUsed },
        floodRisk: fr,
        alerts: buildAlerts(fr, true),
        raw: { cached: true },
      };
    }
  } catch {
    /* ignore cache errors */
  }

  let typeNames: string[] = [];
  try {
    typeNames = await fetchWfsTypeNames();
  } catch {
    return {
      success: false,
      errorCode: "FLOOD_WFS_ERROR",
      message: "Nie udało się pobrać danych z usługi map zagrożenia powodziowego.",
      source: "ISOK / Wody Polskie / Hydroportal",
      method: "WFS intersection",
      property: { latitude: lat, longitude: lng, geometryUsed },
      floodRisk: unknownResult(),
      alerts: buildAlerts(unknownResult(), false),
      raw: {},
    };
  }

  const layers = classifyLayers(typeNames);

  let hit10 = false,
    hit1 = false,
    hit02 = false,
    hitRisk = false;
  try {
    [hit10, hit1, hit02, hitRisk] = await Promise.all([
      anyLayerHit(layers.scenario10, lat, lng),
      anyLayerHit(layers.scenario1, lat, lng),
      anyLayerHit(layers.scenario02, lat, lng),
      anyLayerHit(layers.risk, lat, lng),
    ]);
  } catch {
    /* częściowy brak — pójdziemy z tym co mamy */
  }

  // Klasyfikacja
  let riskLevel: FloodRiskLevel;
  if (hit10) riskLevel = "high";
  else if (hit1) riskLevel = "medium";
  else if (hit02) riskLevel = "low";
  else riskLevel = "none";
  // very_high: gdy hit10 i ryzykowna warstwa MRP
  if (hit10 && hitRisk) riskLevel = "very_high";

  const fr: FloodRiskResult = {
    riskLevel,
    scenario10Percent: hit10,
    scenario1Percent: hit1,
    scenario02Percent: hit02,
    specialFloodHazardArea: hit10,
    waterDepth: null,
    flowVelocity: null,
    riskMapIntersection: hitRisk,
    score: scoreForRiskLevel(riskLevel),
  };

  // Zapis cache
  try {
    await supabaseAdmin.from("flood_risk_cache").insert({
      property_id: input.propertyId ?? null,
      latitude: lat,
      longitude: lng,
      geometry_hash: cacheKey,
      query_bbox: null,
      risk_level: riskLevel,
      scenario_10_percent: hit10,
      scenario_1_percent: hit1,
      scenario_02_percent: hit02,
      special_flood_hazard_area: fr.specialFloodHazardArea,
      water_depth: null,
      flow_velocity: null,
      score: fr.score,
      response_json: { layers, hit10, hit1, hit02, hitRisk } as never,
    });
  } catch {
    /* ignore */
  }

  return {
    success: true,
    source: "ISOK / Wody Polskie / Hydroportal",
    method: "WFS intersection",
    property: { latitude: lat, longitude: lng, geometryUsed },
    floodRisk: fr,
    alerts: buildAlerts(fr, true),
    raw: { layersDetected: layers, typeNamesCount: typeNames.length },
  };
}

export function floodRiskInvestorText(
  fr: FloodRiskResult,
  ok: boolean,
): {
  floodRiskSummary: string;
  riskComment: string;
  shortInvestorBullet: string;
} {
  if (!ok || fr.riskLevel === "unknown") {
    return {
      floodRiskSummary:
        "Nie udało się automatycznie zweryfikować zagrożenia powodziowego dla tej lokalizacji w oficjalnych warstwach ISOK/Wody Polskie. Rekomendowana ręczna weryfikacja w Hydroportalu.",
      riskComment: "Brak rozstrzygającej informacji — pozycja wymaga weryfikacji.",
      shortInvestorBullet: "Ryzyko powodziowe: do weryfikacji.",
    };
  }
  if (fr.riskLevel === "none") {
    return {
      floodRiskSummary:
        "Na podstawie dostępnych warstw ISOK/Wody Polskie nie stwierdzono przecięcia nieruchomości z obszarami zagrożenia powodziowego. Wynik ma charakter pomocniczy i powinien być interpretowany łącznie z dokumentami nieruchomości oraz lokalnymi uwarunkowaniami.",
      riskComment: "Brak stwierdzonego ryzyka powodziowego.",
      shortInvestorBullet: "Ryzyko powodziowe: brak stwierdzonego ryzyka.",
    };
  }
  const scen = fr.scenario10Percent
    ? "10%"
    : fr.scenario1Percent
      ? "1%"
      : fr.scenario02Percent
        ? "0,2%"
        : "—";
  return {
    floodRiskSummary: `Dostępne warstwy ISOK/Wody Polskie wskazują, że nieruchomość znajduje się w obszarze zagrożenia powodziowego dla scenariusza ${scen}. Może to wpływać na płynność zabezpieczenia, warunki ubezpieczenia oraz ostrożnościową ocenę wartości nieruchomości.`,
    riskComment: `Stwierdzone zagrożenie powodziowe — poziom: ${fr.riskLevel}.`,
    shortInvestorBullet: `Ryzyko powodziowe: ${fr.riskLevel === "very_high" ? "bardzo wysokie" : fr.riskLevel === "high" ? "wysokie" : fr.riskLevel === "medium" ? "średnie" : "niskie"} (scenariusz ${scen}).`,
  };
}
