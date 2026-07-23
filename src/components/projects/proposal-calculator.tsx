// Kalkulator propozycji finansowania (sekcja „Przygotuj swoją propozycję").
// Live-podgląd liczy serwer (computeProposalServer) — ten sam silnik finansowy
// co reszta systemu. Przed złożeniem serwer waliduje i przelicza wszystko od
// nowa; ten komponent służy wygodzie inwestora, nie jest źródłem prawdy.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calculator, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computeProposalServer, submitProposal } from "@/lib/projects/proposals.functions";
import { PROPOSAL_STATEMENT_LABELS } from "@/lib/projects/proposals.functions";
import { SECURITY_OPTIONS } from "@/lib/projects/module-types";
import type { ProposalParams, ProposalComputed } from "@/lib/projects/proposal-calc";
import { formatPLN } from "@/lib/labels";

interface CalcContext {
  expectedAmount: number;
  defaultPeriodMonths: number;
  defaultInterestRatePercent: number;
  minPeriodMonths: number;
  maxPeriodMonths: number;
  maxLtvPercent: number;
  propertyValue: number | null;
}

const STATEMENTS = Object.keys(
  PROPOSAL_STATEMENT_LABELS,
) as (keyof typeof PROPOSAL_STATEMENT_LABELS)[];

export function ProposalCalculator({
  assignmentId,
  ctx,
  disabled,
  onSubmitted,
}: {
  assignmentId: string;
  ctx: CalcContext;
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const computeFn = useServerFn(computeProposalServer);
  const submitFn = useServerFn(submitProposal);

  const [amount, setAmount] = useState<number>(ctx.expectedAmount);
  const [period, setPeriod] = useState<number>(ctx.defaultPeriodMonths);
  const [rate, setRate] = useState<number>(ctx.defaultInterestRatePercent);
  const [commission, setCommission] = useState<number>(0);
  const [mode, setMode] = useState<"raty" | "balon">("raty");
  const [maxPayment, setMaxPayment] = useState<number | "">("");
  const [disbursementDate, setDisbursementDate] = useState<string>("");
  const [securities, setSecurities] = useState<string[]>([]);
  const [documents, setDocuments] = useState<string>("");
  const [conditions, setConditions] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");

  const [computed, setComputed] = useState<ProposalComputed | null>(null);
  const [computing, setComputing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const params = useMemo<ProposalParams>(
    () => ({
      amount,
      periodMonths: period,
      interestRatePercent: rate,
      commission: Math.max(0, commission),
      repaymentMode: mode,
      maxMonthlyPayment: mode === "balon" && maxPayment !== "" ? Number(maxPayment) : undefined,
      disbursementDate: disbursementDate || undefined,
      requiredSecurities: securities,
      requiredDocuments: documents
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      additionalConditions: conditions || undefined,
      validUntil: validUntil || undefined,
    }),
    [
      amount,
      period,
      rate,
      commission,
      mode,
      maxPayment,
      disbursementDate,
      securities,
      documents,
      conditions,
      validUntil,
    ],
  );

  // Debounced live-recompute po stronie serwera.
  useEffect(() => {
    if (disabled || !amount || !period || !securities.length) {
      setComputed(null);
      return;
    }
    let cancelled = false;
    setComputing(true);
    const t = setTimeout(() => {
      void computeFn({ data: { assignmentId, params } })
        .then((res) => {
          if (!cancelled) setComputed(res.computed as ProposalComputed);
        })
        .catch(() => {
          if (!cancelled) setComputed(null);
        })
        .finally(() => {
          if (!cancelled) setComputing(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [assignmentId, params, computeFn, disabled, amount, period, securities.length]);

  const canProceed = Boolean(computed) && securities.length > 0 && !disabled;
  const allAccepted = STATEMENTS.every((s) => accepted[s]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await submitFn({
        data: { assignmentId, params, statements: STATEMENTS.filter((s) => accepted[s]) },
      });
      if (res.ok) {
        toast.success("Propozycja została przekazana do analizy.");
        setSummaryOpen(false);
        onSubmitted();
      } else if (res.code === "already_submitted") {
        toast.error("Dla tego projektu złożono już propozycję.");
      } else {
        toast.error(res.errors?.[0] ?? "Nie udało się złożyć propozycji.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się złożyć propozycji.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Przygotuj swoją propozycję
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proponowana kwota pożyczki" suffix="zł">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Okres pożyczki"
            suffix="mies."
            hint={`${ctx.minPeriodMonths}–${ctx.maxPeriodMonths}`}
          >
            <Input
              type="number"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field label="Oprocentowanie (rocznie)" suffix="%">
            <Input
              type="number"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field label="Prowizja / koszty" suffix="zł">
            <Input
              type="number"
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field label="Sposób spłaty">
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as "raty" | "balon")}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="raty">Raty równe</SelectItem>
                <SelectItem value="balon">Rata balonowa</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {mode === "balon" && (
            <Field label="Maksymalna rata miesięczna" suffix="zł">
              <Input
                type="number"
                value={maxPayment}
                onChange={(e) => setMaxPayment(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={disabled}
              />
            </Field>
          )}
          <Field label="Proponowany termin uruchomienia">
            <Input
              type="date"
              value={disbursementDate}
              onChange={(e) => setDisbursementDate(e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="Termin ważności propozycji">
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={disabled}
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Wymagane zabezpieczenia</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SECURITY_OPTIONS.map((s) => (
              <label
                key={s.value}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <Checkbox
                  checked={securities.includes(s.value)}
                  disabled={disabled}
                  onCheckedChange={(c) =>
                    setSecurities((prev) =>
                      c ? [...prev, s.value] : prev.filter((v) => v !== s.value),
                    )
                  }
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wymagane dokumenty (oddziel przecinkami)">
            <Textarea
              value={documents}
              onChange={(e) => setDocuments(e.target.value)}
              rows={2}
              disabled={disabled}
            />
          </Field>
          <Field label="Dodatkowe warunki inwestora">
            <Textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={2}
              disabled={disabled}
            />
          </Field>
        </div>

        {/* Wyniki */}
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Wyliczenia (po stronie serwera)</span>
            {computing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {computed ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Result label="Całkowita spłata" value={formatPLN(computed.totalToRepay)} />
              <Result label="Suma odsetek" value={formatPLN(computed.totalInterest)} />
              <Result label="Suma prowizji" value={formatPLN(computed.totalCommission)} />
              <Result label="Rata miesięczna" value={formatPLN(computed.monthlyPayment)} />
              <Result label="Rata końcowa" value={formatPLN(computed.finalPayment)} />
              <Result label="Okres" value={`${computed.periodMonths} mies.`} />
              <Result
                label="LTV propozycji"
                value={computed.ltvPercent != null ? `${computed.ltvPercent}%` : "—"}
              />
              <Result label="Różnica vs oczekiwana" value={formatPLN(computed.amountDifference)} />
              <Result
                label="Orient. stopa zwrotu"
                value={`${computed.investorAnnualReturnPercent}% rocznie`}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Uzupełnij kwotę, okres i zabezpieczenia, aby zobaczyć wyliczenia.
            </p>
          )}
          {computed?.warnings.map((w) => (
            <div
              key={w}
              className="mt-3 flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 p-2 text-xs"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>{w}</span>
            </div>
          ))}
        </div>

        <Button className="w-full" disabled={!canProceed} onClick={() => setSummaryOpen(true)}>
          Przejdź do podsumowania
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Składasz propozycję finansowania — to nie jest jeszcze zawarcie umowy pożyczki.
        </p>
      </CardContent>

      {/* Podsumowanie + oświadczenia */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Podsumowanie propozycji</DialogTitle>
            <DialogDescription>
              Sprawdź warunki i zaakceptuj wymagane oświadczenia przed wysłaniem.
            </DialogDescription>
          </DialogHeader>
          {computed && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Result label="Proponowana kwota" value={formatPLN(amount)} />
                <Result label="Okres" value={`${period} mies.`} />
                <Result label="Oprocentowanie" value={`${rate}%`} />
                <Result label="Prowizja i koszty" value={formatPLN(commission)} />
                <Result label="Rata miesięczna" value={formatPLN(computed.monthlyPayment)} />
                <Result label="Rata końcowa" value={formatPLN(computed.finalPayment)} />
                <Result
                  label="LTV"
                  value={computed.ltvPercent != null ? `${computed.ltvPercent}%` : "—"}
                />
                <Result label="Całkowita spłata" value={formatPLN(computed.totalToRepay)} />
                <Result
                  label="Zabezpieczenia"
                  value={securities.length ? `${securities.length} wybrane` : "—"}
                />
                <Result label="Termin ważności" value={validUntil || "—"} />
              </div>

              <div className="space-y-2">
                {STATEMENTS.map((s) => (
                  <label key={s} className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
                    <Checkbox
                      checked={Boolean(accepted[s])}
                      onCheckedChange={(c) => setAccepted((p) => ({ ...p, [s]: Boolean(c) }))}
                    />
                    <span>{PROPOSAL_STATEMENT_LABELS[s]}</span>
                  </label>
                ))}
              </div>

              <Button
                className="w-full"
                disabled={!allAccepted || submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Wysyłanie…" : "Złóż propozycję finansowania"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({
  label,
  children,
  suffix,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {suffix && <span className="ml-1 text-xs text-muted-foreground">({suffix})</span>}
        {hint && <span className="ml-1 text-xs text-muted-foreground">· {hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
