import { useEffect, type MutableRefObject } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { computeLoanFigures, formatPLN } from "@/lib/loan-math";
import { FancyShell } from "@/components/landing/fancy-shell";

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
  shellVariant?: "navy" | "silver" | "gold";
  locked?: boolean;
  lockedMessage?: string;
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
  shellVariant = "navy",
  locked = false,
  lockedMessage = "Uzupełnij powyższe pola, żeby odblokować kalkulator.",
}: OfferCalculatorPanelProps) {
  const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
  const FINANCEYOU_FEE_PCT = Math.round((10 - feeT * 6) * 10) / 10;
  const financeYouFee = Math.round((amount * FINANCEYOU_FEE_PCT) / 100);
  const grossPrincipal = amount + financeYouFee;

  // Reguły kosztu:
  // - okres ≤ 36 mies. → min. wynagrodzenie inwestora 24% rocznie, ale klient może płacić tylko odsetki (rata balonowa dopuszczalna)
  // - okres > 36 mies. → wynagrodzenie inwestora może być niższe (od 15%), ale klient musi płacić pełną ratę kapitałowo-odsetkową
  const minAnnualRate = months <= 36 ? 24 : 15;
  const allowBalloon = months <= 36;

  useEffect(() => {
    if (annualRate < minAnnualRate) setAnnualRate(minAnnualRate);
  }, [minAnnualRate, annualRate, setAnnualRate]);

  const r = annualRate / 100 / 12;
  const nominalFig = computeLoanFigures({ amount: grossPrincipal, annualRatePercent: annualRate, months });
  const monthlyInterestOnlyExact = grossPrincipal * r;
  const minCap = allowBalloon ? Math.max(1, Math.round(monthlyInterestOnlyExact)) : Math.round(nominalFig.nominal);
  const maxCap = Math.max(minCap, Math.round(nominalFig.nominal));
  const sliderTouched = maxPayment > 0;
  const chosenPayment = allowBalloon
    ? (sliderTouched ? Math.min(Math.max(maxPayment, minCap), maxCap) : minCap)
    : maxCap;
  const paymentExact = allowBalloon
    ? (sliderTouched ? chosenPayment : monthlyInterestOnlyExact)
    : nominalFig.nominal;
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
    <FancyShell variant={shellVariant}>
      <div className="space-y-6 relative">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-foreground shadow-md">
            {locked ? <Lock className="h-4 w-4" strokeWidth={3} /> : <Check className="h-4 w-4" strokeWidth={3} />}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            {locked ? "Kalkulator raty — zablokowany" : headerLabel}
          </span>
        </div>

        {locked && (
          <div className="rounded-2xl border border-white/30 bg-white/10 p-4 text-sm text-white backdrop-blur-sm flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{lockedMessage}</span>
          </div>
        )}

        <div className={locked ? "pointer-events-none select-none opacity-50" : ""} aria-hidden={locked}>
        <div className="space-y-6">

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold text-white">Kwota pożyczki</Label>
            <span className="text-2xl font-extrabold tabular-nums text-white">{formatPLN(amount)}</span>
          </div>
          <Slider gradient="good-bad" value={[amount]} min={20_000} max={1_000_000} step={5_000}
            onValueChange={(v) => setAmount(v[0] ?? amount)} />
          <div className="flex justify-between text-xs text-white/70"><span>20 000 zł</span><span>1 000 000 zł</span></div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold text-white">Proponowany okres spłaty</Label>
            <span className="text-2xl font-extrabold tabular-nums text-white">{months} mies.</span>
          </div>
          <Slider gradient="good-bad" value={[Math.min(Math.max(months, 12), maxMonths)]} min={12} max={maxMonths} step={1}
            onValueChange={(v) => setMonths(v[0] ?? months)} />
          <div className="flex justify-between text-xs text-white/70"><span>12 mies.</span><span>{maxMonths} mies.</span></div>
          {months <= 36 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/25 bg-white/10 p-3 backdrop-blur-sm">
              <Checkbox checked={canExtend} onCheckedChange={(v) => setCanExtend(v === true)} className="mt-0.5 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground" />
              <span className="text-xs text-white">
                <span className="font-semibold">Możliwość przedłużenia pożyczki</span> — chcę mieć opcję wydłużenia okresu spłaty na zakończenie umowy.
              </span>
            </label>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label className="text-sm font-semibold text-white">Proponowane wynagrodzenie inwestora (miesięcznie)</Label>
            <span className="text-2xl font-extrabold tabular-nums text-white">{(annualRate / 12).toFixed(2)}%</span>
          </div>
          <Slider gradient="bad-good" value={[annualRate / 12]} min={minAnnualRate / 12} max={50 / 12} step={0.05}
            onValueChange={(v) => { rateTouchedRef.current = true; setAnnualRate(((v[0] ?? annualRate / 12) * 12)); }} />
          <div className="flex justify-between text-xs text-white/70"><span>{(minAnnualRate/12).toFixed(2)}% / mies.</span><span>{(50/12).toFixed(2)}% / mies.</span></div>
          <p className="text-xs text-white/75">
            {allowBalloon
              ? `Przy okresie do 36 miesięcy minimalne wynagrodzenie inwestora to ${minAnnualRate}% rocznie (${(minAnnualRate/12).toFixed(2)}% / mies.).`
              : `Powyżej 36 miesięcy wynagrodzenie może być niższe, ale spłacasz pełną ratę kapitałowo-odsetkową.`}
          </p>
        </div>

        {allowBalloon ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold text-white">Maksymalna rata miesięczna</Label>
              <span className="text-2xl font-extrabold tabular-nums text-white">
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
            <div className="flex justify-between text-xs text-white/70">
              <span>min. {formatPLN(minCap)} <span className="opacity-70">(same odsetki)</span></span>
              <span>bez limitu</span>
            </div>
            <p className="text-xs text-white/75">
              Ustaw niżej, jeśli chcesz mniejszą ratę miesięczną. Różnicę dopłacisz jednorazowo na koniec okresu.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/25 bg-white/10 p-4 text-xs text-white/85 backdrop-blur-sm">
            Przy okresie powyżej 36 miesięcy spłacasz <span className="font-semibold text-white">pełną ratę kapitałowo-odsetkową</span> — bez raty balonowej na końcu.
          </div>
        )}

        <div className="rounded-2xl border-2 border-white/30 bg-white/10 p-5 shadow-inner backdrop-blur-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/85">Twoja miesięczna rata</p>
          <p className="mt-1 text-4xl font-black tabular-nums text-white md:text-5xl">{formatPLN(fig.monthly)}</p>
          <p className="mt-1 text-xs text-white/75">przez {months} miesięcy{fig.balloon > 0 ? ` + rata balonowa ${formatPLN(fig.balloon)} na końcu` : ""}</p>

          <div className="mt-4 grid gap-3 border-t border-white/20 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Kwota pożyczki</p>
              <p className="mt-0.5 text-lg font-extrabold tabular-nums text-white">{formatPLN(amount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Okres</p>
              <p className="mt-0.5 text-lg font-extrabold tabular-nums text-white">{months} mies.</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Łączna spłata (z prowizją FY)</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-white">{formatPLN(fig.total)}</p>
            </div>
          </div>
        </div>

        <details className="group rounded-2xl border border-white/25 bg-white/10 backdrop-blur-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:bg-white/15">
            <span>Harmonogram spłat ({months} rat)</span>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="max-h-80 overflow-auto border-t border-white/20">
            <table className="w-full text-right text-xs tabular-nums">
              <thead className="sticky top-0 bg-white/15 text-[11px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
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
                  <tr key={idx} className={`border-t border-white/10 ${row.n === "balon" ? "bg-white/10 font-semibold" : ""}`}>
                    <td className="px-3 py-1.5 text-left text-white">{row.n === "balon" ? "Balon" : row.n}</td>
                    <td className="px-3 py-1.5 font-semibold text-white">{formatPLN(row.payment)}</td>
                    <td className="px-3 py-1.5 text-white/75">{formatPLN(row.interest)}</td>
                    <td className="px-3 py-1.5 text-white/75">{formatPLN(row.principal)}</td>
                    <td className="px-3 py-1.5 text-white">{formatPLN(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-white/70">
            Kapitał startowy: {formatPLN(grossPrincipal)} = kwota pożyczki {formatPLN(amount)} + prowizja Finance You {formatPLN(financeYouFee)} ({FINANCEYOU_FEE_PCT}%, kredytowana zgodnie z regulaminem).
          </p>
        </details>

        <p className="text-[11px] text-white/70">
          Wyliczenia poglądowe przy wynagrodzeniu inwestora {annualRate}% rocznie i prowizji Finance You {FINANCEYOU_FEE_PCT}%. Ostateczne warunki ustalisz indywidualnie z inwestorem.
        </p>
        </div>
        </div>
      </div>
    </FancyShell>
  );
}
