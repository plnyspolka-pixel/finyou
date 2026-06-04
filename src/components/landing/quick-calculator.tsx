import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SecurityTypePicker } from "@/components/security-type-picker";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatPLN, type SecurityType } from "@/lib/loan-math";

function monthlyAnnuity(amount: number, monthlyRatePct: number, months: number): number {
  if (!amount || !months) return 0;
  const r = monthlyRatePct / 100;
  if (r === 0) return amount / months;
  const pow = Math.pow(1 + r, months);
  return (amount * r * pow) / (pow - 1);
}

type ScheduleRow = {
  i: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};

function buildSchedule(amount: number, monthlyRatePct: number, months: number): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  if (!amount || !months) return rows;
  const r = monthlyRatePct / 100;
  const ann = monthlyAnnuity(amount, monthlyRatePct, months);
  let balance = amount;
  for (let i = 1; i <= months; i++) {
    const interest = balance * r;
    let principal = ann - interest;
    if (i === months) principal = balance; // domknięcie zaokrągleń
    const payment = interest + principal;
    balance = Math.max(0, balance - principal);
    rows.push({ i, payment, interest, principal, balance });
  }
  return rows;
}

export function QuickCalculator({ ctaHref = "#wniosek" }: { ctaHref?: string }) {
  const [amount, setAmount] = useState(200_000);
  const [monthlyRate, setMonthlyRate] = useState(2.0); // % miesięcznie 1.5 – 5
  const [months, setMonths] = useState(24);
  const [maxPayment, setMaxPayment] = useState(8000);
  const [secType, setSecType] = useState<SecurityType | null>(null);

  const annuity = useMemo(
    () => monthlyAnnuity(amount, monthlyRate, months),
    [amount, monthlyRate, months],
  );
  const rata = useMemo(
    () => (maxPayment > 0 ? Math.min(annuity, maxPayment) : annuity),
    [annuity, maxPayment],
  );
  const balloon = useMemo(
    () => Math.max(0, (annuity - rata) * months),
    [annuity, rata, months],
  );
  const totalPay = useMemo(() => rata * months + balloon, [rata, months, balloon]);
  const investorComp = useMemo(() => Math.max(0, totalPay - amount), [totalPay, amount]);
  const exceedsMax = balloon > 0;

  const schedule = useMemo(
    () => buildSchedule(amount, monthlyRate, months),
    [amount, monthlyRate, months],
  );

  const canContinue = secType !== null && amount > 0 && months > 0 && monthlyRate > 0;

  const goToFullForm = () => {
    if (!canContinue) return;
    const annualRate = monthlyRate * 12; // /wniosek-start oczekuje stopy rocznej
    const url = new URL("/wniosek-start", window.location.origin);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("annualRate", String(annualRate));
    url.searchParams.set("months", String(months));
    url.searchParams.set("maxPayment", String(maxPayment));
    if (secType) url.searchParams.set("secType", secType);
    url.searchParams.set("source", "landing_calculator");
    window.location.href = url.toString();
  };

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
            Sprawdź warunki pożyczki pod zastaw
          </div>
          <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Wylicz ratę w 5 sekund
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Kalkulator wstępny. Dalsze kroki (dane, dokumenty, KW) wypełnisz w pełnym wniosku.
          </p>

          <div className="mt-7 space-y-6">
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

            {/* Wynagrodzenie miesięczne */}
            <div>
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold text-foreground">
                  Wynagrodzenie miesięczne
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={monthlyRate}
                    onChange={(e) => setMonthlyRate(Number(e.target.value) || 0)}
                    className="w-24 text-right text-base font-extrabold"
                  />
                  <span className="text-sm font-semibold text-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[Math.min(5, Math.max(1.5, monthlyRate))]}
                min={1.5}
                max={5}
                step={0.05}
                onValueChange={(v) => setMonthlyRate(v[0] ?? monthlyRate)}
                className="mt-3"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1,50%</span>
                <span>5,00%</span>
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

            {/* Maksymalna rata */}
            <div>
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold text-foreground">Maksymalna rata</Label>
                <Input
                  type="number"
                  value={maxPayment}
                  onChange={(e) => setMaxPayment(Number(e.target.value) || 0)}
                  className="w-36 text-right text-base font-extrabold"
                />
              </div>
              <Slider
                value={[Math.min(50_000, Math.max(500, maxPayment))]}
                min={500}
                max={50_000}
                step={250}
                onValueChange={(v) => setMaxPayment(v[0] ?? maxPayment)}
                className="mt-3"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>500 zł</span>
                <span>50 000 zł</span>
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

        {/* Result */}
        <div className="relative rounded-2xl border border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.15_0.09_265)] p-6 text-primary-foreground md:p-8">
          <div className="absolute inset-0 rounded-2xl opacity-30 [background-image:radial-gradient(circle_at_30%_20%,oklch(0.65_0.13_235_/0.45),transparent_55%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Twoja symulacja
            </div>

            <div className="mt-5">
              <div className="text-xs uppercase tracking-widest text-white/70">
                Szacunkowa rata miesięczna
              </div>
              <div className="mt-1 text-4xl font-extrabold leading-none text-white drop-shadow-[0_1px_8px_oklch(0.78_0.18_85_/_0.55)] md:text-5xl">
                {formatPLN(rata)}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/15">
                <div className="text-[11px] uppercase tracking-wider text-white/70">
                  Łączna spłata
                </div>
                <div className="mt-1 text-lg font-bold text-white">{formatPLN(totalPay)}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/15">
                <div className="text-[11px] uppercase tracking-wider text-white/70">
                  Wynagrodzenie inwestora
                </div>
                <div className="mt-1 text-lg font-bold text-white">{formatPLN(investorComp)}</div>
              </div>
              {exceedsMax && (
                <div className="col-span-2 rounded-xl bg-white/5 p-4 ring-1 ring-white/15">
                  <div className="text-[11px] uppercase tracking-wider text-white/70">
                    Ostatnia rata (z nadwyżką balonową)
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {formatPLN(rata + balloon)}
                  </div>
                </div>
              )}
            </div>

            {exceedsMax && (
              <Alert className="mt-4 border-white/20 bg-white/10 text-white">
                <AlertTriangle className="h-4 w-4 text-accent" />
                <AlertDescription className="text-white/90">
                  Część zobowiązania przekraczająca maksymalną ratę zostanie rozliczona w racie
                  balonowej na koniec okresu.
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              size="lg"
              disabled={!canContinue}
              onClick={goToFullForm}
              className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {canContinue
                ? "Dalej — wypełnij pełny wniosek"
                : "Wybierz zabezpieczenie, aby przejść dalej"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="mt-4 flex items-center gap-2 text-xs text-white/80">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Symulacja jest bezpłatna i nie zobowiązuje do niczego.
            </div>

            <a
              href={ctaHref}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            >
              wniosek
            </a>
          </div>
        </div>
      </div>

      {/* Harmonogram spłat */}
      <div className="relative mt-8">
        <Accordion type="single" collapsible>
          <AccordionItem value="schedule" className="rounded-2xl border border-border bg-secondary/40">
            <AccordionTrigger className="px-5 text-left text-sm font-semibold text-foreground hover:no-underline">
              Pokaż harmonogram spłat ({months} rat)
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-4">
              <div className="max-h-80 overflow-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="text-right">Rata</TableHead>
                      <TableHead className="text-right">Odsetki</TableHead>
                      <TableHead className="text-right">Kapitał</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.map((row) => (
                      <TableRow key={row.i}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.i}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatPLN(row.payment)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatPLN(row.interest)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatPLN(row.principal)}
                        </TableCell>
                        <TableCell className="text-right">{formatPLN(row.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 px-3 text-xs text-muted-foreground">
                Harmonogram wyliczony dla raty równej (annuita) — bez nakładania maksymalnej raty.
                Realny harmonogram zostanie ustalony na etapie umowy.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
