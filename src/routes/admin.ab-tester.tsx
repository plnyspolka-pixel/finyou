import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye, Users, TrendingUp, ArrowUpRight, ArrowDownRight,
  Monitor, Smartphone, Tablet, RefreshCw, BarChart3,
  Target, Zap,
} from "lucide-react";
import { getHomepageABStats } from "@/lib/ab-homepage.functions";

export const Route = createFileRoute("/admin/ab-tester")({
  component: ABTesterDashboard,
});

type VariantData = {
  views: number;
  uniqueVisitors: number;
  funnel: {
    stepContact: number;
    stepPath: number;
    stepProperty: number;
    stepKw: number;
    stepPhotos: number;
    stepCalculator: number;
    submits: number;
  };
  ctaClicks: number;
  cr: number;
  devices: Record<string, number>;
  sources: Record<string, number>;
  hourly: Record<string, number>;
  daily: Record<string, number>;
};

function ABTesterDashboard() {
  const statsFn = useServerFn(getHomepageABStats);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["homepage-ab-stats"],
    queryFn: () => statsFn(),
    refetchInterval: 30_000,
  });

  const stats = data as { A: VariantData; B: VariantData; totalEvents: number } | undefined;

  const lift = useMemo(() => {
    if (!stats) return null;
    const crA = stats.A.cr;
    const crB = stats.B.cr;
    if (crA === 0) return null;
    return ((crB - crA) / crA) * 100;
  }, [stats]);

  const winner = useMemo(() => {
    if (!stats) return null;
    if (stats.A.views < 30 || stats.B.views < 30) return null;
    if (stats.A.cr > stats.B.cr) return "A";
    if (stats.B.cr > stats.A.cr) return "B";
    return null;
  }, [stats]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">A/B Tester Landing Page</h1>
          <p className="text-sm text-muted-foreground">
            Porównanie dwóch wariantów strony głównej financeyou.pl.
            Ruch dzielony 50/50 na poziomie przeglądarki (localStorage).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Odśwież
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Ładowanie statystyk...</div>
      ) : !stats ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Brak danych. Statystyki pojawią się po pierwszych wizytach na stronie głównej.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Variant descriptions */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card className={winner === "A" ? "ring-2 ring-emerald-500" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="default" className="text-sm">A</Badge>
                  Kontrola — Video + formularz
                  {winner === "A" && <Badge className="bg-emerald-500 text-white">Wygrywa</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Obecny landing: hero video, 3-krokowy formularz (kontakt → ścieżka → wniosek z kalkulatorem).
                Źródło: <code className="text-xs">landing_single_page</code>
              </CardContent>
            </Card>
            <Card className={winner === "B" ? "ring-2 ring-emerald-500" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="secondary" className="text-sm">B</Badge>
                  Express — Money-First
                  {winner === "B" && <Badge className="bg-emerald-500 text-white">Wygrywa</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Odwrócony flow: kalkulator (ile potrzebujesz?) → typ nieruchomości → KW + zdjęcia → kontakt na końcu.
                Źródło: <code className="text-xs">landing_ab_variant_b</code>
              </CardContent>
            </Card>
          </div>

          {/* Main metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCard
              label="Odsłony A"
              value={stats.A.views}
              icon={Eye}
            />
            <MetricCard
              label="Odsłony B"
              value={stats.B.views}
              icon={Eye}
            />
            <MetricCard
              label="Unikalni A"
              value={stats.A.uniqueVisitors}
              icon={Users}
            />
            <MetricCard
              label="Unikalni B"
              value={stats.B.uniqueVisitors}
              icon={Users}
            />
            <MetricCard
              label="CR% A"
              value={`${stats.A.cr.toFixed(2)}%`}
              icon={Target}
              highlight={winner === "A"}
            />
            <MetricCard
              label="CR% B"
              value={`${stats.B.cr.toFixed(2)}%`}
              icon={Target}
              highlight={winner === "B"}
            />
          </div>

          {/* Lift */}
          {lift !== null && (
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`grid h-12 w-12 place-items-center rounded-full ${lift >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                  {lift >= 0 ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">
                    {lift >= 0 ? "+" : ""}{lift.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Lift wariantu B vs kontrola (A)
                  </div>
                </div>
                <div className="ml-auto text-right text-xs text-muted-foreground">
                  <div>A: {stats.A.funnel.submits} konwersji / {stats.A.views} odsłon</div>
                  <div>B: {stats.B.funnel.submits} konwersji / {stats.B.views} odsłon</div>
                  {(stats.A.views < 30 || stats.B.views < 30) && (
                    <div className="mt-1 font-semibold text-amber-600">
                      Za mało danych (min. 30 odsłon per wariant)
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Konwersje */}
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard
              label="Kompletne wnioski (A)"
              value={stats.A.funnel.submits}
              icon={Zap}
              subtitle={stats.A.views > 0 ? `${stats.A.cr.toFixed(2)}% konwersji` : undefined}
            />
            <MetricCard
              label="Kompletne wnioski (B)"
              value={stats.B.funnel.submits}
              icon={Zap}
              subtitle={stats.B.views > 0 ? `${stats.B.cr.toFixed(2)}% konwersji` : undefined}
            />
          </div>

          {/* Funnel comparison */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Lejek po krokach
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <FunnelCard variant="A" data={stats.A} />
              <FunnelCard variant="B" data={stats.B} />
            </div>
          </section>

          {/* Devices */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Urządzenia
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <DeviceCard variant="A" devices={stats.A.devices} />
              <DeviceCard variant="B" devices={stats.B.devices} />
            </div>
          </section>

          {/* Sources */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Źródła ruchu
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <SourceCard variant="A" sources={stats.A.sources} />
              <SourceCard variant="B" sources={stats.B.sources} />
            </div>
          </section>

          {/* Daily trend */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Odsłony dziennie
            </h2>
            <DailyTrend a={stats.A.daily} b={stats.B.daily} />
          </section>

          {/* Total events */}
          <div className="text-xs text-muted-foreground text-right">
            Łącznie {stats.totalEvents} zdarzeń w bazie. Auto-odświeżanie co 30s.
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  subtitle,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: typeof Eye;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "ring-2 ring-emerald-500" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

const FUNNEL_LABELS_A: Record<string, string> = {
  view: "Odsłona strony",
  stepContact: "Dane kontaktowe",
  stepPath: "Wybór ścieżki",
  stepProperty: "Typ nieruchomości",
  stepKw: "Numer KW",
  stepPhotos: "Zdjęcia",
  stepCalculator: "Kalkulator",
  submits: "Wniosek wysłany",
};

const FUNNEL_LABELS_B: Record<string, string> = {
  view: "Odsłona strony",
  stepCalculator: "Kalkulator (kwota)",
  stepProperty: "Typ nieruchomości",
  stepKw: "KW + zdjęcia",
  stepContact: "Dane kontaktowe",
  submits: "Wniosek wysłany",
};

function FunnelCard({ variant, data }: { variant: string; data: VariantData }) {
  const labels = variant === "A" ? FUNNEL_LABELS_A : FUNNEL_LABELS_B;
  const steps = variant === "A"
    ? [
        { key: "view", val: data.views },
        { key: "stepContact", val: data.funnel.stepContact },
        { key: "stepPath", val: data.funnel.stepPath },
        { key: "stepProperty", val: data.funnel.stepProperty },
        { key: "stepKw", val: data.funnel.stepKw },
        { key: "stepCalculator", val: data.funnel.stepCalculator },
        { key: "submits", val: data.funnel.submits },
      ]
    : [
        { key: "view", val: data.views },
        { key: "stepCalculator", val: data.funnel.stepCalculator },
        { key: "stepProperty", val: data.funnel.stepProperty },
        { key: "stepKw", val: data.funnel.stepKw },
        { key: "stepContact", val: data.funnel.stepContact },
        { key: "submits", val: data.funnel.submits },
      ];

  const maxVal = Math.max(1, steps[0]?.val ?? 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Lejek — Wariant <Badge variant={variant === "A" ? "default" : "secondary"}>{variant}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s, i) => {
          const pct = maxVal > 0 ? (s.val / maxVal) * 100 : 0;
          const dropoff = i > 0 && steps[i - 1]!.val > 0
            ? ((steps[i - 1]!.val - s.val) / steps[i - 1]!.val * 100).toFixed(0)
            : null;
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{labels[s.key] ?? s.key}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{s.val}</span>
                  {dropoff && Number(dropoff) > 0 && (
                    <span className="text-red-500 text-[10px]">-{dropoff}%</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${i === steps.length - 1 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function DeviceCard({ variant, devices }: { variant: string; devices: Record<string, number> }) {
  const total = Object.values(devices).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(devices).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Wariant <Badge variant={variant === "A" ? "default" : "secondary"}>{variant}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak danych</p>
        ) : sorted.map(([dev, count]) => {
          const Icon = DEVICE_ICONS[dev] ?? Monitor;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
          return (
            <div key={dev} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground capitalize">
                <Icon className="h-4 w-4" />
                {dev}
              </span>
              <span className="font-medium tabular-nums">{count} <span className="text-xs text-muted-foreground">({pct}%)</span></span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SourceCard({ variant, sources }: { variant: string; sources: Record<string, number> }) {
  const sorted = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Wariant <Badge variant={variant === "A" ? "default" : "secondary"}>{variant}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Brak danych</p>
        ) : sorted.map(([src, count]) => (
          <div key={src} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground truncate max-w-[200px]">{src}</span>
            <span className="font-medium tabular-nums">{count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DailyTrend({ a, b }: { a: Record<string, number>; b: Record<string, number> }) {
  const allDates = useMemo(() => {
    const set = new Set([...Object.keys(a), ...Object.keys(b)]);
    return Array.from(set).sort();
  }, [a, b]);

  if (allDates.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Brak danych dziennych.
        </CardContent>
      </Card>
    );
  }

  const maxVal = Math.max(
    1,
    ...allDates.map((d) => Math.max(a[d] ?? 0, b[d] ?? 0)),
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-2">
          {allDates.slice(-14).map((date) => {
            const va = a[date] ?? 0;
            const vb = b[date] ?? 0;
            return (
              <div key={date} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{date}</span>
                  <span className="tabular-nums">
                    <span className="text-primary">A: {va}</span>
                    {" / "}
                    <span className="text-violet-500">B: {vb}</span>
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(va / maxVal) * 100}%` }} />
                  </div>
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(vb / maxVal) * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Wariant A</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" /> Wariant B</span>
        </div>
      </CardContent>
    </Card>
  );
}
