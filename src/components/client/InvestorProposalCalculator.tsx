import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, Info, Lock, Send, Loader2, Sparkles } from "lucide-react";
import { formatPLN, computeLoanFigures } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { assistBusinessDescription } from "@/lib/ai-assist.functions";

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

  const [amount, setAmount] = useState<number>(200_000);
  const [months, setMonths] = useState<number>(24);
  const [annualRate, setAnnualRate] = useState<number>(30);
  const [maxPayment, setMaxPayment] = useState<number>(0);
  const [canExtend, setCanExtend] = useState<boolean>(false);
  const [investorDesc, setInvestorDesc] = useState<string>("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [sendingToInvestors, setSendingToInvestors] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateTouchedRef = useRef(false);
  const assistDesc = useServerFn(assistBusinessDescription);

  useEffect(() => {
    if (!loan) return;
    setAmount(Number(loan.loan_amount ?? 200_000));
    setMonths(Number(loan.preferred_period_months ?? 24));
    setAnnualRate(Number(loan.annual_investor_rate ?? 30));
    setMaxPayment(Number(loan.max_monthly_payment ?? 0));
    setInvestorDesc(String(loan.investor_description ?? ""));
    rateTouchedRef.current = true;
  }, [loan?.id]);

  // Max okres spłaty maleje wraz z kwotą (jak na landingu).
  const maxMonths = useMemo(() => {
    if (amount <= 200_000) return 72;
    const t = Math.min(1, Math.max(0, (amount - 200_000) / (1_000_000 - 200_000)));
    return Math.round(36 - t * (36 - 12));
  }, [amount]);

  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [maxMonths, months]);

  useEffect(() => {
    if (!loan?.id || locked) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase.from("loan_applications").update({
        loan_amount: amount,
        preferred_period_months: months,
        annual_investor_rate: annualRate,
        max_monthly_payment: maxPayment || null,
      }).eq("id", loan.id);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [amount, months, annualRate, maxPayment, loan?.id, locked]);

  // Prowizja Finance You — skalowana od 10% do 4% liniowo (20k → 1M), kredytowana.
  const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
  const FINANCEYOU_FEE_PCT = Math.round((10 - feeT * 6) * 10) / 10;
  const financeYouFee = Math.round((amount * FINANCEYOU_FEE_PCT) / 100);
  const grossPrincipal = amount + financeYouFee;

  const r = annualRate / 100 / 12;
  const nominalFig = computeLoanFigures({ amount: grossPrincipal, annualRatePercent: annualRate, months });
  const monthlyInterestOnlyExact = grossPrincipal * r;
  const minCap = Math.max(1, Math.round(monthlyInterestOnlyExact));
  const maxCap = Math.max(minCap, Math.round(nominalFig.nominal));
  const sliderTouched = maxPayment > 0;
  const chosenPayment = sliderTouched
    ? Math.min(Math.max(maxPayment, minCap), maxCap)
    : minCap;
  const paymentExact = sliderTouched ? chosenPayment : monthlyInterestOnlyExact;
  const effectiveMax = chosenPayment;

  const schedule = useMemo(() => {
    const rows: Array<{ n: number | "balon"; payment: number; interest: number; principal: number; balance: number }> = [];
    let totalPaid = 0;
    let totalInterest = 0;
    let balance = grossPrincipal;
    for (let n = 1; n <= months; n++) {
      const interest = balance * r;
      const principalPart = Math.max(0, Math.min(paymentExact - interest, balance));
      const payment = interest + principalPart;
      balance = Math.max(0, balance - principalPart);
      totalPaid += payment;
      totalInterest += interest;
      rows.push({ n, payment, interest, principal: principalPart, balance });
    }
    if (balance > 0.5) {
      totalPaid += balance;
      rows.push({ n: "balon", payment: balance, interest: 0, principal: balance, balance: 0 });
    }
    const balloonAmount = rows[rows.length - 1]?.n === "balon" ? rows[rows.length - 1].principal : 0;
    return { rows, totalPaid, totalInterest, balloonAmount };
  }, [grossPrincipal, months, r, paymentExact]);

  const fig = {
    monthly: chosenPayment,
    balloon: schedule.balloonAmount,
    total: schedule.totalPaid,
    investorCompensation: schedule.totalInterest,
  };

  const hasDesc = investorDesc.trim().length >= 20;

  const missingForInvestors = useMemo(() => {
    const m: string[] = [];
    if (!client?.first_name || !client?.phone) m.push("dane kontaktowe");
    if (!prop?.property_type) m.push("typ zabezpieczenia");
    if (!prop?.land_register_number && !prop?.area_sqm) m.push("numer KW lub powierzchnia");
    if (!hasDesc) m.push("krótki opis dla inwestora");
    if (!amount || !months || !annualRate) m.push("warunki finansowe");
    return m;
  }, [client, prop, hasDesc, amount, months, annualRate]);

  const saveInvestorDesc = async () => {
    if (!loan?.id) return;
    if (investorDesc.trim().length < 20) { toast.error("Opis powinien mieć min. 20 znaków"); return; }
    setSavingDesc(true);
    try {
      const { error } = await supabase.from("loan_applications")
        .update({ investor_description: investorDesc.trim() }).eq("id", loan.id);
      if (error) throw error;
      toast.success("Opis zapisany");
      setRefreshTick((t) => t + 1);
    } catch (e: any) { toast.error(e?.message ?? "Błąd zapisu"); }
    finally { setSavingDesc(false); }
  };

  const generateDesc = async (mode: "draft" | "improve" | "expand") => {
    if (!loan?.id) { toast.error("Brak wniosku"); return; }
    setAiBusy(true);
    const t = toast.loading("Generuję opis…");
    try {
      const res: any = await assistDesc({ data: { currentText: investorDesc, mode, loanId: loan.id } });
      if (res?.text) setInvestorDesc(String(res.text));
      toast.success("Gotowe — sprawdź i popraw wedle uznania.", { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd AI", { id: t });
    } finally { setAiBusy(false); }
  };

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
        loan_amount: amount,
        preferred_period_months: months,
        annual_investor_rate: annualRate,
        max_monthly_payment: maxPayment || null,
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
          Najpierw wypełnij wniosek — wtedy uruchomimy tu kalkulator raty.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {(locked || statusLabel) && (
        <div className="flex flex-wrap items-center gap-2">
          {locked && <Badge className="gap-1"><Lock className="h-3.5 w-3.5" /> Zablokowany do edycji</Badge>}
          {statusLabel && <Badge variant="secondary">{statusLabel}</Badge>}
        </div>
      )}

      <fieldset disabled={locked} className="contents">
      <section className="space-y-6 overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 via-background to-background p-5 shadow-[0_20px_60px_-20px_hsl(var(--accent)/0.35)] md:p-7">
        <div className="-mx-5 -mt-5 border-b border-accent/20 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-5 py-4 md:-mx-7 md:-mt-7 md:px-7 md:py-5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground shadow-md">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-accent">Twoja oferta</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold">Kwota pożyczki</Label>
            <span className="text-2xl font-extrabold tabular-nums text-foreground">{formatPLN(amount)}</span>
          </div>
          <Slider gradient="good-bad" value={[amount]} min={20_000} max={1_000_000} step={5_000}
            onValueChange={(v) => setAmount(v[0] ?? amount)} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold">Proponowany okres spłaty</Label>
            <span className="text-2xl font-extrabold tabular-nums text-foreground">{months} mies.</span>
          </div>
          <Slider gradient="good-bad" value={[Math.min(Math.max(months, 12), maxMonths)]} min={12} max={maxMonths} step={1}
            onValueChange={(v) => setMonths(v[0] ?? months)} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>12 mies.</span><span>{maxMonths} mies.</span></div>
          {months <= 36 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Checkbox checked={canExtend} onCheckedChange={(v) => setCanExtend(v === true)} className="mt-0.5" />
              <span className="text-xs text-foreground">
                <span className="font-semibold">Możliwość przedłużenia pożyczki</span> — chcę mieć opcję wydłużenia okresu spłaty na zakończenie umowy.
              </span>
            </label>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold">Proponowane wynagrodzenie inwestora (rocznie)</Label>
            <span className="text-2xl font-extrabold tabular-nums text-foreground">{annualRate}%</span>
          </div>
          <Slider gradient="bad-good" value={[annualRate]} min={15} max={50} step={0.5}
            onValueChange={(v) => { rateTouchedRef.current = true; setAnnualRate(v[0] ?? annualRate); }} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>15%</span><span>50%</span></div>
          <p className="text-xs text-muted-foreground">
            Im wyższe wynagrodzenie inwestora, tym większa szansa na szybkie znalezienie inwestora dla Twojej pożyczki.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold">Maksymalna rata miesięczna</Label>
            <span className="text-2xl font-extrabold tabular-nums text-foreground">
              {effectiveMax > 0 ? formatPLN(effectiveMax) : "bez limitu"}
            </span>
          </div>
          <Slider
            gradient="bad-good"
            value={[effectiveMax > 0 ? effectiveMax : maxCap]}
            min={minCap}
            max={maxCap}
            step={50}
            onValueChange={(v) => setMaxPayment(v[0] ?? 0)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>min. {formatPLN(minCap)} <span className="opacity-70">(same odsetki)</span></span>
            <span>bez limitu</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Ustaw niżej, jeśli chcesz mniejszą ratę miesięczną. Różnicę dopłacisz jednorazowo na koniec okresu.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/15 via-accent/5 to-background p-5 shadow-inner">
          <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Twoja miesięczna rata</p>
          <p className="mt-1 text-4xl font-black tabular-nums text-foreground md:text-5xl">{formatPLN(fig.monthly)}</p>
          <p className="mt-1 text-xs text-muted-foreground">przez {months} miesięcy{fig.balloon > 0 ? ` + rata balonowa ${formatPLN(fig.balloon)} na końcu` : ""}</p>

          <div className="mt-4 grid gap-3 border-t border-accent/20 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kwota pożyczki</p>
              <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{formatPLN(amount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Okres</p>
              <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{months} mies.</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Średnie miesięczne wynagrodzenie inwestora</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{formatPLN(fig.investorCompensation / Math.max(1, months))}<span className="text-xs font-normal text-muted-foreground"> / mies.</span></p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prowizja Finance You ({FINANCEYOU_FEE_PCT}%)</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{formatPLN(financeYouFee)}</p>
            </div>
            <div className="rounded-xl bg-background/60 p-3 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Łączna spłata (z prowizją FY)</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-foreground">{formatPLN(fig.total)}</p>
            </div>
          </div>
        </div>

        <details className="group rounded-2xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/50">
            <span>Harmonogram spłat ({months} rat)</span>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="max-h-80 overflow-auto border-t border-border">
            <table className="w-full text-right text-xs tabular-nums">
              <thead className="sticky top-0 bg-secondary/80 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Rata</th>
                  <th className="px-3 py-2 font-semibold">Odsetki</th>
                  <th className="px-3 py-2 font-semibold">Kapitał</th>
                  <th className="px-3 py-2 font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row, idx) => (
                  <tr key={idx} className={`border-t border-border/50 ${row.n === "balon" ? "bg-accent/5 font-semibold" : ""}`}>
                    <td className="px-3 py-1.5 text-left text-foreground">{row.n === "balon" ? "Balon" : row.n}</td>
                    <td className="px-3 py-1.5 font-semibold text-foreground">{formatPLN(row.payment)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatPLN(row.interest)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatPLN(row.principal)}</td>
                    <td className="px-3 py-1.5 text-foreground">{formatPLN(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-muted-foreground">
            Kapitał startowy: {formatPLN(grossPrincipal)} = kwota pożyczki {formatPLN(amount)} + prowizja Finance You {formatPLN(financeYouFee)} ({FINANCEYOU_FEE_PCT}%, kredytowana zgodnie z regulaminem).
          </p>
        </details>

        <p className="text-[11px] text-muted-foreground">
          Wyliczenia poglądowe przy wynagrodzeniu inwestora {annualRate}% rocznie i prowizji Finance You {FINANCEYOU_FEE_PCT}%. Ostateczne warunki ustalisz indywidualnie z inwestorem.
        </p>
      </section>
      </fieldset>

      {!locked && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">Krótki opis dla inwestora</Label>
              {hasDesc && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ uzupełniony</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              2–5 zdań: po co potrzebujesz finansowania, na co pójdą pieniądze i jak planujesz spłacić. AI pomoże, ale Ty decydujesz, co zostanie.
            </p>
            <Textarea
              rows={5}
              value={investorDesc}
              onChange={(e) => setInvestorDesc(e.target.value)}
              placeholder="Np. Potrzebuję 200 000 zł na uruchomienie kolejnego sklepu, mam już 2 lokalizacje. Spłatę pokryję z bieżących przychodów…"
              disabled={aiBusy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void generateDesc(investorDesc.trim() ? "improve" : "draft")} disabled={aiBusy}>
                {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {investorDesc.trim() ? "Popraw opis (AI)" : "Wygeneruj opis (AI)"}
              </Button>
              {investorDesc.trim() && (
                <Button size="sm" variant="ghost" onClick={() => void generateDesc("expand")} disabled={aiBusy}>
                  Rozwiń (AI)
                </Button>
              )}
              <Button size="sm" onClick={() => void saveInvestorDesc()} disabled={savingDesc || aiBusy}>
                {savingDesc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Zapisz opis
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-5">
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
        </div>
      )}
    </div>
  );
}
