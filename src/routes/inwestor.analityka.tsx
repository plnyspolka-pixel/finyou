// Moduł „Analityka" panelu inwestora: pipeline analityczny (pobranie KW →
// właściciele → analiza KW → analiza ryzyka) — ten sam, którym posługuje się
// zespół Finance You w panelu admina — dla okazji i wniosków inwestora.
// Lewa kolumna: lista z postępem czterech kroków; prawa: szczegóły wybranego
// wniosku krok po kroku oraz uruchomienie przebiegu na żądanie.
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  Play,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { KwAnalysisReport } from "@/components/kw-analysis/kw-analysis-section";
import { InvestorValuationCard } from "@/components/risk-assessment/investor-valuation-card";
import { InvestorSummaryCard } from "@/components/property-analysis/investor-summary-card";
import { RiskDisclaimer } from "@/components/risk-assessment/risk-disclaimer";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { formatDateTime, formatPLN, propertyTypeLabels } from "@/lib/labels";
import { STATUS_LABELS as KW_STATUS_LABELS } from "@/lib/kw-analysis/types";
import {
  getMyAnalyticsDetail,
  listMyAnalyticsApplications,
  requestInvestorAnalysisRun,
} from "@/lib/investor-analytics/analytics.functions";
import {
  ANALYTICS_SOURCE_LABELS,
  ANALYTICS_STEPS,
  ANALYTICS_STEP_STATUS_LABELS,
  analyticsDoneCount,
  analyticsStepStatus,
  type AnalyticsDetail,
  type AnalyticsListItem,
  type AnalyticsSource,
  type AnalyticsStepMeta,
  type AnalyticsStepStatus,
} from "@/lib/investor-analytics/types";

export const Route = createFileRoute("/inwestor/analityka")({
  validateSearch: (search: Record<string, unknown>): { app?: string } => ({
    app: typeof search.app === "string" ? search.app : undefined,
  }),
  component: AnalitykaPage,
});

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

function accent(hue: number, lightness: number, chroma: number, alpha = 1): string {
  return `oklch(${lightness} ${chroma} ${hue}${alpha < 1 ? ` / ${alpha}` : ""})`;
}

const SOURCE_TONE: Record<AnalyticsSource, string> = {
  okazja: "bg-emerald-100 text-emerald-800 border-emerald-200",
  oferta: "bg-sky-100 text-sky-800 border-sky-200",
  przekazany: "bg-slate-100 text-slate-700 border-slate-200",
};

const RUN_LABELS: Record<string, { label: string; tone: string }> = {
  running: { label: "Przebieg w toku", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  done: {
    label: "Przebieg zakończony",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  error: { label: "Przebieg z błędem", tone: "bg-rose-100 text-rose-800 border-rose-200" },
};

type KwSectionKey = keyof NonNullable<AnalyticsDetail["kwDocument"]>["sections"];

const KW_SECTIONS: { key: KwSectionKey; label: string }[] = [
  { key: "okladka", label: "Okładka" },
  { key: "dzial_1o", label: "Dział I-O — Oznaczenie nieruchomości" },
  { key: "dzial_1s", label: "Dział I-Sp — Spis praw związanych" },
  { key: "dzial_2", label: "Dział II — Własność" },
  { key: "dzial_3", label: "Dział III — Prawa, roszczenia i ograniczenia" },
  { key: "dzial_4", label: "Dział IV — Hipoteki" },
];

function itemTitle(item: AnalyticsListItem): string {
  const type = item.propertyType
    ? (propertyTypeLabels[item.propertyType] ?? item.propertyType)
    : "Nieruchomość";
  return [type, item.city].filter(Boolean).join(" · ");
}

// ── Strona ──────────────────────────────────────────────────────────────────

function AnalitykaPage() {
  const { app } = useSearch({ from: "/inwestor/analityka" });
  const navigate = useNavigate();
  const listFn = useServerFn(listMyAnalyticsApplications);
  const listQ = useQuery({
    queryKey: ["investor-analytics-list"],
    queryFn: () => listFn(),
    // Trwający przebieg dokańcza cron (co 15 min) — odświeżamy listę co pół minuty.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((i) => i.run?.status === "running") ? 30_000 : false,
  });
  const items = useMemo(() => listQ.data ?? [], [listQ.data]);

  const [filter, setFilter] = useState<"all" | AnalyticsSource>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== "all" && i.source !== filter) return false;
      if (!needle) return true;
      const hay = [
        i.city,
        i.voivodeship,
        i.kwNumber,
        i.projectRef,
        i.propertyType ? propertyTypeLabels[i.propertyType] : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, filter, q]);

  const selectedId =
    app && items.some((i) => i.id === app) ? app : (filtered[0]?.id ?? items[0]?.id ?? null);

  const select = (id: string) =>
    void navigate({ to: "/inwestor/analityka", search: { app: id }, replace: true });

  const stats = useMemo(() => {
    const ready = items.filter((i) => analyticsDoneCount(i) === ANALYTICS_STEPS.length).length;
    const running = items.filter((i) => i.run?.status === "running").length;
    const partial = items.filter((i) => {
      const n = analyticsDoneCount(i);
      return n > 0 && n < ANALYTICS_STEPS.length && i.run?.status !== "running";
    }).length;
    return {
      total: items.length,
      ready,
      running,
      partial,
      none: items.length - ready - running - partial,
    };
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<"all" | AnalyticsSource, number> = {
      all: items.length,
      okazja: 0,
      oferta: 0,
      przekazany: 0,
    };
    for (const i of items) c[i.source] += 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-5">
      <FancyPageHeader
        eyebrow="Analityka"
        title="Pipeline analityczny"
        subtitle="Cztery kroki, które przechodzi każda okazja u zespołu Finance You: pobranie księgi wieczystej, właściciele w rejestrach, analiza KW silnikiem reguł i analiza ryzyka z prognozą wartości. Tu masz je wyłącznie dla wniosków wybranych dla Ciebie: okazji z Twoich Zleceń, wniosków z Twoją ofertą i wniosków przekazanych Ci przez zespół — z możliwością uruchomienia na żądanie."
        actions={
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/15 text-white hover:bg-white/25 border-white/20"
            disabled={listQ.isFetching}
            onClick={() => void listQ.refetch()}
          >
            {listQ.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Odśwież
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="W zasięgu" value={stats.total} hue={262} />
        <StatTile label="Komplet analiz" value={stats.ready} hue={160} />
        <StatTile label="Przebieg w toku" value={stats.running} hue={48} />
        <StatTile label="Częściowo / bez analiz" value={stats.partial + stats.none} hue={217} />
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie analityki…
        </div>
      ) : listQ.isError ? (
        <Card>
          <CardContent className="space-y-2 py-8 text-center">
            <p className="text-destructive">Nie udało się pobrać listy wniosków.</p>
            <Button variant="outline" onClick={() => void listQ.refetch()}>
              Spróbuj ponownie
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
              <BarChart3 className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Brak wniosków do analizy</CardTitle>
            <CardDescription>
              Analityka obejmuje tylko wnioski wybrane dla Ciebie: okazje ujawnione w wykonaniu
              Twoich Zleceń, wnioski, do których złożyłeś ofertę, oraz wnioski przekazane Ci przez
              zespół Finance You. Złóż Zlecenie poszukiwania okazji — analizy pojawią się tu
              automatycznie.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/inwestor/umowy">Przejdź do okazji inwestycyjnych</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="text-base">Okazje i wnioski</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Miasto, KW, numer projektu…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button
                    type="button"
                    aria-label="Wyczyść"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setQ("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["all", "Wszystkie"],
                    ["okazja", "Okazje"],
                    ["oferta", "Oferty"],
                    ["przekazany", "Przekazane"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      filter === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    {label} <span className="opacity-70">{counts[key]}</span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Brak wniosków spełniających filtr.
                </p>
              )}
              {filtered.map((item) => (
                <ListRow
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  onSelect={() => select(item.id)}
                />
              ))}
            </CardContent>
          </Card>

          {selectedId ? (
            <DetailPanel key={selectedId} applicationId={selectedId} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Wybierz wniosek z listy.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, hue }: { label: string; value: number; hue: number }) {
  return (
    <div
      className="rounded-2xl border bg-card p-4 shadow-sm"
      style={{ borderColor: accent(hue, 0.62, 0.16, 0.35) }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-black tabular-nums"
        style={{ color: accent(hue, 0.45, 0.16) }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Lista ───────────────────────────────────────────────────────────────────

function StepDots({ item, size = "sm" }: { item: AnalyticsListItem; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Postęp pipeline'u">
      {ANALYTICS_STEPS.map((s) => {
        const st = analyticsStepStatus(item, s.key);
        return (
          <span
            key={s.key}
            title={`${s.index}. ${s.title}: ${ANALYTICS_STEP_STATUS_LABELS[st]}`}
            className={cn(
              "inline-block rounded-full border",
              size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3",
              st === "running" && "animate-pulse",
            )}
            style={{
              background:
                st === "done"
                  ? accent(s.hue, 0.6, 0.16)
                  : st === "error"
                    ? "oklch(0.62 0.2 25)"
                    : st === "running"
                      ? accent(s.hue, 0.85, 0.08)
                      : "transparent",
              borderColor:
                st === "error"
                  ? "oklch(0.62 0.2 25)"
                  : accent(s.hue, 0.6, 0.16, st === "pending" ? 0.35 : 1),
            }}
          />
        );
      })}
    </span>
  );
}

function ListRow({
  item,
  active,
  onSelect,
}: {
  item: AnalyticsListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const done = analyticsDoneCount(item);
  const running = item.run?.status === "running";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{itemTitle(item)}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.voivodeship ? `${item.voivodeship} · ` : ""}
            {item.kwNumber ? <span className="font-mono">{item.kwNumber}</span> : "brak numeru KW"}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-bold tabular-nums">
          {formatPLN(item.loanAmount)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            SOURCE_TONE[item.source],
          )}
        >
          {item.source === "okazja" && item.projectRef
            ? `Okazja ${item.projectRef}`
            : ANALYTICS_SOURCE_LABELS[item.source]}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StepDots item={item} />
          {running ? (
            <span className="flex items-center gap-1 text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" /> w toku
            </span>
          ) : (
            <span>
              {done}/{ANALYTICS_STEPS.length}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

// ── Szczegóły ───────────────────────────────────────────────────────────────

function DetailPanel({ applicationId }: { applicationId: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getMyAnalyticsDetail);
  const runFn = useServerFn(requestInvestorAnalysisRun);
  const detailQ = useQuery({
    queryKey: ["investor-analytics-detail", applicationId],
    queryFn: () => detailFn({ data: { applicationId } }),
    refetchInterval: (q) => (q.state.data?.item.run?.status === "running" ? 30_000 : false),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["investor-analytics-detail", applicationId] });
    void qc.invalidateQueries({ queryKey: ["investor-analytics-list"] });
  };
  const runMut = useMutation({
    mutationFn: () => runFn({ data: { applicationId } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "running"
          ? "Przebieg pipeline'u już trwa — wyniki pojawią się tutaj."
          : "Analiza w kolejce. Cztery kroki wykona automat — wyniki pojawią się w ciągu ok. 15–30 minut.",
      );
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (detailQ.isLoading || !detailQ.data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie analiz…
      </div>
    );
  }
  if (detailQ.isError) {
    return (
      <Card>
        <CardContent className="space-y-2 py-8 text-center">
          <p className="text-destructive">{errMsg(detailQ.error)}</p>
          <Button variant="outline" onClick={() => void detailQ.refetch()}>
            Spróbuj ponownie
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = detailQ.data;
  const item = d.item;
  const done = analyticsDoneCount(item);
  const progress = Math.round((done / ANALYTICS_STEPS.length) * 100);
  const gradient = ANALYTICS_STEPS.map(
    (s, i) =>
      `${accent(s.hue, 0.68, 0.17)} ${Math.round((i / (ANALYTICS_STEPS.length - 1)) * 100)}%`,
  ).join(", ");
  const run = item.run;
  const runLabel = run ? RUN_LABELS[run.status] : null;

  return (
    <div className="min-w-0 space-y-4">
      {/* Nagłówek wniosku + postęp */}
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  SOURCE_TONE[item.source],
                )}
              >
                {ANALYTICS_SOURCE_LABELS[item.source]}
                {item.projectRef ? ` · ${item.projectRef}` : ""}
              </span>
              {runLabel && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    runLabel.tone,
                  )}
                >
                  {runLabel.label}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-black leading-tight">
              {itemTitle(item)} · {formatPLN(item.loanAmount)}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.kwNumber && (
                <span>
                  KW <span className="font-mono text-foreground">{item.kwNumber}</span>
                </span>
              )}
              {item.voivodeship && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {item.voivodeship}
                </span>
              )}
              {item.estimatedValue != null && (
                <span>wartość szac. {formatPLN(item.estimatedValue)}</span>
              )}
              {item.areaSqm != null && <span>{item.areaSqm} m²</span>}
              {item.periodMonths != null && <span>{item.periodMonths} mies.</span>}
              {item.ltv != null && <span>LTV {item.ltv}%</span>}
              {item.locationScore != null && (
                <span title="Potencjał lokalizacyjny (0–100) — próg automatu: 50">
                  potencjał lokalizacji{" "}
                  <b className="text-foreground">{Math.round(item.locationScore)}</b>/100
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {item.availableToInvestors && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/inwestor/wniosek/$id" params={{ id: item.id }}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Pełny wniosek
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              disabled={!d.canRequestRun || runMut.isPending}
              title={d.runBlockedReason ?? undefined}
              onClick={() => runMut.mutate()}
            >
              {runMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {done === 0 ? "Uruchom analizę" : "Uruchom ponownie"}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${gradient})` }}
            />
          </div>
          <span className="text-sm font-black tabular-nums">{progress}%</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <StepDots item={item} size="md" />
          {run ? (
            <span>
              {run.triggerReason ? `${run.triggerReason} · ` : ""}
              start {formatDateTime(run.startedAt)}
              {run.finishedAt ? ` · koniec ${formatDateTime(run.finishedAt)}` : ""}
            </span>
          ) : (
            <span>
              Brak przebiegu automatu — wyniki poniżej pochodzą z analiz zespołu (jeśli są).
            </span>
          )}
        </div>
        {d.runBlockedReason && !d.canRequestRun && run?.status !== "running" && (
          <p className="mt-2 text-xs text-muted-foreground">{d.runBlockedReason}</p>
        )}
        {run?.status === "running" && (
          <Alert className="mt-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Automat pracuje</AlertTitle>
            <AlertDescription>
              Kroki wykonują się po kolei (pobranie KW z EKW potrafi potrwać kilka minut). Ten widok
              odświeża się sam.
            </AlertDescription>
          </Alert>
        )}
        {run?.error && run.status !== "running" && (
          <Alert variant="destructive" className="mt-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Część kroków zakończyła się błędem</AlertTitle>
            <AlertDescription className="break-words">{run.error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Krok 1 — KW */}
      <StepCard
        meta={ANALYTICS_STEPS[0]}
        status={analyticsStepStatus(item, "kw")}
        error={run?.steps?.kw?.error}
      >
        <KwStep detail={d} />
      </StepCard>

      {/* Krok 2 — właściciele */}
      <StepCard
        meta={ANALYTICS_STEPS[1]}
        status={analyticsStepStatus(item, "coowners")}
        error={run?.steps?.coowners?.error}
      >
        <CoOwnersStep detail={d} />
      </StepCard>

      {/* Krok 3 — analiza KW */}
      <StepCard
        meta={ANALYTICS_STEPS[2]}
        status={analyticsStepStatus(item, "kw_analysis")}
        error={run?.steps?.kw_analysis?.error}
        badge={
          item.results.kwAnalysisStatus ? (
            <Badge variant="outline">{KW_STATUS_LABELS[item.results.kwAnalysisStatus]}</Badge>
          ) : null
        }
      >
        {d.kwAnalysis ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Analiza z {formatDateTime(d.kwAnalysis.createdAt)}.
            </p>
            <KwAnalysisReport result={d.kwAnalysis.result} investorView />
          </div>
        ) : (
          <StepEmpty
            status={analyticsStepStatus(item, "kw_analysis")}
            text="Raport analizy KW pojawi się po pobraniu księgi wieczystej i przejściu silnika reguł."
          />
        )}
      </StepCard>

      {/* Krok 4 — ryzyko i wartość */}
      <StepCard
        meta={ANALYTICS_STEPS[3]}
        status={analyticsStepStatus(item, "risk")}
        error={run?.steps?.risk?.error}
      >
        {d.valuation || d.collateral ? (
          <div className="space-y-4">
            <InvestorValuationCard applicationId={item.id} summary={d.valuation} />
            <InvestorSummaryCard applicationId={item.id} result={d.collateral} />
          </div>
        ) : (
          <StepEmpty
            status={analyticsStepStatus(item, "risk")}
            text="Prognoza wartości, szybkiej sprzedaży i zbywalności pojawi się po zakończeniu analizy ryzyka."
          />
        )}
      </StepCard>

      <RiskDisclaimer />
    </div>
  );
}

function StepEmpty({ status, text }: { status: AnalyticsStepStatus; text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </p>
  );
}

/** Karta kroku pipeline'u — kolorowa krawędź, numer w kółku, stan (jak stepper inwestora). */
function StepCard({
  meta,
  status,
  error,
  badge,
  children,
}: {
  meta: AnalyticsStepMeta;
  status: AnalyticsStepStatus;
  error?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const done = status === "done";
  const running = status === "running";
  const failed = status === "error";
  const hue = failed ? 25 : meta.hue;
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card shadow-sm transition",
        running && "shadow-lg",
        status === "pending" && "opacity-80",
      )}
      style={{
        borderColor: accent(hue, 0.62, 0.16, running || failed ? 0.75 : 0.28),
        boxShadow: running ? `0 18px 40px -26px ${accent(hue, 0.55, 0.18, 0.9)}` : undefined,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{
          background: `linear-gradient(180deg, ${accent(hue, 0.7, 0.17)}, ${accent(hue + 18, 0.55, 0.19)})`,
          opacity: status === "pending" ? 0.35 : 1,
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 pl-7">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white"
            style={{
              background: done
                ? `linear-gradient(135deg, ${accent(hue, 0.62, 0.16)}, ${accent(hue + 20, 0.48, 0.18)})`
                : failed
                  ? "linear-gradient(135deg, oklch(0.65 0.20 25), oklch(0.52 0.22 20))"
                  : running
                    ? `linear-gradient(135deg, ${accent(hue, 0.68, 0.17)}, ${accent(hue + 20, 0.52, 0.19)})`
                    : "oklch(0.88 0.01 260)",
              color: status === "pending" ? "oklch(0.45 0.02 260)" : "#fff",
            }}
          >
            {done ? (
              <Check className="h-4 w-4" />
            ) : failed ? (
              <AlertTriangle className="h-4 w-4" />
            ) : running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              meta.index
            )}
          </span>
          <div>
            <h3 className="text-base font-bold leading-tight">{meta.title}</h3>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <span
            className="rounded-full px-2.5 py-1 text-[0.68rem] font-bold"
            style={{
              background: done
                ? accent(hue, 0.94, 0.05)
                : failed
                  ? "oklch(0.95 0.06 25)"
                  : running
                    ? accent(hue, 0.92, 0.06)
                    : "oklch(0.95 0.01 260)",
              color: done
                ? accent(hue, 0.38, 0.14)
                : failed
                  ? "oklch(0.45 0.18 25)"
                  : running
                    ? accent(hue, 0.35, 0.14)
                    : "oklch(0.45 0.02 260)",
            }}
          >
            {ANALYTICS_STEP_STATUS_LABELS[status]}
          </span>
        </div>
      </header>
      <div className="px-5 pb-5 pl-7">
        {failed && error && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </div>
    </section>
  );
}

function KwStep({ detail }: { detail: AnalyticsDetail }) {
  const doc = detail.kwDocument;
  const status = analyticsStepStatus(detail.item, "kw");
  if (!detail.item.kwNumber) {
    return (
      <p className="text-sm text-muted-foreground">
        Wniosek nie ma poprawnego numeru księgi wieczystej — pipeline nie może ruszyć.
      </p>
    );
  }
  if (!doc || (doc.status !== "ready" && !Object.values(doc.sections).some(Boolean))) {
    return (
      <div className="space-y-2">
        {doc?.status === "processing" && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Pobieranie KW w toku</AlertTitle>
            <AlertDescription>
              EKW udostępnia dokument z opóźnieniem — to może potrwać do kilkudziesięciu sekund.
            </AlertDescription>
          </Alert>
        )}
        {(doc?.status === "error" || doc?.status === "not_found") && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {doc.status === "not_found" ? "Nie znaleziono księgi w EKW" : "Błąd pobierania KW"}
            </AlertTitle>
            {doc.lastError && <AlertDescription>{doc.lastError}</AlertDescription>}
          </Alert>
        )}
        {!doc && (
          <StepEmpty
            status={status}
            text="Treść księgi wieczystej jeszcze nie została pobrana — zrobi to pierwszy krok pipeline'u."
          />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <BookOpenCheck className="h-4 w-4 text-emerald-600" />
        <span>
          Treść KW <span className="font-mono text-foreground">{detail.item.kwNumber}</span>
          {doc.fetchedAt ? ` pobrana ${formatDateTime(doc.fetchedAt)}` : ""}.
        </span>
      </div>
      {doc.lastError && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ostatnia próba odświeżenia nie powiodła się</AlertTitle>
          <AlertDescription>{doc.lastError} Poniżej wcześniej pobrana treść.</AlertDescription>
        </Alert>
      )}
      <Accordion type="multiple" defaultValue={["dzial_2", "dzial_4"]}>
        {KW_SECTIONS.map(({ key, label }) => {
          const html = doc.sections[key];
          if (!html) return null;
          return (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="text-left">{label}</AccordionTrigger>
              <AccordionContent>
                <div
                  className="kw-html prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function CoOwnersStep({ detail }: { detail: AnalyticsDetail }) {
  const co = detail.coowners;
  if (!co) {
    return (
      <StepEmpty
        status={analyticsStepStatus(detail.item, "coowners")}
        text="Zestawienie właścicieli z działu II KW z CEIDG i KRS pojawi się po pobraniu księgi."
      />
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>
          {co.totalOwnersInKw} {co.totalOwnersInKw === 1 ? "właściciel" : "właścicieli"} w dziale II
          {co.generatedAt ? ` · sprawdzono ${formatDateTime(co.generatedAt)}` : ""}
        </span>
      </div>
      {co.summary && <p>{co.summary}</p>}
      {co.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Na co zwrócić uwagę</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {co.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {co.owners.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {co.owners.map((o, i) => (
            <div key={i} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.fullName ?? "Właściciel"}</span>
                {o.isPrimaryClient && <Badge variant="secondary">pożyczkobiorca</Badge>}
                {o.share && <Badge variant="outline">udział {o.share}</Badge>}
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {o.coOwnershipType && <div>{o.coOwnershipType}</div>}
                {o.businessStatus && <div>CEIDG: {o.businessStatus}</div>}
                {o.krs.map((k, j) => (
                  <div key={j}>
                    KRS: {k.companyName}
                    {k.role ? ` (${k.role})` : ""}
                    {k.flags.length ? ` — ${k.flags.join(", ")}` : ""}
                  </div>
                ))}
                {o.notes.map((n, j) => (
                  <div key={`n-${j}`}>{n}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
