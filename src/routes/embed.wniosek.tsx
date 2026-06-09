import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { monthlyPayment, formatPLN, type SecurityType } from "@/lib/loan-math";
import { AlertTriangle, ChevronDown, CalendarDays, Wallet, Calendar, Percent, CreditCard, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/embed/wniosek")({
  component: EmbedWniosek,
  head: () => ({
    meta: [
      { title: "Wniosek o pożyczkę" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" });
}

function EmbedWniosek() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const source = params?.get("source") ?? "embed";

  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(24);
  // Rate held internally as ANNUAL %, but UI shows monthly %.
  const [annualRate, setAnnualRate] = useState(20);
  const [maxPayment, setMaxPayment] = useState(5000);
  const [secType, setSecType] = useState<SecurityType | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  const monthlyRate = annualRate / 12;

  const rataNominal = useMemo(() => monthlyPayment(amount, annualRate, months), [amount, annualRate, months]);
  const rata = useMemo(() => (maxPayment > 0 ? Math.min(rataNominal, maxPayment) : rataNominal), [rataNominal, maxPayment]);
  const balloon = useMemo(() => Math.max(0, (rataNominal - rata) * months), [rataNominal, rata, months]);
  const totalPay = useMemo(() => rata * months + balloon, [rata, months, balloon]);
  const investorComp = useMemo(() => Math.max(0, totalPay - amount), [totalPay, amount]);
  const exceedsMax = balloon > 0;

  // Harmonogram: rata stała = rata, ostatnia powiększona o balloon.
  const schedule = useMemo(() => {
    const today = new Date();
    const rows: { idx: number; date: Date; payment: number; isLast: boolean }[] = [];
    for (let i = 1; i <= months; i++) {
      const date = addMonths(today, i);
      const isLast = i === months;
      const payment = isLast ? rata + balloon : rata;
      rows.push({ idx: i, date, payment, isLast });
    }
    return rows;
  }, [months, rata, balloon]);

  const canContinue = secType !== null && amount > 0 && months > 0 && annualRate > 0;

  const goToFullForm = () => {
    const origin = window.location.origin;
    const url = new URL("/wniosek-start", origin);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("annualRate", String(annualRate));
    url.searchParams.set("months", String(months));
    url.searchParams.set("maxPayment", String(maxPayment));
    if (secType) url.searchParams.set("secType", secType);
    url.searchParams.set("source", `embed_${source}`);
    const target = url.toString();
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = target;
        return;
      }
    } catch {
      window.open(target, "_blank", "noopener");
      return;
    }
    window.location.href = target;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header card */}
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 border-b">
            <div className="flex items-center gap-2 text-xs font-medium text-primary uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5" />
              Kalkulator pożyczki pod zastaw nieruchomości
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Sprawdź warunki w 30 sekund</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bez wpływu na BIK. Dane, dokumenty i KW uzupełnisz w pełnym wniosku.
            </p>
          </div>

          <div className="p-6 space-y-7">
            {/* 1. Kwota */}
            <Field
              icon={<Wallet className="h-4 w-4" />}
              label="Kwota pożyczki"
              right={
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    className="h-9 w-32 text-right font-semibold"
                  />
                  <span className="text-sm text-muted-foreground">zł</span>
                </div>
              }
            >
              <Slider min={20_000} max={1_000_000} step={5_000} value={[amount]} onValueChange={(v) => setAmount(v[0])} />
              <RangeHint left="20 000 zł" right="1 000 000 zł" />
            </Field>

            {/* 2. Okres */}
            <Field
              icon={<Calendar className="h-4 w-4" />}
              label="Okres spłaty"
              right={<span className="text-sm font-semibold">{months} mies.</span>}
            >
              <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
              <RangeHint left="3 mies." right="72 mies." />
            </Field>

            {/* 3. Maksymalny koszt miesięczny (zamiast wynagrodzenia rocznego) */}
            <Field
              icon={<Percent className="h-4 w-4" />}
              label="Maksymalny koszt miesięczny"
              right={
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.05"
                    value={monthlyRate.toFixed(2)}
                    onChange={(e) => setAnnualRate((Number(e.target.value) || 0) * 12)}
                    className="h-9 w-20 text-right font-semibold"
                  />
                  <span className="text-sm text-muted-foreground">% / mies.</span>
                </div>
              }
            >
              <Slider
                min={1.25}
                max={5}
                step={0.05}
                value={[Math.min(5, Math.max(1.25, monthlyRate))]}
                onValueChange={(v) => setAnnualRate(v[0] * 12)}
              />
              <RangeHint left="1,25% / mies." right="5,00% / mies." />
            </Field>

            {/* 4. Maksymalna rata */}
            <Field
              icon={<CreditCard className="h-4 w-4" />}
              label="Maksymalna rata"
              right={
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={maxPayment}
                    onChange={(e) => setMaxPayment(Number(e.target.value) || 0)}
                    className="h-9 w-32 text-right font-semibold"
                  />
                  <span className="text-sm text-muted-foreground">zł</span>
                </div>
              }
            >
              <Slider
                min={500}
                max={50_000}
                step={250}
                value={[Math.min(50_000, maxPayment)]}
                onValueChange={(v) => setMaxPayment(v[0])}
              />
              <RangeHint left="500 zł" right="50 000 zł" />
            </Field>

            {/* 5. Zabezpieczenie */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Co ma być zabezpieczeniem?</Label>
              <SecurityTypePicker value={secType} onChange={setSecType} />
            </div>
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-primary/10 via-transparent to-transparent border-b">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Rata miesięczna" value={formatPLN(rata)} highlight />
              <Stat label="Łączna spłata" value={formatPLN(totalPay)} />
              <Stat label="Wynagrodzenie inwestora" value={formatPLN(investorComp)} sub="razem za cały okres" />
              <Stat
                label={balloon > 0 ? "Ostatnia rata (balon)" : "Liczba rat"}
                value={balloon > 0 ? formatPLN(rata + balloon) : `${months}`}
                sub={balloon > 0 ? "rata + nadwyżka balonowa" : undefined}
              />
            </div>
          </div>

          {/* Harmonogram rozwijany */}
          <Collapsible open={showSchedule} onOpenChange={setShowSchedule}>
            <CollapsibleTrigger className="w-full flex items-center justify-between px-6 py-3.5 text-sm font-medium hover:bg-muted/40 transition-colors">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Harmonogram spłat
                <span className="text-xs text-muted-foreground font-normal">
                  · od {fmtDate(addMonths(new Date(), 1))}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showSchedule ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left px-6 py-2 font-medium">#</th>
                      <th className="text-left px-2 py-2 font-medium">Data</th>
                      <th className="text-right px-6 py-2 font-medium">Rata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((r) => (
                      <tr key={r.idx} className={`border-t ${r.isLast && balloon > 0 ? "bg-amber-500/10" : ""}`}>
                        <td className="px-6 py-2 tabular-nums text-muted-foreground">{r.idx}</td>
                        <td className="px-2 py-2">{fmtDate(r.date)}</td>
                        <td className="px-6 py-2 text-right tabular-nums font-medium">{formatPLN(r.payment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <p className="px-6 py-3 text-xs text-muted-foreground border-t bg-muted/20">
            Kalkulacja poglądowa. Nie stanowi oferty ani decyzji pożyczkowej.
          </p>
        </div>

        {exceedsMax && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Część zobowiązania przekraczająca maksymalną ratę zostanie rozliczona w racie balonowej na koniec okresu.
            </AlertDescription>
          </Alert>
        )}

        {/* CTA */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
          <Button
            size="lg"
            className="w-full h-12 text-base font-semibold"
            disabled={!canContinue}
            onClick={goToFullForm}
          >
            Dalej — wypełnij pełny wniosek
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            W kolejnym kroku utworzysz konto (e-mail + telefon albo Google / Apple), a następnie uzupełnisz dane,
            nieruchomość i dokumenty.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon, label, right, children,
}: { icon: React.ReactNode; label: string; right: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
          {label}
        </Label>
        {right}
      </div>
      {children}
    </div>
  );
}

function RangeHint({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
      <span>{left}</span><span>{right}</span>
    </div>
  );
}

function Stat({
  label, value, sub, highlight,
}: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-background/60 p-4 ${highlight ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
