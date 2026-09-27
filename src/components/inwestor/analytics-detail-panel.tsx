// Panel „pełny raport z analizy" — cztery kroki pipeline'u analitycznego
// (pobranie KW → właściciele → analiza KW → ryzyko i wartość) dla jednego
// wniosku w zasięgu inwestora. Używany przez moduł „Analityka" (prawa
// kolumna) i przez listę „Moje oferty" (rozwijany raport przy ofercie).
// Dane pobiera sam (`getMyAnalyticsDetail`), więc renderuj go dopiero, gdy
// użytkownik faktycznie rozwinie raport.
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, Loader2, MapPin, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KwAnalysisReport } from "@/components/kw-analysis/kw-analysis-section";
import {
  accent,
  CoOwnersStep,
  KwStep,
  StepCard,
  StepEmpty,
} from "@/components/inwestor/analytics-steps";
import { InvestorValuationCard } from "@/components/risk-assessment/investor-valuation-card";
import { InvestorSummaryCard } from "@/components/property-analysis/investor-summary-card";
import { RiskDisclaimer } from "@/components/risk-assessment/risk-disclaimer";
import { formatDateTime, formatPLN, propertyTypeLabels } from "@/lib/labels";
import { STATUS_LABELS as KW_STATUS_LABELS } from "@/lib/kw-analysis/types";
import {
  getMyAnalyticsDetail,
  requestInvestorAnalysisRun,
} from "@/lib/investor-analytics/analytics.functions";
import {
  ANALYTICS_SOURCE_LABELS,
  ANALYTICS_STEPS,
  ANALYTICS_STEP_STATUS_LABELS,
  analyticsDoneCount,
  analyticsStepStatus,
  type AnalyticsListItem,
  type AnalyticsSource,
} from "@/lib/investor-analytics/types";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

export const SOURCE_TONE: Record<AnalyticsSource, string> = {
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

export function itemTitle(item: AnalyticsListItem): string {
  const type = item.propertyType
    ? (propertyTypeLabels[item.propertyType] ?? item.propertyType)
    : "Nieruchomość";
  return [type, item.city].filter(Boolean).join(" · ");
}

export function StepDots({ item, size = "sm" }: { item: AnalyticsListItem; size?: "sm" | "md" }) {
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

// ── Szczegóły ───────────────────────────────────────────────────────────────

export function AnalyticsDetailPanel({ applicationId }: { applicationId: string }) {
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
          : "Analiza uruchomiona: księga, właściciele i analiza KW są liczone od razu, ocenę ryzyka automat dokończy w ciągu ok. 15–30 minut.",
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
  const missingSteps = ANALYTICS_STEPS.filter((s) => analyticsStepStatus(item, s.key) !== "done");
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
              {done === 0
                ? "Uruchom analizę"
                : done < ANALYTICS_STEPS.length
                  ? "Dokończ analizę"
                  : "Uruchom ponownie"}
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
        {missingSteps.length > 0 && run?.status !== "running" && d.canRequestRun && (
          <Alert className="mt-3">
            <Play className="h-4 w-4" />
            <AlertTitle>
              Brakuje {missingSteps.length} z {ANALYTICS_STEPS.length} kroków
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Do zrobienia: {missingSteps.map((s) => `${s.index}. ${s.title}`).join(", ")}.
              </span>
              <Button size="sm" disabled={runMut.isPending} onClick={() => runMut.mutate()}>
                {runMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Uruchom brakujące kroki
              </Button>
            </AlertDescription>
          </Alert>
        )}
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
        <KwStep
          kwNumber={item.kwNumber}
          doc={d.kwDocument}
          status={analyticsStepStatus(item, "kw")}
        />
      </StepCard>

      {/* Krok 2 — właściciele */}
      <StepCard
        meta={ANALYTICS_STEPS[1]}
        status={analyticsStepStatus(item, "coowners")}
        error={run?.steps?.coowners?.error}
      >
        <CoOwnersStep co={d.coowners} status={analyticsStepStatus(item, "coowners")} />
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
