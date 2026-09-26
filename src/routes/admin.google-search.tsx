// Panel „Google Search": realne dane z Search Console — pozycje najpopularniejszych
// fraz, wejścia na stronę i zmiana w czasie (plus ruch z GA4, jeśli skonfigurowany).
//
// Formy wykresów: zmiana w czasie → linie. Kliknięcia i wyświetlenia mają różne
// rzędy wielkości, więc są to dwa osobne wykresy (nigdy dwie osie Y na jednym).
// Oś pozycji jest odwrócona — pozycja 1 na górze, bo „wyżej" znaczy lepiej.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Search,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  MousePointerClick,
  Eye,
  Percent,
  ArrowUpDown,
  ExternalLink,
  Settings2,
} from "lucide-react";
import {
  getSearchOverview,
  getQueryHistory,
  getSearchIntegrationStatus,
} from "@/lib/google-search.functions";

export const Route = createFileRoute("/admin/google-search")({
  component: GoogleSearchPage,
});

// Paleta kategorii (slot 1–5) — sprawdzona pod kątem daltonizmu, osobne kroki
// dla jasnego i ciemnego tła. Kolor niesie tożsamość frazy, nigdy jej rangę.
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

function useIsDark() {
  const [dark, setDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const nf = new Intl.NumberFormat("pl-PL");
const fmtInt = (v: number | null | undefined) => (v == null ? "—" : nf.format(Math.round(v)));
const fmtPos = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}%`);

/** „2026-09-26" → „26.09" (oś) / „26.09.2026" (dymek). */
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const fullDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

type Overview = Awaited<ReturnType<typeof getSearchOverview>>;

function GoogleSearchPage() {
  const load = useServerFn(getSearchOverview);
  const [days, setDays] = useState(28);
  const [pageFilter, setPageFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (d = days, filter = appliedFilter) => {
      setLoading(true);
      setError(null);
      try {
        const r = await load({
          data: { days: d, page_contains: filter || null, chart_queries: 5, table_limit: 30 },
        });
        setData(r);
      } catch (e: any) {
        setError(e?.message ?? "Nie udało się pobrać danych z Search Console.");
      } finally {
        setLoading(false);
      }
    },
    [load, days, appliedFilter],
  );

  useEffect(() => {
    void refresh(days, appliedFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, appliedFilter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Google Search — pozycje i wejścia</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Dane z Google Search Console: pozycje najpopularniejszych fraz, wejścia na stronę i
            zmiana w czasie. Google podaje dane z 1–3 dniami opóźnienia.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Okres</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dni</SelectItem>
                <SelectItem value="28">28 dni</SelectItem>
                <SelectItem value="90">90 dni</SelectItem>
                <SelectItem value="180">180 dni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tylko adresy zawierające</Label>
            <Input
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setAppliedFilter(pageFilter.trim())}
              placeholder="np. /blog"
              className="w-[180px]"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setAppliedFilter(pageFilter.trim());
              void refresh(days, pageFilter.trim());
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Odśwież
          </Button>
        </div>
      </header>

      {error ? <IntegrationStatus error={error} /> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : null}

      {data ? <Dashboard data={data} days={days} pageFilter={appliedFilter} /> : null}
    </div>
  );
}

function Dashboard({
  data,
  days,
  pageFilter,
}: {
  data: Overview;
  days: number;
  pageFilter: string;
}) {
  const dark = useIsDark();
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  const axis = "var(--muted-foreground)";
  const grid = "var(--border)";
  const [openQuery, setOpenQuery] = useState<string | null>(null);

  // Wspólna oś czasu dla wykresu pozycji fraz: jeden wiersz na dzień, po kolumnie
  // na frazę (klucze techniczne k0…k4, żeby treść frazy nie była kluczem danych).
  const trendRows = useMemo(() => {
    const dates = data.series.map((s) => s.date);
    return dates.map((date, i) => {
      const row: Record<string, number | string | null> = { date };
      data.trends.forEach((t, idx) => {
        row[`k${idx}`] = t.points[i]?.position ?? null;
      });
      return row;
    });
  }, [data]);

  const posDomain = useMemo<[number, (max: number) => number]>(
    () => [1, (max: number) => Math.ceil((max || 10) + 1)],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label={`Wejścia z Google (${days} dni)`}
          value={fmtInt(data.totals.clicks)}
          hint={`poprzednio ${fmtInt(data.previous_totals.clicks)}`}
          change={data.change.clicks_pct}
          suffix="%"
        />
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="Wyświetlenia w wynikach"
          value={fmtInt(data.totals.impressions)}
          hint={`poprzednio ${fmtInt(data.previous_totals.impressions)}`}
          change={data.change.impressions_pct}
          suffix="%"
        />
        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label="CTR"
          value={fmtPct(data.totals.ctr)}
          hint={`poprzednio ${fmtPct(data.previous_totals.ctr)}`}
          change={data.change.ctr_points}
          suffix=" pkt"
          digits={2}
        />
        <StatCard
          icon={<ArrowUpDown className="h-4 w-4" />}
          label="Średnia pozycja"
          value={fmtPos(data.totals.position)}
          hint={`poprzednio ${fmtPos(data.previous_totals.position)}`}
          change={data.change.position_change}
          suffix=" poz."
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Witryna: <span className="font-mono">{data.site}</span> · zakres{" "}
        {fullDay(data.range.startDate)}
        {" – "}
        {fullDay(data.range.endDate)} · porównanie z {fullDay(data.previous_range.startDate)} –{" "}
        {fullDay(data.previous_range.endDate)} · {fmtInt(data.queries_total)} fraz w danych
        {pageFilter ? ` · filtr adresu: ${pageFilter}` : ""}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Wejścia na stronę z Google"
          description="Kliknięcia w wyniki wyszukiwania, dzień po dniu."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gsc-clicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette[0]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={palette[0]} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDay}
                tick={{ fontSize: 11, fill: axis }}
                stroke={grid}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: axis }}
                stroke={grid}
                allowDecimals={false}
                width={44}
              />
              <RTooltip
                content={<SeriesTooltip labels={{ clicks: "Wejścia" }} />}
                cursor={{ stroke: axis, strokeOpacity: 0.3 }}
              />
              <Area
                type="monotone"
                dataKey="clicks"
                stroke={palette[0]}
                strokeWidth={2}
                fill="url(#gsc-clicks)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Wyświetlenia w wynikach"
          description="Ile razy strona pokazała się w Google (osobny wykres — inna skala niż wejścia)."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gsc-impr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette[1]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={palette[1]} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDay}
                tick={{ fontSize: 11, fill: axis }}
                stroke={grid}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: axis }}
                stroke={grid}
                allowDecimals={false}
                width={52}
              />
              <RTooltip
                content={<SeriesTooltip labels={{ impressions: "Wyświetlenia" }} />}
                cursor={{ stroke: axis, strokeOpacity: 0.3 }}
              />
              <Area
                type="monotone"
                dataKey="impressions"
                stroke={palette[1]}
                strokeWidth={2}
                fill="url(#gsc-impr)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Średnia pozycja w Google"
        description="Cała witryna, dzień po dniu. Oś odwrócona — im wyżej, tym lepsza pozycja."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDay}
              tick={{ fontSize: 11, fill: axis }}
              stroke={grid}
              minTickGap={24}
            />
            <YAxis
              reversed
              domain={posDomain}
              tick={{ fontSize: 11, fill: axis }}
              stroke={grid}
              width={44}
            />
            <RTooltip
              content={<SeriesTooltip labels={{ position: "Średnia pozycja" }} digits={1} />}
              cursor={{ stroke: axis, strokeOpacity: 0.3 }}
            />
            <Line
              type="monotone"
              dataKey="position"
              stroke={palette[2]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {data.trends.length ? (
        <ChartCard
          title="Pozycje najpopularniejszych fraz"
          description="Pięć fraz z największą liczbą wejść. Oś odwrócona — pozycja 1 na górze."
          height="h-[22rem]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDay}
                tick={{ fontSize: 11, fill: axis }}
                stroke={grid}
                minTickGap={24}
              />
              <YAxis
                reversed
                domain={posDomain}
                tick={{ fontSize: 11, fill: axis }}
                stroke={grid}
                width={44}
              />
              <RTooltip
                content={
                  <SeriesTooltip
                    labels={Object.fromEntries(data.trends.map((t, i) => [`k${i}`, t.query]))}
                    digits={1}
                  />
                }
                cursor={{ stroke: axis, strokeOpacity: 0.3 }}
              />
              <Legend
                formatter={(value) => {
                  const idx = Number(String(value).replace("k", ""));
                  return (
                    <span className="text-xs text-foreground">
                      {data.trends[idx]?.query ?? value}
                    </span>
                  );
                }}
              />
              {data.trends.map((t, i) => (
                <Line
                  key={t.query}
                  type="monotone"
                  dataKey={`k${i}`}
                  name={`k${i}`}
                  stroke={palette[i % palette.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rozkład pozycji fraz</CardTitle>
          <CardDescription>
            Ile fraz trzyma się w poszczególnych przedziałach — na podstawie{" "}
            {fmtInt(data.queries_total)} fraz pobranych z Search Console (do 1000
            najpopularniejszych).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <BucketBadge label="TOP 3" value={data.buckets.top3} />
          <BucketBadge label="4–10" value={data.buckets.top10} />
          <BucketBadge label="11–20" value={data.buckets.top20} />
          <BucketBadge label="21–50" value={data.buckets.top50} />
          <BucketBadge label="51+" value={data.buckets.rest} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Najpopularniejsze frazy</CardTitle>
          <CardDescription>
            Kliknij frazę, żeby zobaczyć jej pozycję dzień po dniu. Zmiana liczona względem
            poprzedniego okresu tej samej długości.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fraza</TableHead>
                <TableHead className="text-right">Wejścia</TableHead>
                <TableHead className="text-right">Wyświetlenia</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Pozycja</TableHead>
                <TableHead className="text-right">Zmiana pozycji</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.queries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Brak danych w tym okresie.
                  </TableCell>
                </TableRow>
              ) : null}
              {data.queries.map((q) => (
                <TableRow
                  key={q.query}
                  className="cursor-pointer"
                  onClick={() => setOpenQuery(q.query)}
                >
                  <TableCell className="font-medium">{q.query}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(q.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(q.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(q.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPos(q.position)}</TableCell>
                  <TableCell className="text-right">
                    <Delta value={q.position_change} suffix=" poz." digits={1} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Strony z największym ruchem</CardTitle>
          <CardDescription>Wejścia z wyszukiwarki w podziale na podstrony.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adres</TableHead>
                <TableHead className="text-right">Wejścia</TableHead>
                <TableHead className="text-right">Wyświetlenia</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Pozycja</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Brak danych w tym okresie.
                  </TableCell>
                </TableRow>
              ) : null}
              {data.pages.map((p) => (
                <TableRow key={p.page}>
                  <TableCell className="font-mono text-xs">{p.path}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(p.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(p.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(p.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPos(p.position)}</TableCell>
                  <TableCell>
                    <a href={p.page} target="_blank" rel="noreferrer" title="Otwórz stronę">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.ga4 ? <Ga4Card ga4={data.ga4} palette={palette} axis={axis} grid={grid} /> : null}

      <QueryHistoryDialog
        query={openQuery}
        days={days}
        pageFilter={pageFilter}
        palette={palette}
        axis={axis}
        grid={grid}
        onClose={() => setOpenQuery(null)}
      />
    </div>
  );
}

function Ga4Card({
  ga4,
  palette,
  axis,
  grid,
}: {
  ga4: NonNullable<Overview["ga4"]>;
  palette: string[];
  axis: string;
  grid: string;
}) {
  return (
    <ChartCard
      title="Ruch na stronie (Google Analytics 4)"
      description={`Sesje i użytkownicy dzień po dniu — cały ruch, nie tylko z wyszukiwarki. Razem: ${fmtInt(
        ga4.totals.sessions,
      )} sesji, ${fmtInt(ga4.totals.users)} użytkowników.`}
      footer={
        ga4.channels.length ? (
          <div className="flex flex-wrap gap-2 pt-3">
            {ga4.channels.slice(0, 8).map((c) => (
              <Badge key={c.channel} variant="secondary" className="font-normal">
                {c.channel}: {fmtInt(c.sessions)}
              </Badge>
            ))}
          </div>
        ) : null
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={ga4.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tick={{ fontSize: 11, fill: axis }}
            stroke={grid}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: axis }}
            stroke={grid}
            allowDecimals={false}
            width={44}
          />
          <RTooltip
            content={<SeriesTooltip labels={{ sessions: "Sesje", users: "Użytkownicy" }} />}
            cursor={{ stroke: axis, strokeOpacity: 0.3 }}
          />
          <Legend
            formatter={(v) => (
              <span className="text-xs text-foreground">
                {v === "sessions" ? "Sesje" : "Użytkownicy"}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="sessions"
            stroke={palette[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="users"
            stroke={palette[1]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function QueryHistoryDialog({
  query,
  days,
  pageFilter,
  palette,
  axis,
  grid,
  onClose,
}: {
  query: string | null;
  days: number;
  pageFilter: string;
  palette: string[];
  axis: string;
  grid: string;
  onClose: () => void;
}) {
  const load = useServerFn(getQueryHistory);
  const [data, setData] = useState<Awaited<ReturnType<typeof getQueryHistory>> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load({ data: { query, days, page_contains: pageFilter || null } })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: any) => toast.error(e?.message ?? "Nie udało się pobrać historii frazy."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, days, pageFilter, load]);

  return (
    <Dialog open={Boolean(query)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{query}</DialogTitle>
          <DialogDescription>
            {data
              ? `${fmtInt(data.totals.clicks)} wejść · ${fmtInt(
                  data.totals.impressions,
                )} wyświetleń · CTR ${fmtPct(data.totals.ctr)} · średnia pozycja ${fmtPos(
                  data.totals.position,
                )}`
              : "Pozycja i wejścia dzień po dniu."}
          </DialogDescription>
        </DialogHeader>
        {loading ? <Skeleton className="h-64" /> : null}
        {data && !loading ? (
          <div className="space-y-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDay}
                    tick={{ fontSize: 11, fill: axis }}
                    stroke={grid}
                    minTickGap={24}
                  />
                  <YAxis
                    reversed
                    domain={[1, (max: number) => Math.ceil((max || 10) + 1)]}
                    tick={{ fontSize: 11, fill: axis }}
                    stroke={grid}
                    width={44}
                  />
                  <RTooltip
                    content={<SeriesTooltip labels={{ position: "Pozycja" }} digits={1} />}
                    cursor={{ stroke: axis, strokeOpacity: 0.3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="position"
                    stroke={palette[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDay}
                    tick={{ fontSize: 11, fill: axis }}
                    stroke={grid}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: axis }}
                    stroke={grid}
                    allowDecimals={false}
                    width={44}
                  />
                  <RTooltip
                    content={<SeriesTooltip labels={{ clicks: "Wejścia" }} />}
                    cursor={{ stroke: axis, strokeOpacity: 0.3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke={palette[1]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {data.pages.length ? (
              <div className="text-xs text-muted-foreground">
                Strony w wynikach:{" "}
                {data.pages.slice(0, 3).map((p) => (
                  <span key={p.page} className="font-mono">
                    {(() => {
                      try {
                        return new URL(p.page).pathname;
                      } catch {
                        return p.page;
                      }
                    })()}{" "}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function IntegrationStatus({ error }: { error: string }) {
  const load = useServerFn(getSearchIntegrationStatus);
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof getSearchIntegrationStatus>
  > | null>(null);

  useEffect(() => {
    load()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [load]);

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4" />
          Nie udało się pobrać danych z Search Console
        </CardTitle>
        <CardDescription>{error}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {status ? (
          <>
            <Row label="Uwierzytelnienie" value={status.auth_method ?? "brak"} />
            {status.service_account_email ? (
              <Row label="Konto usługi" value={status.service_account_email} />
            ) : null}
            <Row label="Witryna" value={`${status.site_url} (${status.site_url_source})`} />
            <Row label="Uprawnienie do witryny" value={status.site_permission ?? "brak"} />
            <Row label="GA4" value={status.ga4_property_id ?? "nie skonfigurowano"} />
            {status.sites_error ? <Row label="Lista witryn" value={status.sites_error} /> : null}
            <p className="text-xs text-muted-foreground pt-2">
              Konto usługi musi być dodane w Search Console (Ustawienia → Użytkownicy, poziom Pełny)
              oraz w GA4 (Administracja → Dostęp do usługi, Wyświetlający). W Google Cloud włącz
              Search Console API i Analytics Data API. Adres witryny ustawia zmienna GSC_SITE_URL,
              usługę GA4 — GA4_PROPERTY_ID.
            </p>
          </>
        ) : (
          <Skeleton className="h-24" />
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-48 shrink-0">{label}</span>
      <span className="font-mono text-xs break-all">{value}</span>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  height = "h-72",
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  height?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className={height}>{children}</div>
        {footer}
      </CardContent>
    </Card>
  );
}

function SeriesTooltip({
  active,
  payload,
  label,
  labels,
  digits = 0,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  labels: Record<string, string>;
  digits?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1 text-popover-foreground">{fullDay(String(label ?? ""))}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-popover-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground max-w-[16rem] truncate">
            {labels[p.dataKey] ?? p.dataKey}
          </span>
          <span className="ml-auto tabular-nums font-medium">
            {p.value == null
              ? "—"
              : digits
                ? Number(p.value).toFixed(digits)
                : nf.format(Math.round(Number(p.value)))}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  change,
  suffix,
  digits = 1,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  change: number | null;
  suffix?: string;
  digits?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 flex items-center gap-2">
          <Delta value={change} suffix={suffix} digits={digits} />
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Zmiana wartości: dodatnia = lepiej (dla pozycji liczona jako awans). */
function Delta({
  value,
  suffix = "",
  digits = 1,
}: {
  value: number | null;
  suffix?: string;
  digits?: number;
}) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.05;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const cls = flat
    ? "text-muted-foreground"
    : up
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {flat ? "bez zmian" : `${up ? "+" : ""}${value.toFixed(digits)}${suffix}`}
    </span>
  );
}

function BucketBadge({ label, value }: { label: string; value: number }) {
  return (
    <Badge variant="outline" className="text-sm font-normal">
      {label}: <span className="ml-1 font-semibold tabular-nums">{fmtInt(value)}</span>
    </Badge>
  );
}
