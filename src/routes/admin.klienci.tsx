import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/labels";
import { LogIn, Plus } from "lucide-react";
import { loginAsUser } from "@/lib/impersonate-client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/klienci")({
  component: KlienciPage,
});

function KlienciPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    pesel: "", address: "", bank_account: "",
    source: "wewnetrzny", consent_rodo: true,
  });

  const load = async () => {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!f.first_name.trim() || !f.last_name.trim()) { toast.error("Imię i nazwisko są wymagane"); return; }
    if (f.pesel && !/^\d{11}$/.test(f.pesel)) { toast.error("PESEL musi mieć 11 cyfr"); return; }
    const { error } = await supabase.from("clients").insert({
      first_name: f.first_name.trim(),
      last_name: f.last_name.trim(),
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      pesel: f.pesel.trim() || null,
      address: f.address.trim() || null,
      bank_account: f.bank_account.replace(/\s+/g, "") || null,
      source: f.source || null,
      consent_rodo: f.consent_rodo,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Dodano klienta");
    setOpen(false);
    setF({ first_name: "", last_name: "", email: "", phone: "", pesel: "", address: "", bank_account: "", source: "wewnetrzny", consent_rodo: true });
    void load();
  };

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || [r.first_name, r.last_name, r.phone, r.email].some((v) => (v ?? "").toLowerCase().includes(t));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Klienci</h1><p className="text-sm text-muted-foreground">Baza klientów ({rows.length}).</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Dodaj klienta</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nowy klient wewnętrzny</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Imię *</Label><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
              <div><Label>Nazwisko *</Label><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div><Label>Telefon</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              <div><Label>PESEL</Label><Input maxLength={11} value={f.pesel} onChange={(e) => setF({ ...f, pesel: e.target.value.replace(/\D/g, "") })} /></div>
              <div><Label>Numer konta</Label><Input value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} /></div>
              <div className="col-span-2"><Label>Adres</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
              <div><Label>Źródło</Label><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></div>
              <div className="flex items-center gap-2 mt-6">
                <Checkbox id="rodo" checked={f.consent_rodo} onCheckedChange={(v) => setF({ ...f, consent_rodo: !!v })} />
                <Label htmlFor="rodo">Zgoda RODO</Label>
              </div>
            </div>
            <DialogFooter><Button onClick={add}>Zapisz</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><Input placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" /><CardTitle className="text-sm text-muted-foreground mt-2">Wyniki: {filtered.length}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Klient</TableHead><TableHead>Telefon</TableHead><TableHead>E-mail</TableHead><TableHead>Źródło</TableHead><TableHead>RODO</TableHead><TableHead>Dodano</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell><TableCell>{r.email ?? "—"}</TableCell>
                <TableCell>{r.source ?? "—"}</TableCell><TableCell>{r.consent_rodo ? "✓" : "✗"}</TableCell>
                <TableCell>{formatDate(r.created_at)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={!r.email} onClick={() => void loginAsUser(r.email)}>
                    <LogIn className="mr-1 h-3 w-3" /> Zaloguj jako
                  </Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></div>
        </CardContent>
      </Card>
    </div>
  );
}
