// Analityka publikacji (brief 5.5) — czysta logika: mediany, outliery,
// podsumowania per tor. Testy: metrics.test.ts.

export type MetricPoint = {
  platform: string;
  externalId: string;
  track: string | null;
  series: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
};

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Minimalny wiek publikacji do porównań (jak w raporcie IG: 72 h). */
export const OUTLIER_MIN_AGE_H = 72;
/** Próg outliera: ≥ 3× mediany konta i toru (brief 5.5). */
export const OUTLIER_FACTOR = 3;

function ageHours(p: MetricPoint, now: Date): number {
  if (!p.publishedAt) return Infinity;
  return (now.getTime() - Date.parse(p.publishedAt)) / 3_600_000;
}

const groupKey = (p: MetricPoint) => `${p.platform}|${p.track ?? "oba"}`;

/**
 * Outliery per platforma i tor. Mediana z publikacji ≥ 72 h; przy mniej niż
 * 5 publikacjach w grupie nie ogłaszamy outlierów (za mało danych).
 */
export function findOutliers(
  points: MetricPoint[],
  now: Date,
  opts: { minGroupSize?: number } = {},
): (MetricPoint & { median: number; factor: number })[] {
  const minGroup = opts.minGroupSize ?? 5;
  const groups = new Map<string, MetricPoint[]>();
  for (const p of points) {
    if (p.views == null || ageHours(p, now) < OUTLIER_MIN_AGE_H) continue;
    const k = groupKey(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out: (MetricPoint & { median: number; factor: number })[] = [];
  for (const list of groups.values()) {
    if (list.length < minGroup) continue;
    const med = median(list.map((p) => p.views ?? 0));
    if (med <= 0) continue;
    for (const p of list) {
      const factor = (p.views ?? 0) / med;
      if (factor >= OUTLIER_FACTOR)
        out.push({ ...p, median: med, factor: Math.round(factor * 10) / 10 });
    }
  }
  return out.sort((a, b) => b.factor - a.factor);
}

export type TrackSummary = {
  track: string;
  posts: number;
  medianViews: number;
  totalViews: number;
  sharesPer1k: number;
  followsPer1k: number;
  commentsPer1k: number;
};

/** Podsumowanie per tor do raportu (wszystkie platformy razem). */
export function summarizeByTrack(points: MetricPoint[]): TrackSummary[] {
  const by = new Map<string, MetricPoint[]>();
  for (const p of points) {
    const k = p.track ?? "oba";
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const per1k = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 10000) / 10 : 0);
  return [...by.entries()]
    .map(([track, list]) => {
      const views = list.reduce((s, p) => s + (p.views ?? 0), 0);
      const sum = (f: keyof MetricPoint) => list.reduce((s, p) => s + Number(p[f] ?? 0), 0);
      return {
        track,
        posts: list.length,
        medianViews: median(list.map((p) => p.views ?? 0)),
        totalViews: views,
        sharesPer1k: per1k(sum("shares"), views),
        followsPer1k: per1k(sum("follows"), views),
        commentsPer1k: per1k(sum("comments"), views),
      };
    })
    .sort((a, b) => a.track.localeCompare(b.track));
}

/** Wyciąga wartość metryki z odpowiedzi Graph API insights ([{name, values:[{value}]}]). */
export function insightValue(data: any[], name: string): number | null {
  const row = (data ?? []).find((d) => d?.name === name);
  if (!row) return null;
  const v = row.total_value?.value ?? row.values?.[0]?.value;
  return typeof v === "number" ? v : v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
}
