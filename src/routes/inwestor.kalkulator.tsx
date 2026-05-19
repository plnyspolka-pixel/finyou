import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPLN, repaymentTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: Kalkulator,
});

function Kalkulator() {
  const [f, setF] = useState({ amount: "100000", months: "12", yearly: "12", repayment: "miesieczna", balloon: "0" });

  const schedule = useMemo(() => {
    const amount = Number(f.amount) || 0;
    const months = Number(f.months) || 0;
    const yearly = Number(f.yearly) || 0;
    const balloon = Number(f.balloon) || 0;
    if (!amount || !months) return { rows: [] as any[], total: 0 };
    const monthlyRate = yearly / 100 / 12;
    const rows: any[] = []; let saldo = amount; const start = new Date();
    if (f.repayment === "miesieczna" && monthlyRate > 0) {
      const rata = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
      for (let i = 1; i <= months; i++) {
        const ods = saldo * monthlyRate; const kap = rata - ods; saldo = Math.max(0, saldo - kap);
        const d = new Date(start); d.setMonth(d.getMonth() + i);
        rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kap, ods, saldo });
      }
    } else if (f.repayment === "balonowa") {
      for (let i = 1; i <= months; i++) {
        const ods = saldo * monthlyRate; const last = i === months;
        const rata = last ? ods + amount : ods; saldo = last ? 0 : saldo;
        const d = new Date(start); d.setMonth(d.getMonth() + i);
        rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kap: last ? amount : 0, ods, saldo });
      }
    } else {
      const remaining = Math.max(0, amount - balloon);
      const baseRate = monthlyRate > 0 ? (remaining * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)) : remaining / months;
      for (let i = 1; i <= months; i++) {
        const ods = saldo * monthlyRate; const last = i === months;
        const kap = last ? saldo : Math.max(0, baseRate - ods); saldo = Math.max(0, saldo - kap);
        const d = new Date(start); d.setMonth(d.getMonth() + i);
        rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata: ods + kap, kap, ods, saldo });
      }
    }
    return { rows, total: rows.reduce((s, r) => s + r.rata, 0) };
  }, [f]);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Kalkulator pożyczki</h1>
      <Card><CardHeader><CardTitle>Parametry</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div><Label>Kwota</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div><Label>Okres (mies.)</Label><Input type="number" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></div>
          <div><Label>Zysk roczny (%)</Label><Input type="number" step="0.1" value={f.yearly} onChange={(e) => setF({ ...f, yearly: e.target.value })} /></div>
          <div><Label>Typ spłaty</Label>
            <Select value={f.repayment} onValueChange={(v) => setF({ ...f, repayment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(repaymentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.repayment === "mieszana" && <div><Label>Balon</Label><Input type="number" value={f.balloon} onChange={(e) => setF({ ...f, balloon: e.target.value })} /></div>}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Harmonogram · suma {formatPLN(schedule.total)}</CardTitle></CardHeader>
        <CardContent><div className="max-h-96 overflow-y-auto"><Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Termin</TableHead><TableHead>Rata</TableHead><TableHead>Kapitał</TableHead><TableHead>Odsetki</TableHead><TableHead>Saldo</TableHead></TableRow></TableHeader>
          <TableBody>{schedule.rows.map((r) => (
            <TableRow key={r.idx}><TableCell>{r.idx}</TableCell><TableCell>{r.date}</TableCell><TableCell>{formatPLN(r.rata)}</TableCell><TableCell>{formatPLN(r.kap)}</TableCell><TableCell>{formatPLN(r.ods)}</TableCell><TableCell>{formatPLN(r.saldo)}</TableCell></TableRow>
          ))}</TableBody>
        </Table></div></CardContent>
      </Card>
    </div>
  );
}
