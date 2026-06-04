import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { ArrowRight, Calculator, ShieldCheck, Wallet, Clock } from "lucide-react";
import { formatPLN, securityTypeLabels, type SecurityType } from "@/lib/loan-math";

export function QuickCalculator() {
  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(24);
  const [secType, setSecType] = useState<SecurityType | null>(null);

  const canContinue = useMemo(
    () => secType !== null && amount >= 20_000 && months >= 6,
    [secType, amount, months],
  );

  const goNext = () => {
    if (!canContinue) return;
    // Zapisz w sessionStorage żeby przeżyć OAuth round-trip
    try {
      sessionStorage.setItem(
        "calc_step1_v1",
        JSON.stringify({
          amount,
          months,
          secType,
          source: "landing_calculator",
          ts: Date.now(),
        }),
      );
    } catch {
      /* noop */
    }
    const url = new URL("/wniosek-start", window.location.origin);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("months", String(months));
    if (secType) url.searchParams.set("secType", secType);
    url.searchParams.set("source", "landing_calculator");
    url.searchParams.set("next", "/wniosek-warunki");
    window.location.href = url.toString();
  };

  return (
    <div
      id="kalkulator"
      className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-10 scroll-mt-24"
    >
      {/* Subtelne glow akcentowe */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[oklch(0.55_0.18_265)]/15 blur-3xl"
      />

      {/* Wskaźnik kroków */}
      <div className="relative mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-accent-foreground">1</span>
        <span className="text-foreground">Parametry</span>
        <span className="mx-1 h-px w-6 bg-border" />
        <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-[11px] font-bold">2</span>
        <span>Twoje dane</span>
        <span className="mx-1 h-px w-6 bg-border" />
        <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-[11px] font-bold">3</span>
        <span>Indywidualne warunki</span>
        <span className="mx-1 hidden h-px w-6 bg-border sm:block" />
        <span className="hidden h-6 w-6 place-items-center rounded-full bg-secondary text-[11px] font-bold sm:grid">4</span>
        <span className="hidden sm:inline">Nieruchomość</span>
      </div>

      <div className="relative grid gap-10 md:grid-cols-[1.1fr_0.9fr]">
        {/* Inputs */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-foreground">
            <Calculator className="h-3.5 w-3.5 text-accent" />
            Sprawdź warunki pożyczki pod zastaw
          </div>
          <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Powiedz nam, ile i na jak długo
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Trzy proste pytania — w kolejnych krokach dostosujemy ratę i koszt do Twoich możliwości.
          </p>

          <div className="mt-7 space-y-7">
            {/* Kwota */}
            <div>
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold text-foreground">Kwota pożyczki</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="w-36 text-right text-base font-extrabold"
                />
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

            {/* Zabezpieczenie */}
            <div>
              <Label className="text-sm font-semibold text-foreground">
                Co ma być zabezpieczeniem?
              </Label>
              <div className="mt-3">
                <SecurityTypePicker value={secType} onChange={setSecType} />
              </div>
            </div>
          </div>
        </div>

        {/* Summary panel */}
        <div className="relative rounded-2xl border border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.13_0.09_265)] p-6 text-primary-foreground md:p-8">
          <div className="absolute inset-0 rounded-2xl opacity-30 [background-image:radial-gradient(circle_at_30%_20%,oklch(0.65_0.13_235_/0.45),transparent_55%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Twój wybór
            </div>

            <dl className="mt-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <dt className="flex items-center gap-2 text-sm text-white/75">
                  <Wallet className="h-4 w-4 text-accent" />
                  Kwota
                </dt>
                <dd className="text-xl font-extrabold text-white">{formatPLN(amount)}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <dt className="flex items-center gap-2 text-sm text-white/75">
                  <Clock className="h-4 w-4 text-accent" />
                  Okres
                </dt>
                <dd className="text-xl font-extrabold text-white">{months} mies.</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-white/75">Zabezpieczenie</dt>
                <dd className="text-right text-base font-bold text-white">
                  {secType ? securityTypeLabels[secType] : <span className="text-white/40">— wybierz —</span>}
                </dd>
              </div>
            </dl>

            <div className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4 text-xs leading-relaxed text-white/75">
              W kroku 3 ustalisz <strong className="text-white">maksymalną ratę</strong>, jaką
              możesz spłacać miesięcznie. Dostosujemy do tego pozostałe warunki pożyczki — bez SMS-ów,
              bez WhatsAppa, wszystko w jednym miejscu.
            </div>

            <Button
              type="button"
              size="lg"
              disabled={!canContinue}
              onClick={goNext}
              className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
            >
              {canContinue ? "Dalej — Twoje dane" : "Wybierz zabezpieczenie, aby przejść dalej"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Wniosek nic nie kosztuje. Nie pobieramy opłat za rozpatrzenie.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

