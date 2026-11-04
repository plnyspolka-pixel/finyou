// MPZP w punkcie nieruchomości — GetFeatureInfo Krajowej Integracji MPZP.
import { parseMpzpFeatureInfo, type MpzpInfo } from "./mpzp";

const KIMPZP =
  "https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego";
const MERC = 20037508.342789244;

export async function fetchMpzpAtPoint(lat: number, lng: number): Promise<MpzpInfo | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const x = (lng * MERC) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (MERC / 180);
  const d = 50;
  const q = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: "plany",
    QUERY_LAYERS: "plany",
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: [x - d, y - d, x + d, y + d].map((v) => v.toFixed(2)).join(","),
    WIDTH: "101",
    HEIGHT: "101",
    I: "50",
    J: "50",
    INFO_FORMAT: "text/html",
    FEATURE_COUNT: "5",
  });
  try {
    const res = await fetch(`${KIMPZP}?${q}`, {
      headers: { "User-Agent": "FinanceYou-Analysis/1.0 (+https://financeyou.pl)" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return parseMpzpFeatureInfo(await res.text());
  } catch {
    return null;
  }
}
