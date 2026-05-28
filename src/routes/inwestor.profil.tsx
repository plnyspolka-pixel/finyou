import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { investorTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/profil")({
  component: InwestorProfil,
});

function InwestorProfil() {
  const { user } = useAuth();
  const [inv, setInv] = useState<any | null>(null);
  const [f, setF] = useState({
    first_name: "", last_name: "", company_name: "", nip: "",
    phone: "", email: "", investor_type: "indywidualny",
    address: "", street: "", postal_code: "", city: "", country: "Polska",
    bank_account: "",
  });

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase.from("investors").select("*").eq("user_id", user.id).maybeSingle();
    setInv(data);
    if (data) setF({
      first_name: data.first_name ?? "", last_name: data.last_name ?? "",
      company_name: data.company_name ?? "", nip: data.nip ?? "",
      phone: data.phone ?? "", email: data.email ?? user.email ?? "",
      investor_type: data.investor_type ?? "indywidualny",
      address: data.address ?? "",
      street: data.street ?? "", postal_code: data.postal_code ?? "",
      city: data.city ?? "", country: data.country ?? "Polska",
      bank_account: data.bank_account ?? "",
    });
    else setF((x) => ({ ...x, email: user.email ?? "" }));
  })(); }, [user]);

  const save = async () => {
    if (!user) return;
    if (f.nip && !/^\d{10}$/.test(f.nip.replace(/\D/g, ""))) { toast.error("NIP musi mieć 10 cyfr"); return; }
    const payload = {
      first_name: f.first_name.trim() || null, last_name: f.last_name.trim() || null,
      company_name: f.company_name.trim() || null, nip: f.nip.replace(/\D/g, "") || null,
      phone: f.phone.trim() || null, email: f.email.trim() || null,
      investor_type: f.investor_type as any,
      address: f.address.trim() || null,
      street: f.street.trim() || null,
      postal_code: f.postal_code.trim() || null,
      city: f.city.trim() || null,
      country: f.country.trim() || null,
      bank_account: f.bank_account.replace(/\s+/g, "") || null,
    };
    const { error } = inv
      ? await supabase.from("investors").update(payload).eq("id", inv.id)
      : await supabase.from("investors").insert({ ...payload, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Profil inwestora</h1>

      <Card>
        <CardHeader><CardTitle>Dane osobowe / firmowe</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>Typ</Label>
            <Select value={f.investor_type} onValueChange={(v) => setF({ ...f, investor_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(investorTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Firma</Label><Input maxLength={200} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
          <div><Label>Imię</Label><Input maxLength={100} value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
          <div><Label>Nazwisko</Label><Input maxLength={100} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>NIP</Label><Input maxLength={13} value={f.nip} onChange={(e) => setF({ ...f, nip: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dane kontaktowe</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>E-mail</Label><Input type="email" maxLength={255} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Telefon</Label><Input maxLength={32} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Adres</Label><Input maxLength={255} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="ul., nr, kod pocztowy, miasto" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rachunek bankowy</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div><Label>Numer konta (IBAN)</Label><Input maxLength={40} value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} placeholder="PL00 0000 0000 0000 0000 0000 0000" /></div>
        </CardContent>
      </Card>

      <Button onClick={save}>Zapisz</Button>
    </div>
  );
}
