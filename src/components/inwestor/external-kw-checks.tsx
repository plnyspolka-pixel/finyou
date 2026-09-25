// Analiza wniosku spoza Finance You (moduł „Analityka" inwestora). Inwestor
// podaje numer KW i rodzaj nieruchomości; automat pobiera księgę, zestawia
// właścicieli z CEIDG/KRS, przepuszcza treść przez silnik reguł analizy KW
// i wykonuje pełną ocenę ryzyka (ten sam raport co w panelu zespołu).
// Sprawdzenie jest prywatne i nie daje wglądu w żadne wnioski Finance You.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileSearch, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiskAssessmentReport } from "@/components/risk-assessment/risk-assessment-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KwAnalysisReport } from "@/components/kw-analysis/kw-analysis-section";
import { RiskDisclaimer } from "@/components/risk-assessment/risk-disclaimer";
import { formatDateTime, formatPLN, propertyTypeLabels } from "@/lib/labels";
import { validateKwNumber } from "@/lib/kw";
import { STATUS_LABELS as KW_STATUS_LABELS } from "@/lib/kw-analysis/types";
import {
  getMyKwCheck,
  listMyKwChecks,
  startMyKwCheck,
} from "@/lib/investor-analytics/kw-checks.functions";
import {
  ANALYTICS_STEP_STATUS_LABELS,
  KW_CHECK_DAILY_LIMIT,
  KW_CHECK_PROPERTY_TYPES,
  KW_CHECK_STEPS,
  kwCheckStepStatus,
  type KwCheckItem,
  type KwCheckPropertyType,
} from "@/lib/investor-analytics/types";
import { accent, CoOwnersStep, KwStep, StepCard, StepEmpty } from "./analytics-steps";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

/** "1 250 000" / "1250000,50" → liczba; puste → null. */
function parseAmount(raw: string): number | null {
  const t = raw.replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const STATUS_TONE: Record<KwCheckItem["status"], string> = {
  running: "bg-amber-100 text-amber-800 border-amber-200",
  done: "bg-emerald-100 text-emerald-800 border-emerald-200",
  error: "bg-rose-100 text-rose-800 border-rose-200",
};

const STATUS_LABEL: Record<KwCheckItem["status"], string> = {
  running: "W toku",
  done: "Gotowe",
  error: "Błąd",
};

export function ExternalKwChecks({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const listFn = useServerFn(listMyKwChecks);
  const listQ = useQuery({
    queryKey: ["investor-kw-checks"],
    queryFn: () => listFn(),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((i) => i.status === "running") ? 30_000 : false,
  });
  const items = useMemo(() => listQ.data ?? [], [listQ.data]);
  const activeId =
    selectedId && items.some((i) => i.id === selectedId) ? selectedId : (items[0]?.id ?? null);

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4 lg:sticky lg:top-4 lg:h-fit">
        <NewCheckForm onCreated={onSelect} />
        <Card className="lg:max-h-[calc(100vh-24rem)] lg:overflow-y-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Twoje sprawdzenia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {listQ.isLoading ? (
              <p className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wczytywanie…
              </p>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nie masz jeszcze żadnych sprawdzeń. Wpisz numer KW powyżej.
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    item.id === activeId
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {item.label || "Wniosek zewnętrzny"}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {item.kwNumber}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_TONE[item.status],
                      )}
                    >
                      {item.status === "running" && (
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                      )}
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                    {item.kwAnalysisStatus ? ` · ${KW_STATUS_LABELS[item.kwAnalysisStatus]}` : ""}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {activeId ? (
        <CheckDetail key={activeId} id={activeId} />
      ) : (
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
              <FileSearch className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Analiza własnego wniosku</CardTitle>
            <CardDescription className="max-w-xl">
              Masz temat spoza Finance You? Podaj numer księgi wieczystej i rodzaj nieruchomości —
              pobierzemy treść KW, sprawdzimy właścicieli w CEIDG i KRS, przepuścimy księgę przez
              silnik reguł analizy KW i wykonamy pełną ocenę ryzyka: wycenę rynkową, sprzedaż
              wymuszoną, zbywalność i klasę ryzyka. Sprawdzenie widzisz tylko Ty.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function NewCheckForm({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const startFn = useServerFn(startMyKwCheck);
  const [kw, setKw] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [value, setValue] = useState("");
  const [propertyType, setPropertyType] = useState<KwCheckPropertyType | "">("");
  const [period, setPeriod] = useState("");

  const kwCheck = kw.trim() ? validateKwNumber(kw) : null;
  const loanAmount = parseAmount(amount);
  const propertyValue = parseAmount(value);
  const periodMonths = period.trim() ? Number(period.trim()) : null;
  const periodOk =
    periodMonths === null ||
    (Number.isInteger(periodMonths) && periodMonths >= 1 && periodMonths <= 600);
  const amountsOk = !Number.isNaN(loanAmount) && !Number.isNaN(propertyValue) && periodOk;
  const canSubmit = Boolean(kwCheck?.ok) && Boolean(propertyType) && amountsOk;

  const startMut = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          kwNumber: kw,
          label: label.trim() || null,
          loanAmount,
          propertyValue,
          propertyType: propertyType as KwCheckPropertyType,
          periodMonths,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.reused
          ? "Ta księga jest już sprawdzana — otwieram trwające sprawdzenie."
          : "Sprawdzenie ruszyło. Pobranie KW z EKW może potrwać kilka minut.",
      );
      setKw("");
      setLabel("");
      setAmount("");
      setValue("");
      setPropertyType("");
      setPeriod("");
      void qc.invalidateQueries({ queryKey: ["investor-kw-checks"] });
      onCreated(r.id);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nowa analiza KW</CardTitle>
        <CardDescription>
          Dla wniosku spoza Finance You. Limit: {KW_CHECK_DAILY_LIMIT} nowych analiz na 24 h.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) startMut.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="kw-check-number">Numer księgi wieczystej</Label>
            <Input
              id="kw-check-number"
              className="font-mono"
              placeholder="np. WA1M/00012345/6"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            {kwCheck && !kwCheck.ok && (
              <p className="text-xs text-destructive">{kwCheck.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kw-check-type">Rodzaj nieruchomości</Label>
            <Select
              value={propertyType}
              onValueChange={(v) => setPropertyType(v as KwCheckPropertyType)}
            >
              <SelectTrigger id="kw-check-type">
                <SelectValue placeholder="Wybierz — podstawa wyceny" />
              </SelectTrigger>
              <SelectContent>
                {KW_CHECK_PROPERTY_TYPES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {propertyTypeLabels[key] ?? key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kw-check-label">Nazwa (opcjonalnie)</Label>
            <Input
              id="kw-check-label"
              placeholder="np. Mieszkanie Kraków — klient z polecenia"
              maxLength={120}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="kw-check-amount">Kwota pożyczki</Label>
              <Input
                id="kw-check-amount"
                inputMode="decimal"
                placeholder="zł"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kw-check-value">Wartość nieruchomości</Label>
              <Input
                id="kw-check-value"
                inputMode="decimal"
                placeholder="zł"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kw-check-period">Okres pożyczki (mies., opcjonalnie)</Label>
            <Input
              id="kw-check-period"
              inputMode="numeric"
              placeholder="np. 24"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          {!amountsOk && (
            <p className="text-xs text-destructive">
              Kwoty muszą być liczbami, a okres liczbą miesięcy (1–600).
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Kwota, wartość i okres są opcjonalne — pozwalają ocenić miejsce hipoteki, CLTV, relację
            pożyczki do sprzedaży wymuszonej i horyzont analizy właściciela.
          </p>
          <Button type="submit" className="w-full" disabled={!canSubmit || startMut.isPending}>
            {startMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Analizuj księgę
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CheckDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getMyKwCheck);
  const detailQ = useQuery({
    queryKey: ["investor-kw-check", id],
    queryFn: async () => {
      const d = await detailFn({ data: { id } });
      // Odczyt mógł przesunąć przebieg — lista ma pokazać ten sam stan.
      void qc.invalidateQueries({ queryKey: ["investor-kw-checks"] });
      return d;
    },
    refetchInterval: (q) => (q.state.data?.item.status === "running" ? 30_000 : false),
  });

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
  if (detailQ.isLoading || !detailQ.data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie analizy…
      </div>
    );
  }

  const d = detailQ.data;
  const item = d.item;
  const done = KW_CHECK_STEPS.filter((s) => kwCheckStepStatus(item, s.key) === "done").length;
  const progress = Math.round((done / KW_CHECK_STEPS.length) * 100);
  const gradient = KW_CHECK_STEPS.map(
    (s, i) =>
      `${accent(s.hue, 0.68, 0.17)} ${Math.round((i / (KW_CHECK_STEPS.length - 1)) * 100)}%`,
  ).join(", ");
  const kwStatus = kwCheckStepStatus(item, "kw");
  const coStatus = kwCheckStepStatus(item, "coowners");
  const kwaStatus = kwCheckStepStatus(item, "kw_analysis");
  const riskStatus = kwCheckStepStatus(item, "risk");

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                Wniosek spoza Finance You
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  STATUS_TONE[item.status],
                )}
              >
                {STATUS_LABEL[item.status]}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-black leading-tight">
              {item.label || "Wniosek zewnętrzny"}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                KW <span className="font-mono text-foreground">{item.kwNumber}</span>
              </span>
              {item.propertyType && (
                <span>{propertyTypeLabels[item.propertyType] ?? item.propertyType}</span>
              )}
              {item.loanAmount != null && <span>kwota {formatPLN(item.loanAmount)}</span>}
              {item.periodMonths != null && <span>{item.periodMonths} mies.</span>}
              {item.propertyValue != null && <span>wartość {formatPLN(item.propertyValue)}</span>}
              <span>zlecono {formatDateTime(item.createdAt)}</span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={detailQ.isFetching}
            onClick={() => void detailQ.refetch()}
          >
            {detailQ.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Odśwież
          </Button>
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
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {KW_CHECK_STEPS.map((s) => (
            <span key={s.key}>
              {s.index}. {s.title}: {ANALYTICS_STEP_STATUS_LABELS[kwCheckStepStatus(item, s.key)]}
            </span>
          ))}
        </div>
        {item.status === "running" && (
          <Alert className="mt-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Automat pracuje</AlertTitle>
            <AlertDescription>
              Pobranie KW z EKW potrafi potrwać kilka minut, a pełna ocena ryzyka rusza w tle do
              15–30 minut później. Ten widok odświeża się sam.
            </AlertDescription>
          </Alert>
        )}
        {item.error && item.status !== "running" && (
          <Alert variant="destructive" className="mt-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {item.status === "error" ? "Analiza nie powiodła się" : "Część kroków z błędem"}
            </AlertTitle>
            <AlertDescription className="break-words">{item.error}</AlertDescription>
          </Alert>
        )}
      </div>

      <StepCard meta={KW_CHECK_STEPS[0]} status={kwStatus} error={item.steps.kw?.error}>
        <KwStep kwNumber={item.kwNumber} doc={d.kwDocument} status={kwStatus} />
      </StepCard>

      <StepCard meta={KW_CHECK_STEPS[1]} status={coStatus} error={item.steps.coowners?.error}>
        <CoOwnersStep co={d.coowners} status={coStatus} />
      </StepCard>

      <StepCard
        meta={KW_CHECK_STEPS[2]}
        status={kwaStatus}
        error={item.steps.kw_analysis?.error}
        badge={
          item.kwAnalysisStatus ? (
            <Badge variant="outline">{KW_STATUS_LABELS[item.kwAnalysisStatus]}</Badge>
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
            status={kwaStatus}
            text="Raport analizy KW pojawi się po pobraniu księgi wieczystej i przejściu silnika reguł."
          />
        )}
      </StepCard>

      <StepCard meta={KW_CHECK_STEPS[3]} status={riskStatus} error={item.steps.risk?.error}>
        {d.risk ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Ocena z {formatDateTime(d.risk.generatedAt)}. Dla tematu spoza Finance You bez
              dokumentów i korespondencji klienta — parametry nieruchomości pochodzą z działu I-O
              KW.
            </p>
            <RiskAssessmentReport result={d.risk} />
          </div>
        ) : (
          <StepEmpty
            status={riskStatus}
            text="Pełną ocenę ryzyka (wycena rynkowa, sprzedaż wymuszona, zbywalność, klasa ryzyka) wykonuje automat w tle — zwykle do 15–30 minut od pobrania księgi."
          />
        )}
      </StepCard>

      <RiskDisclaimer />
    </div>
  );
}
