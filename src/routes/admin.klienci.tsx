import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/labels";
import { LogIn, Plus, FileUp, Trash2, Download } from "lucide-react";
import { loginAsUser } from "@/lib/impersonate-client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/klienci")({
  component: KlienciPage,
});

const emptyForm = {
  first_name: "", last_name: "", company_name: "",
  email: "", phone: "",
  pesel: "", nip: "", regon: "",
  street: "", postal_code: "", city: "", country: "Polska",
  address: "", bank_account: "",
  land_register_number: "", notes: "",
  source: "wewnetrzny", consent_rodo: true,
};

function KlienciPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState({ ...emptyForm });
  const [docsFor, setDocsFor] = useState<any | null>(null);

  const load = async () => {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setEditingId(null); setF({ ...emptyForm }); setOpen(true); };
  const openEdit = (r: any) => {
    setEditingId(r.id);
    setF({
      first_name: r.first_name ?? "", last_name: r.last_name ?? "", company_name: r.company_name ?? "",
      email: r.email ?? "", phone: r.phone ?? "",
      pesel: r.pesel ?? "", nip: r.nip ?? "", regon: r.regon ?? "",
      street: r.street ?? "", postal_code: r.postal_code ?? "", city: r.city ?? "", country: r.country ?? "Polska",
      address: r.address ?? "", bank_account: r.bank_account ?? "",
      land_register_number: r.land_register_number ?? "", notes: r.notes ?? "",
      source: r.source ?? "wewnetrzny", consent_rodo: !!r.consent_rodo,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!f.first_name.trim() || !f.last_name.trim()) { toast.error("Imię i nazwisko są wymagane"); return; }
    if (f.pesel && !/^\d{11}$/.test(f.pesel)) { toast.error("PESEL musi mieć 11 cyfr"); return; }
    if (f.nip && !/^\d{10}$/.test(f.nip)) { toast.error("NIP musi mieć 10 cyfr"); return; }
    const payload = {
      first_name: f.first_name.trim(),
      last_name: f.last_name.trim(),
      company_name: f.company_name.trim() || null,
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      pesel: f.pesel.trim() || null,
      nip: f.nip.trim() || null,
      regon: f.regon.trim() || null,
      street: f.street.trim() || null,
      postal_code: f.postal_code.trim() || null,
      city: f.city.trim() || null,
      country: f.country.trim() || null,
      address: f.address.trim() || null,
      bank_account: f.bank_account.replace(/\s+/g, "") || null,
      land_register_number: f.land_register_number.trim() || null,
      notes: f.notes.trim() || null,
      source: f.source || null,
      consent_rodo: f.consent_rodo,
    };
    const { error } = editingId
      ? await supabase.from("clients").update(payload).eq("id", editingId)
      : await supabase.from("clients").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Zaktualizowano" : "Dodano klienta");
    setOpen(false);
    setF({ ...emptyForm });
    void load();
  };

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || [r.first_name, r.last_name, r.phone, r.email, r.nip, r.company_name].some((v) => (v ?? "").toLowerCase().includes(t));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Klienci</h1><p className="text-sm text-muted-foreground">Baza klientów ({rows.length}).</p></div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Dodaj klienta</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edytuj klienta" : "Nowy klient wewnętrzny"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold mb-2">Dane osobowe / firmowe</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Imię *</Label><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
                <div><Label>Nazwisko *</Label><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
                <div className="col-span-2"><Label>Nazwa firmy</Label><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
                <div><Label>PESEL</Label><Input maxLength={11} value={f.pesel} onChange={(e) => setF({ ...f, pesel: e.target.value.replace(/\D/g, "") })} /></div>
                <div><Label>NIP</Label><Input maxLength={10} value={f.nip} onChange={(e) => setF({ ...f, nip: e.target.value.replace(/\D/g, "") })} /></div>
                <div><Label>REGON</Label><Input maxLength={14} value={f.regon} onChange={(e) => setF({ ...f, regon: e.target.value.replace(/\D/g, "") })} /></div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Kontakt</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
                <div><Label>Telefon</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Adres</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Ulica i numer</Label><Input value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} /></div>
                <div><Label>Kod pocztowy</Label><Input maxLength={10} value={f.postal_code} onChange={(e) => setF({ ...f, postal_code: e.target.value })} /></div>
                <div><Label>Miasto</Label><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
                <div><Label>Kraj</Label><Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></div>
                <div className="col-span-2"><Label>Adres dodatkowy / korespondencyjny</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Rachunek i nieruchomość</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Numer konta (IBAN)</Label><Input value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} /></div>
                <div className="col-span-2"><Label>Numer KW</Label><Input value={f.land_register_number} onChange={(e) => setF({ ...f, land_register_number: e.target.value })} placeholder="np. WA1M/00012345/6" /></div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Dodatkowe</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Źródło</Label><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></div>
                <div className="flex items-center gap-2 mt-6">
                  <Checkbox id="rodo" checked={f.consent_rodo} onCheckedChange={(v) => setF({ ...f, consent_rodo: !!v })} />
                  <Label htmlFor="rodo">Zgoda RODO</Label>
                </div>
                <div className="col-span-2"><Label>Notatki</Label><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
              </div>
            </section>
          </div>
          <DialogFooter><Button onClick={save}>{editingId ? "Zapisz zmiany" : "Zapisz"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><Input placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" /><CardTitle className="text-sm text-muted-foreground mt-2">Wyniki: {filtered.length}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Klient</TableHead><TableHead>NIP</TableHead><TableHead>Telefon</TableHead><TableHead>KW</TableHead><TableHead>Dodano</TableHead><TableHead className="text-right">Akcje</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                <TableCell className="font-medium">{r.first_name} {r.last_name}{r.company_name ? <span className="text-muted-foreground"> · {r.company_name}</span> : null}</TableCell>
                <TableCell>{r.nip ?? "—"}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell>
                <TableCell>{r.land_register_number ?? "—"}</TableCell>
                <TableCell>{formatDate(r.created_at)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => setDocsFor(r)}><FileUp className="mr-1 h-3 w-3" />Dokumenty</Button>
                  <Button size="sm" variant="outline" className="ml-2" disabled={!r.email} onClick={() => void loginAsUser(r.email)}>
                    <LogIn className="mr-1 h-3 w-3" /> Zaloguj jako
                  </Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></div>
        </CardContent>
      </Card>

      <ClientDocsDialog client={docsFor} onClose={() => setDocsFor(null)} />
    </div>
  );
}

function ClientDocsDialog({ client, onClose }: { client: any | null; onClose: () => void }) {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folder = client ? `clients/${client.id}` : "";

  const list = async () => {
    if (!client) return;
    const { data } = await supabase.storage.from("documents").list(folder, { sortBy: { column: "created_at", order: "desc" } });
    setFiles(data ?? []);
  };
  useEffect(() => { if (client) void list(); /* eslint-disable-next-line */ }, [client?.id]);

  const upload = async (file: File) => {
    if (!client) return;
    setUploading(true);
    const path = `${folder}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file);
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Wgrano");
    void list();
  };

  const remove = async (name: string) => {
    const { error } = await supabase.storage.from("documents").remove([`${folder}/${name}`]);
    if (error) { toast.error(error.message); return; }
    void list();
  };

  const download = async (name: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(`${folder}/${name}`, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Dokumenty — {client?.first_name} {client?.last_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            <Button disabled={uploading} onClick={() => inputRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />{uploading ? "Wgrywanie…" : "Dodaj plik"}</Button>
            <span className="text-xs text-muted-foreground">Bucket: documents/{folder}</span>
          </div>
          <div className="border rounded-md divide-y">
            {files.length === 0 && <div className="p-4 text-sm text-muted-foreground">Brak dokumentów.</div>}
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between p-2 text-sm">
                <span className="truncate">{f.name}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void download(f.name)}><Download className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(f.name)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
