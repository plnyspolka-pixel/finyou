// „Moje zlecenia" — Zlecenia inwestora i Projekty do nich: wnioski w kwocie
// Zlecenia utworzone do 3 dni przed jego złożeniem, ze zdjęciami/dokumentami,
// kwotą, potencjałem lokalizacyjnym i zamaskowaną KW. Raport analityczny
// na żądanie (gotowy przebieg reużywany) — te same karty kroków i komponenty,
// co w module „Analityka"; przed rezerwacją bez danych identyfikujących
// właściciela — a pod nim jeden przycisk: „Pobierz dane kontaktowe i rezerwuj".
// Bez żadnego klikania po stronie admina.
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Clock,
  Eye,
  FileText,
  Loader2,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OrderCycleSection } from "@/components/inwestor/order-cycle";
import {
  accent,
  CoOwnersStep,
  KwStep,
  StepCard,
  StepEmpty,
} from "@/components/inwestor/analytics-steps";
import { KwAnalysisReport, KwStatusBadge } from "@/components/kw-analysis/kw-analysis-section";
import { InvestorValuationCard } from "@/components/risk-assessment/investor-valuation-card";
import { InvestorSummaryCard } from "@/components/property-analysis/investor-summary-card";
import { RiskDisclaimer } from "@/components/risk-assessment/risk-disclaimer";
import {
  ProjectPhotoGallery,
  ProjectPhotoThumbs,
} from "@/components/inwestor/project-photo-gallery";
import { withdrawInvestorOrder } from "@/lib/investor-agreements/legal-pack.functions";
import {
  getMyOrderProjects,
  getOrderProjectReportDetail,
  orderProjectReport,
  reserveOrderProject,
  type OrderProject,
  type OrderProjectReport,
} from "@/lib/investor-agreements/order-projects.functions";
import {
  ANALYTICS_STEPS,
  analyticsDoneCount,
  analyticsStepStatus,
  type AnalyticsStepKey,
  type AnalyticsStepSource,
  type AnalyticsStepStatus,
} from "@/lib/investor-analytics/types";
import type { FindingStatus } from "@/lib/kw-analysis/types";
import { saleabilityBandLabel } from "@/lib/risk-assessment/forced-sale";
import { formatDateTime, propertyTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/zlecenia")({
  component: MyOrdersPage,
});

const ORDER_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  zlozone: { label: "Złożone — przyjmujemy", tone: "bg-amber-100 text-amber-800" },
  przyjete: {
    label: "Przyjęte — szukamy dla Ciebie klienta",
    tone: "bg-emerald-100 text-emerald-800",
  },
  wykonane: { label: "Wykonane", tone: "bg-blue-100 text-blue-800" },
  wygasle: { label: "Wygasłe", tone: "bg-slate-100 text-slate-600" },
  cofniete: { label: "Cofnięte", tone: "bg-slate-100 text-slate-600" },
  odmowa: { label: "Odmowa", tone: "bg-red-100 text-red-700" },
};

const PLN = (n: number | null | undefined) =>
  n != null ? `${Number(n).toLocaleString("pl-PL")} zł` : "—";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

const PROJECTS_KEY = ["order-projects"];
const reportKey = (orderId: string, applicationId: string) => [
  "order-project-report",
  orderId,
  applicationId,
];

function MyOrdersPage() {
  const qc = useQueryClient();
  const fetchProjects = useServerFn(getMyOrderProjects);
  const withdraw = useServerFn(withdrawInvestorOrder);
  const { data, isLoading } = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchProjects(),
    // Raporty w toku dokańcza cron — odświeżamy, gdy któryś trwa.
    refetchInterval: (q) =>
      q.state.data?.orders.some((o) => o.projects.some((p) => p.report.status === "running"))
        ? 20_000
        : 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    void qc.invalidateQueries({ queryKey: ["order-cycle"] });
    void qc.invalidateQueries({ queryKey: ["legal-pack-state"] });
    // Cofnięcie Zlecenia przywraca w menu zakładkę „Złóż zlecenie".
    void qc.invalidateQueries({ queryKey: ["investor-flags"] });
  };
  const withdrawMut = useMutation({
    mutationFn: (orderId: string) => withdraw({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Zlecenie cofnięte");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie zleceń…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Moje zlecenia</h1>
        <p className="text-sm text-muted-foreground">
          Do każdego przyjętego Zlecenia pokazujemy Projekty w jego kwocie, utworzone w systemie od
          3 dni przed złożeniem Zlecenia. Zamów raport analityczny, a potem jednym przyciskiem
          pobierz dane kontaktowe i zarezerwuj Projekt.
        </p>
      </div>

      {data.orders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nie masz jeszcze Zleceń.{" "}
            <Link to="/inwestor/umowy" className="underline">
              Złóż Zlecenie
            </Link>
            , a Projekty pojawią się tutaj.
          </CardContent>
        </Card>
      ) : (
        data.orders.map((o) => {
          const st = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, tone: "bg-slate-100" };
          return (
            <Card key={o.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      FY-Z-{o.orderSeq} · do {PLN(o.amountPln)}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground">
                      {o.expiresAt
                        ? `ważne do ${new Date(o.expiresAt).toLocaleDateString("pl-PL")}`
                        : ""}
                      {o.projects.length > 0 ? ` · Projekty: ${o.projects.length}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={st.tone}>{st.label}</Badge>
                    {["zlozone", "przyjete"].includes(o.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdrawMut.isPending}
                        onClick={() => withdrawMut.mutate(o.id)}
                      >
                        Cofnij
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {o.status !== "przyjete" ? null : o.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Na razie brak Projektów w tej kwocie. Sprawdzamy na bieżąco — nowy Projekt
                    pojawi się tu automatycznie.
                  </p>
                ) : (
                  o.projects.map((p) => (
                    <ProjectCard
                      key={p.applicationId}
                      project={p}
                      isConsumer={data.isConsumer}
                      assignmentHours={data.limits?.assignmentHours ?? 24}
                      onChanged={refresh}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Odstąpienie Konsumenta i przystąpienie spółki do NDA. */}
      <OrderCycleSection hideMatches />
    </div>
  );
}

// ── Projekt ──────────────────────────────────────────────────────────────────

function ProjectCard({
  project: p,
  isConsumer,
  assignmentHours,
  onChanged,
}: {
  project: OrderProject;
  isConsumer: boolean;
  assignmentHours: number;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const reportFn = useServerFn(orderProjectReport);
  const reserveFn = useServerFn(reserveOrderProject);
  const [report, setReport] = useState<OrderProjectReport>(p.report);
  const [showReport, setShowReport] = useState(p.report.status === "done");
  const [kartaOk, setKartaOk] = useState(false);
  const [karaOk, setKaraOk] = useState(false);
  const [reserved, setReserved] = useState<{
    contact: OrderProject["contact"];
    reservationExpiresAt: string | null;
  } | null>(
    p.match && ["rezerwacja", "transakcja"].includes(p.match.status)
      ? { contact: p.contact, reservationExpiresAt: p.match.reservationExpiresAt }
      : null,
  );
  // Nowe dane z serwera (np. cron dokończył ryzyko) nadpisują lokalny stan.
  if (p.report.finishedAt && p.report.finishedAt !== report.finishedAt) setReport(p.report);

  const reportMut = useMutation({
    mutationFn: () => reportFn({ data: { orderId: p.orderId, applicationId: p.applicationId } }),
    onSuccess: (res) => {
      setReport(res.report);
      setShowReport(true);
      toast.success(
        res.reused
          ? "Raport był już wygenerowany — pokazujemy gotowy."
          : res.report.status === "running"
            ? "Raport w przygotowaniu — ocenę ryzyka dokończymy za chwilę."
            : "Raport gotowy.",
      );
      void qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      void qc.invalidateQueries({ queryKey: reportKey(p.orderId, p.applicationId) });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reserveMut = useMutation({
    mutationFn: () =>
      reserveFn({
        data: {
          orderId: p.orderId,
          applicationId: p.applicationId,
          kartaLeadaConfirmed: true,
          karaConfirmed: karaOk,
        },
      }),
    onSuccess: (res) => {
      setReserved({ contact: res.contact, reservationExpiresAt: res.reservationExpiresAt });
      toast.success(`Projekt zarezerwowany na ${assignmentHours} h — dane kontaktowe odsłonięte.`);
      // Po Ujawnieniu raport dostaje komplet: numer i treść KW, nazwiska, adres.
      void qc.invalidateQueries({ queryKey: reportKey(p.orderId, p.applicationId) });
      onChanged();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const [photoIdx, setPhotoIdx] = useState(0);
  const location = [p.city, p.voivodeship].filter(Boolean).join(", ");
  const typeLabel = p.propertyType ? (propertyTypeLabels[p.propertyType] ?? p.propertyType) : null;
  const finished = p.match && ["odrzucone", "przekazane", "wygasle"].includes(p.match.status);

  return (
    <div className="rounded-lg border">
      <div className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
        <ProjectPhotoGallery photos={p.photos} index={photoIdx} onIndexChange={setPhotoIdx} />
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {p.match ? `Projekt ${p.match.projectRef}` : "Projekt"}
              {typeLabel ? <span className="text-muted-foreground"> · {typeLabel}</span> : null}
            </div>
            {p.match ? <MatchBadge status={p.match.status} /> : null}
          </div>
          {/* Inwestor widzi tylko kwotę pożyczki — reszta parametrów w raporcie/po rezerwacji. */}
          <div className="text-sm">
            <Info k="Wnioskowana kwota" v={PLN(p.loanAmount)} strong />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {location}
              </span>
            ) : null}
            <LocationScore score={p.locationScore} />
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> KW: {p.kwMasked ?? "brak"}
            </span>
            <span className="text-muted-foreground">
              w systemie od {new Date(p.createdAt).toLocaleDateString("pl-PL")}
            </span>
          </div>
          {p.description ? (
            <p className="line-clamp-3 text-xs text-muted-foreground">{p.description}</p>
          ) : null}
          <ProjectPhotoThumbs photos={p.photos} index={photoIdx} onIndexChange={setPhotoIdx} />
          <FilesRow photos={p.photos} files={p.files} />
        </div>
      </div>

      {finished ? null : (
        <div className="space-y-3 border-t p-4">
          {/* Raport analityczny */}
          <div className="flex flex-wrap items-center gap-2">
            {report.status === "done" || report.status === "running" ? (
              <Button size="sm" variant="outline" onClick={() => setShowReport((s) => !s)}>
                <Sparkles className="mr-2 h-4 w-4" />
                {showReport ? "Ukryj raport" : "Pokaż raport analityczny"}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={reportMut.isPending || !p.hasKw}
                title={!p.hasKw ? "Projekt nie ma numeru KW" : undefined}
                onClick={() => reportMut.mutate()}
              >
                {reportMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Zamów raport analityczny
              </Button>
            )}
            {report.status === "running" ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> raport w przygotowaniu
              </span>
            ) : null}
            {report.status === "error" ? (
              <span className="text-xs text-red-700">
                Raport nie powiódł się{report.error ? `: ${report.error}` : ""}.{" "}
                <button className="underline" onClick={() => reportMut.mutate()}>
                  Spróbuj ponownie
                </button>
              </span>
            ) : null}
          </div>
          {showReport && (report.status === "done" || report.status === "running") ? (
            <ReportPanel orderId={p.orderId} applicationId={p.applicationId} report={report} />
          ) : null}

          {/* Pobierz dane kontaktowe i rezerwuj */}
          {reserved ? (
            <ContactBox
              contact={reserved.contact}
              applicationId={p.applicationId}
              reservationExpiresAt={reserved.reservationExpiresAt}
            />
          ) : (
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`karta-${p.applicationId}`}
                  checked={kartaOk}
                  onCheckedChange={(v) => setKartaOk(Boolean(v))}
                />
                <Label htmlFor={`karta-${p.applicationId}`} className="text-xs leading-snug">
                  Przyjmuję Kartę Leada (Zał. 1) dla tego Projektu i rezerwuję go na{" "}
                  {assignmentHours} h — po Ujawnieniu otrzymuję dane kontaktowe klienta.
                </Label>
              </div>
              {isConsumer ? (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`kara-${p.applicationId}`}
                    checked={karaOk}
                    onCheckedChange={(v) => setKaraOk(Boolean(v))}
                  />
                  <Label htmlFor={`kara-${p.applicationId}`} className="text-xs leading-snug">
                    Jako Konsument indywidualnie uzgadniam Karę Obejściową (§ 11 Umowy ramowej).
                  </Label>
                </div>
              ) : null}
              <Button
                size="sm"
                disabled={!kartaOk || (isConsumer && !karaOk) || reserveMut.isPending}
                onClick={() => reserveMut.mutate()}
              >
                {reserveMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="mr-2 h-4 w-4" />
                )}
                Pobierz dane kontaktowe i rezerwuj
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground">{k}: </span>
      <span className={strong ? "font-semibold" : "font-medium"}>{v}</span>
    </div>
  );
}

function MatchBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    dopasowane: { label: "Dopasowany", tone: "bg-slate-100 text-slate-700" },
    teaser: { label: "Dopasowany", tone: "bg-slate-100 text-slate-700" },
    karta_leada: { label: "Karta Leada przyjęta", tone: "bg-blue-100 text-blue-800" },
    rezerwacja: { label: "Zarezerwowany", tone: "bg-emerald-100 text-emerald-800" },
    transakcja: { label: "Transakcja", tone: "bg-emerald-100 text-emerald-800" },
    odrzucone: { label: "Odrzucony", tone: "bg-slate-100 text-slate-600" },
    przekazane: { label: "Przekazany dalej", tone: "bg-slate-100 text-slate-600" },
    wygasle: { label: "Rezerwacja wygasła", tone: "bg-slate-100 text-slate-600" },
  };
  const s = map[status] ?? { label: status, tone: "bg-slate-100" };
  return <Badge className={s.tone}>{s.label}</Badge>;
}

function LocationScore({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">potencjał lokalizacji: w analizie</span>;
  }
  const tone =
    score >= 70
      ? "bg-emerald-100 text-emerald-800"
      : score >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  return <Badge className={tone}>Potencjał lokalizacji: {Math.round(score)}/100</Badge>;
}

function FilesRow({
  photos,
  files,
}: {
  photos: OrderProject["photos"];
  files: OrderProject["files"];
}) {
  // Zdjęcia obsługuje slajder (ProjectPhotoGallery) — tu tylko dokumenty.
  if (files.length === 0) {
    return photos.length === 0 ? (
      <p className="text-xs text-muted-foreground">Brak zdjęć i dokumentów.</p>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {files.map((f) => (
        <a
          key={f.url}
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          <FileText className="h-3.5 w-3.5" /> {f.name}
        </a>
      ))}
    </div>
  );
}

// ── Raport analityczny ──────────────────────────────────────────────────────
// Te same karty kroków i komponenty, co w module „Analityka" (ten sam
// pipeline: KW → właściciele → analiza KW → ryzyko i wartość). Treść pobierana
// osobno, dopiero po rozwinięciu raportu; przed rezerwacją serwer wysyła
// wersję bez danych identyfikujących właściciela.

function stepSource(r: OrderProjectReport): AnalyticsStepSource {
  return {
    results: r.results,
    run:
      r.status === "none"
        ? null
        : {
            status: r.status === "running" ? "running" : r.status === "error" ? "error" : "done",
            steps: r.steps,
          },
  };
}

function ReportPanel({
  orderId,
  applicationId,
  report,
}: {
  orderId: string;
  applicationId: string;
  report: OrderProjectReport;
}) {
  const detailFn = useServerFn(getOrderProjectReportDetail);
  const q = useQuery({
    queryKey: reportKey(orderId, applicationId),
    queryFn: () => detailFn({ data: { orderId, applicationId } }),
    // Ocenę ryzyka dokańcza cron — dopytujemy, dopóki przebieg trwa.
    refetchInterval: (query) =>
      (query.state.data?.report.status ?? report.status) === "running" ? 20_000 : false,
  });

  if (q.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
        <AlertTriangle className="h-4 w-4" /> {errMsg(q.error)}
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie raportu…
      </div>
    );
  }

  const d = q.data;
  const r = d.report;
  const src = stepSource(r);
  const status = (k: AnalyticsStepKey): AnalyticsStepStatus => analyticsStepStatus(src, k);
  const done = analyticsDoneCount(src);
  const progress = Math.round((done / ANALYTICS_STEPS.length) * 100);
  const gradient = ANALYTICS_STEPS.map(
    (s, i) =>
      `${accent(s.hue, 0.68, 0.17)} ${Math.round((i / (ANALYTICS_STEPS.length - 1)) * 100)}%`,
  ).join(", ");
  const sa = d.valuation?.saleability ?? null;
  const pv = d.valuation?.predictedValue ?? null;

  return (
    <div className="space-y-4">
      {/* Nagłówek raportu: postęp czterech kroków + kluczowe liczby */}
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black leading-tight">
              <BarChart3 className="h-5 w-5" /> Raport analityczny
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.status === "running"
                ? "Automat pracuje — kroki wykonują się po kolei, ten widok odświeża się sam."
                : r.finishedAt
                  ? `Przebieg zakończony ${formatDateTime(r.finishedAt)}.`
                  : "Wyniki z analiz zespołu Finance You."}
            </p>
          </div>
          {d.disclosed ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/inwestor/analityka" search={{ app: applicationId }}>
                <BarChart3 className="mr-2 h-4 w-4" /> Otwórz w Analityce
              </Link>
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-[0.68rem] font-semibold text-muted-foreground">
              <Lock className="h-3 w-3" /> dane właściciela po rezerwacji
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${gradient})` }}
            />
          </div>
          <span className="text-sm font-black tabular-nums">
            {done}/{ANALYTICS_STEPS.length}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreTile
            label="Potencjał lokalizacji"
            value={r.locationScore != null ? Math.round(r.locationScore) : null}
            hint="0–100 · próg automatu: 50"
          />
          <KwStatusTile
            status={r.results.kwAnalysisStatus}
            unresolved={d.kwAnalysis?.result.unresolvedFindingCount ?? null}
          />
          <ScoreTile
            label="Łatwość sprzedaży"
            value={sa?.available ? sa.score : null}
            hint={
              sa?.available
                ? `${saleabilityBandLabel(sa.band)}${
                    sa.estimatedDaysOnMarket != null ? ` · ~${sa.estimatedDaysOnMarket} dni` : ""
                  }`
                : "po analizie ryzyka"
            }
          />
          <ValueTile
            low={pv?.lowPln ?? null}
            mid={pv?.midPln ?? null}
            high={pv?.highPln ?? null}
            ltvCap={pv?.suggestedLtvCapPercent ?? null}
          />
        </div>

        {!d.disclosed && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Przed rezerwacją raport nie zawiera danych pozwalających zidentyfikować właściciela:
            numer KW jest zamaskowany, a treść księgi, cytaty z niej, nazwiska i adres odsłaniamy po
            Ujawnieniu — razem z danymi kontaktowymi klienta.
          </p>
        )}
      </div>

      {/* Krok 1 — KW */}
      <StepCard meta={ANALYTICS_STEPS[0]} status={status("kw")} error={r.steps.kw?.error}>
        {d.disclosed ? (
          <KwStep kwNumber={d.kwNumber} doc={d.kwDocument} status={status("kw")} />
        ) : (
          <TeaserKwStep status={status("kw")} fetched={r.results.kwFetched} kwMasked={d.kwNumber} />
        )}
      </StepCard>

      {/* Krok 2 — właściciele */}
      <StepCard
        meta={ANALYTICS_STEPS[1]}
        status={status("coowners")}
        error={r.steps.coowners?.error}
      >
        <CoOwnersStep co={d.coowners} status={status("coowners")} />
      </StepCard>

      {/* Krok 3 — analiza KW */}
      <StepCard
        meta={ANALYTICS_STEPS[2]}
        status={status("kw_analysis")}
        error={r.steps.kw_analysis?.error}
        badge={
          r.results.kwAnalysisStatus ? <KwStatusBadge status={r.results.kwAnalysisStatus} /> : null
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
            status={status("kw_analysis")}
            text="Raport analizy KW pojawi się po pobraniu księgi wieczystej i przejściu silnika reguł."
          />
        )}
      </StepCard>

      {/* Krok 4 — ryzyko i wartość */}
      <StepCard meta={ANALYTICS_STEPS[3]} status={status("risk")} error={r.steps.risk?.error}>
        {d.valuation || d.collateral ? (
          <div className="space-y-4">
            <InvestorValuationCard applicationId={applicationId} summary={d.valuation} />
            <InvestorSummaryCard applicationId={applicationId} result={d.collateral} />
          </div>
        ) : (
          <StepEmpty
            status={status("risk")}
            text="Prognoza wartości, szybkiej sprzedaży i zbywalności pojawi się po zakończeniu analizy ryzyka (kilka–kilkanaście minut)."
          />
        )}
      </StepCard>

      <RiskDisclaimer />
    </div>
  );
}

/** Krok 1 przed Ujawnieniem: potwierdzenie pobrania KW bez treści działów i pełnego numeru. */
function TeaserKwStep({
  status,
  fetched,
  kwMasked,
}: {
  status: AnalyticsStepStatus;
  fetched: boolean;
  kwMasked: string | null;
}) {
  if (!fetched) {
    return (
      <StepEmpty
        status={status}
        text="Treść księgi wieczystej jeszcze nie została pobrana — zrobi to pierwszy krok pipeline'u."
      />
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <BookOpenCheck className="h-4 w-4 text-emerald-600" />
        <span>
          Treść KW <span className="font-mono text-foreground">{kwMasked ?? "—"}</span> pobrana z
          EKW i przeanalizowana w krokach 2–3.
        </span>
      </div>
      <p className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Pełny numer KW i treść działów I–IV (oznaczenie nieruchomości, własność, prawa i roszczenia,
        hipoteki) odsłaniamy po rezerwacji Projektu.
      </p>
    </div>
  );
}

function scoreTone(value: number | null): { bar: string; text: string } {
  if (value == null) return { bar: "bg-muted-foreground/30", text: "text-muted-foreground" };
  if (value >= 70) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (value >= 50) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-rose-500", text: "text-rose-700" };
}

/** Kafelek 0–100 z paskiem w kolorze progu (zielony ≥ 70, bursztyn ≥ 50, róż poniżej). */
function ScoreTile({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const tone = scoreTone(value);
  return (
    <div className="rounded-2xl border bg-background p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-xl font-black tabular-nums", tone.text)}>
        {value != null ? value : "—"}
        <span className="text-xs font-semibold text-muted-foreground">/100</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", tone.bar)}
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function KwStatusTile({
  status,
  unresolved,
}: {
  status: FindingStatus | null;
  unresolved: number | null;
}) {
  return (
    <div className="rounded-2xl border bg-background p-3">
      <div className="text-[11px] text-muted-foreground">Analiza księgi wieczystej</div>
      <div className="mt-1">
        {status ? (
          <KwStatusBadge status={status} large />
        ) : (
          <span className="text-sm text-muted-foreground">w przygotowaniu</span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {status
          ? unresolved
            ? `${unresolved} ${unresolved === 1 ? "kwestia" : "kwestii"} do wyjaśnienia`
            : "bez nierozwiązanych alertów"
          : "silnik reguł po pobraniu KW"}
      </div>
    </div>
  );
}

function ValueTile({
  low,
  mid,
  high,
  ltvCap,
}: {
  low: number | null;
  mid: number | null;
  high: number | null;
  ltvCap: number | null;
}) {
  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
      <div className="text-[11px] text-muted-foreground">Wartość prognozowana</div>
      <div className="mt-0.5 text-xl font-black tabular-nums text-primary">{PLN(mid)}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {mid != null
          ? `${PLN(low)} – ${PLN(high)}${ltvCap != null ? ` · LTV do ${ltvCap}%` : ""}`
          : "po analizie ryzyka"}
      </div>
    </div>
  );
}

function ContactBox({
  contact,
  applicationId,
  reservationExpiresAt,
}: {
  contact: OrderProject["contact"];
  applicationId: string;
  reservationExpiresAt: string | null;
}) {
  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-emerald-900">Projekt zarezerwowany — dane kontaktowe</div>
        {reservationExpiresAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-900">
            <Clock className="h-3.5 w-3.5" /> rezerwacja do{" "}
            {new Date(reservationExpiresAt).toLocaleString("pl-PL")}
          </span>
        ) : null}
      </div>
      {contact ? (
        <div className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
          <span>Klient: {contact.name ?? "—"}</span>
          <span>
            Telefon:{" "}
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="underline">
                {contact.phone}
              </a>
            ) : (
              "—"
            )}
          </span>
          <span>
            E-mail:{" "}
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="underline">
                {contact.email}
              </a>
            ) : (
              "—"
            )}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Dane kontaktowe klienta znajdziesz w pełnym widoku Projektu.
        </p>
      )}
      <Button asChild size="sm" variant="outline">
        <Link to="/inwestor/wniosek/$id" params={{ id: applicationId }}>
          <Eye className="mr-2 h-4 w-4" /> Pełne dane Projektu (KW, dokumenty, czat)
        </Link>
      </Button>
    </div>
  );
}
