import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AlertTriangle, ArrowRight, ShieldCheck, Sparkles, Wallet, Clock, Home as HomeIcon } from "lucide-react";
import { formatPLN, securityTypeLabels, type SecurityType } from "@/lib/loan-math";
import { FinanceYouLogo } from "@/components/finance-you-logo";

export const Route = createFileRoute("/wniosek-warunki")({
  component: WniosekWarunkiPage,
  head: () => ({
    meta: [
      { title: "Indywidualne warunki pożyczki — krok 3" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Step1 = {
  amount: number;
  months: number;
  secType: SecurityType | null;
  source?: string;
};

function monthlyAnnuity(amount: number, monthlyRatePct: number, months: number): number {
  if (!amount || !months) return 0;
  const r = monthlyRatePct / 100;
  if (r === 0) return amount / months;
  const pow = Math.pow(1 + r, months);
  return (amount * r * pow) / (pow - 1);
}

type Row = { i: number; payment: number; interest: number; principal: number; balance: number };

function buildSchedule(amount: number, monthlyRatePct: number, months: number): Row[] {
  const rows: Row[] = [];
  if (!amount || !months) return rows;
  const r = monthlyRatePct / 100;
  const ann = monthlyAnnuity(amount, monthlyRatePct, months);
  let balance = amount;
  for (let i = 1; i <= months; i++) {
    const interest = balance * r;
    let principal = ann - interest;
    if (i === months) principal = balance;
    const payment = interest + principal;
    balance = Math.max(0, balance - principal);
    rows.push({ i, payment, interest, principal, balance });
  }
  return rows;
}

function WniosekWarunkiPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [step1, setStep1] = useState<Step1 | null>(null);
  const [monthlyRate, setMonthlyRate] = useState(2.0);
  const [maxPayment, setMaxPayment] = useState(8000);

  // Restore step 1 z sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("calc_step1_v1");
      if (raw) setStep1(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);

  // Wymagana auth — jeśli brak, wracamy do step 2
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({ to: "/wniosek-start" });
    }
  }, [authLoading, user, navigate]);

  const amount = step1?.amount ?? 0;
  const months = step1?.months ?? 0;

  const annuity = useMemo(() => monthlyAnnuity(amount, monthlyRate, months), [amount, monthlyRate, months]);
  const rata = useMemo(() => (maxPayment > 0 ? Math.min(annuity, maxPayment) : annuity), [annuity, maxPayment]);
  const balloon = useMemo(() => Math.max(0, (annuity - rata) * months), [annuity, rata, months]);
  const totalPay = useMemo(() => rata * months + balloon, [rata, months, balloon]);
  const investorComp = useMemo(() => Math.max(0, totalPay - amount), [totalPay, amount]);
  const exceedsMax = balloon > 0;

  const schedule = useMemo(() => buildSchedule(amount, monthlyRate, months), [amount, monthlyRate, months]);

  const goNext = () => {
    try {
      sessionStorage.setItem(
        "calc_step3_v1",
        JSON.stringify({
          monthlyRate,
          maxPayment,
          rata,
          totalPay,
          investorComp,
          ts: Date.now(),
        }),
      );
    } catch {
      /* noop */
    }
    void navigate({ to: "/klient" });
  };

  if (!step1) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Brak parametrów pożyczki</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wróć do kalkulatora i wybierz kwotę, okres oraz typ zabezpieczenia.
            </p>
            <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/">Wróć do kalkulatora</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Mini header z logo */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/">
            <FinanceYouLogo variant="light" />
          </Link>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Krok 3 z 4
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-10 md:px-6">
        {/* Stepper */}
        <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <li className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-muted-foreground">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/30 text-[10px] text-foreground">✓</span>
            Parametry
          </li>
          <li className="text-muted-foreground">→</li>
          <li className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-muted-foreground">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/30 text-[10px] text-foreground">✓</span>
            Twoje dane
          </li>
          <li className="text-muted-foreground">→</li>
          <li className="flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-accent-foreground">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-foreground/30 text-[10px]">3</span>
            Indywidualne warunki
          </li>
          <li className="text-muted-foreground">→</li>
          <li className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-muted-foreground">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-border text-[10px]">4</span>
            Nieruchomość (KW + zdjęcia)
          </li>
        </ol>

        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Dostosujemy warunki pożyczki do <span className="text-accent">Twoich możliwości</span>
          </h1>
          <p className="mt-3 text-muted-foreground">
            Powiedz, jaką maksymalną ratę możesz spłacać miesięcznie. My pokażemy, jak wpłynie to na koszt i harmonogram — wszystko zmienia się na żywo, gdy ruszasz suwakami.
          </p>
        </div>

        {/* Recap step 1 */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-4 w-4 text-accent" /> Kwota
            </div>
            <div className="mt-1 text-xl font-extrabold text-foreground">{formatPLN(amount)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Clock className="h-4 w-4 text-accent" /> Okres
            </div>
            <div className="mt-1 text-xl font-extrabold text-foreground">{months} mies.</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <HomeIcon className="h-4 w-4 text-accent" /> Zabezpieczenie
            </div>
            <div className="mt-1 text-xl font-extrabold text-foreground">
              {step1.secType ? securityTypeLabels[step1.secType] : "—"}
            </div>
          </div>
        </div>

        {/* Suwaki + live wynik */}
        <div className="relative mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl md:p-8">
            <div className="space-y-7">
              {/* Maksymalna rata */}
              <div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <Label className="text-sm font-semibold text-foreground">
                      Maksymalna rata, jaką możesz płacić miesięcznie
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Suwak zmienia harmonogram na żywo — możesz zobaczyć efekt każdej zmiany.
                    </p>
                  </div>
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

              {/* Wynagrodzenie miesięczne inwestora */}
              <div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <Label className="text-sm font-semibold text-foreground">
                      Miesięczne wynagrodzenie inwestora
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Zaproponuj, ile możesz miesięcznie pokryć — ustalimy z Tobą indywidualne warunki.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.05"
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
                  <span>1,50% / mies.</span>
                  <span>5,00% / mies.</span>
                </div>
              </div>
            </div>

            {/* Harmonogram - live */}
            <div className="mt-7">
              <Accordion type="single" collapsible defaultValue="schedule">
                <AccordionItem value="schedule" className="rounded-2xl border border-border bg-secondary/40">
                  <AccordionTrigger className="px-5 text-left text-sm font-semibold text-foreground hover:no-underline">
                    Pokaż harmonogram spłat ({months} rat) — aktualizuje się na żywo
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-4">
                    <div className="max-h-96 overflow-auto rounded-xl border border-border bg-card">
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
                              <TableCell className="font-mono text-xs text-muted-foreground">{row.i}</TableCell>
                              <TableCell className="text-right font-semibold">{formatPLN(row.payment)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatPLN(row.interest)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatPLN(row.principal)}</TableCell>
                              <TableCell className="text-right">{formatPLN(row.balance)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          {/* Live result */}
          <div className="relative h-fit rounded-3xl border border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.15_0.09_265)] p-6 text-primary-foreground shadow-2xl md:sticky md:top-6 md:p-8">
            <div className="absolute inset-0 rounded-3xl opacity-30 [background-image:radial-gradient(circle_at_30%_20%,oklch(0.65_0.13_235_/0.45),transparent_55%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-white/40 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Twoja symulacja
              </div>

              <div className="mt-5">
                <div className="text-xs uppercase tracking-widest text-white/80">Szacunkowa rata miesięczna</div>
                <div className="mt-1 text-4xl font-extrabold leading-none text-white drop-shadow-[0_2px_12px_oklch(0.78_0.18_85_/_0.6)] md:text-5xl">
                  {formatPLN(rata)}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                  <div className="text-[11px] uppercase tracking-wider text-white/75">Łączna spłata</div>
                  <div className="mt-1 text-lg font-bold text-white">{formatPLN(totalPay)}</div>
                </div>
                <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                  <div className="text-[11px] uppercase tracking-wider text-white/75">Wynagrodzenie inwestora</div>
                  <div className="mt-1 text-lg font-bold text-white">{formatPLN(investorComp)}</div>
                </div>
                {exceedsMax && (
                  <div className="col-span-2 rounded-xl border border-white/20 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-wider text-white/75">Ostatnia rata (z nadwyżką balonową)</div>
                    <div className="mt-1 text-lg font-bold text-white">{formatPLN(rata + balloon)}</div>
                  </div>
                )}
              </div>

              {exceedsMax && (
                <Alert className="mt-4 border-white/30 bg-white/10 text-white">
                  <AlertTriangle className="h-4 w-4 text-accent" />
                  <AlertDescription className="text-white/95">
                    Część zobowiązania przekraczająca maks. ratę zostanie rozliczona w racie balonowej na koniec okresu.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                size="lg"
                onClick={goNext}
                className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Dalej — nieruchomość i KW
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <div className="mt-4 flex items-center gap-2 text-xs text-white/80">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                Warunki ostateczne ustalamy z inwestorem po analizie nieruchomości.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
