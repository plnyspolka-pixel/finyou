import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Calculator, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

function pln(n: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

/**
 * Lekki publiczny kalkulator orientacyjny.
 * Rata = kapitał/n + saldo * rate_m (uproszczona równa stała rata kapitał + odsetki od salda startowego).
 * Realny harmonogram liczony jest po stronie inwestora w panelu.
 */
export function QuickCalculator({ ctaHref = "#wniosek" }: { ctaHref?: string }) {
  const [amount, setAmount] = useState(150_000);
  const [months, setMonths] = useState(24);
  const [rate, setRate] = useState(1.79); // % miesięcznie, orientacyjnie

  const calc = useMemo(() => {
    const rm = rate / 100;
    // Annuita: rata = K * r / (1 - (1+r)^-n)
    const r = rm;
    const n = months;
    const annuita = amount * (r / (1 - Math.pow(1 + r, -n)));
    const total = annuita * n;
    const cost = total - amount;
    return { rata: annuita, total, cost };
  }, [amount, months, rate]);

  return (
    <div
      id="kalkulator"
      className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-10 scroll-mt-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[oklch(0.65_0.13_235)]/25 blur-3xl"
      />

      <div className="relative grid gap-10 md:grid-cols-[1.1fr_1fr]">
        {/* Inputs */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-foreground">
            <Calculator className="h-3.5 w-3.5 text-accent" />
            Kalkulator orientacyjny
          </div>
          <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Sprawdź ratę w 5 sekund
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Wynik szacunkowy. Realna oferta zależy od wartości nieruchomości i decyzji inwestorów.
          </p>

          <div className="mt-8 space-y-7">
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-semibold text-foreground">Kwota pożyczki</label>
                <span className="text-xl font-extrabold text-foreground">{pln(amount)}</span>
              </div>
              <Slider
                value={[amount]}
                min={20_000}
                max={1_000_000}
                step={5_000}
                onValueChange={(v) => setAmount(v[0] ?? amount)}
                className="mt-3"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>20 000 zł</span>
                <span>1 000 000 zł</span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-semibold text-foreground">Okres spłaty</label>
                <span className="text-xl font-extrabold text-foreground">{months} mies.</span>
              </div>
              <Slider
                value={[months]}
                min={6}
                max={72}
                step={1}
                onValueChange={(v) => setMonths(v[0] ?? months)}
                className="mt-3"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>6 mies.</span>
                <span>72 mies.</span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-semibold text-foreground">
                  Orientacyjne oprocentowanie / mies.
                </label>
                <span className="text-xl font-extrabold text-foreground">
                  {rate.toFixed(2)}%
                </span>
              </div>
              <Slider
                value={[rate]}
                min={1.5}
                max={3}
                step={0.01}
                onValueChange={(v) => setRate(v[0] ?? rate)}
                className="mt-3"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1,50%</span>
                <span>3,00%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="relative rounded-2xl border border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.15_0.09_265)] p-6 text-primary-foreground md:p-8">
          <div className="absolute inset-0 rounded-2xl opacity-30 [background-image:radial-gradient(circle_at_30%_20%,oklch(0.65_0.13_235_/0.45),transparent_55%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Twoja symulacja
            </div>

            <div className="mt-5">
              <div className="text-xs uppercase tracking-widest text-white/60">
                Szacunkowa rata miesięczna
              </div>
              <div className="mt-1 text-4xl font-extrabold leading-none text-accent md:text-5xl">
                {pln(calc.rata)}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-[11px] uppercase tracking-wider text-white/60">
                  Łączna spłata
                </div>
                <div className="mt-1 text-lg font-bold">{pln(calc.total)}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-[11px] uppercase tracking-wider text-white/60">
                  Koszt pożyczki
                </div>
                <div className="mt-1 text-lg font-bold">{pln(calc.cost)}</div>
              </div>
            </div>

            <Button
              asChild
              size="lg"
              className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <a href={ctaHref}>
                Złóż wniosek z tymi parametrami
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>

            <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Symulacja jest bezpłatna i nie zobowiązuje do niczego.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
