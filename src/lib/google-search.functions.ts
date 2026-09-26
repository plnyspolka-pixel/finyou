/**
 * Dane z Google Search Console i GA4 dla panelu „Google Search" (monitoring
 * pozycji najpopularniejszych fraz + ruch na stronie w czasie).
 *
 * Właściwe wywołania API są w `google-search.server.ts` (import dynamiczny,
 * żeby moduł serwerowy nie trafił do paczki przeglądarki). Dostęp: administrator
 * lub operator.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAY = 86_400_000;

async function requireAdminOrOperator(supabase: any, userId: string) {
  const [a, o] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "administrator" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operator" }),
  ]);
  if (!a.data && !o.data) throw new Error("Forbidden");
}

/** Wszystkie dni zakresu (Search Console pomija dni bez danych — wykres ma mieć ciągłą oś). */
function dateAxis(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  for (let t = new Date(`${startDate}T00:00:00Z`).getTime(); t <= end; t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const pct = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : now > 0 ? 100 : 0;

/** „20260926" (GA4) → „2026-09-26". */
const ga4Date = (v: string) =>
  /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;

export type SearchOverview = Awaited<ReturnType<typeof buildOverview>>;

async function buildOverview(opts: {
  days: number;
  pageContains?: string | null;
  queryContains?: string | null;
  tableLimit: number;
  chartQueries: number;
  withGa4: boolean;
}) {
  const g = await import("@/lib/google-search.server");
  const range = g.lastDays(opts.days);
  const prev = g.previousRange(range);
  const filters: any[] = [];
  if (opts.pageContains?.trim())
    filters.push({ dimension: "page", operator: "contains", expression: opts.pageContains.trim() });
  if (opts.queryContains?.trim())
    filters.push({
      dimension: "query",
      operator: "contains",
      expression: opts.queryContains.trim(),
    });

  const [daily, dailyPrev, queries, queriesPrev, pages, site] = await Promise.all([
    g.searchAnalytics({ ...range, dimensions: ["date"], filters, rowLimit: 500 }),
    g.searchAnalytics({ ...prev, dimensions: ["date"], filters, rowLimit: 500 }),
    g.searchAnalytics({ ...range, dimensions: ["query"], filters, rowLimit: 1000 }),
    g.searchAnalytics({ ...prev, dimensions: ["query"], filters, rowLimit: 1000 }),
    g.searchAnalytics({ ...range, dimensions: ["page"], filters, rowLimit: 200 }),
    g.resolveGscSiteUrl(),
  ]);

  const byDate = new Map(daily.map((r) => [r.keys[0], r]));
  const series = dateAxis(range.startDate, range.endDate).map((date) => {
    const r = byDate.get(date);
    return {
      date,
      clicks: r?.clicks ?? 0,
      impressions: r?.impressions ?? 0,
      ctr: r?.ctr ?? 0,
      position: r?.position ?? null,
    };
  });

  const totals = g.totals(daily);
  const totalsPrev = g.totals(dailyPrev);

  const prevByQuery = new Map(queriesPrev.map((r) => [r.keys[0], r]));
  const ranked = [...queries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const topQueries = ranked.slice(0, opts.tableLimit).map((r) => {
    const before = prevByQuery.get(r.keys[0]);
    return {
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      prev_clicks: before?.clicks ?? null,
      prev_position: before?.position ?? null,
      // dodatnia wartość = awans (mniejszy numer pozycji)
      position_change: before ? Math.round((before.position - r.position) * 10) / 10 : null,
      clicks_change: before ? r.clicks - before.clicks : null,
    };
  });

  const buckets = { top3: 0, top10: 0, top20: 0, top50: 0, rest: 0 };
  for (const r of queries) {
    if (r.position <= 3) buckets.top3++;
    else if (r.position <= 10) buckets.top10++;
    else if (r.position <= 20) buckets.top20++;
    else if (r.position <= 50) buckets.top50++;
    else buckets.rest++;
  }

  // Historia pozycji dzień po dniu dla najpopularniejszych fraz.
  const chartQueries = ranked.slice(0, opts.chartQueries).map((r) => r.keys[0]);
  const trends = await Promise.all(
    chartQueries.map(async (query) => {
      const rows = await g.searchAnalytics({
        ...range,
        dimensions: ["date"],
        filters: [...filters, { dimension: "query", operator: "equals", expression: query }],
        rowLimit: 500,
      });
      const map = new Map(rows.map((r) => [r.keys[0], r]));
      return {
        query,
        points: dateAxis(range.startDate, range.endDate).map((date) => {
          const r = map.get(date);
          return {
            date,
            position: r ? r.position : null,
            clicks: r?.clicks ?? 0,
            impressions: r?.impressions ?? 0,
          };
        }),
      };
    }),
  );

  const topPages = [...pages]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, opts.tableLimit)
    .map((r) => ({
      page: r.keys[0],
      path: (() => {
        try {
          return new URL(r.keys[0]).pathname;
        } catch {
          return r.keys[0];
        }
      })(),
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

  let ga4: {
    property_id: string;
    daily: { date: string; sessions: number; users: number }[];
    totals: { sessions: number; users: number };
    channels: { channel: string; sessions: number }[];
  } | null = null;
  if (opts.withGa4 && g.ga4PropertyId()) {
    try {
      const [byDay, byChannel] = await Promise.all([
        g.ga4RunReport({
          ...range,
          dimensions: ["date"],
          metrics: ["sessions", "totalUsers"],
          limit: 400,
          orderBy: { dimension: "date" },
        }),
        g.ga4RunReport({
          ...range,
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions"],
          limit: 12,
          orderBy: { metric: "sessions", desc: true },
        }),
      ]);
      const map = new Map(
        byDay.rows.map((r) => [
          ga4Date(String(r.date ?? "")),
          { sessions: Number(r.sessions ?? 0), users: Number(r.totalUsers ?? 0) },
        ]),
      );
      const ga4Daily = dateAxis(range.startDate, range.endDate).map((date) => ({
        date,
        sessions: map.get(date)?.sessions ?? 0,
        users: map.get(date)?.users ?? 0,
      }));
      ga4 = {
        property_id: g.ga4PropertyId()!,
        daily: ga4Daily,
        totals: {
          sessions: ga4Daily.reduce((a, r) => a + r.sessions, 0),
          users: ga4Daily.reduce((a, r) => a + r.users, 0),
        },
        channels: byChannel.rows.map((r) => ({
          channel: String(r.sessionDefaultChannelGroup ?? ""),
          sessions: Number(r.sessions ?? 0),
        })),
      };
    } catch {
      ga4 = null; // brak dostępu do GA4 — panel pokazuje same dane Search Console
    }
  }

  return {
    site: site.url,
    site_source: site.source,
    range,
    previous_range: prev,
    totals,
    previous_totals: totalsPrev,
    change: {
      clicks_pct: pct(totals.clicks, totalsPrev.clicks),
      impressions_pct: pct(totals.impressions, totalsPrev.impressions),
      ctr_points: Math.round((totals.ctr - totalsPrev.ctr) * 100) / 100,
      // dodatnia wartość = awans w wynikach
      position_change:
        totalsPrev.position > 0
          ? Math.round((totalsPrev.position - totals.position) * 10) / 10
          : null,
    },
    series,
    queries: topQueries,
    queries_total: queries.length,
    buckets,
    trends,
    pages: topPages,
    ga4,
  };
}

/** Przegląd: ruch z Google dzień po dniu, najpopularniejsze frazy i ich pozycje. */
export const getSearchOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        days: z.number().int().min(7).max(180).default(28),
        page_contains: z.string().max(200).optional().nullable(),
        query_contains: z.string().max(200).optional().nullable(),
        table_limit: z.number().int().min(5).max(100).default(25),
        chart_queries: z.number().int().min(0).max(8).default(5),
        with_ga4: z.boolean().default(true),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdminOrOperator(context.supabase, context.userId);
    return buildOverview({
      days: data.days,
      pageContains: data.page_contains,
      queryContains: data.query_contains,
      tableLimit: data.table_limit,
      chartQueries: data.chart_queries,
      withGa4: data.with_ga4,
    });
  });

/** Historia pozycji jednej frazy — do wykresu po kliknięciu w wiersz tabeli. */
export const getQueryHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        query: z.string().min(1).max(200),
        days: z.number().int().min(7).max(180).default(28),
        page_contains: z.string().max(200).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdminOrOperator(context.supabase, context.userId);
    const g = await import("@/lib/google-search.server");
    const range = g.lastDays(data.days);
    const filters: any[] = [{ dimension: "query", operator: "equals", expression: data.query }];
    if (data.page_contains?.trim())
      filters.push({
        dimension: "page",
        operator: "contains",
        expression: data.page_contains.trim(),
      });
    const [rows, pages] = await Promise.all([
      g.searchAnalytics({ ...range, dimensions: ["date"], filters, rowLimit: 500 }),
      g.searchAnalytics({ ...range, dimensions: ["page"], filters, rowLimit: 20 }),
    ]);
    const map = new Map(rows.map((r) => [r.keys[0], r]));
    return {
      query: data.query,
      range,
      totals: g.totals(rows),
      points: dateAxis(range.startDate, range.endDate).map((date) => {
        const r = map.get(date);
        return {
          date,
          position: r ? r.position : null,
          clicks: r?.clicks ?? 0,
          impressions: r?.impressions ?? 0,
          ctr: r?.ctr ?? 0,
        };
      }),
      pages: [...pages]
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, 10)
        .map((r) => ({
          page: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
    };
  });

/** Stan integracji — pokazywany, gdy pobranie danych się nie uda. */
export const getSearchIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdminOrOperator(context.supabase, context.userId);
    const auth = await import("@/lib/google-auth.server");
    const g = await import("@/lib/google-search.server");
    const sa = auth.serviceAccount();
    const site = await g.resolveGscSiteUrl();
    let sites: { siteUrl: string; permissionLevel: string }[] = [];
    let sites_error: string | null = null;
    try {
      sites = await g.listSites();
    } catch (e) {
      sites_error = (e as Error).message;
    }
    return {
      auth_method: auth.googleAuthMethod(),
      service_account_email: sa?.client_email ?? null,
      site_url: site.url,
      site_url_source: site.source,
      ga4_property_id: g.ga4PropertyId(),
      sites,
      sites_error,
      site_permission: sites.find((s) => s.siteUrl === site.url)?.permissionLevel ?? null,
    };
  });
