// ULDK (GUGiK) — Usługa Lokalizacji Działek Katastralnych: działka ewidencyjna
// pod punktem. Czysty parser odpowiedzi + geometria (bez zależności serwerowych).
//
// Format odpowiedzi (request=GetParcelByXY, result=id,voivodeship,county,
// commune,region,parcel,geom_wkt, srid=4326):
//   linia 1: status ("0" = OK, "-1 ..." = brak / błąd)
//   linia 2: id|województwo|powiat|gmina|obręb|numer|SRID=4326;POLYGON((lng lat, …))

export interface UldkParcel {
  /** Identyfikator działki TERYT, np. 146510_8.0502.1/3. */
  id: string;
  number: string;
  region: string | null;
  commune: string | null;
  county: string | null;
  voivodeship: string | null;
  /** Powierzchnia z geometrii ewidencyjnej (m², przybliżenie geodezyjne). */
  areaM2: number | null;
  /** Obrys [lng, lat] (uproszczony do ≤ 200 punktów) — do mapy w raporcie. */
  polygon: Array<[number, number]>;
  source: "ULDK GUGiK";
  /**
   * Działka pod punktem geokodowania adresu — nie zawsze ta z KW (punkt adresu
   * bywa na drodze lub sąsiedniej działce). Do weryfikacji z działem I-O KW.
   */
  note: string;
}

export const ULDK_NOTE =
  "Działka ewidencyjna pod punktem lokalizacji adresu (ULDK GUGiK) — zweryfikuj z działem I-O KW; punkt adresowy może wskazywać sąsiednią działkę lub drogę.";

const MAX_POINTS = 200;

function parsePolygon(wkt: string): Array<[number, number]> {
  const m = wkt.match(/POLYGON\s*\(\(([^)]+)\)/i);
  if (!m) return [];
  const pts: Array<[number, number]> = [];
  for (const pair of m[1].split(",")) {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  if (pts.length <= MAX_POINTS) return pts;
  const step = Math.ceil(pts.length / MAX_POINTS);
  const out = pts.filter((_, i) => i % step === 0);
  out.push(pts[pts.length - 1]);
  return out;
}

/** Pole wielokąta [lng,lat] w m² (rzut równoodległościowy wokół środka — dokładność ~0,5% dla działek). */
export function polygonAreaM2(poly: Array<[number, number]>): number | null {
  if (poly.length < 3) return null;
  const lat0 = (poly.reduce((a, p) => a + p[1], 0) / poly.length) * (Math.PI / 180);
  const R = 6_371_008.8;
  const xy = poly.map(([lng, lat]) => [
    lng * (Math.PI / 180) * R * Math.cos(lat0),
    lat * (Math.PI / 180) * R,
  ]);
  let s = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    s += x1 * y2 - x2 * y1;
  }
  const area = Math.abs(s) / 2;
  return area > 0 ? Math.round(area) : null;
}

export function parseUldkResponse(text: string): UldkParcel | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines[0].trim() !== "0") return null;
  const f = lines[1].split("|");
  if (f.length < 7 || !f[0]) return null;
  const nul = (s: string | undefined) => (s && s.trim() ? s.trim() : null);
  const polygon = parsePolygon(f.slice(6).join("|"));
  return {
    id: f[0].trim(),
    voivodeship: nul(f[1]),
    county: nul(f[2]),
    commune: nul(f[3]),
    region: nul(f[4]),
    number: f[5]?.trim() || f[0].split(".").pop() || f[0],
    areaM2: polygonAreaM2(polygon),
    polygon,
    source: "ULDK GUGiK",
    note: ULDK_NOTE,
  };
}

/** Budynek ewidencyjny pod punktem (ULDK GetBuildingByXY). */
export interface UldkBuilding {
  /** Identyfikator budynku, np. 126105_9.0001.311.1_BUD. */
  id: string;
  /** Powierzchnia zabudowy z obrysu (m²) — NIE powierzchnia użytkowa. */
  footprintM2: number | null;
  polygon: Array<[number, number]>;
  source: "ULDK GUGiK (EGiB)";
}

export function parseUldkBuilding(text: string): UldkBuilding | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines[0].trim() !== "0") return null;
  const f = lines[1].split("|");
  if (f.length < 2 || !f[0]) return null;
  const polygon = parsePolygon(f.slice(1).join("|"));
  return {
    id: f[0].trim(),
    footprintM2: polygonAreaM2(polygon),
    polygon,
    source: "ULDK GUGiK (EGiB)",
  };
}
