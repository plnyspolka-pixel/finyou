import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { formatPLN, propertyTypeLabels, repaymentTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/wniosek/$id")({
  component: InwestorWniosek,
});

function calcSchedule(amount: number, months: number, yearly: number, repayment: "miesieczna" | "balonowa" | "mieszana", balloon: number) {
  const monthlyRate = yearly / 100 / 12;
  const rows: { idx: number; date: string; rata: number; kapital: number; odsetki: number; saldo: number }[] = [];
  let saldo = amount;
  const start = new Date();
  if (repayment === "miesieczna" && monthlyRate > 0) {
    const rata = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
    for (let i = 1; i <= months; i++) {
      const ods = saldo * monthlyRate; const kap = rata - ods; saldo = Math.max(0, saldo - kap);
      const d = new Date(start); d.setMonth(d.getMonth() + i);
      rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kapital: kap, odsetki: ods, saldo });
    }
  } else if (repayment === "balonowa") {
    for (let i = 1; i <= months; i++) {
      const ods = saldo * monthlyRate;
      const last = i === months;
      const rata = last ? ods + amount : ods;
      saldo = last ? 0 : saldo;
      const d = new Date(start); d.setMonth(d.getMonth() + i);
      rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kapital: last ? amount : 0, odsetki: ods, saldo });
    }
  } else {
    const remaining = Math.max(0, amount - balloon);
    const baseRate = monthlyRate > 0 ? (remaining * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)) : remaining / months;
    for (let i = 1; i <= months; i++) {
      const ods = saldo * monthlyRate;
      const last = i === months;
      const kap = last ? saldo : Math.max(0, baseRate - ods);
      saldo = Math.max(0, saldo - kap);
      const rata = ods + kap;
      const d = new Date(start); d.setMonth(d.getMonth() + i);
      rows.push({ idx: i, date: d.toLocaleDateString("pl-PL"), rata, kapital: kap, odsetki: ods, saldo });
    }
  }
  const total = rows.reduce((s, r) => s + r.rata, 0);
  return { rows, total };
}

function InwestorWniosek() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<any | null>(null);
  const [investorId, setInvestorId] = useState<string | null>(null);
  const [f, setF] = useState({
    proposed_amount: "", period_months: "", expected_yearly_yield: "10", commission: "2",
    collection_protection: false, collection_protection_settlement: "miesieczne",
    has_balloon: false, balloon_amount: "", repayment_type: "miesieczna",
    investor_note: "",
  });

  useEffect(() => { void (async () => {
    const { data } = await supabase.from("loan_applications").select("*, properties(*)").eq("id", id).maybeSingle();
    setApp(data);
    if (data?.loan_amount) setF((x) => ({ ...x, proposed_amount: String(data.loan_amount), period_months: data.preferred_period_months?.toString() ?? "12" }));
    if (user) {
      const { data: inv } = await supabase.from("investors").select("id").eq("user_id", user.id).maybeSingle();
      if (inv) setInvestorId(inv.id);
    }
  })(); }, [id, user]);

  const schedule = useMemo(() => {
    const amount = Number(f.proposed_amount) || 0;
    const months = Number(f.period_months) || 0;
    const yearly = Number(f.expected_yearly_yield) || 0;
    const balloon = Number(f.balloon_amount) || 0;
    if (!amount || !months) return { rows: [], total: 0 };
    return calcSchedule(amount, months, yearly, f.repayment_type as any, balloon);
  }, [f]);

  const monthly = schedule.rows[0]?.rata ?? 0;

  const submit = async (status: "szkic" | "zlozona") => {
    if (!investorId) { toast.error("Brak profilu inwestora"); return; }
    const payload = {
      loan_application_id: id, investor_id: investorId, offer_status: status as any,
      proposed_amount: Number(f.proposed_amount), period_months: Number(f.period_months),
      expected_yearly_yield: Number(f.expected_yearly_yield), commission: Number(f.commission),
      collection_protection: f.collection_protection,
      collection_protection_settlement: f.collection_protection ? f.collection_protection_settlement : null,
      has_balloon: f.has_balloon, balloon_amount: f.has_balloon ? Number(f.balloon_amount) : null,
      repayment_type: f.repayment_type as any,
      estimated_monthly_payment: monthly, estimated_total_cost: schedule.total,
      schedule: schedule.rows as any,
      investor_note: f.investor_note || null,
      submitted_at: status === "zlozona" ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("investor_offers").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "zlozona" ? "Oferta złożona" : "Zapisano szkic");
    void navigate({ to: "/inwestor/oferty" });
  };

  if (!app) return <div className="text-muted-foreground">Ładowanie…</div>;
  const p = app.properties?.[0];

  return (
    <div className="space-y-6 max-w-5xl">
      <Link to="/inwestor" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Wróć</Link>
      <h1 className="text-2xl font-bold">Wniosek {formatPLN(app.loan_amount)} · {app.preferred_period_months} mies.</h1>

      {p && <Card><CardHeader><CardTitle>Nieruchomość</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {p.photos?.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {p.photos.map((src: string, i: number) => (
                <img key={i} src={src} alt="" className="aspect-[4/3] w-full object-cover rounded-md" loading="lazy" />
              ))}
            </div>
          )}
          <div className="text-sm grid gap-1 md:grid-cols-2">
            <div><span className="text-muted-foreground">Typ:</span> {propertyTypeLabels[p.property_type]}</div>
            <div><span className="text-muted-foreground">Lokalizacja:</span> {[p.city, p.voivodeship].filter(Boolean).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Powierzchnia:</span> {p.area_sqm ? `${p.area_sqm} m²` : "—"}</div>
            <div><span className="text-muted-foreground">Wartość:</span> {formatPLN(p.estimated_value)}</div>
          </div>
        </CardContent>
      </Card>}

      <Card><CardHeader><CardTitle>Kalkulator oferty</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div><Label>Kwota oferty (PLN)</Label><Input type="number" value={f.proposed_amount} onChange={(e) => setF({ ...f, proposed_amount: e.target.value })} /></div>
          <div><Label>Okres (miesiące)</Label><Input type="number" value={f.period_months} onChange={(e) => setF({ ...f, period_months: e.target.value })} /></div>
          <div><Label>Zysk roczny (%)</Label><Input type="number" step="0.1" value={f.expected_yearly_yield} onChange={(e) => setF({ ...f, expected_yearly_yield: e.target.value })} /></div>
          <div><Label>Prowizja (%)</Label><Input type="number" step="0.1" value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} /></div>
          <div><Label>Typ spłaty</Label>
            <Select value={f.repayment_type} onValueChange={(v) => setF({ ...f, repayment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(repaymentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-end gap-2 pb-2"><Checkbox checked={f.has_balloon} onCheckedChange={(v) => setF({ ...f, has_balloon: !!v })} /><span className="text-sm">Rata balonowa</span></label>
          {f.has_balloon && <div><Label>Kwota balonu (PLN)</Label><Input type="number" value={f.balloon_amount} onChange={(e) => setF({ ...f, balloon_amount: e.target.value })} /></div>}
          <label className="flex items-end gap-2 pb-2"><Checkbox checked={f.collection_protection} onCheckedChange={(v) => setF({ ...f, collection_protection: !!v })} /><span className="text-sm">Ochrona windykacyjna</span></label>
          {f.collection_protection && <div><Label>Rozliczenie ochrony</Label><Input value={f.collection_protection_settlement} onChange={(e) => setF({ ...f, collection_protection_settlement: e.target.value })} /></div>}
          <div className="md:col-span-3"><Label>Notatka dla administratora</Label><Textarea rows={2} value={f.investor_note} onChange={(e) => setF({ ...f, investor_note: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Podsumowanie i harmonogram</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3 text-sm">
            <div className="border rounded-md p-3"><div className="text-muted-foreground">Rata miesięczna</div><div className="text-lg font-bold">{formatPLN(monthly)}</div></div>
            <div className="border rounded-md p-3"><div className="text-muted-foreground">Całkowity koszt</div><div className="text-lg font-bold">{formatPLN(schedule.total)}</div></div>
            <div className="border rounded-md p-3"><div className="text-muted-foreground">Liczba rat</div><div className="text-lg font-bold">{schedule.rows.length}</div></div>
          </div>
          <div className="max-h-80 overflow-y-auto"><Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Termin</TableHead><TableHead>Rata</TableHead><TableHead>Kapitał</TableHead><TableHead>Odsetki</TableHead><TableHead>Saldo</TableHead></TableRow></TableHeader>
            <TableBody>{schedule.rows.map((r) => (
              <TableRow key={r.idx}><TableCell>{r.idx}</TableCell><TableCell>{r.date}</TableCell><TableCell>{formatPLN(r.rata)}</TableCell><TableCell>{formatPLN(r.kapital)}</TableCell><TableCell>{formatPLN(r.odsetki)}</TableCell><TableCell>{formatPLN(r.saldo)}</TableCell></TableRow>
            ))}</TableBody>
          </Table></div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => void submit("szkic")}>Zapisz jako szkic</Button>
        <Button onClick={() => void submit("zlozona")}><Send className="mr-2 h-4 w-4" />Złóż ofertę</Button>
      </div>
    </div>
  );
}
