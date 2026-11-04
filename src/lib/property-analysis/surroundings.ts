// Otoczenie nieruchomości z otwartych źródeł — typy i czysta logika.
//  • obszary chronione: Natura 2000 (SOO/OSO) i krajowe formy ochrony
//    przyrody (park narodowy, rezerwat, park krajobrazowy, OChK…) — EEA,
//  • uciążliwości w okolicy: drogi szybkiego ruchu, kolej, lotniska, linie
//    WN, przemysł, wysypiska, oczyszczalnie, cmentarze, wiatraki — OSM,
//  • budynek ewidencyjny pod punktem (ULDK/EGiB) — powierzchnia zabudowy,
//  • statystyki powiatu (GUS BDL): ludność i jej zmiana, saldo migracji,
//    bezrobocie, wynagrodzenia względem średniej krajowej.
import type { UldkBuilding } from "./uldk";

export interface ProtectedAreaHit {
  kind: "natura2000" | "krajowa";
  code: string | null;
  name: string;
  /** Np. „Obszar specjalnej ochrony ptaków (OSO)”, „Park krajobrazowy”. */
  type: string;
}

export interface ProtectedAreasInfo {
  status: "checked" | "unavailable";
  areas: ProtectedAreaHit[];
  note: string;
}

/** Kody krajowych form ochrony przyrody (CDDA, Polska). */
export const PL_DESIGNATION_LABEL: Record<string, string> = {
  PL01: "Park narodowy",
  PL02: "Rezerwat przyrody",
  PL03: "Park krajobrazowy",
  PL04: "Obszar chronionego krajobrazu",
};

export function natura2000Type(siteType: string | null | undefined, layerName: string): string {
  const t = String(siteType ?? "").toUpperCase();
  if (t === "A" || (/birds directive/i.test(layerName) && !/habitats/i.test(layerName)))
    return "Natura 2000 — obszar specjalnej ochrony ptaków (OSO)";
  if (t === "B" || (/habitats directive/i.test(layerName) && !/birds/i.test(layerName)))
    return "Natura 2000 — specjalny obszar ochrony siedlisk (SOO)";
  return "Natura 2000 — obszar ptasi i siedliskowy";
}

export type NuisanceKey =
  | "motorway"
  | "mainRoad"
  | "railway"
  | "airport"
  | "powerLine"
  | "industrial"
  | "landfill"
  | "wastewater"
  | "cemetery"
  | "windTurbine";

export const NUISANCE_LABEL: Record<NuisanceKey, string> = {
  motorway: "Autostrada / droga ekspresowa",
  mainRoad: "Droga krajowa / główna",
  railway: "Linia kolejowa",
  airport: "Lotnisko",
  powerLine: "Linia wysokiego napięcia",
  industrial: "Teren przemysłowy",
  landfill: "Wysypisko / składowisko odpadów",
  wastewater: "Oczyszczalnia ścieków",
  cemetery: "Cmentarz",
  windTurbine: "Turbina wiatrowa",
};

/** Odległość, poniżej której uciążliwość zaznaczamy jako istotną dla wyceny (m). */
export const NUISANCE_ALERT_M: Record<NuisanceKey, number> = {
  motorway: 300,
  mainRoad: 100,
  railway: 200,
  airport: 3000,
  powerLine: 100,
  industrial: 300,
  landfill: 1000,
  wastewater: 500,
  cemetery: 150,
  windTurbine: 700,
};

export interface NuisanceHit {
  key: NuisanceKey;
  name: string | null;
  distanceM: number;
  alert: boolean;
}

export interface NuisancesInfo {
  status: "checked" | "unavailable";
  radiusM: number;
  hits: NuisanceHit[];
  note: string;
}

export interface PowiatStats {
  status: "checked" | "unavailable";
  unitName: string | null;
  year: string | null;
  population: number | null;
  /** Zmiana ludności w ciągu 5 lat (%). */
  populationChange5yPct: number | null;
  /** Saldo migracji na 1000 mieszkańców. */
  migrationPer1000: number | null;
  unemploymentPct: number | null;
  unemploymentPolandPct: number | null;
  /** Przeciętne wynagrodzenie brutto, Polska = 100. */
  wageIndexPl100: number | null;
  note: string;
}

export interface SurroundingsInfo {
  protectedAreas: ProtectedAreasInfo | null;
  nuisances: NuisancesInfo | null;
  building: UldkBuilding | null;
  powiat: PowiatStats | null;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Odległość punktu od łamanej (m): do najbliższego ODCINKA, nie wierzchołka —
 * długi prosty odcinek drogi może przebiegać tuż obok domu, mając wierzchołki
 * setki metrów dalej. Rzut równoodległościowy wokół punktu (dokładny w skali km).
 */
export function distanceToPolyline(
  lat: number,
  lng: number,
  pts: Array<{ lat: number; lon: number }>,
): number {
  if (pts.length === 1) return haversine(lat, lng, pts[0].lat, pts[0].lon);
  const kx = 111_320 * Math.cos(toRad(lat));
  const ky = 110_574;
  const xy = pts.map((p) => [(p.lon - lng) * kx, (p.lat - lat) * ky] as const);
  let best = Infinity;
  for (let i = 0; i < xy.length - 1; i += 1) {
    const [ax, ay] = xy[i];
    const [bx, by] = xy[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

/** Kategoria uciążliwości z tagów OSM (null = spoza listy). */
export function nuisanceKey(tags: Record<string, string>): NuisanceKey | null {
  const hw = tags.highway;
  if (hw === "motorway" || hw === "trunk") return "motorway";
  if (hw === "primary") return "mainRoad";
  if (tags.railway === "rail" && !tags.service) return "railway";
  if (tags.aeroway === "aerodrome") return "airport";
  if (tags.power === "line") return "powerLine";
  if (tags.power === "generator" && tags["generator:source"] === "wind") return "windTurbine";
  if (tags.landuse === "landfill") return "landfill";
  if (tags.man_made === "wastewater_plant") return "wastewater";
  if (tags.landuse === "cemetery" || tags.amenity === "grave_yard") return "cemetery";
  if (tags.landuse === "industrial") return "industrial";
  return null;
}

/** Najbliższy obiekt każdej kategorii z odpowiedzi Overpass (`out geom`/`center`). */
export function nearestNuisances(
  lat: number,
  lng: number,
  elements: Array<{
    tags?: Record<string, string>;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    geometry?: Array<{ lat: number; lon: number }>;
  }>,
): NuisanceHit[] {
  const best = new Map<NuisanceKey, NuisanceHit>();
  for (const el of elements) {
    const key = nuisanceKey(el.tags ?? {});
    if (!key) continue;
    // Linia WN: tylko ≥ 110 kV.
    if (key === "powerLine") {
      const v = Math.max(
        ...String(el.tags?.voltage ?? "0")
          .split(/[;,]/)
          .map(Number)
          .filter(Number.isFinite),
        0,
      );
      if (v < 110_000) continue;
    }
    const pts = el.geometry?.length
      ? el.geometry
      : el.center
        ? [el.center]
        : el.lat != null && el.lon != null
          ? [{ lat: el.lat, lon: el.lon }]
          : [];
    if (!pts.length) continue;
    const d = Math.round(distanceToPolyline(lat, lng, pts));
    const prev = best.get(key);
    if (!prev || d < prev.distanceM) {
      best.set(key, {
        key,
        name: (el.tags?.name ?? el.tags?.ref ?? null)?.slice(0, 80) ?? null,
        distanceM: d,
        alert: d <= NUISANCE_ALERT_M[key],
      });
    }
  }
  return [...best.values()].sort((a, b) => a.distanceM - b.distanceM);
}
