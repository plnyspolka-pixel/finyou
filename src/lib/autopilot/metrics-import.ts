// Mapowanie surowych odpowiedzi API (IG Graph, YouTube Data) na wiersze
// ai_publication_metrics. Czysty moduł – bez I/O.

export interface MetricRow {
  platform: "instagram_reels" | "youtube";
  external_post_id: string;
  published_at: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
  duration_s: number | null;
  raw: Record<string, unknown>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Insights IG (lista {name, values|total_value}) → mapa nazwa → liczba. */
export function insightsMap(rows: unknown[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const r of rows as Array<{
    name?: string;
    values?: Array<{ value?: unknown }>;
    total_value?: { value?: unknown };
  }>) {
    if (!r?.name) continue;
    out[r.name] = num(r.total_value?.value ?? r.values?.[0]?.value);
  }
  return out;
}

export function igMetricRow(
  media: { id: string; timestamp?: string; like_count?: number; comments_count?: number },
  insights: Record<string, number | null>,
): MetricRow {
  return {
    platform: "instagram_reels",
    external_post_id: media.id,
    published_at: media.timestamp ?? null,
    views: insights.views ?? insights.plays ?? null,
    reach: insights.reach ?? null,
    likes: insights.likes ?? num(media.like_count),
    comments: insights.comments ?? num(media.comments_count),
    shares: insights.shares ?? null,
    saves: insights.saved ?? null,
    follows: insights.follows ?? null,
    duration_s: null,
    raw: { insights },
  };
}

/** ISO 8601 „PT1M5S” → sekundy. */
export function isoDurationSeconds(d: string | null | undefined): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? "");
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function ytMetricRow(video: {
  id: string;
  snippet?: { publishedAt?: string };
  statistics?: Record<string, string | undefined>;
  contentDetails?: { duration?: string };
}): MetricRow {
  const s = video.statistics ?? {};
  return {
    platform: "youtube",
    external_post_id: video.id,
    published_at: video.snippet?.publishedAt ?? null,
    views: num(s.viewCount),
    reach: null,
    likes: num(s.likeCount),
    comments: num(s.commentCount),
    shares: null,
    saves: null,
    follows: null,
    duration_s: isoDurationSeconds(video.contentDetails?.duration),
    raw: { statistics: s },
  };
}
