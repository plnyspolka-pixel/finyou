// RCN / Geoportal — pobieranie transakcji porównawczych przez WFS z pełną diagnostyką.
// Wszystko działa po stronie serwera (server function), nigdy nie odpytujemy WFS z przeglądarki.
import { XMLParser } from "fast-xml-parser";
import proj4 from "proj4";
import type { PropertyType, RcnStats, RcnDiagnostics, RcnStatus } from "./types";
import { average, fetchWithTimeout, filterIqrOutliers, median, quartile, withCache } from "./cache.server";

// Definicja układu PUWG 1992 (EPSG:2180) — często używany przez polskie usługi WFS.
proj4.defs(
  "EPSG:2180",
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

// Bazowy endpoint usługi RCN (Geoportal). Typ usługi określa parametr SERVICE=WFS|WMS.
// NIE dopisuj /WFS do ścieżki — to powoduje błąd 404.
const RCN_BASE_ENDPOINT = "https://mapy.geoportal.gov.pl/wss/service/rcn";

// Wersje WFS do wypróbowania w kolejności.
const WFS_VERSIONS: ReadonlyArray<string> = ["2.0.0", "1.1.0", "1.0.0"];

const RCN_TIMEOUT_MS = 20_000;
const RCN_HEADERS: Record<string, string> = {
  Accept: "application/xml,text/xml,*/*",
};


// Słownik typów aplikacyjnych → słowa kluczowe charakterystyczne dla nazw warstw / atrybutów RCN.
const TYPE_KEYWORDS: Record<string, string[]> = {
  mieszkanie: ["lokal", "lokalow", "mieszka"],
  dom: ["budynek", "budynkow", "zabudowan"],
  lokal_uslugowy: ["lokal", "niemieszk", "uslugow", "uzytkow"],
  dzialka_budowlana: ["grunt", "niezabudow", "dzialk"],
  dzialka_zabudowana: ["grunt", "zabudow", "dzialk"],
  grunt_rolny: ["grunt", "rolny", "uzytk"],
  inna: [],
};

interface RcnFeatureRaw {
  pricePerM2?: number | null;
  pricePerHa?: number | null;
  date?: string | null;
  rawType?: string | null;
  attrs: Record<string, unknown>;
}

function bboxAround4326(lat: number, lng: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

function bboxAround2180(lat: number, lng: number, radiusM: number): [number, number, number, number] {
  const [x, y] = proj4("EPSG:4326", "EPSG:2180", [lng, lat]) as [number, number];
  return [x - radiusM, y - radiusM, x + radiusM, y + radiusM];
}

function emptyDiag(): RcnDiagnostics {
  return {
    status: "not_started",
    statusMessage: "Diagnostyka nieuruchomiona.",
    endpoint: null,
    availableLayers: [],
    layerUsed: null,
    crsUsed: null,
    inputCoordinates: { lat: null, lng: null, crs: "EPSG:4326" },
    queryBbox: null,
    radiusM: null,
    radiiTried: [],
    featuresRawCount: 0,
    featuresFilteredCount: 0,
    filtersApplied: [],
    periodCounts: { countAllDates: 0, countLast12Months: 0, countLast24Months: 0, countLast36Months: 0 },
    sampleFeature: null,
    rawResponseSnippet: null,
    errorTechnical: null,
    capabilitiesChecked: false,
    propertyTypeMapping: { applicationType: null, keywords: [], matchedLayerKeywords: [] },
  };
}

async function fetchCapabilities(endpoint: string): Promise<{ layers: string[]; xml: string } | null> {
  const url = `${endpoint}?service=WFS&version=2.0.0&request=GetCapabilities`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/xml" } }, 15_000);
    if (!res.ok) return null;
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    const parsed = parser.parse(xml) as any;
    const featureTypes =
      parsed?.WFS_Capabilities?.FeatureTypeList?.FeatureType ??
      parsed?.Capabilities?.FeatureTypeList?.FeatureType ??
      [];
    const arr = Array.isArray(featureTypes) ? featureTypes : [featureTypes];
    const layers = arr.map((f: any) => String(f?.Name ?? "")).filter(Boolean);
    return { layers, xml };
  } catch {
    return null;
  }
}

function pickLayers(layers: string[], keywords: string[]): string[] {
  if (keywords.length === 0) return layers.slice(0, 3);
  const lc = layers.map((l) => ({ orig: l, lower: l.toLowerCase() }));
  const matches = lc.filter((l) => keywords.some((k) => l.lower.includes(k)));
  return (matches.length > 0 ? matches : lc).map((l) => l.orig).slice(0, 3);
}

function tryParseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // Akceptujemy YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS, DD.MM.YYYY, DD-MM-YYYY
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractFromProps(p: Record<string, unknown>): RcnFeatureRaw {
  const keys = Object.keys(p);
  const find = (rgx: RegExp) => keys.find((k) => rgx.test(k.toLowerCase()));
  const kPpm2 = find(/m2|m²|metr/) && find(/cena|price/);
  const kPpha = find(/(^|_)ha(_|$)|hektar/) && find(/cena|price/);
  const findFirst = (rgxs: RegExp[]) => {
    for (const r of rgxs) { const k = keys.find((k) => r.test(k.toLowerCase())); if (k) return p[k]; }
    return null;
  };
  return {
    pricePerM2: toNumber(findFirst([/cena.*m2|m2.*cena|cena_za_m2|cena_m2|price.*m2/])),
    pricePerHa: toNumber(findFirst([/cena.*ha|ha.*cena|cena_za_ha|cena_ha/])),
    date: tryParseDate(findFirst([/data.*transak|data_trans|transakcja_data|^data$|date/])),
    rawType: (findFirst([/rodzaj|typ|kategor|przedmiot/]) as string | null) ?? null,
    attrs: p,
  };
}

async function fetchFeaturesJson(endpoint: string, layer: string, bbox: [number, number, number, number], bboxCrs: string): Promise<{ raw: any; snippet: string } | null> {
  const bboxStr = bboxCrs === "EPSG:4326"
    ? `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]},EPSG:4326` // WFS 2.0 + 4326 → lat,lon
    : `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},${bboxCrs}`;
  const url =
    `${endpoint}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(layer)}&outputFormat=application/json` +
    `&bbox=${encodeURIComponent(bboxStr)}&count=500`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 25_000);
  if (!res.ok) return null;
  const txt = await res.text();
  try {
    return { raw: JSON.parse(txt), snippet: txt.slice(0, 600) };
  } catch {
    return null;
  }
}

async function fetchFeaturesGml(endpoint: string, layer: string, bbox: [number, number, number, number], bboxCrs: string): Promise<{ features: Record<string, unknown>[]; snippet: string } | null> {
  const bboxStr = bboxCrs === "EPSG:4326"
    ? `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]},EPSG:4326`
    : `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},${bboxCrs}`;
  const url =
    `${endpoint}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(layer)}` +
    `&bbox=${encodeURIComponent(bboxStr)}&count=500`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/xml" } }, 25_000);
  if (!res.ok) return null;
  const xml = await res.text();
  try {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseAttributeValue: true });
    const parsed = parser.parse(xml) as any;
    const fc = parsed?.FeatureCollection ?? parsed?.featureCollection ?? parsed;
    let members: any[] = [];
    const m1 = fc?.member ?? fc?.featureMember ?? fc?.featureMembers;
    if (Array.isArray(m1)) members = m1;
    else if (m1) members = [m1];
    const features = members.map((m: any) => {
      const inner = typeof m === "object" ? Object.values(m)[0] : m;
      return (typeof inner === "object" && inner) ? (inner as Record<string, unknown>) : {};
    });
    return { features, snippet: xml.slice(0, 600) };
  } catch {
    return null;
  }
}

export interface RcnBenchmarkResult {
  stats: RcnStats | null;
  transactionsCount: number;
  radiusKm: number | null;
  diagnostics: RcnDiagnostics;
}

export async function rcnBenchmark(args: {
  lat: number;
  lng: number;
  propertyType: PropertyType | string;
}): Promise<RcnBenchmarkResult> {
  const diag = emptyDiag();
  const { lat, lng, propertyType } = args;
  diag.inputCoordinates = { lat, lng, crs: "EPSG:4326" };
  const typeStr = String(propertyType);
  diag.propertyTypeMapping.applicationType = typeStr;
  const keywords = TYPE_KEYWORDS[typeStr] ?? [];
  diag.propertyTypeMapping.keywords = keywords;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    diag.status = "missing_coordinates";
    diag.statusMessage = "Brak współrzędnych nieruchomości.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // 1) GetCapabilities — wybór endpointu i warstwy
  let endpoint: string | null = null;
  let layers: string[] = [];
  for (const ep of WFS_ENDPOINTS) {
    const cap = await fetchCapabilities(ep);
    if (cap && cap.layers.length > 0) { endpoint = ep; layers = cap.layers; break; }
  }
  diag.capabilitiesChecked = true;
  diag.availableLayers = layers;

  if (!endpoint) {
    diag.status = "wfs_capabilities_failed";
    diag.statusMessage = "Nie udało się pobrać GetCapabilities z żadnego endpointu RCN.";
    diag.errorTechnical = `Próbowano: ${WFS_ENDPOINTS.join(", ")}`;
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }
  diag.endpoint = endpoint;

  const candidateLayers = pickLayers(layers, keywords);
  diag.propertyTypeMapping.matchedLayerKeywords = candidateLayers;
  if (candidateLayers.length === 0) {
    diag.status = "wfs_layer_not_found";
    diag.statusMessage = "Nie znaleziono warstwy RCN pasującej do typu nieruchomości.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // 2) Eskalacja promienia (1km → 10km diagnostycznie)
  const radii = [1000, 2000, 5000, 10000];
  diag.radiiTried = radii;

  const isLand = typeStr === "grunt_rolny" || typeStr === "dzialka_budowlana" || typeStr === "dzialka_zabudowana";
  let allRaw: RcnFeatureRaw[] = [];
  let chosenRadius: number | null = null;
  let chosenLayer: string | null = null;
  let chosenCrs: "EPSG:4326" | "EPSG:2180" = "EPSG:4326";

  for (const r of radii) {
    let success = false;
    for (const layer of candidateLayers) {
      // Próbujemy CRS EPSG:4326 → potem EPSG:2180
      for (const crs of ["EPSG:4326", "EPSG:2180"] as const) {
        const bbox = crs === "EPSG:4326" ? bboxAround4326(lat, lng, r) : bboxAround2180(lat, lng, r);
        diag.queryBbox = { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3], crs };
        diag.crsUsed = crs;
        diag.layerUsed = layer;
        diag.radiusM = r;

        try {
          const jsonResp = await fetchFeaturesJson(endpoint, layer, bbox, crs);
          if (jsonResp) {
            const feats: any[] = jsonResp.raw?.features ?? [];
            diag.rawResponseSnippet = jsonResp.snippet;
            if (feats.length > 0) {
              allRaw = feats.map((f) => extractFromProps((f?.properties ?? {}) as Record<string, unknown>));
              diag.sampleFeature = feats[0]?.properties ?? null;
              success = true;
              chosenRadius = r; chosenLayer = layer; chosenCrs = crs;
              break;
            }
          } else {
            const gmlResp = await fetchFeaturesGml(endpoint, layer, bbox, crs);
            if (gmlResp) {
              diag.rawResponseSnippet = gmlResp.snippet;
              if (gmlResp.features.length > 0) {
                allRaw = gmlResp.features.map((p) => extractFromProps(p));
                diag.sampleFeature = gmlResp.features[0] ?? null;
                success = true;
                chosenRadius = r; chosenLayer = layer; chosenCrs = crs;
                break;
              }
            } else {
              diag.errorTechnical = `WFS odrzucił JSON i GML dla warstwy ${layer} (${crs}, r=${r}m).`;
            }
          }
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          diag.errorTechnical = msg;
          if (/abort|timeout/i.test(msg)) { diag.status = "wfs_timeout"; }
        }
      }
      if (success) break;
    }
    if (success) break;
  }

  if (allRaw.length === 0) {
    if (diag.errorTechnical && diag.status === "not_started") {
      diag.status = "wfs_request_failed";
      diag.statusMessage = "Nie udało się pobrać danych RCN z usługi WFS.";
    } else if (diag.status === "not_started") {
      diag.status = "no_features_in_bbox";
      diag.statusMessage = "Nie znaleziono transakcji RCN w analizowanym obszarze (do 10 km).";
    }
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  diag.featuresRawCount = allRaw.length;

  // 3) Liczniki okresów (przed filtrowaniem)
  const now = Date.now();
  const cutoff = (months: number) => now - months * 30 * 24 * 3600 * 1000;
  diag.periodCounts = {
    countAllDates: allRaw.length,
    countLast12Months: allRaw.filter((t) => !t.date || Date.parse(t.date) >= cutoff(12)).length,
    countLast24Months: allRaw.filter((t) => !t.date || Date.parse(t.date) >= cutoff(24)).length,
    countLast36Months: allRaw.filter((t) => !t.date || Date.parse(t.date) >= cutoff(36)).length,
  };

  // 4) Filtry typu — preferuj, ale nie wymuszaj
  diag.filtersApplied = [`propertyType=${typeStr}`];
  const matchType = (t: RcnFeatureRaw) => {
    if (keywords.length === 0 || !t.rawType) return true;
    const lr = t.rawType.toLowerCase();
    return keywords.some((k) => lr.includes(k));
  };

  // 5) Eskalacja okresu
  const periods: Array<{ months: number; freshness: RcnStats["freshness"] }> = [
    { months: 12, freshness: "good" },
    { months: 24, freshness: "limited" },
    { months: 36, freshness: "weak" },
  ];

  for (const p of periods) {
    diag.filtersApplied = [`propertyType=${typeStr}`, `periodMonths<=${p.months}`];
    const filtered = allRaw.filter((t) => {
      if (!matchType(t)) return false;
      if (!t.date) return true;
      const ts = Date.parse(t.date);
      return Number.isNaN(ts) ? true : ts >= cutoff(p.months);
    });
    const valuesRaw = filtered
      .map((t) => (isLand ? t.pricePerHa : t.pricePerM2))
      .filter((v): v is number => typeof v === "number" && v > 0);
    const values = filterIqrOutliers(valuesRaw);
    if (values.length >= 3) {
      diag.featuresFilteredCount = values.length;
      diag.status = "success";
      diag.statusMessage = `Znaleziono ${values.length} porównywalnych transakcji RCN (${chosenLayer}, r=${chosenRadius! / 1000} km, ${p.months} mies., CRS=${chosenCrs}).`;
      return {
        stats: {
          count: values.length,
          median: median(values),
          average: average(values),
          q1: quartile(values, 1),
          q3: quartile(values, 3),
          unit: isLand ? "pln_per_ha" : "pln_per_m2",
          radiusM: chosenRadius!,
          periodMonths: p.months,
          freshness: p.freshness,
        },
        transactionsCount: values.length,
        radiusKm: chosenRadius! / 1000,
        diagnostics: diag,
      };
    }
  }

  // 6) Dane były, ale wszystko odfiltrowane
  diag.featuresFilteredCount = 0;
  diag.status = "features_found_but_filtered_out";
  diag.statusMessage = "RCN zwrócił dane, ale po zastosowaniu filtrów (typ, daty, ceny) zostało zbyt mało rekordów.";
  return { stats: null, transactionsCount: allRaw.length, radiusKm: chosenRadius ? chosenRadius / 1000 : null, diagnostics: diag };
}

// Cache wrapper
export async function rcnBenchmarkCached(args: { lat: number; lng: number; propertyType: PropertyType | string }): Promise<RcnBenchmarkResult> {
  const key = `rcn2:${args.lat.toFixed(3)}:${args.lng.toFixed(3)}:${args.propertyType}`;
  return withCache("rcn_cache", key, 7, () => rcnBenchmark(args));
}

// Komunikat dla użytkownika zależny od statusu (do warstwy prezentacji).
export function rcnStatusMessage(status: RcnStatus): string {
  switch (status) {
    case "success": return "Znaleziono transakcje porównawcze w RCN.";
    case "no_features_in_bbox": return "Nie znaleziono transakcji RCN w analizowanym obszarze.";
    case "features_found_but_filtered_out": return "RCN zwrócił dane, ale nie znaleziono wystarczająco podobnych transakcji po zastosowaniu filtrów.";
    case "wfs_request_failed": return "Nie udało się pobrać danych RCN z usługi WFS.";
    case "wfs_timeout": return "Usługa RCN nie odpowiedziała w wymaganym czasie.";
    case "wfs_parse_error": return "Dane RCN zostały pobrane, ale aplikacja nie potrafiła ich poprawnie przetworzyć.";
    case "wfs_capabilities_failed": return "Nie udało się odczytać GetCapabilities z usługi RCN.";
    case "wfs_layer_not_found": return "Nie znaleziono warstwy RCN pasującej do typu nieruchomości.";
    case "bad_bbox": return "Błąd zapytania przestrzennego RCN — sprawdź współrzędne i układ odniesienia.";
    case "missing_coordinates": return "Brak współrzędnych nieruchomości — RCN nie został odpytany.";
    case "geocoding_failed": return "Nie udało się zgeokodować adresu — RCN nie został odpytany.";
    case "filter_too_strict": return "Filtry RCN okazały się zbyt restrykcyjne.";
    case "not_started": return "Diagnostyka RCN nie została uruchomiona.";
    default: return "Status RCN nieznany.";
  }
}
