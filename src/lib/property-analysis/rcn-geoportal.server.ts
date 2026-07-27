// RCN — rzeczywiste transakcje porównawcze z lokalnej bazy `rcn_transactions`
// (wgranej z publicznego zbioru CC0 deweloperuch/rejestr-cen-nieruchomosci, format GML).
//
// Zastępuje wcześniejsze odpytywanie Geoportal WMS GetFeatureInfo na żywo: dane trzymamy
// u siebie i odpytujemy po współrzędnych (bounding-box + eskalacja promienia i okresu).
// Nazwa pliku zachowana dla kompatybilności importów (gov-benchmark, diagnostyka RCN).
//
// UWAGA: zbiór obejmuje wybrane miasta — poza nimi RCN zwróci „brak danych" i wycena
// zejdzie na źródło zapasowe (GUS BDL). Import danych: `scripts/import-rcn.ts`.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PropertyType, RcnStats, RcnDiagnostics, RcnStatus } from "./types";
import { average, filterIqrOutliers, median, quartile, withCache } from "./cache.server";
import type { RcnPropertyKind } from "./rcn-gml";

// Tabela rcn_transactions nie jest jeszcze w wygenerowanych typach Supabase —
// dostęp przez rzutowanie (typy regenerują się w pipeline Supabase/Lovable).
const db = supabaseAdmin as unknown as { from: (t: string) => any };

// Mapowanie typu nieruchomości → rodzaje obiektów w bazie RCN (kolejność = priorytet).
const TYPE_TO_KINDS: Record<string, RcnPropertyKind[]> = {
  mieszkanie: ["lokal", "budynek"],
  lokal_uslugowy: ["lokal", "budynek"],
  dom: ["budynek"],
  dzialka_budowlana: ["dzialka"],
  dzialka_zabudowana: ["dzialka", "budynek"],
  grunt_rolny: ["dzialka"],
  inna: ["lokal", "budynek", "dzialka"],
};

// Promienie eskalacji (m) — dla lokali/budynków gęstsza siatka, dla gruntów szersza.
const RADII_BUILDINGS = [500, 1000, 2000, 4000];
const RADII_LAND = [1000, 3000, 6000, 12000];

const MIN_DESIRED = 3;

interface RcnRow {
  lat: number;
  lng: number;
  tx_date: string | null;
  price_per_m2: number | null;
  price_per_ha: number | null;
  property_kind: string;
}

function emptyDiag(): RcnDiagnostics {
  return {
    status: "not_started",
    statusMessage: "Diagnostyka nieuruchomiona.",
    endpoint: "supabase://rcn_transactions",
    availableLayers: [],
    layerUsed: null,
    crsUsed: "EPSG:4326",
    inputCoordinates: { lat: null, lng: null, crs: "EPSG:4326" },
    queryBbox: null,
    radiusM: null,
    radiiTried: [],
    featuresRawCount: 0,
    featuresFilteredCount: 0,
    filtersApplied: [],
    periodCounts: {
      countAllDates: 0,
      countLast12Months: 0,
      countLast24Months: 0,
      countLast36Months: 0,
    },
    sampleFeature: null,
    rawResponseSnippet: null,
    errorTechnical: null,
    capabilitiesChecked: false,
    propertyTypeMapping: { applicationType: null, keywords: [], matchedLayerKeywords: [] },
  };
}

// Bounding-box w stopniach wokół punktu (WGS84).
function degreeBox(
  lat: number,
  lng: number,
  radiusM: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

async function queryRows(
  lat: number,
  lng: number,
  radiusM: number,
  kinds: RcnPropertyKind[],
  isLand: boolean,
): Promise<{ rows: RcnRow[]; error: string | null }> {
  const box = degreeBox(lat, lng, radiusM);
  const valueCol = isLand ? "price_per_ha" : "price_per_m2";
  const { data, error } = await db
    .from("rcn_transactions")
    .select("lat, lng, tx_date, price_per_m2, price_per_ha, property_kind")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng)
    .in("property_kind", kinds)
    .not(valueCol, "is", null)
    .limit(5000);
  return { rows: (data ?? []) as RcnRow[], error: error?.message ?? null };
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

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    diag.status = "missing_coordinates";
    diag.statusMessage = "Brak współrzędnych nieruchomości.";
    return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
  }

  const isLand =
    typeStr === "grunt_rolny" ||
    typeStr === "dzialka_budowlana" ||
    typeStr === "dzialka_zabudowana";
  const kinds = TYPE_TO_KINDS[typeStr] ?? TYPE_TO_KINDS.inna;
  diag.availableLayers = kinds;
  diag.propertyTypeMapping.matchedLayerKeywords = kinds;
  const radii = isLand ? RADII_LAND : RADII_BUILDINGS;

  // Eskalacja promienia — aż zbierzemy statystycznie sensowną próbkę.
  let rows: RcnRow[] = [];
  let chosenRadius: number | null = null;
  for (const r of radii) {
    diag.radiiTried.push(r);
    const res = await queryRows(lat, lng, r, kinds, isLand);
    if (res.error) {
      diag.status = "wfs_request_failed";
      diag.statusMessage = "Nie udało się odczytać transakcji RCN z bazy (rcn_transactions).";
      diag.errorTechnical = res.error;
      return { stats: null, transactionsCount: 0, radiusKm: null, diagnostics: diag };
    }
    rows = res.rows;
    chosenRadius = r;
    diag.radiusM = r;
    const box = degreeBox(lat, lng, r);
    diag.queryBbox = {
      minX: box.minLng,
      minY: box.minLat,
      maxX: box.maxLng,
      maxY: box.maxLat,
      crs: "EPSG:4326",
    };
    if (rows.length >= MIN_DESIRED) break;
  }
  diag.featuresRawCount = rows.length;
  if (rows[0]) diag.sampleFeature = rows[0] as unknown as Record<string, any>;

  if (rows.length === 0) {
    diag.status = "no_features";
    diag.statusMessage =
      "Brak transakcji RCN w bazie w analizowanym promieniu (zbiór obejmuje wybrane miasta — poza nimi wycena korzysta z GUS BDL).";
    return {
      stats: null,
      transactionsCount: 0,
      radiusKm: chosenRadius ? chosenRadius / 1000 : null,
      diagnostics: diag,
    };
  }

  const valOf = (row: RcnRow) => (isLand ? row.price_per_ha : row.price_per_m2);

  // Liczniki okresów (przed filtrowaniem).
  const now = Date.now();
  const cutoff = (months: number) => now - months * 30 * 24 * 3600 * 1000;
  diag.periodCounts = {
    countAllDates: rows.length,
    countLast12Months: rows.filter((t) => !t.tx_date || Date.parse(t.tx_date) >= cutoff(12)).length,
    countLast24Months: rows.filter((t) => !t.tx_date || Date.parse(t.tx_date) >= cutoff(24)).length,
    countLast36Months: rows.filter((t) => !t.tx_date || Date.parse(t.tx_date) >= cutoff(36)).length,
  };

  // Eskalacja okresu i agregacja.
  const periods: Array<{ months: number; freshness: RcnStats["freshness"] }> = [
    { months: 12, freshness: "good" },
    { months: 24, freshness: "limited" },
    { months: 36, freshness: "weak" },
    { months: 120, freshness: "weak" },
  ];

  for (const p of periods) {
    diag.filtersApplied = [
      `propertyType=${typeStr}`,
      `kinds=${kinds.join("|")}`,
      `periodMonths<=${p.months}`,
    ];
    const filtered = rows.filter((t) => {
      if (!t.tx_date) return true;
      const ts = Date.parse(t.tx_date);
      return Number.isNaN(ts) ? true : ts >= cutoff(p.months);
    });
    const valuesRaw = filtered
      .map(valOf)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const values = filterIqrOutliers(valuesRaw);
    if (values.length >= MIN_DESIRED) {
      diag.featuresFilteredCount = values.length;
      diag.status = "success";
      diag.statusMessage = `Znaleziono ${values.length} transakcji RCN (rodzaje=${kinds.join("/")}, r=${(chosenRadius! / 1000).toFixed(2)} km, okres ${p.months} mies.).`;
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
    "RCN: znaleziono rekordy w bazie, ale po filtrach (cena/powierzchnia, daty) zostało zbyt mało do statystyki.";
  return {
    stats: null,
    transactionsCount: rows.length,
    radiusKm: chosenRadius ? chosenRadius / 1000 : null,
    diagnostics: diag,
  };
}

// Cache wrapper — wynik keyowany po zaokrąglonych współrzędnych i typie.
export async function rcnBenchmarkCached(args: {
  lat: number;
  lng: number;
  propertyType: PropertyType | string;
}): Promise<RcnBenchmarkResult> {
  const key = `rcn-db1:${args.lat.toFixed(3)}:${args.lng.toFixed(3)}:${args.propertyType}`;
  return withCache("rcn_cache", key, 7, () => rcnBenchmark(args));
}

// Komunikat dla użytkownika zależny od statusu.
export function rcnStatusMessage(status: RcnStatus): string {
  switch (status) {
    case "success":
      return "Znaleziono transakcje porównawcze w RCN.";
    case "no_features":
      return "Brak transakcji RCN w bazie w analizowanym obszarze (zbiór obejmuje wybrane miasta).";
    case "no_features_in_bbox":
      return "Nie znaleziono transakcji RCN w analizowanym obszarze.";
    case "features_found_but_filtered_out":
      return "RCN zwrócił rekordy, ale za mało po zastosowaniu filtrów.";
    case "features_found":
      return "Znaleziono transakcje RCN w analizowanym obszarze.";
    case "wfs_request_failed":
      return "Nie udało się odczytać transakcji RCN z bazy.";
    case "missing_coordinates":
      return "Brak współrzędnych — RCN nie odpytany.";
    case "geocoding_failed":
      return "Nie udało się zgeokodować adresu — RCN nie odpytany.";
    case "filter_too_strict":
      return "Filtry RCN zbyt restrykcyjne.";
    case "not_started":
      return "Diagnostyka RCN nie została uruchomiona.";
    default:
      return "Status RCN nieznany.";
  }
}
