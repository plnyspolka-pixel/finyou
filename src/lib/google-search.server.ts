/**
 * Google dla pozycjonowania i ruchu financeyou.pl: Search Console (wyniki
 * wyszukiwania, mapy witryny, inspekcja adresów), Indexing API, Analytics
 * Data API (GA4) i PageSpeed Insights. Uwierzytelnienie: `google-auth.server.ts`.
 * Używane przez narzędzia MCP (`src/lib/mcp/tools/google.ts`).
 *
 * Konfiguracja: `GSC_SITE_URL` (domyślnie `sc-domain:<host financeyou.pl>`),
 * `GA4_PROPERTY_ID` (numer usługi GA4), opcjonalnie `PAGESPEED_API_KEY`.
 */
import { googleRequest } from "./google-auth.server";
import { SITE_URL } from "./seo/company";

export const SCOPES = {
  webmasters: "https://www.googleapis.com/auth/webmasters",
  webmastersReadonly: "https://www.googleapis.com/auth/webmasters.readonly",
  analytics: "https://www.googleapis.com/auth/analytics.readonly",
  indexing: "https://www.googleapis.com/auth/indexing",
} as const;

const WM = "https://www.googleapis.com/webmasters/v3";
const enc = encodeURIComponent;

export function gscSiteUrl(): string {
  return process.env.GSC_SITE_URL?.trim() || `sc-domain:${new URL(SITE_URL).hostname}`;
}

export function ga4PropertyId(): string | null {
  const v = process.env.GA4_PROPERTY_ID?.trim();
  return v ? v.replace(/^properties\//, "") : null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Zakres dat: `days` dni kończący się wczoraj (Search Console ma 1–3 dni opóźnienia). */
export function lastDays(days: number, endOffsetDays = 1): { startDate: string; endDate: string } {
  const end = new Date(Date.now() - endOffsetDays * 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { startDate: day(start), endDate: day(end) };
}

/** Poprzedni okres tej samej długości, bezpośrednio przed `range`. */
export function previousRange(range: { startDate: string; endDate: string }) {
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  const len = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return {
    startDate: day(new Date(start.getTime() - len * 86_400_000)),
    endDate: day(new Date(start.getTime() - 86_400_000)),
  };
}

// ── Search Console ──────────────────────────────────────────────────────────

export async function listSites(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const j = await googleRequest(`${WM}/sites`, { scopes: [SCOPES.webmastersReadonly] });
  return (j?.siteEntry ?? []) as { siteUrl: string; permissionLevel: string }[];
}

export type SearchDimension = "query" | "page" | "country" | "device" | "date" | "searchAppearance";
export type SearchFilter = {
  dimension: "query" | "page" | "country" | "device" | "searchAppearance";
  operator?:
    | "contains"
    | "equals"
    | "notContains"
    | "notEquals"
    | "includingRegex"
    | "excludingRegex";
  expression: string;
};
export type SearchRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function searchAnalytics(opts: {
  startDate: string;
  endDate: string;
  dimensions?: SearchDimension[];
  filters?: SearchFilter[];
  rowLimit?: number;
  startRow?: number;
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  dataState?: "final" | "all";
}): Promise<SearchRow[]> {
  const body: Record<string, unknown> = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions ?? [],
    rowLimit: Math.min(25_000, Math.max(1, opts.rowLimit ?? 100)),
    startRow: opts.startRow ?? 0,
    type: opts.type ?? "web",
    dataState: opts.dataState ?? "all",
  };
  if (opts.filters?.length) {
    body.dimensionFilterGroups = [
      {
        groupType: "and",
        filters: opts.filters.map((f) => ({
          dimension: f.dimension,
          operator: f.operator ?? "contains",
          expression: f.expression,
        })),
      },
    ];
  }
  const j = await googleRequest(`${WM}/sites/${enc(gscSiteUrl())}/searchAnalytics/query`, {
    method: "POST",
    json: body,
    scopes: [SCOPES.webmastersReadonly],
  });
  return ((j?.rows ?? []) as any[]).map((r) => ({
    keys: (r.keys ?? []) as string[],
    clicks: Number(r.clicks ?? 0),
    impressions: Number(r.impressions ?? 0),
    ctr: Math.round(Number(r.ctr ?? 0) * 10_000) / 100,
    position: Math.round(Number(r.position ?? 0) * 10) / 10,
  }));
}

export function totals(rows: SearchRow[]) {
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const impressions = rows.reduce((a, r) => a + r.impressions, 0);
  const posWeighted = rows.reduce((a, r) => a + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? Math.round((clicks / impressions) * 10_000) / 100 : 0,
    position: impressions ? Math.round((posWeighted / impressions) * 10) / 10 : 0,
  };
}

export type Sitemap = {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  warnings?: string;
  errors?: string;
  contents?: { type: string; submitted: string; indexed: string }[];
};

export async function listSitemaps(): Promise<Sitemap[]> {
  const j = await googleRequest(`${WM}/sites/${enc(gscSiteUrl())}/sitemaps`, {
    scopes: [SCOPES.webmastersReadonly],
  });
  return (j?.sitemap ?? []) as Sitemap[];
}

export async function submitSitemap(feedpath: string): Promise<void> {
  await googleRequest(`${WM}/sites/${enc(gscSiteUrl())}/sitemaps/${enc(feedpath)}`, {
    method: "PUT",
    scopes: [SCOPES.webmasters],
  });
}

export async function deleteSitemap(feedpath: string): Promise<void> {
  await googleRequest(`${WM}/sites/${enc(gscSiteUrl())}/sitemaps/${enc(feedpath)}`, {
    method: "DELETE",
    scopes: [SCOPES.webmasters],
  });
}

export async function inspectUrl(url: string, languageCode = "pl"): Promise<any> {
  const j = await googleRequest(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      json: { inspectionUrl: url, siteUrl: gscSiteUrl(), languageCode },
      scopes: [SCOPES.webmasters],
    },
  );
  return j?.inspectionResult ?? j;
}

// ── Indexing API ────────────────────────────────────────────────────────────

export async function requestIndexing(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED",
) {
  return googleRequest("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    json: { url, type },
    scopes: [SCOPES.indexing],
  });
}

export async function indexingStatus(url: string) {
  return googleRequest("https://indexing.googleapis.com/v3/urlNotifications/metadata", {
    query: { url },
    scopes: [SCOPES.indexing],
  });
}

// ── GA4 (Analytics Data API) ────────────────────────────────────────────────

export type Ga4Row = Record<string, string | number>;

function requireGa4(): string {
  const id = ga4PropertyId();
  if (!id)
    throw new Error("Brak GA4_PROPERTY_ID (numer usługi GA4, np. 123456789) w środowisku serwera.");
  return id;
}

function ga4Rows(j: any): Ga4Row[] {
  const dims: string[] = (j?.dimensionHeaders ?? []).map((h: any) => h.name);
  const mets: string[] = (j?.metricHeaders ?? []).map((h: any) => h.name);
  return ((j?.rows ?? []) as any[]).map((r) => {
    const out: Ga4Row = {};
    dims.forEach((d, i) => (out[d] = r.dimensionValues?.[i]?.value ?? ""));
    mets.forEach((m, i) => {
      const v = Number(r.metricValues?.[i]?.value ?? 0);
      out[m] = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
    });
    return out;
  });
}

export async function ga4RunReport(opts: {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics: string[];
  limit?: number;
  orderBy?: { metric?: string; dimension?: string; desc?: boolean };
  filter?: { dimension: string; value: string; matchType?: "EXACT" | "CONTAINS" | "BEGINS_WITH" };
}): Promise<{ rows: Ga4Row[]; rowCount: number }> {
  const id = requireGa4();
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
    dimensions: (opts.dimensions ?? []).map((name) => ({ name })),
    metrics: opts.metrics.map((name) => ({ name })),
    limit: Math.min(10_000, Math.max(1, opts.limit ?? 50)),
    keepEmptyRows: false,
  };
  if (opts.orderBy?.metric) {
    body.orderBys = [
      { metric: { metricName: opts.orderBy.metric }, desc: opts.orderBy.desc ?? true },
    ];
  } else if (opts.orderBy?.dimension) {
    body.orderBys = [
      { dimension: { dimensionName: opts.orderBy.dimension }, desc: opts.orderBy.desc ?? false },
    ];
  }
  if (opts.filter) {
    body.dimensionFilter = {
      filter: {
        fieldName: opts.filter.dimension,
        stringFilter: {
          matchType: opts.filter.matchType ?? "CONTAINS",
          value: opts.filter.value,
          caseSensitive: false,
        },
      },
    };
  }
  const j = await googleRequest(
    `https://analyticsdata.googleapis.com/v1beta/properties/${enc(id)}:runReport`,
    {
      method: "POST",
      json: body,
      scopes: [SCOPES.analytics],
    },
  );
  return { rows: ga4Rows(j), rowCount: Number(j?.rowCount ?? 0) };
}

export async function ga4Realtime(
  opts: { dimensions?: string[]; metrics?: string[]; limit?: number } = {},
) {
  const id = requireGa4();
  const j = await googleRequest(
    `https://analyticsdata.googleapis.com/v1beta/properties/${enc(id)}:runRealtimeReport`,
    {
      method: "POST",
      json: {
        dimensions: (opts.dimensions ?? []).map((name) => ({ name })),
        metrics: (opts.metrics ?? ["activeUsers"]).map((name) => ({ name })),
        limit: Math.min(250, Math.max(1, opts.limit ?? 20)),
      },
      scopes: [SCOPES.analytics],
    },
  );
  return { rows: ga4Rows(j), rowCount: Number(j?.rowCount ?? 0) };
}

// ── PageSpeed Insights (bez uwierzytelnienia; klucz opcjonalny) ─────────────

export async function pageSpeed(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
  categories: string[] = ["performance", "seo", "accessibility", "best-practices"],
) {
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", url);
  u.searchParams.set("strategy", strategy);
  u.searchParams.set("locale", "pl");
  for (const c of categories) u.searchParams.append("category", c);
  if (process.env.PAGESPEED_API_KEY) u.searchParams.set("key", process.env.PAGESPEED_API_KEY);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(u, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PageSpeed ${res.status}: ${j?.error?.message ?? "błąd"}`);
  const lh = j?.lighthouseResult ?? {};
  const cats = lh.categories ?? {};
  const audits = lh.audits ?? {};
  const score = (k: string) =>
    typeof cats[k]?.score === "number" ? Math.round(cats[k].score * 100) : null;
  const metric = (k: string) => audits[k]?.displayValue ?? null;
  const field = j?.loadingExperience?.metrics ?? {};
  const fieldMetric = (k: string) =>
    field[k] ? { percentile: field[k].percentile, category: field[k].category } : null;
  const opportunities = Object.values(audits)
    .filter(
      (a: any) =>
        a?.details?.type === "opportunity" && typeof a.score === "number" && a.score < 0.9,
    )
    .sort(
      (a: any, b: any) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0),
    )
    .slice(0, 8)
    .map((a: any) => ({ title: a.title, savings: a.displayValue ?? null }));
  const failedSeo = (cats.seo?.auditRefs ?? [])
    .map((r: any) => audits[r.id])
    .filter((a: any) => a && typeof a.score === "number" && a.score < 1)
    .map((a: any) => a.title);
  return {
    url: j?.id ?? url,
    strategy,
    analysed_at: lh.fetchTime ?? null,
    scores: {
      performance: score("performance"),
      seo: score("seo"),
      accessibility: score("accessibility"),
      best_practices: score("best-practices"),
    },
    lab: {
      lcp: metric("largest-contentful-paint"),
      fcp: metric("first-contentful-paint"),
      cls: metric("cumulative-layout-shift"),
      tbt: metric("total-blocking-time"),
      speed_index: metric("speed-index"),
      tti: metric("interactive"),
    },
    field: {
      overall: j?.loadingExperience?.overall_category ?? null,
      lcp: fieldMetric("LARGEST_CONTENTFUL_PAINT_MS"),
      inp: fieldMetric("INTERACTION_TO_NEXT_PAINT"),
      cls: fieldMetric("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
    },
    opportunities,
    failed_seo_audits: failedSeo,
  };
}
