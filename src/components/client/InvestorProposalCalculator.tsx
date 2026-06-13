import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Info, Lock, Send, Loader2 } from "lucide-react";
import { formatPLN, monthlyPayment } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { toast } from "sonner";

// Klient może swobodnie zmieniać parametry propozycji aż do momentu, w którym
// pojawi się konkretna oferta od inwestora lub umowa wchodzi w realizację.
const LOCKED_STATUSES = new Set<string>([
  "oferta_od_inwestora", "oferta_przekazana_klientowi",
  "zaakceptowany_przez_klienta", "do_umowy", "zamkniety", "archiwalny",
]);

export function InvestorProposalCalculator() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [prop, setProp] = useState<any | null>(null);
  const [client, setClient] = useState<any | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => { void (async () => {
    if (!user) return;
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
    setClient(c);
    if (c) {
      const { data: la } = await supabase.from("loan_applications").select("*")
        .eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setLoan(la);
      if (la) {
        const { data: p } = await supabase.from("properties").select("*").eq("loan_application_id", la.id).maybeSingle();
        setProp(p);
      }
    }
    setLoading(false);
  })(); }, [user, refreshTick]);

  const locked = !!(loan?.status && LOCKED_STATUSES.has(loan.status));

  const [editAmount, setEditAmount] = useState<number>(0);
  const [editMonths, setEditMonths] = useState<number>(0);
  const [editRate, setEditRate] = useState<number>(0);
  const [editMaxPayment, setEditMaxPayment] = useState<number>(0);
  const [sendingToInvestors, setSendingToInvestors] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loan) return;
    setEditAmount(Number(loan.loan_amount ?? 200_000));
    setEditMonths(Number(loan.preferred_period_months ?? 24));
    setEditRate(Number(loan.annual_investor_rate ?? 24));
    setEditMaxPayment(Number(loan.max_monthly_payment ?? 0));
  }, [loan?.id]);

  useEffect(() => {
    if (!loan?.id || locked) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase.from("loan_applications").update({
        loan_amount: editAmount,
        preferred_period_months: editMonths,
        annual_investor_rate: editRate,
        max_monthly_payment: editMaxPayment || null,
      }).eq("id", loan.id);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [editAmount, editMonths, editRate, editMaxPayment, loan?.id, locked]);

  const schedule = useMemo(() => {
    const amount = editAmount;
    const months = editMonths;
    const annual = editRate;
    const maxPayment = editMaxPayment;
    if (!amount || !months || !annual) return null;

    const nominalMonthly = monthlyPayment(amount, annual, months);
    const monthly = maxPayment > 0 ? Math.min(nominalMonthly, maxPayment) : nominalMonthly;
    const r = annual / 100 / 12;

    type Row = { index: number | "Balon"; date: string; payment: number; interest: number; capital: number; remaining: number };
    const rows: Row[] = [];
    let remaining = amount;
    const start = new Date();
    for (let i = 1; i <= months; i++) {
      const interest = remaining * r;
      let capital = Math.max(0, monthly - interest);
      if (capital > remaining) capital = remaining;
      const payment = interest + capital;
      remaining = Math.max(0, remaining - capital);
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      rows.push({ index: i, date: d.toLocaleDateString("pl-PL"), payment, interest, capital, remaining });
    }
    const balloon = remaining;
    if (balloon > 0.5) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + months);
      rows.push({ index: "Balon", date: d.toLocaleDateString("pl-PL"), payment: balloon, interest: 0, capital: balloon, remaining: 0 });
    }
    const total = rows.reduce((a, x) => a + x.payment, 0);
    return { rows, monthly, balloon, total, nominalMonthly };
  }, [editAmount, editMonths, editRate, editMaxPayment]);

  const missingForInvestors = useMemo(() => {
    const m: string[] = [];
    if (!client?.first_name || !client?.phone) m.push("dane kontaktowe");
    if (!prop?.property_type) m.push("typ zabezpieczenia");
    if (!prop?.land_register_number && !prop?.area_sqm) m.push("numer KW lub powierzchnia");
    if (!loan?.investor_description) m.push("krótki opis dla inwestora");
    if (!editAmount || !editMonths || !editRate) m.push("warunki finansowe");
    return m;
  }, [client, prop, loan, editAmount, editMonths, editRate]);

  const sendToInvestors = async () => {
    if (!loan?.id) return;
    if (missingForInvestors.length > 0) {
      toast.error(`Aby wysłać do inwestorów uzupełnij: ${missingForInvestors.join(", ")}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSendingToInvestors(true);
    try {
      const { error } = await supabase.from("loan_applications").update({
        loan_amount: editAmount,
        preferred_period_months: editMonths,
        annual_investor_rate: editRate,
        max_monthly_payment: editMaxPayment || null,
        status: "wyslany_do_inwestorow",
      }).eq("id", loan.id);
      if (error) throw error;
      toast.success("Wniosek wysłany do inwestorów. Powiadomimy Cię o decyzji.");
      setRefreshTick((t) => t + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się wysłać wniosku");
    } finally {
      setSendingToInvestors(false);
    }
  };

  const statusLabel = loan ? (loanStatusLabels[loan.status as keyof typeof loanStatusLabels] ?? loan.status) : null;

  if (loading) return <p className="text-sm text-muted-foreground">Ładowanie kalkulatora…</p>;

  if (!loan) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Najpierw wypełnij wniosek — wtedy uruchomimy tu kalkulator propozycji dla inwestora.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Moja propozycja dla inwestora</h1>
          <p className="text-sm text-muted-foreground">
            {locked
              ? "Wniosek jest w analizie — dane są zablokowane do edycji."
              : "Dopasuj warunki — harmonogram przeliczy się od razu. Gdy będziesz gotowy, wyślij wniosek do inwestorów."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {locked && <Badge className="gap-1"><Lock className="h-3.5 w-3.5" /> Zablokowany</Badge>}
          {statusLabel && <Badge variant="secondary">{statusLabel}</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Harmonogram spłat</CardTitle>
          <CardDescription>Zmiany zapisują się automatycznie.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Kwota pożyczki</Label>
                <span className="text-sm font-bold tabular-nums">{formatPLN(editAmount)}</span>
              </div>
              <Input type="number" inputMode="numeric" min={10_000} max={5_000_000} step={5_000}
                value={editAmount || ""} onChange={(e) => setEditAmount(Math.max(0, Number(e.target.value) || 0))} disabled={locked} />
              <Slider value={[editAmount]} min={10_000} max={2_000_000} step={5_000}
                onValueChange={(v) => setEditAmount(v[0] ?? editAmount)} disabled={locked} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Okres spłaty</Label>
                <span className="text-sm font-bold tabular-nums">{editMonths} mies.</span>
              </div>
              <Input type="number" inputMode="numeric" min={3} max={120} step={1}
                value={editMonths || ""} onChange={(e) => setEditMonths(Math.max(0, Number(e.target.value) || 0))} disabled={locked} />
              <Slider value={[editMonths]} min={3} max={72} step={1}
                onValueChange={(v) => setEditMonths(v[0] ?? editMonths)} disabled={locked} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Wynagrodzenie inwestora w skali roku</Label>
                <span className="text-sm font-bold tabular-nums">{editRate}%</span>
              </div>
              <Input type="number" inputMode="decimal" min={15} max={60} step={0.5}
                value={editRate || ""} onChange={(e) => setEditRate(Math.max(0, Number(e.target.value) || 0))} disabled={locked} />
              <Slider value={[editRate]} min={15} max={60} step={0.5}
                onValueChange={(v) => setEditRate(v[0] ?? editRate)} disabled={locked} />
              <p className="text-[11px] text-muted-foreground">Im wyższe wynagrodzenie, tym szybciej znajdziemy inwestora.</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Maks. miesięczna rata, którą udźwigniesz (opcjonalnie)</Label>
              <Input type="number" inputMode="numeric" min={0} step={100} placeholder="np. 3500"
                value={editMaxPayment || ""} onChange={(e) => setEditMaxPayment(Math.max(0, Number(e.target.value) || 0))} disabled={locked} />
              <p className="text-[11px] text-muted-foreground">Gdy ustawisz limit niższy niż rata anuitetowa — różnica trafi do raty balonowej.</p>
            </div>
          </div>

          {schedule ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Rata miesięczna" value={formatPLN(schedule.monthly)} />
                <Metric label="Rata balonowa" value={schedule.balloon > 0.5 ? formatPLN(schedule.balloon) : "—"} />
                <Metric label="Suma do spłaty" value={formatPLN(schedule.total)} />
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-[11px] tabular-nums sm:text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground uppercase tracking-wide text-[10px]">
                    <tr>
                      <th className="px-2 py-1.5 font-normal">#</th>
                      <th className="px-2 py-1.5 font-normal">data</th>
                      <th className="px-2 py-1.5 font-normal text-right">rata</th>
                      <th className="px-2 py-1.5 font-normal text-right">odsetki</th>
                      <th className="px-2 py-1.5 font-normal text-right">kapitał</th>
                      <th className="px-2 py-1.5 font-normal text-right">saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.rows.map((r) => (
                      <tr key={String(r.index)} className={r.index === "Balon" ? "border-t bg-primary/5 font-medium" : "border-t"}>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.index}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatPLNCompact(r.payment)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatPLNCompact(r.interest)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatPLNCompact(r.capital)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatPLNCompact(r.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {schedule.balloon > 0.5 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Twoja maksymalna rata jest niższa niż rata wymagana do pełnej spłaty w tym okresie — różnica trafia do ostatniej raty balonowej.
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Uzupełnij kwotę, okres i wynagrodzenie, aby zobaczyć harmonogram.</p>
          )}

          {!locked && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              {missingForInvestors.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Aby wysłać wniosek do inwestorów, uzupełnij jeszcze: <strong>{missingForInvestors.join(", ")}</strong>.</span>
                </div>
              )}
              <Button onClick={() => void sendToInvestors()} disabled={sendingToInvestors}
                variant="cta" size="lg" className="w-full sm:w-auto">
                {sendingToInvestors
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wysyłam…</>
                  : <><Send className="mr-2 h-4 w-4" />Wyślij wniosek do inwestorów</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function formatPLNCompact(n: number): string {
  const v = Math.round(n);
  return new Intl.NumberFormat("pl-PL").format(v) + " zł";
}
