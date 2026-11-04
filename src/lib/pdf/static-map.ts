// Statyczna mapa do raportu PDF: kafelki OpenStreetMap składane w przeglądarce
// (canvas) + pinezka i obrys działki. Moduł ładowany wraz z generatorem PDF
// (dopiero po kliknięciu „Pobierz PDF”). Kafelki OSM mają CORS `*`, więc
// canvas nie jest „skażony” i daje się zapisać do PNG. Zgodnie z zasadami OSM
// mapa ma podpis „© OpenStreetMap contributors”, a liczba kafelków na mapę
// jest mała (≤ 12). Nakładki państwowych WMS (ISOK, KIMPZP) w EPSG:3857
// trafiają piksel w piksel w ten sam zakres.

export const OSM_TILE_URL = "https://tile.openstreetmap.org";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const TILE = 256;

export interface StaticMapSpec {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
  /** Pinezka w punkcie (false = mapa poglądowa bez dokładnego punktu). */
  marker?: boolean;
  /** Obrys działki [lng, lat]. */
  polygon?: Array<[number, number]> | null;
  /**
   * Podkład zamiast kafelków OSM (np. ortofotomapa pobrana przez serwer) —
   * obraz dokładnie w zakresie `bbox3857ForMap(spec)`.
   */
  baseImage?: { bytes: Uint8Array; mime: string } | null;
  /** Nakładki WMS (EPSG:3857, ten sam zakres) — np. strefy powodziowe, MPZP. */
  overlays?: Array<{ url: string; opacity?: number }>;
  /** Podpis źródeł obok atrybucji OSM. */
  attribution?: string;
}

const MERC = 20037508.342789244;

/** Zakres mapy w metrach EPSG:3857 (minX,minY,maxX,maxY) — zgodny z kafelkami OSM. */
export function bbox3857ForMap(
  spec: Pick<StaticMapSpec, "lat" | "lng" | "zoom" | "width" | "height">,
): [number, number, number, number] {
  const [cx, cy] = lngLatToWorldPx(spec.lng, spec.lat, spec.zoom);
  const res = (2 * MERC) / (TILE * 2 ** spec.zoom);
  const toX = (px: number) => px * res - MERC;
  const toY = (py: number) => MERC - py * res;
  return [
    toX(cx - spec.width / 2),
    toY(cy + spec.height / 2),
    toX(cx + spec.width / 2),
    toY(cy - spec.height / 2),
  ];
}

/** URL GetMap WMS 1.3.0 w EPSG:3857 dla zakresu mapy (piksele ×2 — ostrość w PDF-ie). */
export function wmsGetMapUrl(
  base: string,
  layers: string,
  spec: Pick<StaticMapSpec, "lat" | "lng" | "zoom" | "width" | "height">,
  opts: { format?: string; transparent?: boolean; scale?: number } = {},
): string {
  const scale = opts.scale ?? 2;
  const bbox = bbox3857ForMap(spec)
    .map((v) => v.toFixed(2))
    .join(",");
  const q = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layers,
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: bbox,
    WIDTH: String(spec.width * scale),
    HEIGHT: String(spec.height * scale),
    FORMAT: opts.format ?? "image/png",
    TRANSPARENT: opts.transparent === false ? "FALSE" : "TRUE",
  });
  return `${base}?${q.toString()}`;
}

/** Mapy zagrożenia powodziowego ISOK (Wody Polskie) — obszary zagrożenia powodzią rzeczną i morską. */
export const ISOK_FLOOD_WMS = "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS";
export const ISOK_FLOOD_LAYERS = "NZ.Fluvial,NZ.SeaWater";
/** Krajowa Integracja MPZP (GUGiK) — granice planów i rysunki tam, gdzie usługa krajowa je renderuje. */
export const KIMPZP_WMS =
  "https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego";
export const KIMPZP_LAYERS = "raster,wektor-str,wektor-pow,wektor-lin,wektor-lzb,plany_granice";

/** Współrzędne geograficzne → piksele świata (Web Mercator) dla danego zoomu. */
export function lngLatToWorldPx(lng: number, lat: number, zoom: number): [number, number] {
  const scale = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return [x, y];
}

/** Kafelki potrzebne do pokrycia mapy i przesunięcie lewego górnego rogu. */
export function tilesForMap(spec: StaticMapSpec): {
  origin: [number, number];
  tiles: Array<{ x: number; y: number; dx: number; dy: number }>;
} {
  const [cx, cy] = lngLatToWorldPx(spec.lng, spec.lat, spec.zoom);
  const ox = cx - spec.width / 2;
  const oy = cy - spec.height / 2;
  const n = 2 ** spec.zoom;
  const tiles: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + spec.height) / TILE); ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + spec.width) / TILE); tx += 1) {
      tiles.push({
        x: ((tx % n) + n) % n,
        y: ty,
        dx: Math.round(tx * TILE - ox),
        dy: Math.round(ty * TILE - oy),
      });
    }
  }
  return { origin: [ox, oy], tiles };
}

/** Największy zoom (≤ maxZoom), przy którym obrys mieści się w mapie z marginesem. */
export function zoomToFit(
  polygon: Array<[number, number]>,
  width: number,
  height: number,
  maxZoom = 18,
  minZoom = 12,
): number {
  for (let z = maxZoom; z > minZoom; z -= 1) {
    const px = polygon.map(([lng, lat]) => lngLatToWorldPx(lng, lat, z));
    const w = Math.max(...px.map((p) => p[0])) - Math.min(...px.map((p) => p[0]));
    const h = Math.max(...px.map((p) => p[1])) - Math.min(...px.map((p) => p[1]));
    if (w <= width * 0.6 && h <= height * 0.6) return z;
  }
  return minZoom;
}

function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "strict-origin-when-cross-origin";
    const timer = setTimeout(() => resolve(null), 10_000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Mapa jako PNG (Uint8Array). null = brak przeglądarki/canvasu albo żaden
 * kafelek się nie wczytał — wtedy raport pokazuje same współrzędne.
 */
export async function renderStaticMapPng(spec: StaticMapSpec): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const scale = 2; // ostrość w PDF-ie
  const canvas = document.createElement("canvas");
  canvas.width = spec.width * scale;
  canvas.height = spec.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, spec.width, spec.height);

  const { origin, tiles } = tilesForMap(spec);
  if (spec.baseImage) {
    const url = URL.createObjectURL(
      new Blob([spec.baseImage.bytes as BlobPart], { type: spec.baseImage.mime }),
    );
    const img = await loadTile(url);
    URL.revokeObjectURL(url);
    if (!img) return null;
    ctx.drawImage(img, 0, 0, spec.width, spec.height);
  } else {
    const imgs = await Promise.all(
      tiles.map((t) => loadTile(`${OSM_TILE_URL}/${spec.zoom}/${t.x}/${t.y}.png`)),
    );
    if (imgs.every((i) => i == null)) return null;
    imgs.forEach((img, i) => {
      if (img) ctx.drawImage(img, tiles[i].dx, tiles[i].dy, TILE, TILE);
    });
  }

  // Nakładki WMS: niedostępna (brak CORS, błąd serwera) jest po prostu pomijana.
  const overlayImgs = await Promise.all((spec.overlays ?? []).map((o) => loadTile(o.url)));
  overlayImgs.forEach((img, i) => {
    if (!img) return;
    ctx.globalAlpha = spec.overlays![i].opacity ?? 0.7;
    ctx.drawImage(img, 0, 0, spec.width, spec.height);
    ctx.globalAlpha = 1;
  });

  const toCanvas = (lng: number, lat: number): [number, number] => {
    const [x, y] = lngLatToWorldPx(lng, lat, spec.zoom);
    return [x - origin[0], y - origin[1]];
  };

  if (spec.polygon && spec.polygon.length >= 3) {
    ctx.beginPath();
    spec.polygon.forEach(([lng, lat], i) => {
      const [x, y] = toCanvas(lng, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(220, 38, 38, 0.18)";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#dc2626";
    ctx.stroke();
  }

  if (spec.marker !== false) {
    const [x, y] = toCanvas(spec.lng, spec.lat);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 11, y - 14, x - 11, y - 30, x, y - 30);
    ctx.bezierCurveTo(x + 11, y - 30, x + 11, y - 14, x, y);
    ctx.fillStyle = "#dc2626";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 20, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  // Podpis atrybucji (wymóg licencji ODbL / źródeł państwowych).
  const attribution = [spec.baseImage ? null : OSM_ATTRIBUTION, spec.attribution]
    .filter(Boolean)
    .join(" · ");
  ctx.font = "10px sans-serif";
  const tw = ctx.measureText(attribution).width;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(spec.width - tw - 8, spec.height - 15, tw + 8, 15);
  ctx.fillStyle = "#111827";
  ctx.fillText(attribution, spec.width - tw - 4, spec.height - 4);

  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}
