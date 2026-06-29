import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Calculator, RefreshCw, Info, HelpCircle, Download, Copy, Scale, ShieldAlert, ExternalLink, TrendingUp, Wallet, HandCoins } from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { getNbpRates } from "@/lib/nbp-rates.functions";

// Limity ustawowe:
// Odsetki ustawowe (art. 359 §2 KC): stopa ref. NBP + 3,5 p.p.
// Odsetki maksymalne (art. 359 §2¹ KC): 2 × odsetki ustawowe = 2 × (stopa ref. NBP + 3,5 p.p.).
// Maks. koszty pozaodsetkowe (art. 36a UoKK): MPKK = K·(10% + 10%·n/R), maks. 45% K.
function maxNonInterestCosts(amount: number, months: number): number {
  if (!amount || !months) return 0;
  const mpkk = amount * (0.10 + 0.10 * (months / 12));
  return Math.min(mpkk, amount * 0.45);
}

function maxInterestRate(refRate: number): number {
  return (refRate + 3.5) * 2;
}

export type LoanCalculatorState = {
  amount: number;
  months: number;
  annualRate: number;
  commissionPct: number;
  commissionPln: number;
  financeYouFeePct: number;
  financeYouFeePln: number;
  grossPrincipal: number;
  maxPayment: number;
  nominalRata: number;
  cappedRata: number;
  balloon: number;
  totalRata: number;
  totalOds: number;
  totalKap: number;
  totalCost: number;
  totalToRepay: number;
  schedule: { idx: number; date: string; rata: number; kap: number; ods: number; saldo: number }[];
};

type Props = {
  initialAmount?: number;
  initialMonths?: number;
  initialAnnualRate?: number;
  initialCommissionPct?: number;
  initialMaxPayment?: number;
  onChange?: (s: LoanCalculatorState) => void;
  /** Włącza rozszerzone ostrzeżenia prawne i wskazówki dla inwestora (kalkulator /inwestor/kalkulator). */
  investorGuidance?: boolean;
};

/** Tooltip ze słowniczkiem przy etykiecie pola. */
function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-grid place-items-center text-muted-foreground hover:text-foreground align-middle" aria-label="Wyjaśnienie">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LoanCalculator({
  initialAmount = 100_000,
  initialMonths = 12,
  initialAnnualRate = 10,
  initialCommissionPct = 5,
  initialMaxPayment = 5000,
  onChange,
  investorGuidance = false,
}: Props) {
  const fetchRates = useServerFn(getNbpRates);
  const ratesQ = useQuery({
    queryKey: ["nbp-rates"],
    queryFn: () => fetchRates(),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const liveRefRate = ratesQ.data?.referenceRate ?? 3.75;

  const [amount, setAmount] = useState(initialAmount);
  const [months, setMonths] = useState(initialMonths);
  const [annualRate, setAnnualRate] = useState(initialAnnualRate);
  const [commissionPct, setCommissionPct] = useState(initialCommissionPct);
  const [maxPayment, setMaxPayment] = useState(initialMaxPayment);
  const rateTouched = useRef(false);
  const commissionTouched = useRef(false);
  const setAnnualRateTouched = (v: number) => { rateTouched.current = true; setAnnualRate(v); };
  const setCommissionPctTouched = (v: number) => { commissionTouched.current = true; setCommissionPct(v); };

  // Tryb inwestora: ręczne nadpisanie stopy NBP, model prowizji, potwierdzenie stopy.
  const [nbpOverride, setNbpOverride] = useState<number | null>(null);
  const [nbpConfirmed, setNbpConfirmed] = useState(false);
  const [agreementDate, setAgreementDate] = useState<string>("");

  const [checkRate, setCheckRate] = useState(false);
  const [checkCommission, setCheckCommission] = useState(false);
  const [checkKrotnosc, setCheckKrotnosc] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const effectiveRefRate = investorGuidance && nbpOverride != null ? nbpOverride : liveRefRate;
  const MAX_INTEREST_RATE = maxInterestRate(effectiveRefRate);
  const statutoryInterest = effectiveRefRate + 3.5;

  // Prowizja Finance You — liczona ZAWSZE tak samo, jak w kalkulatorze na /klient:
  // skala liniowa od 10% (przy 20 000 zł) do 4% (przy 1 000 000 zł), kredytowana do kapitału startowego.
  const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
  const financeYouFeePct = Math.round((10 - feeT * 6) * 10) / 10;
  const financeYouFeePln = Math.round((amount * financeYouFeePct) / 100);
  const grossPrincipal = amount + financeYouFeePln;

  const maxNonInterest = maxNonInterestCosts(amount, months);

  // Prowizja inwestora — zawsze sterowana ręcznie suwakiem.
  const commissionPln = (amount * commissionPct) / 100;
  const effectiveCommissionPct = commissionPct;


  const schedule = useMemo(() => {
    if (!grossPrincipal || !months) return { rows: [] as any[], totalRata: 0, totalOds: 0, totalKap: 0, balloon: 0, nominalRata: 0, cappedRata: 0 };
    const monthlyRate = annualRate / 100 / 12;
    const rows: any[] = [];
    const start = new Date();

    const nominalRata = monthlyRate > 0
      ? (grossPrincipal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      : grossPrincipal / months;
    const cappedRata = maxPayment > 0 ? Math.min(nominalRata, maxPayment) : nominalRata;
    const balloon = Math.max(0, (nominalRata - cappedRata) * months);

    let saldo = grossPrincipal;
    for (let i = 1; i <= months; i++) {
      const ods = saldo * monthlyRate;
      const last = i === months;
      const rata = last ? cappedRata + balloon : cappedRata;
      const kap = rata - ods;
      saldo = Math.max(0, saldo - kap);
      const d = new Date(start); d.setMonth(d.getMonth() + i);
      rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kap, ods, saldo });
    }
    return {
      rows,
      totalRata: rows.reduce((s, r) => s + r.rata, 0),
      totalOds: rows.reduce((s, r) => s + r.ods, 0),
      totalKap: rows.reduce((s, r) => s + r.kap, 0),
      balloon,
      nominalRata,
      cappedRata,
    };
  }, [grossPrincipal, months, annualRate, maxPayment]);

  // MPKK obejmuje wyłącznie prowizję inwestora. Prowizja Finance You jest osobnym wynagrodzeniem operatora i nie jest kosztem pozaodsetkowym po stronie pożyczki.
  const nonInterestTotal = commissionPln;
  const totalCost = schedule.totalOds + commissionPln + financeYouFeePln;
  const totalToRepay = schedule.totalRata + commissionPln + financeYouFeePln;
  const disbursedOnHand = Math.max(0, amount - commissionPln - financeYouFeePln);
  // Inwestor: wkład gotówkowy = kwota nominalna - prowizja (potrącana z góry).
  // Inwestor otrzymuje: spłaty kapitału z części "amount" + odsetki + prowizja.
  const investorCashOut = Math.max(0, amount - commissionPln);
  const investorTotalIn = amount + schedule.totalOds + commissionPln; // brutto: zwrot kapitału + odsetki + prowizja
  const investorProfit = schedule.totalOds + commissionPln;
  const investorRoiPct = investorCashOut > 0 ? (investorProfit / investorCashOut) * 100 : 0;
  const investorRoiAnnualPct = months > 0 ? (investorRoiPct * 12) / months : 0;
  // Krotność: ile razy klient oddaje względem kwoty otrzymanej na rękę.
  // Prowizja Finance You jest wynagrodzeniem operatora (poza MPKK) i NIE wlicza się do tego limitu —
  // wyłączamy ją zarówno z licznika (łączna spłata), jak i z mianownika (kwota na rękę).
  const krotnoscBasis = Math.max(0, amount - commissionPln);
  const krotnoscRepay = totalToRepay - financeYouFeePln;
  const krotnosc = krotnoscBasis > 0 ? krotnoscRepay / krotnoscBasis : 0;

  const interestExceeds = annualRate > MAX_INTEREST_RATE + 1e-9;
  const nonInterestExceeds = nonInterestTotal > maxNonInterest + 1e-9;
  const commissionOver45 = commissionPln > amount * 0.45 + 1e-9;
  const krotnoscWarn = krotnosc > 1.5;
  const krotnoscDanger = krotnosc > 2.0;
  const periodWarn = months > 24;
  const anyWarning = interestExceeds || nonInterestExceeds;

  useEffect(() => {
    if (!rateTouched.current) {
      const rounded = Math.floor(MAX_INTEREST_RATE * 10) / 10;
      if (Math.abs(annualRate - rounded) > 1e-9) setAnnualRate(rounded);
    }
  }, [MAX_INTEREST_RATE, annualRate]);

  useEffect(() => {
    if (!commissionTouched.current) {
      // Maksymalna prowizja bez wątpliwości prawnych = limit MPKK (% kwoty nominalnej),
      // przycięta do zakresu suwaka (0–30%).
      const mpkkPct = Math.min(30, Math.max(0, 10 + 10 * (months / 12)));
      const rounded = Math.floor(mpkkPct * 2) / 2; // krok 0,5%
      if (Math.abs(commissionPct - rounded) > 1e-9) setCommissionPct(rounded);
    }
  }, [months, commissionPct]);

  useEffect(() => {
    onChange?.({
      amount, months, annualRate, commissionPct: effectiveCommissionPct, commissionPln,
      financeYouFeePct, financeYouFeePln, grossPrincipal,
      maxPayment,
      nominalRata: schedule.nominalRata, cappedRata: schedule.cappedRata, balloon: schedule.balloon,
      totalRata: schedule.totalRata, totalOds: schedule.totalOds, totalKap: schedule.totalKap,
      totalCost, totalToRepay, schedule: schedule.rows,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, months, annualRate, effectiveCommissionPct, commissionPln, financeYouFeePct, financeYouFeePln, grossPrincipal, maxPayment, schedule.balloon, schedule.totalRata, schedule.totalOds]);

  const contractClause =
    `Pożyczka oprocentowana jest według stopy stanowiącej dwukrotność odsetek ustawowych, ` +
    `tj. dwukrotność sumy stopy referencyjnej Narodowego Banku Polskiego i 3,5 punktu procentowego. ` +
    `Na dzień zawarcia niniejszej umowy stopa oprocentowania wynosi ${annualRate.toFixed(2).replace(".", ",")}% w stosunku rocznym ` +
    `(stopa referencyjna NBP: ${effectiveRefRate.toFixed(2).replace(".", ",")}%, limit odsetek maksymalnych: ${MAX_INTEREST_RATE.toFixed(2).replace(".", ",")}%). ` +
    `W przypadku zmiany stopy referencyjnej NBP oprocentowanie ulega odpowiedniej zmianie z dniem wejścia w życie nowej stopy, ` +
    `nie przekraczając wysokości odsetek maksymalnych.`;

  function downloadScheduleCsv() {
    const header = ["Nr raty", "Termin", "Rata", "Kapitał", "Odsetki", "Saldo"];
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");
    const lines = [header.join(";")];
    for (const r of schedule.rows) {
      lines.push([r.idx, r.date, fmt(r.rata), fmt(r.kap), fmt(r.ods), fmt(r.saldo)].join(";"));
    }
    lines.push(["", "RAZEM", fmt(schedule.totalRata), fmt(schedule.totalKap), fmt(schedule.totalOds), ""].join(";"));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harmonogram-${amount}-${months}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw className={`h-3.5 w-3.5 ${ratesQ.isFetching ? "animate-spin" : ""}`} />
            Stopy NBP {ratesQ.data?.source === "fallback" && <span className="text-xs text-muted-foreground">(dane offline)</span>}
          </div>
          <span>Referencyjna: <b className="tabular-nums">{effectiveRefRate.toFixed(2)}%</b>{investorGuidance && nbpOverride != null && <span className="text-xs text-amber-600"> (ręcznie)</span>}</span>
          {ratesQ.data?.lombardRate != null && <span>Lombardowa: <b className="tabular-nums">{ratesQ.data.lombardRate.toFixed(2)}%</b></span>}
          {ratesQ.data?.depositRate != null && <span>Depozytowa: <b className="tabular-nums">{ratesQ.data.depositRate.toFixed(2)}%</b></span>}
          <span className="text-muted-foreground">Maks. odsetki ustawowe: <b className="tabular-nums text-foreground">{MAX_INTEREST_RATE.toFixed(2)}%</b></span>
          {ratesQ.data?.effectiveFrom && <span className="text-xs text-muted-foreground ml-auto">obowiązuje od {ratesQ.data.effectiveFrom}</span>}
        </CardContent>
      </Card>

      {/* HERO — najważniejsze liczby (fancy) */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top_left,_hsl(220_70%_25%),_hsl(230_60%_12%)_60%,_hsl(235_50%_8%))] p-6 md:p-8 shadow-2xl">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[conic-gradient(from_120deg,_#a78bfa,_#22d3ee,_#34d399,_#a78bfa)] opacity-25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[conic-gradient(from_0deg,_#22d3ee,_#a78bfa,_#f472b6,_#22d3ee)] opacity-20 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Najważniejsze liczby</p>
          <h2 className="mt-1 text-2xl font-black text-white md:text-3xl">Co realnie wchodzi i wychodzi z tej pożyczki</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {/* Investor cash out */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur-sm transition hover:bg-white/[0.09]">
              <div className="flex items-center gap-2 text-white/70">
                <Wallet className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest">Inwestor wkłada</span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-white md:text-4xl">{formatPLN(investorCashOut)}</p>
              <p className="mt-1 text-xs text-white/65">gotówka wypłacana z konta inwestora (kwota nominalna − prowizja potrącona z góry)</p>
            </div>

            {/* Investor cash in */}
            <div className="group relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 p-5 backdrop-blur-sm transition hover:from-emerald-400/20 hover:to-cyan-400/15">
              <div className="flex items-center gap-2 text-emerald-200/90">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest">Inwestor odbiera łącznie</span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-white md:text-4xl">{formatPLN(investorTotalIn)}</p>
              <p className="mt-1 text-xs text-emerald-100/80">
                zysk <b className="text-white">{formatPLN(investorProfit)}</b> · ROI <b className="text-white">{investorRoiPct.toFixed(1)}%</b> ({investorRoiAnnualPct.toFixed(1)}% / rok)
              </p>
            </div>

            {/* Client on hand */}
            <div className="group relative overflow-hidden rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-rose-400/10 p-5 backdrop-blur-sm transition hover:from-amber-400/20 hover:to-rose-400/15">
              <div className="flex items-center gap-2 text-amber-200/90">
                <HandCoins className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest">Klient dostaje na rękę</span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-white md:text-4xl">{formatPLN(disbursedOnHand)}</p>
              <p className="mt-1 text-xs text-amber-100/80">
                kwota nominalna <b className="text-white">{formatPLN(amount)}</b> − prowizja inwestora <b className="text-white">{formatPLN(commissionPln)}</b> − prowizja FY <b className="text-white">{formatPLN(financeYouFeePln)}</b>
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/75 md:grid-cols-4">
            <div><span className="text-white/55">Rata miesięczna</span><div className="mt-0.5 text-base font-bold tabular-nums text-white">{formatPLN(schedule.cappedRata)}</div></div>
            <div><span className="text-white/55">Okres</span><div className="mt-0.5 text-base font-bold tabular-nums text-white">{months} mies.</div></div>
            <div><span className="text-white/55">Łączna spłata</span><div className="mt-0.5 text-base font-bold tabular-nums text-white">{formatPLN(totalToRepay)}</div></div>
            <div><span className="text-white/55">Krotność spłaty</span><div className={`mt-0.5 text-base font-bold tabular-nums ${krotnoscDanger ? "text-rose-300" : krotnoscWarn ? "text-amber-300" : "text-white"}`}>{krotnosc.toFixed(2)}×</div></div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Parametry pożyczki</CardTitle>
          <CardDescription>Suwaki działają tak samo, jak po stronie klienta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">Kwota nominalna pożyczki {investorGuidance && <InfoTip text="Kwota brutto wpisana w umowie. Klient otrzymuje na rękę kwotę nominalną pomniejszoną o prowizję inwestora; odsetki liczone są od kapitału startowego (kwota nominalna + kredytowana prowizja Finance You)." />}</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-40" />
            </div>
            <Slider min={20000} max={1_000_000} step={100} value={[Math.min(1_000_000, Math.max(20000, amount))]} onValueChange={(v) => setAmount(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
            {investorGuidance && (
              <Alert className="py-2">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Klient otrzymuje na rękę <b>{formatPLN(disbursedOnHand)}</b> (kwota nominalna − prowizja inwestora). Kwota nominalna umowy (brutto) jest wyższa o prowizję i koszty.
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Do wypłaty klientowi (po prowizji inwestora)</span><b className="tabular-nums">{formatPLN(disbursedOnHand)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Realny wkład gotówkowy inwestora</span><b className="tabular-nums text-primary">{formatPLN(Math.max(0, amount - commissionPln))}</b></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">Klient otrzymuje na rękę {investorGuidance && <InfoTip text="Kwota faktycznie wypłacana klientowi po potrąceniu prowizji inwestora i prowizji Finance You. Ustawienie tego suwaka dobiera kwotę nominalną pożyczki tak, aby na rękę wyszła wskazana wartość." />}</Label>
              <Input
                type="number"
                value={Math.round(disbursedOnHand)}
                onChange={(e) => {
                  const target = Number(e.target.value) || 0;
                  let a = target / Math.max(0.01, 1 - commissionPct / 100 - 0.07);
                  for (let i = 0; i < 25; i++) {
                    const t = Math.min(1, Math.max(0, (a - 20_000) / (1_000_000 - 20_000)));
                    const feePct = 10 - t * 6;
                    const onHand = a * (1 - commissionPct / 100 - feePct / 100);
                    a = a + (target - onHand);
                  }
                  setAmount(Math.min(1_000_000, Math.max(20_000, Math.round(a / 100) * 100)));
                }}
                className="w-40"
              />
            </div>
            <Slider
              min={10_000}
              max={1_000_000}
              step={500}
              value={[Math.min(1_000_000, Math.max(10_000, Math.round(disbursedOnHand)))]}
              onValueChange={(v) => {
                const target = v[0];
                let a = target / Math.max(0.01, 1 - commissionPct / 100 - 0.07);
                for (let i = 0; i < 25; i++) {
                  const t = Math.min(1, Math.max(0, (a - 20_000) / (1_000_000 - 20_000)));
                  const feePct = 10 - t * 6;
                  const onHand = a * (1 - commissionPct / 100 - feePct / 100);
                  a = a + (target - onHand);
                }
                setAmount(Math.min(1_000_000, Math.max(20_000, Math.round(a / 100) * 100)));
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10 000 zł</span>
              <span>Kwota nominalna: <b className="tabular-nums text-foreground">{formatPLN(amount)}</b></span>
              <span>1 000 000 zł</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Okres (miesiące)</Label>
              <span className="text-sm tabular-nums">{months} mies.</span>
            </div>
            <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>3 mies.</span><span>72 mies.</span></div>
            {investorGuidance && periodWarn && (
              <Alert className="py-2 border-amber-300 bg-amber-50 text-amber-900">
                <Info className="h-4 w-4 !text-amber-600" />
                <AlertDescription className="text-xs">
                  Przy okresie powyżej 24 miesięcy referencyjna prowizja MPKK przekracza 30% kwoty, a roczna efektywność spada. Rozważ krótszy okres lub odnowienie umowy po 12–24 miesiącach.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">Roczne oprocentowanie (odsetki) {investorGuidance && <InfoTip text="Górny limit z art. 359 §2¹ KC = 2 × (stopa ref. NBP + 3,5 p.p.). Odsetki ponad limit są nienależne i podlegają zwrotowi." />}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" step="0.1" value={annualRate} onChange={(e) => setAnnualRateTouched(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm">%</span>
              </div>
            </div>
            <Slider min={0} max={MAX_INTEREST_RATE} step={0.1} value={[Math.min(MAX_INTEREST_RATE, Math.max(0, annualRate))]} onValueChange={(v) => setAnnualRateTouched(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span className={interestExceeds ? "text-destructive font-medium" : ""}>
                limit ustawowy: {MAX_INTEREST_RATE.toFixed(2)}%
              </span>
              <span>{MAX_INTEREST_RATE.toFixed(2)}%</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">Prowizja dla inwestora (jednorazowa, pozaodsetkowa) {investorGuidance && <InfoTip text="Jedyny koszt pozaodsetkowy. Ustawiana ręcznie suwakiem; potrącana z góry przy uruchomieniu." />}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" step="0.5" value={commissionPct} onChange={(e) => setCommissionPctTouched(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm">% ({formatPLN(commissionPln)})</span>
              </div>
            </div>
            <Slider min={0} max={30} step={0.5} value={[Math.min(30, Math.max(0, commissionPct))]} onValueChange={(v) => setCommissionPctTouched(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              {nonInterestExceeds ? (
                <span className="text-destructive font-medium">przekroczono limit MPKK (art. 36a UoKK): {formatPLN(maxNonInterest)}</span>
              ) : <span />}
              <span>30%</span>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Prowizja Finance You ({financeYouFeePct}%, kredytowana)</span><b className="tabular-nums">{formatPLN(financeYouFeePln)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Kapitał startowy (od którego liczone są odsetki)</span><b className="tabular-nums">{formatPLN(grossPrincipal)}</b></div>
          </div>



          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Maksymalna rata dla klienta</Label>
              <Input type="number" value={maxPayment} onChange={(e) => setMaxPayment(Number(e.target.value) || 0)} className="w-40" />
            </div>
            <Slider min={500} max={50000} step={100} value={[Math.min(50000, Math.max(500, maxPayment))]} onValueChange={(v) => setMaxPayment(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>500 zł</span><span>50 000 zł</span></div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1">Rata nominalna (annuitet){investorGuidance && <InfoTip text="Pełna rata annuitetowa wyliczona od kapitału startowego i oprocentowania." />}</span><b className="tabular-nums">{formatPLN(schedule.nominalRata)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1">Rata balonowa (ostatnia nadwyżka){investorGuidance && <InfoTip text="Jednorazowa spłata nadwyżki kapitału na koniec umowy, gdy rata miesięczna jest ograniczona limitem." />}</span><b className="tabular-nums">{formatPLN(schedule.balloon)}</b></div>
            </div>
            {schedule.balloon > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>Część zobowiązania przekraczająca maksymalną ratę zostanie rozliczona w racie balonowej na koniec okresu.</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>


      {nonInterestExceeds && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Upewnij się, że pożyczka jest w modelu B2B</AlertTitle>
          <AlertDescription className="pt-1">
            Koszty pozaodsetkowe <b>{formatPLN(nonInterestTotal)}</b> przekraczają limit MPKK <b>{formatPLN(maxNonInterest)}</b> (art. 36a UoKK).
            Limit ten dotyczy <b>kredytu konsumenckiego</b> — przy umowie z konsumentem nadwyżka będzie nienależna.
            Aby kontynuować z tą prowizją, pożyczkobiorca musi być przedsiębiorcą, a pożyczka udzielona w <b>modelu B2B</b> (na cele związane z prowadzoną działalnością gospodarczą).
          </AlertDescription>
        </Alert>
      )}

      {/* OSTRZEŻENIE #1 — przekroczenie limitu odsetek */}
      {interestExceeds ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Przekraczasz maksymalne odsetki ustawowe</AlertTitle>
          <AlertDescription className="pt-1">
            Oprocentowanie <b>{annualRate.toFixed(2)}%</b> przekracza limit (<b>{MAX_INTEREST_RATE.toFixed(2)}%</b> = 2 × (stopa ref. NBP {effectiveRefRate.toFixed(2)}% + 3,5 p.p.), art. 359 §2¹ KC).
            Pożyczkobiorca może żądać zwrotu nadpłaconych odsetek — nadwyżka nie jest egzekwowalna. Suwak jest ograniczony do limitu.
          </AlertDescription>
        </Alert>
      ) : !anyWarning && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Parametry mieszczą się w limitach ustawowych</AlertTitle>
          <AlertDescription>Odsetki ≤ {MAX_INTEREST_RATE.toFixed(2)}% · koszty pozaodsetkowe ≤ {formatPLN(maxNonInterest)}.</AlertDescription>
        </Alert>
      )}

      {/* OSTRZEŻENIA inwestora: prowizja > MPKK, prowizja > 45%, krotność */}
      {investorGuidance && commissionPln > maxNonInterest + 1e-9 && !nonInterestExceeds && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 !text-amber-600" />
          <AlertTitle>Prowizja powyżej referencyjnego limitu MPKK</AlertTitle>
          <AlertDescription className="text-sm">
            Prowizja <b>{formatPLN(commissionPln)}</b> przekracza referencyjny limit MPKK <b>{formatPLN(maxNonInterest)}</b>. Pożyczka hipoteczna jest wyłączona z ustawy o kredycie konsumenckim,
            jednak sądy stosują MPKK jako punkt odniesienia przy ocenie zasad współżycia społecznego (art. 58 §2 KC) i wyzysku (art. 388 KC). Ryzyko rośnie przy zabezpieczeniu hipoteką (niskie ryzyko pożyczkodawcy).
          </AlertDescription>
        </Alert>
      )}

      {investorGuidance && commissionOver45 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Prowizja przekracza 45% kwoty wypłaconej</AlertTitle>
          <AlertDescription className="text-sm">
            Prowizja <b>{formatPLN(commissionPln)}</b> przekracza 45% kwoty nominalnej — absolutne maksimum referencyjne MPKK. Silne ryzyko prawne (wyzysk / lichwa).
          </AlertDescription>
        </Alert>
      )}

      {investorGuidance && krotnoscDanger ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Krotność spłaty {krotnosc.toFixed(2)}× — strefa podwyższonego ryzyka</AlertTitle>
          <AlertDescription className="text-sm">
            Pożyczkobiorca oddaje <b>{krotnosc.toFixed(2)}×</b> kwotę otrzymaną na rękę. Powyżej 2,0× rośnie ryzyko zakwalifikowania jako lichwa (art. 304 KK — kara do 3 lat) oraz wyzysk (art. 388 KC).
            Przy pożyczkach pod zastaw nieruchomości — gdzie ryzyko pożyczkodawcy jest ograniczone hipoteką — sądy stosują wyższe standardy ekwiwalentności świadczeń.
          </AlertDescription>
        </Alert>
      ) : investorGuidance && krotnoscWarn && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 !text-amber-600" />
          <AlertTitle>Krotność spłaty {krotnosc.toFixed(2)}×</AlertTitle>
          <AlertDescription className="text-sm">
            Pożyczkobiorca spłaca <b>{krotnosc.toFixed(2)}×</b> kwotę, którą otrzymał. Powyżej 2,0× istnieje ryzyko zakwalifikowania jako lichwa (art. 304 KK). Przy pożyczkach hipotecznych sądy są bardziej krytyczne.
          </AlertDescription>
        </Alert>
      )}

      <Card className={investorGuidance && krotnoscDanger ? "border-destructive" : undefined}>
        <CardHeader>
          <CardTitle>Podsumowanie</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="flex justify-between"><span>Kwota nominalna (kapitał)</span><b className="tabular-nums">{formatPLN(amount)}</b></div>
          <div className="flex justify-between"><span>Do wypłaty klientowi na rękę</span><b className="tabular-nums text-primary">{formatPLN(disbursedOnHand)}</b></div>
          <div className="flex justify-between"><span>Odsetki razem</span><b className="tabular-nums">{formatPLN(schedule.totalOds)}</b></div>

          <div className="flex justify-between"><span>Prowizja dla inwestora <span className="text-xs text-muted-foreground">(koszt pozaodsetkowy)</span></span><b className="tabular-nums">{formatPLN(commissionPln)}</b></div>
          <div className="flex justify-between"><span>Prowizja Finance You <span className="text-xs text-muted-foreground">(poza MPKK)</span></span><b className="tabular-nums">{formatPLN(financeYouFeePln)}</b></div>
          {investorGuidance && (
            <div className="flex justify-between"><span className="flex items-center gap-1">Krotność spłaty <InfoTip text="Ile razy pożyczkobiorca oddaje więcej niż otrzymał na rękę. Prowizja Finance You (poza MPKK) nie wlicza się do tego limitu — jest pomijana po obu stronach wyliczenia." /></span><b className={`tabular-nums ${krotnoscDanger ? "text-destructive" : krotnoscWarn ? "text-amber-600" : ""}`}>{krotnosc.toFixed(2)}×</b></div>
          )}
          <div className="flex justify-between"><span>Całkowity koszt pożyczki</span><b className="tabular-nums">{formatPLN(totalCost)}</b></div>
          <div className="flex justify-between md:col-span-2 border-t pt-2"><span>Łączna kwota do spłaty (raty + prowizja inwestora)</span><b className="tabular-nums">{formatPLN(totalToRepay)}</b></div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Harmonogram spłat</CardTitle>
          {investorGuidance && schedule.rows.length > 0 && (
            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Download className="mr-2 h-3.5 w-3.5" /> Pobierz jako CSV</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Weryfikacja przed pobraniem harmonogramu</DialogTitle>
                  <DialogDescription>Potwierdź założenia zanim wygenerujesz dokument.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={checkRate} onCheckedChange={(c) => setCheckRate(Boolean(c))} className="mt-0.5" />
                    <span>Potwierdzam aktualną stopę ref. NBP: <b>{effectiveRefRate.toFixed(2)}%</b> (limit odsetek: {MAX_INTEREST_RATE.toFixed(2)}%).</span>
                  </label>
                  <div className="flex items-center gap-2 text-sm pl-6">
                    <span className="text-muted-foreground">Data zawarcia umowy:</span>
                    <Input type="date" value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} className="w-44" />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={checkCommission} onCheckedChange={(c) => setCheckCommission(Boolean(c))} className="mt-0.5" />
                    <span>Prowizja <b>{formatPLN(commissionPln)}</b> mieści się w przyjętym limicie referencyjnym{commissionPln > maxNonInterest ? " (UWAGA: powyżej MPKK)" : ""}.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={checkKrotnosc} onCheckedChange={(c) => setCheckKrotnosc(Boolean(c))} className="mt-0.5" />
                    <span>Krotność spłaty: <b>{krotnosc.toFixed(2)}×</b> — akceptuję ryzyko prawne.</span>
                  </label>
                </div>
                <DialogFooter>
                  <Button onClick={downloadScheduleCsv} disabled={!checkRate || !checkCommission || !checkKrotnosc || !agreementDate}>
                    <Download className="mr-2 h-4 w-4" /> Pobierz harmonogram
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead><TableHead>Termin</TableHead><TableHead>Rata</TableHead><TableHead>Kapitał</TableHead><TableHead>Odsetki</TableHead><TableHead>Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.rows.map((r) => (
                  <TableRow key={r.idx}>
                    <TableCell>{r.idx}</TableCell>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="tabular-nums">{formatPLN(r.rata)}</TableCell>
                    <TableCell className="tabular-nums">{formatPLN(r.kap)}</TableCell>
                    <TableCell className="tabular-nums">{formatPLN(r.ods)}</TableCell>
                    <TableCell className="tabular-nums">{formatPLN(r.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {investorGuidance && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Kalkulator ma charakter informacyjny. Nie stanowi porady prawnej ani finansowej. Limity odsetek zmieniają się z decyzjami RPP — weryfikuj je przed każdym podpisaniem umowy.
          Finance You Sp. z o.o. zaleca konsultację prawną przy niestandardowych strukturach pożyczek. Podstawy prawne: art. 359 §2¹ KC (odsetki maksymalne), art. 36a UoKK (MPKK ref.),
          art. 388 KC (wyzysk), art. 304 KK (lichwa), art. 58 §2 KC (zasady współżycia społecznego).
        </p>
      )}
    </div>
  );
}
