import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Calculator } from "lucide-react";
import { formatPLN, repaymentTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: Kalkulator,
});

// Ustawowe limity (stan obecny):
// Maks. odsetki: art. 359 §2¹ KC = 2 × stopa ref. NBP + 8 p.p.
// Maks. koszty pozaodsetkowe (kredyt konsumencki, art. 36a UoKK):
//   MPKK = K·(10% + 10%·n/R), łącznie nie więcej niż 45% K.
const NBP_REF_RATE = 5.75;
const MAX_INTEREST_RATE = NBP_REF_RATE * 2 + 8; // 19.5%

function maxNonInterestCosts(amount: number, months: number): number {
  if (!amount || !months) return 0;
  const mpkk = amount * (0.10 + 0.10 * (months / 12));
  return Math.min(mpkk, amount * 0.45);
}

function Kalkulator() {
  const [amount, setAmount] = useState(100_000);
  const [months, setMonths] = useState(12);
  const [annualRate, setAnnualRate] = useState(15);
  const [commissionPct, setCommissionPct] = useState(5);
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [repayment, setRepayment] = useState("miesieczna");
  const [balloon, setBalloon] = useState(0);

  const schedule = useMemo(() => {
    if (!amount || !months) return { rows: [] as any[], totalRata: 0, totalOds: 0, totalKap: 0 };
    const monthlyRate = annualRate / 100 / 12;
    const rows: any[] = [];
    let saldo = amount;
    const start = new Date();
    if (repayment === "miesieczna" && monthlyRate > 0) {
      const rata = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
      for (let i = 1; i <= months; i++) {
        const ods = saldo * monthlyRate;
        const kap = rata - ods;
        saldo = Math.max(0, saldo - kap);
        const d = new Date(start); d.setMonth(d.getMonth() + i);
        rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kap, ods, saldo });
      }
    } else if (repayment === "balonowa") {
      for (let i = 1; i <= months; i++) {
        const ods = saldo * monthlyRate;
        const last = i === months;
        const rata = last ? ods + amount : ods;
        saldo = last ? 0 : saldo;
        const d = new Date(start); d.setMonth(d.getMonth() + i);
        rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kap: last ? amount : 0, ods, saldo });
      }
    } else {
      const remaining = Math.max(0, amount - balloon);
      const baseRate = monthlyRate > 0 ? (remaining * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)) : remaining / months;
      for (let i = 1; i <= months; i++) {
        const ods = saldo * monthlyRate;
        const last = i === months;
        const kap = last ? saldo : Math.max(0, baseRate - ods);
        saldo = Math.max(0, saldo - kap);
        const d = new Date(start); d.setMonth(d.getMonth() + i);
        rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata: ods + kap, kap, ods, saldo });
      }
    }
    return {
      rows,
      totalRata: rows.reduce((s, r) => s + r.rata, 0),
      totalOds: rows.reduce((s, r) => s + r.ods, 0),
      totalKap: rows.reduce((s, r) => s + r.kap, 0),
    };
  }, [amount, months, annualRate, repayment, balloon]);

  const commissionPln = (amount * commissionPct) / 100;
  const monthlyFeesTotal = monthlyFee * months;
  const nonInterestTotal = commissionPln + monthlyFeesTotal;
  const maxNonInterest = maxNonInterestCosts(amount, months);
  const totalCost = schedule.totalOds + nonInterestTotal;
  const totalToRepay = schedule.totalRata + nonInterestTotal;

  const interestExceeds = annualRate > MAX_INTEREST_RATE;
  const nonInterestExceeds = nonInterestTotal > maxNonInterest;
  const anyWarning = interestExceeds || nonInterestExceeds;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Kalkulator pożyczki</h1>
        <p className="text-sm text-muted-foreground">Ustaw parametry — od razu zobaczysz harmonogram, koszty i zgodność z limitami ustawowymi.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Parametry pożyczki</CardTitle>
          <CardDescription>Suwaki działają tak samo, jak po stronie klienta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Kwota pożyczki</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-40" />
            </div>
            <Slider min={20000} max={1_000_000} step={5000} value={[Math.min(1_000_000, Math.max(20000, amount))]} onValueChange={(v) => setAmount(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
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
            <Slider min={0} max={60} step={0.5} value={[Math.min(60, Math.max(0, annualRate))]} onValueChange={(v) => setAnnualRate(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span className={interestExceeds ? "text-destructive font-medium" : ""}>
                limit ustawowy: {MAX_INTEREST_RATE.toFixed(2)}%
              </span>
              <span>60%</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Typ spłaty</Label>
            <Select value={repayment} onValueChange={setRepayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(repaymentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {repayment === "mieszana" && (
              <div className="space-y-2 pt-2">
                <Label>Balon (PLN)</Label>
                <Input type="number" value={balloon} onChange={(e) => setBalloon(Number(e.target.value) || 0)} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Koszty pozaodsetkowe</CardTitle>
          <CardDescription>Prowizja jednorazowa oraz opłaty miesięczne (np. obsługa, ubezpieczenie).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Prowizja jednorazowa</Label>
              <div className="flex items-center gap-2">
                <Input type="number" step="0.5" value={commissionPct} onChange={(e) => setCommissionPct(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm">% ({formatPLN(commissionPln)})</span>
              </div>
            </div>
            <Slider min={0} max={30} step={0.5} value={[Math.min(30, Math.max(0, commissionPct))]} onValueChange={(v) => setCommissionPct(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>0%</span><span>30%</span></div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Opłata miesięczna</Label>
              <Input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(Number(e.target.value) || 0)} className="w-40" />
            </div>
            <Slider min={0} max={2000} step={25} value={[Math.min(2000, Math.max(0, monthlyFee))]} onValueChange={(v) => setMonthlyFee(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>0 zł</span><span>2 000 zł</span></div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span>Prowizja</span><b className="tabular-nums">{formatPLN(commissionPln)}</b></div>
            <div className="flex justify-between"><span>Opłaty miesięczne razem ({months} × {formatPLN(monthlyFee)})</span><b className="tabular-nums">{formatPLN(monthlyFeesTotal)}</b></div>
            <div className="flex justify-between border-t pt-2"><span>Suma kosztów pozaodsetkowych</span><b className="tabular-nums">{formatPLN(nonInterestTotal)}</b></div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Limit ustawowy MPKK (art. 36a UoKK)</span>
              <span className={nonInterestExceeds ? "text-destructive font-medium" : ""}>{formatPLN(maxNonInterest)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {anyWarning ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Przekraczasz ustawowe limity</AlertTitle>
          <AlertDescription className="space-y-1 pt-1">
            {interestExceeds && (
              <div>
                Oprocentowanie <b>{annualRate.toFixed(2)}%</b> przekracza maksymalne odsetki ustawowe (<b>{MAX_INTEREST_RATE.toFixed(2)}%</b> = 2× stopa ref. NBP + 8 p.p., art. 359 §2¹ KC). Nadwyżka nie będzie egzekwowalna.
              </div>
            )}
            {nonInterestExceeds && (
              <div>
                Koszty pozaodsetkowe <b>{formatPLN(nonInterestTotal)}</b> przekraczają limit MPKK <b>{formatPLN(maxNonInterest)}</b> (art. 36a UoKK — dotyczy kredytu konsumenckiego).
              </div>
            )}
          </AlertDescription>
        </Alert>
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
          <div className="flex justify-between"><span>Kapitał</span><b className="tabular-nums">{formatPLN(amount)}</b></div>
          <div className="flex justify-between"><span>Odsetki razem</span><b className="tabular-nums">{formatPLN(schedule.totalOds)}</b></div>
          <div className="flex justify-between"><span>Koszty pozaodsetkowe razem</span><b className="tabular-nums">{formatPLN(nonInterestTotal)}</b></div>
          <div className="flex justify-between"><span>Całkowity koszt pożyczki</span><b className="tabular-nums">{formatPLN(totalCost)}</b></div>
          <div className="flex justify-between md:col-span-2 border-t pt-2"><span>Łączna kwota do spłaty</span><b className="tabular-nums">{formatPLN(totalToRepay)}</b></div>
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
