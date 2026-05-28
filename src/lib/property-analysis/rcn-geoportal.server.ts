// RCN / Geoportal — pobieranie transakcji porównawczych przez WFS.
// Tolerancyjne na brak danych: zwraca pustą listę zamiast wyrzucać.
import type { PropertyType, RcnStats } from "./types";
import { average, filterIqrOutliers, fetchWithTimeout, median, quartile, withCache } from "./cache.server";

const WFS_BASE = "https://mapy.geoportal.gov.pl/wss/service/PZGiK/RCiWN/WFS";

interface RcnTransaction {
  pricePerM2?: number | null;
  pricePerHa?: number | null;
  date?: string | null;
  type?: string | null;
}

function bboxAround(lat: number, lng: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

async function fetchRcnRaw(lat: number, lng: number, radiusM: number): Promise<RcnTransaction[]> {
  const [minx, miny, maxx, maxy] = bboxAround(lat, lng, radiusM);
  const url =
    `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=ms:transakcje&outputFormat=application/json` +
    `&bbox=${miny},${minx},${maxy},${maxx},EPSG:4326&count=500`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 20_000);
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: Array<{ properties?: Record<string, unknown> }> };
    const features = json.features ?? [];
    return features.map((f) => {
      const p = f.properties ?? {};
      const num = (k: string) => {
        const v = p[k];
        return typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : null;
      };
      return {
        pricePerM2: num("cena_za_m2") ?? num("cena_m2") ?? null,
        pricePerHa: num("cena_za_ha") ?? num("cena_ha") ?? null,
        date: (p["data_transakcji"] as string | undefined) ?? (p["data"] as string | undefined) ?? null,
        type: (p["rodzaj"] as string | undefined) ?? (p["typ"] as string | undefined) ?? null,
      } as RcnTransaction;
    });
  } catch {
    return [];
  }
}

function filterByPeriod(txs: RcnTransaction[], months: number): RcnTransaction[] {
  const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000;
  return txs.filter(t => {
    if (!t.date) return true;
    const ts = Date.parse(t.date);
    return Number.isNaN(ts) ? true : ts >= cutoff;
  });
}

export interface RcnBenchmarkResult {
  stats: RcnStats | null;
  transactionsCount: number;
  radiusKm: number | null;
}

/**
 * Eskalacja promienia 1km → 2km → 5km i okresu 12 → 24 → 36 mies.
 */
export async function rcnBenchmark(args: {
  lat: number;
  lng: number;
  propertyType: PropertyType | string;
}): Promise<RcnBenchmarkResult> {
  const { lat, lng, propertyType } = args;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { stats: null, transactionsCount: 0, radiusKm: null };
  }
  const isLand = propertyType === "grunt_rolny" || propertyType === "dzialka_budowlana" || propertyType === "dzialka_zabudowana";
  const radii = [1000, 2000, 5000];
  const periods: Array<{ months: number; freshness: RcnStats["freshness"] }> = [
    { months: 12, freshness: "good" },
    { months: 24, freshness: "limited" },
    { months: 36, freshness: "weak" },
  ];
  for (const r of radii) {
    const key = `rcn:${lat.toFixed(3)}:${lng.toFixed(3)}:${r}`;
    const raw = await withCache("rcn_cache", key, 30, () => fetchRcnRaw(lat, lng, r));
    for (const p of periods) {
      const filtered = filterByPeriod(raw, p.months);
      const valuesRaw = filtered
        .map(t => (isLand ? t.pricePerHa : t.pricePerM2))
        .filter((v): v is number => typeof v === "number" && v > 0);
      const values = filterIqrOutliers(valuesRaw);
      if (values.length >= 3) {
        return {
          stats: {
            count: values.length,
            median: median(values),
            average: average(values),
            q1: quartile(values, 1),
            q3: quartile(values, 3),
            unit: isLand ? "pln_per_ha" : "pln_per_m2",
            radiusM: r,
            periodMonths: p.months,
            freshness: p.freshness,
          },
          transactionsCount: values.length,
          radiusKm: r / 1000,
        };
      }
    }
  }
  return { stats: null, transactionsCount: 0, radiusKm: null };
}
