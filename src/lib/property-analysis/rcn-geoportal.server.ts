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

// Cloudflare Workers często nie ma dostępu sieciowego do mapy.geoportal.gov.pl
// (filtry IP / brak DNS). Routujemy więc wszystkie żądania przez Supabase Edge
// Function `rcn-proxy`, która działa w Deno Deploy i ma normalne wyjście do internetu.
function proxify(target: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) return target; // fallback: bezpośrednio (np. lokalnie)
  return `${base}/functions/v1/rcn-proxy?action=proxy&url=${encodeURIComponent(target)}`;
}


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

export interface CapabilitiesAttempt {
  url: string;
  httpStatus: number | null;
  contentType: string;
  responseStartsWith: string;
  success: boolean;
  error: string;
}

function looksLikeCapabilitiesXml(text: string): boolean {
  return /WFS_Capabilities|WMS_Capabilities|FeatureTypeList|<\s*Layer[\s>]/i.test(text);
}

function parseLayersFromCapabilitiesXml(xml: string): string[] {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    const parsed = parser.parse(xml) as any;
    const root = parsed?.WFS_Capabilities ?? parsed?.Capabilities ?? parsed?.WMS_Capabilities ?? {};
    const ft = root?.FeatureTypeList?.FeatureType;
    if (ft) {
      const arr = Array.isArray(ft) ? ft : [ft];
      return arr.map((f: any) => String(f?.Name ?? "")).filter(Boolean);
    }
    // WMS fallback — zbierz warstwy z drzewa <Layer>
    const layers: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      const ls = node.Layer;
      if (ls) {
        const arr = Array.isArray(ls) ? ls : [ls];
        for (const l of arr) {
          const name = l?.Name;
          if (name) layers.push(String(name));
          walk(l);
        }
      }
    };
    walk(root);
    return layers;
  } catch {
    return [];
  }
}

/**
 * Testuje połączenie z usługą RCN GetCapabilities — kolejno WFS 2.0.0, 1.1.0, 1.0.0, WMS.
 * Zwraca pełną diagnostykę każdej próby.
 */
export async function testRcnCapabilities(): Promise<{
  attempts: CapabilitiesAttempt[];
  successfulUrl: string | null;
  successfulService: "WFS" | "WMS" | null;
  wfsSucceeded: boolean;
  wmsSucceeded: boolean;
  layers: string[];
  xml: string | null;
}> {
  const attempts: CapabilitiesAttempt[] = [];
  let successfulUrl: string | null = null;
  let successfulService: "WFS" | "WMS" | null = null;
  let wfsSucceeded = false;
  let wmsSucceeded = false;
  let layers: string[] = [];
  let xml: string | null = null;

  const urls: Array<{ url: string; service: "WFS" | "WMS" }> = [
    ...WFS_VERSIONS.map((v) => ({
      url: `${RCN_BASE_ENDPOINT}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=${v}`,
      service: "WFS" as const,
    })),
    { url: `${RCN_BASE_ENDPOINT}?SERVICE=WMS&REQUEST=GetCapabilities`, service: "WMS" },
  ];

  for (const { url, service } of urls) {
    const attempt: CapabilitiesAttempt = {
      url,
      httpStatus: null,
      contentType: "",
      responseStartsWith: "",
      success: false,
      error: "",
    };
    try {
      const res = await fetchWithTimeout(url, { headers: RCN_HEADERS }, RCN_TIMEOUT_MS);
      attempt.httpStatus = res.status;
      attempt.contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      attempt.responseStartsWith = text.slice(0, 300);
      if (res.ok && looksLikeCapabilitiesXml(text)) {
        attempt.success = true;
        if (service === "WFS" && !wfsSucceeded) {
          wfsSucceeded = true;
          successfulUrl = url;
          successfulService = "WFS";
          layers = parseLayersFromCapabilitiesXml(text);
          xml = text;
        } else if (service === "WMS") {
          wmsSucceeded = true;
          if (!wfsSucceeded) {
            successfulUrl = url;
            successfulService = "WMS";
          }
        }
      } else if (!res.ok) {
        attempt.error = `HTTP ${res.status}`;
      } else {
        attempt.error = "Odpowiedź nie wygląda na XML GetCapabilities";
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      attempt.error = /abort|timeout/i.test(msg) ? `timeout po ${RCN_TIMEOUT_MS} ms` : msg;
    }
    attempts.push(attempt);
    // Jeśli WFS już zadziałał, możemy przerwać po WFS (sprawdzanie WMS pozostawiamy dla pełności diagnostyki tylko gdy WFS padło).
    if (wfsSucceeded && service === "WFS") break;
  }

  return { attempts, successfulUrl, successfulService, wfsSucceeded, wmsSucceeded, layers, xml };
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

  // 1) GetCapabilities — testujemy WFS 2.0.0 → 1.1.0 → 1.0.0 → WMS i zapisujemy pełną diagnostykę.
  const capTest = await testRcnCapabilities();
  diag.capabilitiesChecked = true;
  diag.capabilitiesAttempts = capTest.attempts;
  diag.availableLayers = capTest.layers;

  if (!capTest.wfsSucceeded) {
    if (capTest.wmsSucceeded) {
      diag.status = "wms_capabilities_success_but_wfs_failed";
      diag.statusMessage =
        "WMS RCN działa, ale WFS RCN GetCapabilities nie zwrócił poprawnej odpowiedzi. To błąd techniczny integracji WFS, nie brak transakcji.";
    } else {
      diag.status = "capabilities_failed";
      diag.statusMessage =
        "Nie udało się połączyć z usługą RCN GetCapabilities. To błąd techniczny integracji albo dostępności usługi, a nie informacja o braku transakcji RCN.";
    }
    diag.errorTechnical = capTest.attempts
      .map((a) => `${a.url} → ${a.httpStatus ?? "no-status"} ${a.error || "ok"}`)
      .join(" | ");
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // WFS GetCapabilities OK
  diag.endpoint = capTest.successfulUrl;
  const layers = capTest.layers;
  if (layers.length === 0) {
    diag.status = "no_layers_detected";
    diag.statusMessage =
      "RCN GetCapabilities odpowiedział poprawnie, ale nie wykryto żadnych warstw FeatureType. Sprawdź konfigurację usługi.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }
  // status pośredni: warstwy wykryte — kontynuujemy do GetFeature
  diag.status = "layers_detected";
  diag.statusMessage = `Wykryto ${layers.length} warstw RCN. Próbuję pobrać GetFeature.`;

  const candidateLayers = pickLayers(layers, keywords);
  diag.propertyTypeMapping.matchedLayerKeywords = candidateLayers;
  if (candidateLayers.length === 0) {
    diag.status = "wfs_layer_not_found";
    diag.statusMessage = "Wykryto warstwy RCN, ale żadna nie pasuje do typu nieruchomości.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // Endpoint bazowy do GetFeature (nie URL GetCapabilities — usuwamy querystring).
  const featureEndpoint = RCN_BASE_ENDPOINT;


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
          const jsonResp = await fetchFeaturesJson(featureEndpoint, layer, bbox, crs);

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
            const gmlResp = await fetchFeaturesGml(featureEndpoint, layer, bbox, crs);

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
    if (diag.errorTechnical) {
      diag.status = "getfeature_failed";
      diag.statusMessage = "GetFeature nie zwrócił danych z powodu błędu technicznego.";
    } else {
      diag.status = "no_features";
      diag.statusMessage = "GetCapabilities OK, GetFeature OK — ale w analizowanym obszarze (do 10 km) nie znaleziono transakcji RCN.";
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
    case "capabilities_failed": return "Nie udało się połączyć z usługą RCN GetCapabilities. To błąd techniczny integracji albo dostępności usługi, a nie informacja o braku transakcji RCN.";
    case "capabilities_success": return "RCN GetCapabilities odpowiedział poprawnie.";
    case "wms_capabilities_success_but_wfs_failed": return "WMS RCN działa, ale WFS RCN nie zwrócił GetCapabilities — błąd integracji WFS.";
    case "layers_detected": return "Wykryto warstwy RCN.";
    case "no_layers_detected": return "RCN GetCapabilities OK, ale nie wykryto żadnych warstw.";
    case "getfeature_success": return "GetFeature RCN zwrócił dane.";
    case "getfeature_failed": return "GetFeature RCN nie powiódł się technicznie.";
    case "features_found": return "Znaleziono obiekty RCN w analizowanym obszarze.";
    case "no_features": return "GetCapabilities i GetFeature OK, ale w analizowanym obszarze nie znaleziono transakcji RCN.";

    default: return "Status RCN nieznany.";
  }
}
