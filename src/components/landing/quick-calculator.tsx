import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Calculator, ShieldCheck } from "lucide-react";
import { mergeFunnelState } from "@/lib/wniosek-funnel";

export function QuickCalculator() {
  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(24);

  const canSubmit = useMemo(() => amount >= 20_000 && months >= 6, [amount, months]);

  const goNext = () => {
    if (!canSubmit) return;
    mergeFunnelState({ amount, months, source: "landing_calculator" });
    const url = new URL("/wniosek-zabezpieczenie", window.location.origin);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("months", String(months));
    url.searchParams.set("source", "landing_calculator");
    window.location.href = url.toString();
  };

  return (
    <div
      id="kalkulator"
      className="relative w-full max-w-full overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-2xl sm:p-6 md:p-10 scroll-mt-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[oklch(0.55_0.18_265)]/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-2xl">
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground sm:text-xs">
          <Calculator className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="truncate">Sprawdź warunki pożyczki</span>
        </div>
        <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Powiedz nam, ile i na jak długo
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          W kolejnym kroku wybierzesz, co stanowi zabezpieczenie pożyczki.
        </p>

        <div className="mt-7 space-y-8">
          {/* Kwota */}
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="text-sm font-semibold text-foreground">Kwota pożyczki</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-28 shrink-0 text-right text-sm font-extrabold sm:w-36 sm:text-base"
              />
            </div>
            <Slider
              value={[amount]}
              min={20_000}
              max={1_000_000}
              step={100}
              onValueChange={(v) => setAmount(v[0] ?? amount)}
              className="mt-3"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>20 000 zł</span>
              <span>1 000 000 zł</span>
            </div>
          </div>

          {/* Okres */}
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold text-foreground">Okres spłaty</Label>
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
        </div>

        <div className="relative mt-8">
          <Button
            type="button"
            variant="cta"
            size="cta"
            disabled={!canSubmit}
            onClick={goNext}
            className="w-full"
          >
            Dalej
            <ArrowRight className="ml-2 h-6 w-6" />
          </Button>
        </div>


        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          Wniosek nic nie kosztuje. Nie pobieramy opłat za rozpatrzenie.
        </div>
      </div>
    </div>
  );
}
