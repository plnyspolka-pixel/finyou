import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Calculator, RefreshCw, Info, HelpCircle, Download, Copy, Scale, ShieldAlert, ExternalLink } from "lucide-react";
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
  initialAnnualRate = 15,
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

  // Tryb inwestora: ręczne nadpisanie stopy NBP, model prowizji, potwierdzenie stopy.
  const [nbpOverride, setNbpOverride] = useState<number | null>(null);
  const [nbpConfirmed, setNbpConfirmed] = useState(false);
  const [commissionMode, setCommissionMode] = useState<"mpkk" | "manual">("manual");
  const [agreementDate, setAgreementDate] = useState<string>("");
  const [checkRate, setCheckRate] = useState(false);
  const [checkCommission, setCheckCommission] = useState(false);
  const [checkKrotnosc, setCheckKrotnosc] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const effectiveRefRate = investorGuidance && nbpOverride != null ? nbpOverride : liveRefRate;
  const MAX_INTEREST_RATE = maxInterestRate(effectiveRefRate);
  const statutoryInterest = effectiveRefRate + 3.5;

  // Prowizja dla inwestora to JEDYNY koszt pozaodsetkowy. Brak prowizji Finance You.
  const financeYouFeePct = 0;
  const financeYouFeePln = 0;
  const grossPrincipal = amount;

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

  const nonInterestTotal = commissionPln + financeYouFeePln;
  const totalCost = schedule.totalOds + nonInterestTotal;
  const totalToRepay = schedule.totalRata + commissionPln; // FY już w racie (kredytowana), prowizja inwestora płatna z góry
  const disbursedOnHand = Math.max(0, amount - commissionPln);
  // Krotność: ile razy klient oddaje względem kwoty otrzymanej na rękę.
  const krotnosc = disbursedOnHand > 0 ? totalToRepay / disbursedOnHand : 0;

  const interestExceeds = annualRate > MAX_INTEREST_RATE + 1e-9;
  const nonInterestExceeds = nonInterestTotal > maxNonInterest + 1e-9;
  const commissionOver45 = commissionPln > amount * 0.45 + 1e-9;
  const krotnoscWarn = krotnosc > 1.5;
  const krotnoscDanger = krotnosc > 2.0;
  const periodWarn = months > 24;
  const anyWarning = interestExceeds || nonInterestExceeds;

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

      {investorGuidance && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" /> Aktualna stopa referencyjna NBP</CardTitle>
            <CardDescription>
              Limit odsetek maksymalnych zależy od stopy referencyjnej NBP, która zmienia się z każdym posiedzeniem RPP. Zweryfikuj wartość przed podpisaniem umowy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Stopa referencyjna NBP (%)</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={effectiveRefRate}
                  onChange={(e) => { setNbpOverride(Number(e.target.value) || 0); setNbpConfirmed(false); }}
                  className="w-32"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => { setNbpOverride(null); setNbpConfirmed(true); void ratesQ.refetch(); }}>
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${ratesQ.isFetching ? "animate-spin" : ""}`} /> Aktualizuj z NBP
              </Button>
              <Button variant={nbpConfirmed ? "secondary" : "default"} size="sm" onClick={() => setNbpConfirmed(true)}>
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> {nbpConfirmed ? "Stopa potwierdzona" : "Potwierdzam aktualną stopę"}
              </Button>
              <a href="https://nbp.pl/podstawowe-stopy-procentowe-nbp/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                nbp.pl <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-3">
              <div className="flex justify-between sm:flex-col sm:gap-0.5"><span className="text-muted-foreground">Stopa ref. NBP</span><b className="tabular-nums">{effectiveRefRate.toFixed(2)}%</b></div>
              <div className="flex justify-between sm:flex-col sm:gap-0.5"><span className="text-muted-foreground">Odsetki ustawowe (+3,5 p.p.)</span><b className="tabular-nums">{statutoryInterest.toFixed(2)}%</b></div>
              <div className="flex justify-between sm:flex-col sm:gap-0.5"><span className="text-muted-foreground">Odsetki maksymalne (×2)</span><b className="tabular-nums text-primary">{MAX_INTEREST_RATE.toFixed(2)}%</b></div>
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Decyzje RPP zapadają co miesiąc. Zalecany zapis w umowie: <i>„oprocentowanie = 2 × (stopa ref. NBP + 3,5 p.p.)"</i> zamiast konkretnego procentu — chroni inwestora przy zmianach stóp (art. 359 §2¹ KC).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

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
                <Input type="number" step="0.1" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm">%</span>
              </div>
            </div>
            <Slider min={0} max={MAX_INTEREST_RATE} step={0.1} value={[Math.min(MAX_INTEREST_RATE, Math.max(0, annualRate))]} onValueChange={(v) => setAnnualRate(v[0])} />
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
                <Input type="number" step="0.5" value={commissionPct} onChange={(e) => setCommissionPct(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm">% ({formatPLN(commissionPln)})</span>
              </div>
            </div>
            <Slider min={0} max={30} step={0.5} value={[Math.min(30, Math.max(0, commissionPct))]} onValueChange={(v) => setCommissionPct(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              {nonInterestExceeds ? (
                <span className="text-destructive font-medium">przekroczono limit MPKK (art. 36a UoKK): {formatPLN(maxNonInterest)}</span>
              ) : <span />}
              <span>30%</span>
            </div>
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

      {/* OSTRZEŻENIE #5 — stopa NBP niezweryfikowana */}
      {investorGuidance && !nbpConfirmed && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <Info className="h-4 w-4 !text-amber-600" />
          <AlertTitle>Zweryfikuj aktualną stopę referencyjną NBP</AlertTitle>
          <AlertDescription className="text-sm">
            Limit odsetek maksymalnych zależy od stopy referencyjnej NBP. Aktualna wartość w kalkulatorze: <b>{effectiveRefRate.toFixed(2)}%</b>
            {ratesQ.data?.effectiveFrom ? ` (obowiązuje od ${ratesQ.data.effectiveFrom})` : ""}. Potwierdź ją na nbp.pl przed podpisaniem umowy.
          </AlertDescription>
        </Alert>
      )}

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
          <div className="flex justify-between"><span>Prowizja Finance You ({financeYouFeePct}%, kredytowana)</span><b className="tabular-nums">{formatPLN(financeYouFeePln)}</b></div>
          <div className="flex justify-between"><span>Kapitał startowy (od którego liczone odsetki)</span><b className="tabular-nums">{formatPLN(grossPrincipal)}</b></div>
          <div className="flex justify-between"><span>Do wypłaty klientowi na rękę</span><b className="tabular-nums text-primary">{formatPLN(disbursedOnHand)}</b></div>
          <div className="flex justify-between"><span>Odsetki razem (od kapitału startowego)</span><b className="tabular-nums">{formatPLN(schedule.totalOds)}</b></div>
          <div className="flex justify-between"><span>Prowizja dla inwestora</span><b className="tabular-nums">{formatPLN(commissionPln)}</b></div>
          {investorGuidance && (
            <div className="flex justify-between"><span className="flex items-center gap-1">Krotność spłaty <InfoTip text="Ile razy pożyczkobiorca oddaje więcej niż otrzymał na rękę: łączna kwota do spłaty ÷ kwota wypłacona." /></span><b className={`tabular-nums ${krotnoscDanger ? "text-destructive" : krotnoscWarn ? "text-amber-600" : ""}`}>{krotnosc.toFixed(2)}×</b></div>
          )}
          <div className="flex justify-between"><span>Całkowity koszt pożyczki</span><b className="tabular-nums">{formatPLN(totalCost)}</b></div>
          <div className="flex justify-between md:col-span-2 border-t pt-2"><span>Łączna kwota do spłaty (raty + prowizja inwestora)</span><b className="tabular-nums">{formatPLN(totalToRepay)}</b></div>
        </CardContent>
      </Card>

      {investorGuidance && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Copy className="h-4 w-4" /> Zapis oprocentowania do umowy</CardTitle>
            <CardDescription>Gotowy fragment chroniący inwestora przy zmianach stóp NBP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea readOnly value={contractClause} rows={5} className="text-xs leading-relaxed" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void navigator.clipboard?.writeText(contractClause); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> {copied ? "Skopiowano" : "Kopiuj zapis"}
            </Button>
          </CardContent>
        </Card>
      )}

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
