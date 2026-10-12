// Ocena wyników publikacji — wspólna miara dla FB, IG i YouTube.
// Czysty moduł.

export interface PostMetrics {
  impressions?: number | null;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  clicks?: number | null;
  follows?: number | null;
}

const n = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

/**
 * Zaangażowanie ważone: komentarz i udostępnienie znaczą więcej niż polubienie
 * (algorytmy platform i cel właściciela — interakcje), obserwacja najwięcej.
 * Dzielone przez zasięg (min. 30, żeby pojedynczy lajk przy 3 wyświetleniach
 * nie wyglądał jak hit).
 */
export function engagementScore(m: PostMetrics): number {
  const interactions =
    n(m.likes) +
    3 * n(m.comments) +
    4 * n(m.shares) +
    3 * n(m.saves) +
    1.5 * n(m.clicks) +
    8 * n(m.follows);
  const audience = Math.max(n(m.reach) || n(m.impressions) || n(m.views), 30);
  return Math.round((interactions / audience) * 10000) / 10000;
}

export function median(values: number[]): number {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Nagroda 0..1: 0,5 = mediana konta, 1 = dwukrotność mediany i więcej. */
export function rewardFromScore(score: number, baselineMedian: number): number {
  if (baselineMedian <= 0) return score > 0 ? 0.75 : 0.25;
  return Math.max(0, Math.min(1, score / (2 * baselineMedian)));
}
