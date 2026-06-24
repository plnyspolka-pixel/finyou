import type { MutableRefObject } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { computeLoanFigures, formatPLN } from "@/lib/loan-math";

/**
 * SHARED OFFER CALCULATOR — used by:
 *  - landing single-page application form (step 3)
 *  - /klient dashboard (InvestorProposalCalculator)
 *
 * This is a controlled, presentational component — all state is owned by parent.
 * Do NOT inline a copy elsewhere; reuse this component to keep behavior identical.
 */
export type OfferCalculatorPanelProps = {
  amount: number;
  setAmount: (v: number) => void;
  months: number;
  setMonths: (v: number) => void;
  maxMonths: number;
  canExtend: boolean;
  setCanExtend: (v: boolean) => void;
  annualRate: number;
  setAnnualRate: (v: number) => void;
  rateTouchedRef: MutableRefObject<boolean>;
  maxPayment: number;
  setMaxPayment: (v: number) => void;
  headerLabel?: string;
};

export function OfferCalculatorPanel({
  amount, setAmount,
  months, setMonths,
  maxMonths,
  canExtend, setCanExtend,
  annualRate, setAnnualRate,
  rateTouchedRef,
  maxPayment, setMaxPayment,
  headerLabel = "Wniosek przyjęty",
}: OfferCalculatorPanelProps) {
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

  const schedule: Array<{ n: number | "balon"; payment: number; interest: number; principal: number; balance: number }> = [];
  let totalPaid = 0;
  let totalInterest = 0;
  {
    let balance = grossPrincipal;
    for (let n = 1; n <= months; n++) {
      const interest = balance * r;
      const principalPart = Math.max(0, Math.min(paymentExact - interest, balance));
      const payment = interest + principalPart;
      balance = Math.max(0, balance - principalPart);
      totalPaid += payment;
      totalInterest += interest;
      schedule.push({ n, payment, interest, principal: principalPart, balance });
    }
    if (balance > 0.5) {
      totalPaid += balance;
      schedule.push({ n: "balon", payment: balance, interest: 0, principal: balance, balance: 0 });
    }
  }
  const balloonAmount = schedule[schedule.length - 1]?.n === "balon" ? schedule[schedule.length - 1].principal : 0;
  const fig = { monthly: chosenPayment, balloon: balloonAmount, total: totalPaid, investorCompensation: totalInterest };

  return (
    <section className="space-y-6 overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 via-background to-background p-5 shadow-[0_20px_60px_-20px_hsl(var(--accent)/0.35)] md:p-7">
      <div className="-mx-5 -mt-5 border-b border-accent/20 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-5 py-4 md:-mx-7 md:-mt-7 md:px-7 md:py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground shadow-md">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent">{headerLabel}</span>
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
          <Label className="text-sm font-semibold">Proponowane wynagrodzenie inwestora (miesięcznie)</Label>
          <span className="text-2xl font-extrabold tabular-nums text-foreground">{(annualRate / 12).toFixed(2)}%</span>
        </div>
        <Slider gradient="bad-good" value={[annualRate / 12]} min={15 / 12} max={50 / 12} step={0.05}
          onValueChange={(v) => { rateTouchedRef.current = true; setAnnualRate(((v[0] ?? annualRate / 12) * 12)); }} />
        <div className="flex justify-between text-xs text-muted-foreground"><span>{(15/12).toFixed(2)}% / mies.</span><span>{(50/12).toFixed(2)}% / mies.</span></div>
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
              {schedule.map((row, idx) => (
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
  );
}
