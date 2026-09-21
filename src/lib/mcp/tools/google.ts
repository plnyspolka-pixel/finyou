// Google — pozycjonowanie i ruch financeyou.pl: Search Console (wyniki
// wyszukiwania po zapytaniach / stronach / krajach / urządzeniach, trend,
// porównanie okresów, mapy witryny, inspekcja adresu), Indexing API,
// Analytics GA4 (ruch, strony, kanały, realtime), PageSpeed Insights i ogólne
// wywołanie API Google.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  WRITE,
  actorId,
  fail,
  handle,
  ok,
  requireRolesAdmin,
  requireTeam,
} from "../_helpers";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

const DIMENSIONS = ["query", "page", "country", "device", "date", "searchAppearance"] as const;
const dateOpt = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

type Range = { startDate: string; endDate: string };

async function rangeOf(a: {
  days?: number;
  start_date?: string;
  end_date?: string;
}): Promise<Range> {
  const g = await import("@/lib/google-search.server");
  if (a.start_date && a.end_date) return { startDate: a.start_date, endDate: a.end_date };
  if (a.start_date) return { startDate: a.start_date, endDate: g.lastDays(1).endDate };
  return g.lastDays(a.days ?? 28);
}

type Filters = {
  page_contains?: string;
  query_contains?: string;
  country?: string;
  device?: string;
};

function filtersOf(a: Filters) {
  const f: {
    dimension: "query" | "page" | "country" | "device";
    operator?: "contains" | "equals";
    expression: string;
  }[] = [];
  if (a.page_contains)
    f.push({ dimension: "page", operator: "contains", expression: a.page_contains });
  if (a.query_contains)
    f.push({ dimension: "query", operator: "contains", expression: a.query_contains });
  if (a.country)
    f.push({ dimension: "country", operator: "equals", expression: a.country.toLowerCase() });
  if (a.device)
    f.push({ dimension: "device", operator: "equals", expression: a.device.toUpperCase() });
  return f;
}

const filterSchema = {
  page_contains: z
    .string()
    .optional()
    .describe("Tylko adresy zawierające fragment (np. `/blog/`)."),
  query_contains: z.string().optional().describe("Tylko zapytania zawierające frazę."),
  country: z.string().length(3).optional().describe("Kod kraju ISO-3166-1 alpha-3, np. `pol`."),
  device: z.enum(["desktop", "mobile", "tablet"]).optional(),
};
const rangeSchema = {
  days: z.number().int().min(1).max(480).default(28).describe("Ostatnie N dni (do wczoraj)."),
  start_date: dateOpt.describe("Alternatywnie: zakres od (YYYY-MM-DD)."),
  end_date: dateOpt.describe("Zakres do (YYYY-MM-DD)."),
};

function positionBuckets(rows: { position: number; clicks: number; impressions: number }[]) {
  const b = { top3: 0, top10: 0, "11_20": 0, "21_50": 0, "51_plus": 0 };
  for (const r of rows) {
    if (r.position <= 3) b.top3++;
    else if (r.position <= 10) b.top10++;
    else if (r.position <= 20) b["11_20"]++;
    else if (r.position <= 50) b["21_50"]++;
    else b["51_plus"]++;
  }
  return b;
}

const pct = (cur: number, prev: number) =>
  prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 1000) / 10;

function compareTotals(cur: ReturnType<typeof toTotals>, prev: ReturnType<typeof toTotals>) {
  return {
    clicks: {
      current: cur.clicks,
      previous: prev.clicks,
      change_pct: pct(cur.clicks, prev.clicks),
    },
    impressions: {
      current: cur.impressions,
      previous: prev.impressions,
      change_pct: pct(cur.impressions, prev.impressions),
    },
    ctr: {
      current: cur.ctr,
      previous: prev.ctr,
      change_pp: Math.round((cur.ctr - prev.ctr) * 100) / 100,
    },
    position: {
      current: cur.position,
      previous: prev.position,
      change: Math.round((cur.position - prev.position) * 10) / 10,
    },
  };
}
const toTotals = (rows: Parameters<typeof positionBuckets>[0]) => {
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const impressions = rows.reduce((a, r) => a + r.impressions, 0);
  const posW = rows.reduce((a, r) => a + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? Math.round((clicks / impressions) * 10_000) / 100 : 0,
    position: impressions ? Math.round((posW / impressions) * 10) / 10 : 0,
  };
};

// ── Status ──────────────────────────────────────────────────────────────────

export const googleSearchStatus = defineTool({
  name: "google_search_status",
  title: "Google Search Console / GA4 status",
  description:
    "Stan integracji Google: sposób uwierzytelnienia (konto usługi albo OAuth kanału YouTube), e-mail konta usługi do dodania w Search Console / GA4, skonfigurowana witryna, witryny widoczne dla konta z poziomem uprawnień, mapy witryny, usługa GA4. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const auth = await import("@/lib/google-auth.server");
      const g = await import("@/lib/google-search.server");
      const sa = auth.serviceAccount();
      const out: Record<string, unknown> = {
        auth_method: auth.googleAuthMethod(),
        service_account_email: sa?.client_email ?? null,
        site_url: g.gscSiteUrl(),
        ga4_property_id: g.ga4PropertyId(),
        pagespeed_key: Boolean(process.env.PAGESPEED_API_KEY),
        setup: sa
          ? "Konto usługi: dodaj jego e-mail w Search Console (Ustawienia → Użytkownicy, Pełny) i w GA4 (Administracja → Dostęp do usługi, Wyświetlający); w Google Cloud włącz Search Console API, Analytics Data API i Web Search Indexing API."
          : "Bez konta usługi narzędzia używają tokena kanału YouTube — połącz kanał ponownie w panelu kontem z dostępem do Search Console / GA4 (zgoda obejmuje teraz te zakresy).",
      };
      try {
        const sites = await g.listSites();
        out.sites = sites;
        out.site_permission =
          sites.find((s) => s.siteUrl === g.gscSiteUrl())?.permissionLevel ?? null;
      } catch (e) {
        out.sites_error = (e as Error).message;
      }
      try {
        const maps = await g.listSitemaps();
        out.sitemaps = maps.map((m) => ({
          path: m.path,
          last_submitted: m.lastSubmitted ?? null,
          last_downloaded: m.lastDownloaded ?? null,
          pending: m.isPending ?? false,
          errors: Number(m.errors ?? 0),
          warnings: Number(m.warnings ?? 0),
          urls: (m.contents ?? []).map((c) => ({
            type: c.type,
            submitted: Number(c.submitted),
            indexed: Number(c.indexed),
          })),
        }));
      } catch (e) {
        out.sitemaps_error = (e as Error).message;
      }
      if (g.ga4PropertyId()) {
        try {
          const r = await g.ga4Realtime({ metrics: ["activeUsers"] });
          out.ga4_active_users_now = Number(r.rows[0]?.activeUsers ?? 0);
        } catch (e) {
          out.ga4_error = (e as Error).message;
        }
      }
      return ok(out);
    }),
});

// ── Search Console: wyniki ──────────────────────────────────────────────────

export const getSearchPerformance = defineTool({
  name: "get_search_performance",
  title: "Search Console performance",
  description:
    "Wyniki financeyou.pl w wyszukiwarce Google (Search Console) za okres: kliknięcia, wyświetlenia, CTR, średnia pozycja — w podziale na wybrane wymiary (query, page, country, device, date, searchAppearance; można łączyć, np. query+page). Filtry po fragmencie adresu, frazie, kraju, urządzeniu. Dane mają 1–3 dni opóźnienia. Tylko administrator/operator.",
  inputSchema: {
    dimensions: z.array(z.enum(DIMENSIONS)).min(0).max(3).default(["query"]),
    ...rangeSchema,
    ...filterSchema,
    type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    order_by: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    limit: z.number().int().min(1).max(1000).default(50),
    offset: z.number().int().min(0).default(0),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const rows = await g.searchAnalytics({
        ...range,
        dimensions: a.dimensions,
        filters: filtersOf(a),
        rowLimit: a.limit,
        startRow: a.offset,
        type: a.type,
      });
      const sorted = [...rows].sort((x, y) =>
        a.order_by === "position"
          ? x.position - y.position
          : (y as any)[a.order_by] - (x as any)[a.order_by],
      );
      return ok({
        site: g.gscSiteUrl(),
        range,
        dimensions: a.dimensions,
        totals: g.totals(rows),
        rows: sorted.map((r) => ({
          ...Object.fromEntries(a.dimensions.map((d, i) => [d, r.keys[i]])),
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
      });
    }),
});

export const getSearchTrend = defineTool({
  name: "get_search_trend",
  title: "Search trend (daily)",
  description:
    "Trend widoczności w Google dzień po dniu (kliknięcia, wyświetlenia, CTR, pozycja) za ostatnie N dni plus porównanie z poprzednim okresem tej samej długości (zmiany w %). Opcjonalnie tylko dla fragmentu adresu albo frazy. Tylko administrator/operator.",
  inputSchema: { ...rangeSchema, ...filterSchema },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const prev = g.previousRange(range);
      const filters = filtersOf(a);
      const [cur, before] = await Promise.all([
        g.searchAnalytics({ ...range, dimensions: ["date"], filters, rowLimit: 500 }),
        g.searchAnalytics({ ...prev, dimensions: ["date"], filters, rowLimit: 500 }),
      ]);
      const curT = g.totals(cur);
      const prevT = g.totals(before);
      const weekly: Record<string, { clicks: number; impressions: number }> = {};
      for (const r of cur) {
        const d = new Date(r.keys[0]);
        const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000)
          .toISOString()
          .slice(0, 10);
        weekly[monday] ??= { clicks: 0, impressions: 0 };
        weekly[monday].clicks += r.clicks;
        weekly[monday].impressions += r.impressions;
      }
      return ok({
        site: g.gscSiteUrl(),
        range,
        previous_range: prev,
        comparison: compareTotals(curT, prevT),
        weekly: Object.entries(weekly)
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([week_start, v]) => ({ week_start, ...v })),
        daily: cur
          .sort((x, y) => x.keys[0].localeCompare(y.keys[0]))
          .map((r) => ({
            date: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          })),
      });
    }),
});

export const getTopQueries = defineTool({
  name: "get_top_queries",
  title: "Top search queries",
  description:
    "Najważniejsze zapytania, na które financeyou.pl pojawia się w Google: kliknięcia, wyświetlenia, CTR, pozycja; rozkład pozycji (top 3 / top 10 / 11–20 / 21–50 / dalej). Filtr `page_contains` zawęża do podstrony, `min_impressions` odcina szum. Tylko administrator/operator.",
  inputSchema: {
    ...rangeSchema,
    ...filterSchema,
    min_impressions: z.number().int().min(0).default(0),
    order_by: z.enum(["clicks", "impressions", "position"]).default("clicks"),
    limit: z.number().int().min(1).max(1000).default(50),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const rows = (
        await g.searchAnalytics({
          ...range,
          dimensions: ["query"],
          filters: filtersOf(a),
          rowLimit: 5000,
        })
      ).filter((r) => r.impressions >= a.min_impressions);
      const sorted = rows.sort((x, y) =>
        a.order_by === "position"
          ? x.position - y.position
          : (y as any)[a.order_by] - (x as any)[a.order_by],
      );
      return ok({
        site: g.gscSiteUrl(),
        range,
        total_queries: rows.length,
        totals: g.totals(rows),
        position_buckets: positionBuckets(rows),
        queries: sorted.slice(0, a.limit).map((r) => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
      });
    }),
});

export const getTopPages = defineTool({
  name: "get_top_pages",
  title: "Top pages in search",
  description:
    "Podstrony financeyou.pl z największym ruchem z Google: kliknięcia, wyświetlenia, CTR, pozycja. Filtr `query_contains` pokazuje, które strony rankują na frazę. Tylko administrator/operator.",
  inputSchema: {
    ...rangeSchema,
    ...filterSchema,
    order_by: z.enum(["clicks", "impressions", "position"]).default("clicks"),
    limit: z.number().int().min(1).max(1000).default(50),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const rows = await g.searchAnalytics({
        ...range,
        dimensions: ["page"],
        filters: filtersOf(a),
        rowLimit: 5000,
      });
      const sorted = rows.sort((x, y) =>
        a.order_by === "position"
          ? x.position - y.position
          : (y as any)[a.order_by] - (x as any)[a.order_by],
      );
      return ok({
        site: g.gscSiteUrl(),
        range,
        total_pages: rows.length,
        totals: g.totals(rows),
        pages: sorted.slice(0, a.limit).map((r) => ({
          page: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
      });
    }),
});

export const getPageSearchData = defineTool({
  name: "get_page_search_data",
  title: "Search data for one page",
  description:
    "Wszystko o jednej podstronie w Google: sumy za okres, porównanie z poprzednim okresem, trend dzienny, zapytania, na które się pojawia (z pozycjami), podział na urządzenia i kraje. `page` to pełny adres albo fragment ścieżki. Tylko administrator/operator.",
  inputSchema: {
    page: z
      .string()
      .min(1)
      .describe("Pełny URL albo fragment ścieżki, np. `/pozyczka-pod-zastaw`."),
    ...rangeSchema,
    limit: z.number().int().min(1).max(500).default(40),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const prev = g.previousRange(range);
      const exact = /^https?:\/\//.test(a.page);
      const filters = [
        {
          dimension: "page" as const,
          operator: exact ? ("equals" as const) : ("contains" as const),
          expression: a.page,
        },
      ];
      const [queries, daily, before, devices, countries] = await Promise.all([
        g.searchAnalytics({ ...range, dimensions: ["query"], filters, rowLimit: a.limit }),
        g.searchAnalytics({ ...range, dimensions: ["date"], filters, rowLimit: 500 }),
        g.searchAnalytics({ ...prev, dimensions: ["date"], filters, rowLimit: 500 }),
        g.searchAnalytics({ ...range, dimensions: ["device"], filters, rowLimit: 10 }),
        g.searchAnalytics({ ...range, dimensions: ["country"], filters, rowLimit: 10 }),
      ]);
      return ok({
        site: g.gscSiteUrl(),
        page: a.page,
        range,
        comparison: compareTotals(g.totals(daily), g.totals(before)),
        position_buckets: positionBuckets(queries),
        queries: queries.map((r) => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
        devices: devices.map((r) => ({
          device: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
        countries: countries.map((r) => ({
          country: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
        daily: daily
          .sort((x, y) => x.keys[0].localeCompare(y.keys[0]))
          .map((r) => ({
            date: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            position: r.position,
          })),
      });
    }),
});

export const getQueryPages = defineTool({
  name: "get_query_pages",
  title: "Pages ranking for a query",
  description:
    "Dla jednej frazy (dokładnej albo zawierającej): które podstrony financeyou.pl rankują, z jaką pozycją i CTR, trend dzienny i porównanie z poprzednim okresem. Tylko administrator/operator.",
  inputSchema: {
    query: z.string().min(2),
    exact: z.boolean().default(false).describe("Dokładna fraza zamiast „zawiera”."),
    ...rangeSchema,
    limit: z.number().int().min(1).max(200).default(20),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const prev = g.previousRange(range);
      const filters = [
        {
          dimension: "query" as const,
          operator: a.exact ? ("equals" as const) : ("contains" as const),
          expression: a.query,
        },
      ];
      const [pages, daily, before, variants] = await Promise.all([
        g.searchAnalytics({ ...range, dimensions: ["page"], filters, rowLimit: a.limit }),
        g.searchAnalytics({ ...range, dimensions: ["date"], filters, rowLimit: 500 }),
        g.searchAnalytics({ ...prev, dimensions: ["date"], filters, rowLimit: 500 }),
        a.exact
          ? Promise.resolve([])
          : g.searchAnalytics({ ...range, dimensions: ["query"], filters, rowLimit: 30 }),
      ]);
      return ok({
        site: g.gscSiteUrl(),
        query: a.query,
        exact: a.exact,
        range,
        comparison: compareTotals(g.totals(daily), g.totals(before)),
        pages: pages.map((r) => ({
          page: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
        query_variants: variants.map((r) => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
        daily: daily
          .sort((x, y) => x.keys[0].localeCompare(y.keys[0]))
          .map((r) => ({
            date: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            position: r.position,
          })),
      });
    }),
});

export const compareSearchPeriods = defineTool({
  name: "compare_search_periods",
  title: "Compare search periods",
  description:
    "Co urosło, a co spadło w Google: porównuje zapytania albo strony z ostatnich N dni z poprzednim okresem tej samej długości — zmiana kliknięć, wyświetleń i pozycji, plus nowe i utracone pozycje. Tylko administrator/operator.",
  inputSchema: {
    dimension: z.enum(["query", "page"]).default("query"),
    days: z.number().int().min(7).max(180).default(28),
    ...filterSchema,
    min_impressions: z
      .number()
      .int()
      .min(0)
      .default(20)
      .describe("Minimalne wyświetlenia w którymkolwiek okresie."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(25)
      .describe("Ile pozycji w każdej z list (wzrosty, spadki, nowe, utracone)."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = g.lastDays(a.days);
      const prev = g.previousRange(range);
      const filters = filtersOf(a);
      const [cur, before] = await Promise.all([
        g.searchAnalytics({ ...range, dimensions: [a.dimension], filters, rowLimit: 5000 }),
        g.searchAnalytics({ ...prev, dimensions: [a.dimension], filters, rowLimit: 5000 }),
      ]);
      const prevMap = new Map(before.map((r) => [r.keys[0], r]));
      const curMap = new Map(cur.map((r) => [r.keys[0], r]));
      const joined = [...new Set([...curMap.keys(), ...prevMap.keys()])]
        .map((key) => {
          const c = curMap.get(key);
          const p = prevMap.get(key);
          return {
            [a.dimension]: key,
            clicks: c?.clicks ?? 0,
            clicks_prev: p?.clicks ?? 0,
            clicks_change: (c?.clicks ?? 0) - (p?.clicks ?? 0),
            impressions: c?.impressions ?? 0,
            impressions_prev: p?.impressions ?? 0,
            position: c?.position ?? null,
            position_prev: p?.position ?? null,
            position_change: c && p ? Math.round((c.position - p.position) * 10) / 10 : null,
            status: c && p ? "both" : c ? "new" : "lost",
          };
        })
        .filter((r) => Math.max(r.impressions, r.impressions_prev) >= a.min_impressions);
      const both = joined.filter((r) => r.status === "both");
      return ok({
        site: g.gscSiteUrl(),
        dimension: a.dimension,
        range,
        previous_range: prev,
        comparison: compareTotals(g.totals(cur), g.totals(before)),
        gains: [...both].sort((x, y) => y.clicks_change - x.clicks_change).slice(0, a.limit),
        drops: [...both]
          .sort((x, y) => x.clicks_change - y.clicks_change)
          .filter((r) => r.clicks_change < 0)
          .slice(0, a.limit),
        improved_position: [...both]
          .filter((r) => (r.position_change ?? 0) < 0)
          .sort((x, y) => (x.position_change ?? 0) - (y.position_change ?? 0))
          .slice(0, a.limit),
        worsened_position: [...both]
          .filter((r) => (r.position_change ?? 0) > 0)
          .sort((x, y) => (y.position_change ?? 0) - (x.position_change ?? 0))
          .slice(0, a.limit),
        new: joined
          .filter((r) => r.status === "new")
          .sort((x, y) => y.clicks - x.clicks)
          .slice(0, a.limit),
        lost: joined
          .filter((r) => r.status === "lost")
          .sort((x, y) => y.clicks_prev - x.clicks_prev)
          .slice(0, a.limit),
      });
    }),
});

// ── Search Console: mapy witryny i inspekcja ────────────────────────────────

export const listSitemaps = defineTool({
  name: "list_sitemaps",
  title: "List sitemaps",
  description:
    "Mapy witryny zgłoszone w Search Console: ostatnie zgłoszenie i pobranie, liczba adresów zgłoszonych i zaindeksowanych, błędy, ostrzeżenia. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const maps = await g.listSitemaps();
      return ok({
        site: g.gscSiteUrl(),
        sitemaps: maps.map((m) => ({
          path: m.path,
          last_submitted: m.lastSubmitted ?? null,
          last_downloaded: m.lastDownloaded ?? null,
          pending: m.isPending ?? false,
          is_index: m.isSitemapsIndex ?? false,
          errors: Number(m.errors ?? 0),
          warnings: Number(m.warnings ?? 0),
          contents: (m.contents ?? []).map((c) => ({
            type: c.type,
            submitted: Number(c.submitted),
            indexed: Number(c.indexed),
          })),
        })),
      });
    }),
});

export const submitSitemap = defineTool({
  name: "submit_sitemap",
  title: "Submit sitemap",
  description:
    "Zgłasza (lub ponownie zgłasza) mapę witryny w Search Console — domyślnie https://financeyou.pl/sitemap.xml. Tylko administrator/operator.",
  inputSchema: { sitemap_url: z.string().url().optional() },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const { SITE_URL } = await import("@/lib/seo/company");
      const url = a.sitemap_url ?? `${SITE_URL}/sitemap.xml`;
      await g.submitSitemap(url);
      return ok({ ok: true, submitted: url, site: g.gscSiteUrl(), actor: actorId(ctx) });
    }),
});

export const deleteSitemap = defineTool({
  name: "delete_sitemap",
  title: "Delete sitemap",
  description:
    "Usuwa mapę witryny z Search Console (Google przestaje z niej korzystać). Tylko administrator.",
  inputSchema: { sitemap_url: z.string().url() },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const g = await import("@/lib/google-search.server");
      await g.deleteSitemap(a.sitemap_url);
      return ok({ ok: true, deleted: a.sitemap_url, actor: actorId(ctx) });
    }),
});

export const inspectUrl = defineTool({
  name: "inspect_url",
  title: "Inspect URL (index status)",
  description:
    "Inspekcja adresu w Google (jak w Search Console): czy jest w indeksie, werdykt, stan indeksowania, ostatnie skanowanie, robots.txt, kanoniczny wg Google i wg strony, mapa witryny, z których stron Google trafił, przydatność mobilna i wyniki rozszerzone. Limit Google: 2000 inspekcji dziennie. Tylko administrator/operator.",
  inputSchema: { url: z.string().url() },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const r = await g.inspectUrl(a.url);
      const idx = r?.indexStatusResult ?? {};
      return ok({
        url: a.url,
        search_console_link: r?.inspectionResultLink ?? null,
        index: {
          verdict: idx.verdict ?? null,
          coverage_state: idx.coverageState ?? null,
          indexing_state: idx.indexingState ?? null,
          robots_txt_state: idx.robotsTxtState ?? null,
          page_fetch_state: idx.pageFetchState ?? null,
          last_crawl_time: idx.lastCrawlTime ?? null,
          crawled_as: idx.crawledAs ?? null,
          google_canonical: idx.googleCanonical ?? null,
          user_canonical: idx.userCanonical ?? null,
          sitemaps: idx.sitemap ?? [],
          referring_urls: idx.referringUrls ?? [],
        },
        mobile_usability: r?.mobileUsabilityResult ?? null,
        rich_results: r?.richResultsResult ?? null,
        amp: r?.ampResult ?? null,
      });
    }),
});

// ── Indexing API ────────────────────────────────────────────────────────────

export const requestGoogleIndexing = defineTool({
  name: "request_google_indexing",
  title: "Request Google indexing",
  description:
    "Zgłasza adres do Google przez Indexing API (URL_UPDATED — nowa / zmieniona strona, URL_DELETED — usunięta). Uwaga: Google oficjalnie przewiduje to API dla stron z ofertami pracy i transmisjami; dla innych stron zgłoszenie bywa ignorowane. Konto usługi musi być właścicielem witryny w Search Console. Tylko administrator.",
  inputSchema: {
    url: z.string().url(),
    type: z.enum(["URL_UPDATED", "URL_DELETED"]).default("URL_UPDATED"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const g = await import("@/lib/google-search.server");
      const r = await g.requestIndexing(a.url, a.type);
      return ok({
        ok: true,
        url: a.url,
        type: a.type,
        response: r?.urlNotificationMetadata ?? r,
        actor: actorId(ctx),
      });
    }),
});

export const getGoogleIndexingStatus = defineTool({
  name: "get_google_indexing_status",
  title: "Indexing API notification status",
  description:
    "Ostatnie zgłoszenia adresu przez Indexing API (kiedy i jakiego typu). Tylko administrator/operator.",
  inputSchema: { url: z.string().url() },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      return ok(await g.indexingStatus(a.url));
    }),
});

// ── GA4 ─────────────────────────────────────────────────────────────────────

export const getSiteTraffic = defineTool({
  name: "get_site_traffic",
  title: "Site traffic (GA4)",
  description:
    "Ruch na financeyou.pl z Google Analytics 4 za okres: sesje, użytkownicy (w tym nowi), odsłony, współczynnik zaangażowania, średni czas, konwersje; porównanie z poprzednim okresem; dzień po dniu; kanały (organic, direct, paid, social…); źródła; najpopularniejsze strony; strony wejścia. Wymaga GA4_PROPERTY_ID. Tylko administrator/operator.",
  inputSchema: {
    ...rangeSchema,
    page_contains: z
      .string()
      .optional()
      .describe("Tylko strony, których ścieżka zawiera fragment."),
    limit: z.number().int().min(1).max(200).default(20),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const prev = g.previousRange(range);
      const metrics = [
        "sessions",
        "totalUsers",
        "newUsers",
        "screenPageViews",
        "engagementRate",
        "averageSessionDuration",
        "conversions",
      ];
      const filter = a.page_contains
        ? { dimension: "pagePath", value: a.page_contains }
        : undefined;
      const [cur, before, daily, channels, sources, pages, landing] = await Promise.all([
        g.ga4RunReport({ ...range, metrics, filter }),
        g.ga4RunReport({ ...prev, metrics, filter }),
        g.ga4RunReport({
          ...range,
          dimensions: ["date"],
          metrics: ["sessions", "totalUsers", "screenPageViews"],
          limit: 500,
          orderBy: { dimension: "date" },
          filter,
        }),
        g.ga4RunReport({
          ...range,
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions", "totalUsers", "conversions"],
          limit: 20,
          orderBy: { metric: "sessions" },
          filter,
        }),
        g.ga4RunReport({
          ...range,
          dimensions: ["sessionSource", "sessionMedium"],
          metrics: ["sessions", "totalUsers"],
          limit: a.limit,
          orderBy: { metric: "sessions" },
          filter,
        }),
        g.ga4RunReport({
          ...range,
          dimensions: ["pagePath"],
          metrics: ["screenPageViews", "totalUsers", "averageSessionDuration"],
          limit: a.limit,
          orderBy: { metric: "screenPageViews" },
          filter,
        }),
        g.ga4RunReport({
          ...range,
          dimensions: ["landingPage"],
          metrics: ["sessions", "totalUsers", "conversions"],
          limit: a.limit,
          orderBy: { metric: "sessions" },
          filter,
        }),
      ]);
      const c = cur.rows[0] ?? {};
      const p = before.rows[0] ?? {};
      const cmp = Object.fromEntries(
        metrics.map((m) => [
          m,
          {
            current: Number(c[m] ?? 0),
            previous: Number(p[m] ?? 0),
            change_pct: pct(Number(c[m] ?? 0), Number(p[m] ?? 0)),
          },
        ]),
      );
      return ok({
        property_id: g.ga4PropertyId(),
        range,
        previous_range: prev,
        totals: cmp,
        daily: daily.rows,
        channels: channels.rows,
        sources: sources.rows,
        top_pages: pages.rows,
        landing_pages: landing.rows,
      });
    }),
});

export const getGa4Report = defineTool({
  name: "get_ga4_report",
  title: "GA4 custom report",
  description:
    "Dowolny raport GA4 (Analytics Data API): wymiary (np. pagePath, sessionSource, city, deviceCategory, eventName) i metryki (np. sessions, totalUsers, screenPageViews, eventCount, conversions, engagementRate) za okres, z sortowaniem i filtrem po wymiarze. Tylko administrator/operator.",
  inputSchema: {
    dimensions: z.array(z.string().min(1)).max(9).default([]),
    metrics: z.array(z.string().min(1)).min(1).max(10),
    ...rangeSchema,
    order_by_metric: z.string().optional(),
    filter_dimension: z.string().optional(),
    filter_value: z.string().optional(),
    filter_match: z.enum(["EXACT", "CONTAINS", "BEGINS_WITH"]).default("CONTAINS"),
    limit: z.number().int().min(1).max(10_000).default(50),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const range = await rangeOf(a);
      const r = await g.ga4RunReport({
        ...range,
        dimensions: a.dimensions,
        metrics: a.metrics,
        limit: a.limit,
        orderBy: a.order_by_metric ? { metric: a.order_by_metric } : undefined,
        filter:
          a.filter_dimension && a.filter_value
            ? { dimension: a.filter_dimension, value: a.filter_value, matchType: a.filter_match }
            : undefined,
      });
      return ok({ property_id: g.ga4PropertyId(), range, row_count: r.rowCount, rows: r.rows });
    }),
});

export const getGa4Realtime = defineTool({
  name: "get_ga4_realtime",
  title: "GA4 realtime",
  description:
    "Kto jest teraz na stronie (ostatnie 30 min): aktywni użytkownicy łącznie, po stronach, krajach i urządzeniach. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const [total, pages, countries, devices] = await Promise.all([
        g.ga4Realtime({}),
        g.ga4Realtime({ dimensions: ["unifiedScreenName"], limit: 20 }),
        g.ga4Realtime({ dimensions: ["country"], limit: 10 }),
        g.ga4Realtime({ dimensions: ["deviceCategory"], limit: 5 }),
      ]);
      return ok({
        active_users: Number(total.rows[0]?.activeUsers ?? 0),
        pages: pages.rows,
        countries: countries.rows,
        devices: devices.rows,
      });
    }),
});

// ── PageSpeed ───────────────────────────────────────────────────────────────

export const getPagespeed = defineTool({
  name: "get_pagespeed",
  title: "PageSpeed Insights",
  description:
    "Ocena strony wg Google PageSpeed / Lighthouse: wyniki 0–100 (wydajność, SEO, dostępność, dobre praktyki), Core Web Vitals z laboratorium i z realnych użytkowników (LCP, INP, CLS), największe okazje do poprawy, oblane audyty SEO. Domyślnie strona główna, mobile. Trwa 20–60 s. Tylko administrator/operator.",
  inputSchema: {
    url: z.string().url().optional(),
    strategy: z.enum(["mobile", "desktop"]).default("mobile"),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const g = await import("@/lib/google-search.server");
      const { SITE_URL } = await import("@/lib/seo/company");
      return ok(await g.pageSpeed(a.url ?? SITE_URL, a.strategy));
    }),
});

// ── Ogólne wywołanie ────────────────────────────────────────────────────────

export const googleApiRequest = defineTool({
  name: "google_api_request",
  title: "Raw Google API request",
  description:
    "Dowolne uwierzytelnione wywołanie API Google pod https://*.googleapis.com/… (GET/POST/PUT/DELETE, parametry, body JSON) z wybranymi zakresami (webmasters, analytics, indexing) — do funkcji bez dedykowanego narzędzia. Tylko administrator.",
  inputSchema: {
    url: z
      .string()
      .url()
      .regex(/^https:\/\/[a-z0-9.-]*googleapis\.com\//),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    json: z.any().optional(),
    scopes: z
      .array(z.enum(["webmasters", "webmastersReadonly", "analytics", "indexing"]))
      .min(1)
      .default(["webmastersReadonly"]),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const auth = await import("@/lib/google-auth.server");
      const g = await import("@/lib/google-search.server");
      const r = await auth.googleRequest(a.url, {
        method: a.method,
        query: a.query,
        json: a.json,
        scopes: a.scopes.map((s) => g.SCOPES[s]),
      });
      return ok({ body: r });
    }),
});

export const googleTools = [
  googleSearchStatus,
  getSearchPerformance,
  getSearchTrend,
  getTopQueries,
  getTopPages,
  getPageSearchData,
  getQueryPages,
  compareSearchPeriods,
  listSitemaps,
  submitSitemap,
  deleteSitemap,
  inspectUrl,
  requestGoogleIndexing,
  getGoogleIndexingStatus,
  getSiteTraffic,
  getGa4Report,
  getGa4Realtime,
  getPagespeed,
  googleApiRequest,
];
