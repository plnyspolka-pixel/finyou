import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { formatDate, loanStatusLabels } from "@/lib/labels";
import { GoogleSheetsLeadsPanel } from "@/components/GoogleSheetsLeadsPanel";

export const Route = createFileRoute("/admin/leady")({
  component: LeadyPage,
});

type Row = {
  id: string;
  created_at: string;
  status: string;
  source: string | null;
  client: { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
};

function LeadyPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", source: "manual" });

  const load = async () => {
    const { data } = await supabase
      .from("loan_applications")
      .select("id, created_at, status, source, client:clients(first_name,last_name,phone,email)")
      .eq("status", "nowy_lead")
      .order("created_at", { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const addLead = async () => {
    if (!form.first_name || !form.last_name) { toast.error("Imię i nazwisko są wymagane"); return; }
    const { data: client, error: ce } = await supabase.from("clients").insert({
      first_name: form.first_name, last_name: form.last_name,
      phone: form.phone || null, email: form.email || null, source: form.source,
    }).select("id").single();
    if (ce || !client) { toast.error("Błąd", { description: ce?.message }); return; }
    const { error: le } = await supabase.from("loan_applications").insert({
      client_id: client.id, status: "nowy_lead", source: form.source,
    });
    if (le) { toast.error("Błąd", { description: le.message }); return; }
    toast.success("Dodano lead");
    setOpen(false); setForm({ first_name: "", last_name: "", phone: "", email: "", source: "manual" });
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leady</h1>
          <p className="text-sm text-muted-foreground">Nowe leady oczekujące na obsługę.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Dodaj lead</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nowy lead</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Imię *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><Label>Nazwisko *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="col-span-2"><Label>Źródło</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={addLead}>Zapisz</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <GoogleSheetsLeadsPanel onSynced={() => void load()} />
      <Card>
        <CardHeader><CardTitle>Lista ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Klient</TableHead><TableHead>Kontakt</TableHead><TableHead>Źródło</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Brak leadów</TableCell></TableRow> :
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.client ? `${r.client.first_name} ${r.client.last_name}` : "—"}</TableCell>
                    <TableCell><div>{r.client?.phone ?? "—"}</div><div className="text-xs text-muted-foreground">{r.client?.email ?? "—"}</div></TableCell>
                    <TableCell>{r.source ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{loanStatusLabels[r.status]}</Badge></TableCell>
                    <TableCell>{formatDate(r.created_at)}</TableCell>
                    <TableCell><Link to="/admin/wnioski/$id" params={{ id: r.id }} className="text-sm text-primary hover:underline">Otwórz</Link></TableCell>
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
