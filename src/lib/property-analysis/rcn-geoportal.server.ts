// RCN / Geoportal — pobieranie transakcji porównawczych przez WMS GetFeatureInfo
// z pełną diagnostyką.
//
// WAŻNE: Usługa RCN GUGiK https://mapy.geoportal.gov.pl/wss/service/rcn jest WYŁĄCZNIE WMS 1.3.0
// (NIE WFS). Pobieranie danych odbywa się przez WMS GetFeatureInfo na warstwach:
//   - lokale  (mieszkania)        — maxScaleDenominator ≈ 2000
//   - budynki (domy/budynki)      — maxScaleDenominator ≈ 2000
//   - dzialki (działki/grunty)    — maxScaleDenominator ≈ 5001
//   - powiaty (granice powiatów, do skali ≥ 5001)
// GetFeatureInfo wymaga: STYLES=&CRS=EPSG:2180&BBOX=...&WIDTH&HEIGHT&I&J&INFO_FORMAT=application/vnd.ogc.gml.
//
// Wszystko działa po stronie serwera. Cloudflare Workers nie mają sieciowego dostępu do
// mapy.geoportal.gov.pl, więc każde żądanie idzie przez Supabase Edge Function `rcn-proxy`
// (akcja `proxy` — generyczny pass-through, whitelist hosta geoportalu).

import { XMLParser } from "fast-xml-parser";
import proj4 from "proj4";
import type { PropertyType, RcnStats, RcnDiagnostics, RcnStatus } from "./types";
import { average, fetchWithTimeout, filterIqrOutliers, median, quartile, withCache } from "./cache.server";

// EPSG:2180 (PUWG 1992) — natywny CRS warstw RCN.
proj4.defs(
  "EPSG:2180",
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

const RCN_BASE_ENDPOINT = "https://mapy.geoportal.gov.pl/wss/service/rcn";
const RCN_TIMEOUT_MS = 25_000;

// Proxy przez Supabase Edge Function — Workers nie mają wyjścia do geoportalu.
function proxify(target: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) return target;
  return `${base}/functions/v1/rcn-proxy?action=proxy&url=${encodeURIComponent(target)}`;
}

// Mapowanie typu nieruchomości → warstwa WMS RCN.
const TYPE_TO_LAYER: Record<string, string[]> = {
  mieszkanie: ["lokale"],
  lokal_uslugowy: ["lokale", "budynki"],
  dom: ["budynki"],
  dzialka_budowlana: ["dzialki"],
  dzialka_zabudowana: ["dzialki"],
  grunt_rolny: ["dzialki"],
  inna: ["lokale", "budynki", "dzialki"],
};

// Promień (m) i krok siatki sond GetFeatureInfo zależnie od typu warstwy.
const LAYER_PROBE_CONFIG: Record<string, { radii: number[]; gridSize: number }> = {
  lokale: { radii: [200, 400, 800, 1500], gridSize: 6 },
  budynki: { radii: [200, 400, 800, 1500], gridSize: 6 },
  dzialki: { radii: [400, 800, 1500, 3000], gridSize: 5 },
};

interface RcnFeatureRaw {
  pricePerM2?: number | null;
  pricePerHa?: number | null;
  totalPrice?: number | null;
  areaM2?: number | null;
  areaHa?: number | null;
  date?: string | null;
  rawType?: string | null;
  layer: string;
  signature: string; // do deduplikacji
  attrs: Record<string, unknown>;
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

// --------- GetCapabilities WMS ---------

export async function testRcnCapabilities(): Promise<{
  attempts: CapabilitiesAttempt[];
  successfulUrl: string | null;
  layers: string[];
  xml: string | null;
}> {
  const url = `${RCN_BASE_ENDPOINT}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;
  const attempt: CapabilitiesAttempt = {
    url,
    httpStatus: null,
    contentType: "",
    responseStartsWith: "",
    success: false,
    error: "",
  };
  try {
    const res = await fetchWithTimeout(
      proxify(url),
      { headers: { Accept: "application/xml,text/xml,*/*" } },
      RCN_TIMEOUT_MS,
    );
    attempt.httpStatus = res.status;
    attempt.contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    attempt.responseStartsWith = text.slice(0, 300);
    if (res.ok && /WMS_Capabilities|wms_capabilities/i.test(text)) {
      attempt.success = true;
      const layers = parseLayerNamesFromWms(text);
      return { attempts: [attempt], successfulUrl: url, layers, xml: text };
    }
    attempt.error = res.ok ? "Odpowiedź nie wygląda na WMS_Capabilities" : `HTTP ${res.status}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    attempt.error = /abort|timeout/i.test(msg) ? `timeout po ${RCN_TIMEOUT_MS} ms` : msg;
  }
  return { attempts: [attempt], successfulUrl: null, layers: [], xml: null };
}

function parseLayerNamesFromWms(xml: string): string[] {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    const parsed = parser.parse(xml) as any;
    const layers: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const name = node.Name ?? node.name;
      if (typeof name === "string" || typeof name === "number") {
        const s = String(name).trim();
        if (s && !layers.includes(s)) layers.push(s);
      }
      for (const v of Object.values(node)) {
        if (v && typeof v === "object") walk(v);
      }
    };
    walk(parsed);
    // Odfiltruj nazwy serwisowe (np. "WMS")
    return layers.filter((l) => !/^wms$/i.test(l));
  } catch {
    return [];
  }
}


// --------- BBOX i grid sond ---------

function point2180(lat: number, lng: number): [number, number] {
  return proj4("EPSG:4326", "EPSG:2180", [lng, lat]) as [number, number];
}

function bbox2180(lat: number, lng: number, radiusM: number): [number, number, number, number] {
  const [x, y] = point2180(lat, lng);
  return [x - radiusM, y - radiusM, x + radiusM, y + radiusM];
}

// Oblicza minimalną szerokość obrazka żeby utrzymać scaleDenominator ≤ limit.
// scaleDenominator ≈ pixelSizeM * 1000 / 0.28
function widthForScale(bboxWidthM: number, scaleLimit: number): number {
  const maxPxSize = (scaleLimit * 0.28) / 1000; // m/pixel
  return Math.max(512, Math.ceil(bboxWidthM / maxPxSize));
}

// --------- GetFeatureInfo ---------

async function getFeatureInfo(
  layer: string,
  bbox: [number, number, number, number],
  width: number,
  height: number,
  i: number,
  j: number,
): Promise<string | null> {
  const url =
    `${RCN_BASE_ENDPOINT}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
    `&LAYERS=${layer}&QUERY_LAYERS=${layer}&STYLES=` +
    `&CRS=EPSG:2180&BBOX=${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}` +
    `&WIDTH=${width}&HEIGHT=${height}&I=${i}&J=${j}` +
    `&INFO_FORMAT=${encodeURIComponent("application/vnd.ogc.gml")}` +
    `&FEATURE_COUNT=50&FORMAT=image/png`;
  try {
    const res = await fetchWithTimeout(
      proxify(url),
      { headers: { Accept: "application/xml,text/xml,*/*" } },
      RCN_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Wyciąga obiekty (features) z msGMLOutput. MapServer zwraca strukturę:
// <msGMLOutput><{layer}_layer><{layer}_feature>...properties...</_feature></_layer></msGMLOutput>
function parseMsGmlFeatures(xml: string, layer: string): Array<Record<string, unknown>> {
  if (!xml || !xml.includes("msGMLOutput") || xml.includes("ServiceException")) return [];
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
    });
    const parsed = parser.parse(xml) as any;
    const root = parsed?.msGMLOutput ?? parsed?.msgmloutput ?? parsed;
    if (!root || typeof root !== "object") return [];
    const features: Array<Record<string, unknown>> = [];
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        const lk = key.toLowerCase();
        if (lk.endsWith("_feature") || lk === `${layer}_feature` || lk === "feature") {
          const arr = Array.isArray(value) ? value : [value];
          for (const f of arr) {
            if (f && typeof f === "object") features.push(flattenProps(f as Record<string, unknown>));
          }
        } else if (typeof value === "object") {
          walk(value);
        }
      }
    };
    walk(root);
    return features;
  } catch {
    return [];
  }
}

function flattenProps(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (v: unknown, prefix: string) => {
    if (v === null || v === undefined) return;
    if (typeof v !== "object") { out[prefix] = v; return; }
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${prefix}_${i}`)); return; }
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith("@_") || k === "boundedBy" || k === "Box" || k === "geometry") continue;
      const next = prefix ? `${prefix}.${k}` : k;
      visit(vv, next);
    }
  };
  visit(obj, "");
  return out;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tryParseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function extractFromProps(p: Record<string, unknown>, layer: string): RcnFeatureRaw {
  const keys = Object.keys(p);
  const findFirst = (rgxs: RegExp[]): unknown => {
    for (const r of rgxs) {
      const k = keys.find((kk) => r.test(kk.toLowerCase()));
      if (k) return p[k];
    }
    return null;
  };
  const pricePerM2 = toNumber(findFirst([/cena.*m2|m2.*cena|cena_za_m2|cena_m2|price.*m2|jednost.*cen/]));
  const pricePerHa = toNumber(findFirst([/cena.*ha|ha.*cena|cena_za_ha|cena_ha/]));
  const totalPrice = toNumber(findFirst([/cena_transakcyjna|cena_calk|cena_lacz|cena_n|^cena$/]));
  const areaM2 = toNumber(findFirst([/^pow$|powierzchnia$|pow_uzytk|pow_calk|pow_m2|area_m2/]));
  const areaHa = toNumber(findFirst([/pow_ha|powierzchnia_ha|area_ha/]));
  const date = tryParseDate(findFirst([/data.*transak|data_trans|transakcja_data|^data$|date/]));
  const rawType = (findFirst([/rodzaj|typ|kategor|przedmiot/]) as string | null) ?? null;

  return {
    pricePerM2: pricePerM2 ?? (totalPrice && areaM2 ? totalPrice / areaM2 : null),
    pricePerHa: pricePerHa ?? (totalPrice && areaHa ? totalPrice / areaHa : null),
    totalPrice,
    areaM2,
    areaHa,
    date,
    rawType,
    layer,
    signature: JSON.stringify(
      Object.entries(p)
        .filter(([k]) => !k.toLowerCase().includes("gml") && !k.toLowerCase().includes("geom"))
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
    attrs: p,
  };
}

// --------- Główna funkcja ---------

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
  diag.crsUsed = "EPSG:2180";
  const typeStr = String(propertyType);
  diag.propertyTypeMapping.applicationType = typeStr;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    diag.status = "missing_coordinates";
    diag.statusMessage = "Brak współrzędnych nieruchomości.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // 1) GetCapabilities (WMS)
  const cap = await testRcnCapabilities();
  diag.capabilitiesChecked = true;
  diag.capabilitiesAttempts = cap.attempts;
  diag.availableLayers = cap.layers;

  if (!cap.successfulUrl) {
    diag.status = "capabilities_failed";
    diag.statusMessage =
      "Nie udało się połączyć z usługą WMS RCN GetCapabilities. To błąd techniczny integracji albo dostępności usługi.";
    diag.errorTechnical = cap.attempts.map((a) => `${a.url} → ${a.httpStatus ?? "no-status"} ${a.error || "ok"}`).join(" | ");
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }
  diag.endpoint = cap.successfulUrl;
  if (cap.layers.length === 0) {
    diag.status = "no_layers_detected";
    diag.statusMessage = "WMS GetCapabilities OK, ale nie wykryto żadnych warstw.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // 2) Mapowanie typu → warstwa
  const candidateLayers = (TYPE_TO_LAYER[typeStr] ?? TYPE_TO_LAYER.inna).filter((l) => cap.layers.includes(l));
  diag.propertyTypeMapping.matchedLayerKeywords = candidateLayers;
  if (candidateLayers.length === 0) {
    diag.status = "wfs_layer_not_found";
    diag.statusMessage = `Wykryto warstwy WMS RCN (${cap.layers.join(", ")}), ale żadna nie pasuje do typu nieruchomości "${typeStr}".`;
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // 3) GetFeatureInfo — eskalacja warstwa × promień × siatka sond
  const isLand = typeStr === "grunt_rolny" || typeStr === "dzialka_budowlana" || typeStr === "dzialka_zabudowana";
  const allRaw: RcnFeatureRaw[] = [];
  const seenSig = new Set<string>();
  let chosenLayer: string | null = null;
  let chosenRadius: number | null = null;
  const radiiUsed: number[] = [];

  outer: for (const layer of candidateLayers) {
    const cfg = LAYER_PROBE_CONFIG[layer] ?? LAYER_PROBE_CONFIG.lokale;
    const scaleLimit = layer === "dzialki" ? 5000 : 2000;

    for (const radius of cfg.radii) {
      radiiUsed.push(radius);
      const bbox = bbox2180(lat, lng, radius);
      const bboxWidth = bbox[2] - bbox[0];
      const w = widthForScale(bboxWidth, scaleLimit);
      const h = w;
      diag.queryBbox = { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3], crs: "EPSG:2180" };
      diag.layerUsed = layer;
      diag.radiusM = radius;

      // Siatka sond I,J — równomierne pokrycie obrazka.
      const probes: Array<[number, number]> = [];
      const N = cfg.gridSize;
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          const i = Math.round(((col + 0.5) / N) * w);
          const j = Math.round(((row + 0.5) / N) * h);
          probes.push([i, j]);
        }
      }

      // Wykonujemy w batchach po 6 równolegle, żeby nie zatkać edge function.
      const batchSize = 6;
      const newThisRound: RcnFeatureRaw[] = [];
      for (let b = 0; b < probes.length; b += batchSize) {
        const batch = probes.slice(b, b + batchSize);
        const results = await Promise.all(
          batch.map(([i, j]) => getFeatureInfo(layer, bbox, w, h, i, j)),
        );
        for (const xml of results) {
          if (!xml) continue;
          if (!diag.rawResponseSnippet) diag.rawResponseSnippet = xml.slice(0, 800);
          const feats = parseMsGmlFeatures(xml, layer);
          for (const f of feats) {
            const raw = extractFromProps(f, layer);
            if (seenSig.has(raw.signature)) continue;
            seenSig.add(raw.signature);
            allRaw.push(raw);
            newThisRound.push(raw);
            if (!diag.sampleFeature) diag.sampleFeature = f;
          }
        }
      }

      if (newThisRound.length >= 3) {
        chosenLayer = layer;
        chosenRadius = radius;
        break outer;
      }
      if (allRaw.length >= 3) {
        chosenLayer = layer;
        chosenRadius = radius;
        break outer;
      }
    }
  }
  diag.radiiTried = radiiUsed;
  diag.featuresRawCount = allRaw.length;

  if (allRaw.length === 0) {
    diag.status = "no_features";
    diag.statusMessage =
      "WMS GetCapabilities OK, GetFeatureInfo OK — ale w analizowanym obszarze (do max. promienia) nie znaleziono transakcji RCN.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  // 4) Liczniki okresów (przed filtrowaniem)
  const now = Date.now();
  const cutoff = (months: number) => now - months * 30 * 24 * 3600 * 1000;
  diag.periodCounts = {
    countAllDates: allRaw.length,
    countLast12Months: allRaw.filter((t) => !t.date || Date.parse(t.date) >= cutoff(12)).length,
    countLast24Months: allRaw.filter((t) => !t.date || Date.parse(t.date) >= cutoff(24)).length,
    countLast36Months: allRaw.filter((t) => !t.date || Date.parse(t.date) >= cutoff(36)).length,
  };

  // 5) Eskalacja okresu i agregacja
  const periods: Array<{ months: number; freshness: RcnStats["freshness"] }> = [
    { months: 12, freshness: "good" },
    { months: 24, freshness: "limited" },
    { months: 36, freshness: "weak" },
    { months: 120, freshness: "weak" },
  ];

  for (const p of periods) {
    diag.filtersApplied = [`propertyType=${typeStr}`, `layer=${chosenLayer}`, `periodMonths<=${p.months}`];
    const filtered = allRaw.filter((t) => {
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
      diag.statusMessage = `Znaleziono ${values.length} porównywalnych transakcji RCN (warstwa=${chosenLayer}, r=${(chosenRadius! / 1000).toFixed(2)} km, okres ${p.months} mies., CRS=EPSG:2180).`;
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

  diag.featuresFilteredCount = 0;
  diag.status = "features_found_but_filtered_out";
  diag.statusMessage =
    "WMS RCN zwrócił dane, ale po zastosowaniu filtrów (typ, daty, ceny) zostało zbyt mało rekordów do statystyki.";
  return {
    stats: null,
    transactionsCount: allRaw.length,
    radiusKm: chosenRadius ? chosenRadius / 1000 : null,
    diagnostics: diag,
  };
}

// Cache wrapper
export async function rcnBenchmarkCached(args: {
  lat: number;
  lng: number;
  propertyType: PropertyType | string;
}): Promise<RcnBenchmarkResult> {
  const key = `rcn3:${args.lat.toFixed(3)}:${args.lng.toFixed(3)}:${args.propertyType}`;
  return withCache("rcn_cache", key, 7, () => rcnBenchmark(args));
}

// Komunikat dla użytkownika zależny od statusu.
export function rcnStatusMessage(status: RcnStatus): string {
  switch (status) {
    case "success": return "Znaleziono transakcje porównawcze w RCN.";
    case "no_features": return "WMS RCN OK, ale w analizowanym obszarze nie znaleziono transakcji.";
    case "no_features_in_bbox": return "Nie znaleziono transakcji RCN w analizowanym obszarze.";
    case "features_found_but_filtered_out": return "RCN zwrócił dane, ale za mało po zastosowaniu filtrów.";
    case "capabilities_failed": return "Nie udało się połączyć z WMS RCN GetCapabilities — błąd integracji.";
    case "capabilities_success": return "WMS RCN GetCapabilities OK.";
    case "wms_capabilities_success_but_wfs_failed": return "WMS RCN OK (WFS nie istnieje — RCN udostępnia tylko WMS).";
    case "layers_detected": return "Wykryto warstwy WMS RCN.";
    case "no_layers_detected": return "WMS GetCapabilities OK, brak warstw.";
    case "getfeature_success": return "GetFeatureInfo RCN zwrócił dane.";
    case "getfeature_failed": return "GetFeatureInfo RCN nie powiódł się technicznie.";
    case "features_found": return "Znaleziono obiekty RCN w analizowanym obszarze.";
    case "wfs_capabilities_failed": return "Legacy: WFS RCN nie istnieje — używamy WMS.";
    case "wfs_layer_not_found": return "Nie znaleziono warstwy WMS pasującej do typu nieruchomości.";
    case "wfs_request_failed": return "Nie udało się pobrać danych z WMS RCN.";
    case "wfs_timeout": return "WMS RCN nie odpowiedział w wymaganym czasie.";
    case "wfs_parse_error": return "Aplikacja nie potrafiła przetworzyć odpowiedzi WMS RCN.";
    case "bad_bbox": return "Błąd zapytania przestrzennego RCN.";
    case "missing_coordinates": return "Brak współrzędnych — RCN nie odpytany.";
    case "geocoding_failed": return "Nie udało się zgeokodować adresu — RCN nie odpytany.";
    case "filter_too_strict": return "Filtry RCN zbyt restrykcyjne.";
    case "not_started": return "Diagnostyka RCN nie została uruchomiona.";
    default: return "Status RCN nieznany.";
  }
}
