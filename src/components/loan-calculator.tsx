import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Calculator, RefreshCw, Info } from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { getNbpRates } from "@/lib/nbp-rates.functions";

// Limity ustawowe:
// Maks. odsetki: art. 359 §2¹ KC = 2 × stopa ref. NBP + 8 p.p.
// Maks. koszty pozaodsetkowe (art. 36a UoKK): MPKK = K·(10% + 10%·n/R), maks. 45% K.
function maxNonInterestCosts(amount: number, months: number): number {
  if (!amount || !months) return 0;
  const mpkk = amount * (0.10 + 0.10 * (months / 12));
  return Math.min(mpkk, amount * 0.45);
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
};

export function LoanCalculator({
  initialAmount = 100_000,
  initialMonths = 12,
  initialAnnualRate = 15,
  initialCommissionPct = 5,
  initialMaxPayment = 5000,
  onChange,
}: Props) {
  const fetchRates = useServerFn(getNbpRates);
  const ratesQ = useQuery({
    queryKey: ["nbp-rates"],
    queryFn: () => fetchRates(),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const NBP_REF_RATE = ratesQ.data?.referenceRate ?? 5.75;
  const MAX_INTEREST_RATE = NBP_REF_RATE * 2 + 8;

  const [amount, setAmount] = useState(initialAmount);
  const [months, setMonths] = useState(initialMonths);
  const [annualRate, setAnnualRate] = useState(initialAnnualRate);
  const [commissionPct, setCommissionPct] = useState(initialCommissionPct);
  const [maxPayment, setMaxPayment] = useState(initialMaxPayment);

  // Prowizja Finance You — skalowana wg kwoty (10% → 4%), kredytowana do kapitału (gross principal).
  // Identyczna logika jak w kalkulatorze na landingu.
  const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
  const financeYouFeePct = Math.round((10 - feeT * 6) * 10) / 10;
  const financeYouFeePln = Math.round((amount * financeYouFeePct) / 100);
  const grossPrincipal = amount + financeYouFeePln;

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

  const commissionPln = (amount * commissionPct) / 100;
  const nonInterestTotal = commissionPln + financeYouFeePln;
  const maxNonInterest = maxNonInterestCosts(amount, months);
  const totalCost = schedule.totalOds + nonInterestTotal;
  const totalToRepay = schedule.totalRata + commissionPln; // FY już w racie (kredytowana), prowizja inwestora płatna z góry

  const interestExceeds = annualRate > MAX_INTEREST_RATE;
  const nonInterestExceeds = nonInterestTotal > maxNonInterest;
  const anyWarning = interestExceeds || nonInterestExceeds;

  useEffect(() => {
    onChange?.({
      amount, months, annualRate, commissionPct, commissionPln,
      financeYouFeePct, financeYouFeePln, grossPrincipal,
      maxPayment,
      nominalRata: schedule.nominalRata, cappedRata: schedule.cappedRata, balloon: schedule.balloon,
      totalRata: schedule.totalRata, totalOds: schedule.totalOds, totalKap: schedule.totalKap,
      totalCost, totalToRepay, schedule: schedule.rows,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, months, annualRate, commissionPct, financeYouFeePct, financeYouFeePln, grossPrincipal, maxPayment, schedule.balloon, schedule.totalRata, schedule.totalOds]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw className={`h-3.5 w-3.5 ${ratesQ.isFetching ? "animate-spin" : ""}`} />
            Stopy NBP {ratesQ.data?.source === "fallback" && <span className="text-xs text-muted-foreground">(dane offline)</span>}
          </div>
          <span>Referencyjna: <b className="tabular-nums">{NBP_REF_RATE.toFixed(2)}%</b></span>
          {ratesQ.data?.lombardRate != null && <span>Lombardowa: <b className="tabular-nums">{ratesQ.data.lombardRate.toFixed(2)}%</b></span>}
          {ratesQ.data?.depositRate != null && <span>Depozytowa: <b className="tabular-nums">{ratesQ.data.depositRate.toFixed(2)}%</b></span>}
          <span className="text-muted-foreground">Maks. odsetki ustawowe: <b className="tabular-nums text-foreground">{MAX_INTEREST_RATE.toFixed(2)}%</b></span>
          {ratesQ.data?.effectiveFrom && <span className="text-xs text-muted-foreground ml-auto">obowiązuje od {ratesQ.data.effectiveFrom}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Parametry pożyczki</CardTitle>
          <CardDescription>Suwaki działają tak samo, jak po stronie klienta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Kwota nominalna pożyczki</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-40" />
            </div>
            <Slider min={20000} max={1_000_000} step={100} value={[Math.min(1_000_000, Math.max(20000, amount))]} onValueChange={(v) => setAmount(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm grid gap-1.5 sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Kapitał startowy (od którego liczone odsetki)</span><b className="tabular-nums">{formatPLN(grossPrincipal)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prowizja Finance You ({financeYouFeePct}%, kredytowana)</span><b className="tabular-nums">{formatPLN(financeYouFeePln)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Do wypłaty klientowi (po prowizji inwestora)</span><b className="tabular-nums">{formatPLN(Math.max(0, amount - commissionPln))}</b></div>
              <div className="flex justify-between sm:col-span-2 border-t pt-1.5"><span className="text-muted-foreground">Realny wkład gotówkowy inwestora (wypłata klientowi + prowizja FY, minus prowizja inwestora)</span><b className="tabular-nums text-primary">{formatPLN(Math.max(0, grossPrincipal - commissionPln))}</b></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Okres (miesiące)</Label>
              <span className="text-sm tabular-nums">{months} mies.</span>
            </div>
            <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>3 mies.</span><span>72 mies.</span></div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Roczne oprocentowanie (odsetki)</Label>
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
              <Label>Prowizja dla inwestora (jednorazowa, pozaodsetkowa)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" step="0.5" value={commissionPct} onChange={(e) => setCommissionPct(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm">% ({formatPLN(commissionPln)})</span>
              </div>
            </div>
            <Slider min={0} max={30} step={0.5} value={[Math.min(30, Math.max(0, commissionPct))]} onValueChange={(v) => setCommissionPct(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span className={nonInterestExceeds ? "text-destructive font-medium" : ""}>
                limit MPKK (art. 36a UoKK): {formatPLN(maxNonInterest)}
              </span>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Rata nominalna (annuitet)</span><b className="tabular-nums">{formatPLN(schedule.nominalRata)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rata balonowa (ostatnia nadwyżka)</span><b className="tabular-nums">{formatPLN(schedule.balloon)}</b></div>
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

      {anyWarning ? (
        interestExceeds && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Przekraczasz maksymalne odsetki ustawowe</AlertTitle>
            <AlertDescription className="pt-1">
              Oprocentowanie <b>{annualRate.toFixed(2)}%</b> przekracza limit (<b>{MAX_INTEREST_RATE.toFixed(2)}%</b> = 2× stopa ref. NBP + 8 p.p., art. 359 §2¹ KC). Nadwyżka nie będzie egzekwowalna.
            </AlertDescription>
          </Alert>
        )
      ) : (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Parametry mieszczą się w limitach ustawowych</AlertTitle>
          <AlertDescription>Odsetki ≤ {MAX_INTEREST_RATE.toFixed(2)}% · koszty pozaodsetkowe ≤ {formatPLN(maxNonInterest)}.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Podsumowanie</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="flex justify-between"><span>Kwota nominalna (kapitał)</span><b className="tabular-nums">{formatPLN(amount)}</b></div>
          <div className="flex justify-between"><span>Prowizja Finance You ({financeYouFeePct}%, kredytowana)</span><b className="tabular-nums">{formatPLN(financeYouFeePln)}</b></div>
          <div className="flex justify-between"><span>Kapitał startowy (od którego liczone odsetki)</span><b className="tabular-nums">{formatPLN(grossPrincipal)}</b></div>
          <div className="flex justify-between"><span>Do wypłaty klientowi na rękę</span><b className="tabular-nums text-primary">{formatPLN(Math.max(0, amount - commissionPln))}</b></div>
          <div className="flex justify-between"><span>Odsetki razem (od kapitału startowego)</span><b className="tabular-nums">{formatPLN(schedule.totalOds)}</b></div>
          <div className="flex justify-between"><span>Prowizja dla inwestora</span><b className="tabular-nums">{formatPLN(commissionPln)}</b></div>
          <div className="flex justify-between"><span>Całkowity koszt pożyczki</span><b className="tabular-nums">{formatPLN(totalCost)}</b></div>
          <div className="flex justify-between md:col-span-2 border-t pt-2"><span>Łączna kwota do spłaty (raty + prowizja inwestora)</span><b className="tabular-nums">{formatPLN(totalToRepay)}</b></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Harmonogram spłat</CardTitle></CardHeader>
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
    </div>
  );
}
