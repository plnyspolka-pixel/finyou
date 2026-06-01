import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/klient/profil")({
  component: KlientProfil,
});

function KlientProfil() {
  const { user } = useAuth();
  const [row, setRow] = useState<any | null>(null);
  const [f, setF] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    pesel: "", address: "", bank_account: "",
    company_name: "", nip: "", regon: "", krs: "",
  });

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
    setRow(data);
    if (data) setF({
      first_name: data.first_name ?? "", last_name: data.last_name ?? "",
      email: data.email ?? user.email ?? "", phone: data.phone ?? "",
      pesel: data.pesel ?? "", address: data.address ?? "", bank_account: data.bank_account ?? "",
      company_name: data.company_name ?? "", nip: data.nip ?? "", regon: data.regon ?? "", krs: (data as any).krs ?? "",
    });
    else setF((x) => ({ ...x, email: user.email ?? "" }));
  })(); }, [user]);

  const save = async () => {
    if (!user) return;
    if (f.pesel && !/^\d{11}$/.test(f.pesel)) { toast.error("PESEL musi mieć 11 cyfr"); return; }
    if (f.nip && !/^\d{10}$/.test(f.nip.replace(/[\s-]/g, ""))) { toast.error("NIP musi mieć 10 cyfr"); return; }
    if (f.regon && !/^\d{9}$|^\d{14}$/.test(f.regon)) { toast.error("REGON musi mieć 9 lub 14 cyfr"); return; }
    if (f.krs && !/^\d{10}$/.test(f.krs)) { toast.error("KRS musi mieć 10 cyfr"); return; }
    const payload = {
      first_name: f.first_name.trim() || "",
      last_name: f.last_name.trim() || "",
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      pesel: f.pesel.trim() || null,
      address: f.address.trim() || null,
      bank_account: f.bank_account.replace(/\s+/g, "") || null,
      company_name: f.company_name.trim() || null,
      nip: f.nip.replace(/[\s-]/g, "") || null,
      regon: f.regon.trim() || null,
      krs: f.krs.trim() || null,
    };
    const { error } = row
      ? await supabase.from("clients").update(payload).eq("id", row.id)
      : await supabase.from("clients").insert({ ...payload, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Mój profil</h1>

      <Card>
        <CardHeader><CardTitle>Dane osobowe</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>Imię</Label><Input maxLength={100} value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
          <div><Label>Nazwisko</Label><Input maxLength={100} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>PESEL</Label><Input maxLength={11} value={f.pesel} onChange={(e) => setF({ ...f, pesel: e.target.value.replace(/\D/g, "") })} /></div>
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
        <CardHeader><CardTitle>Dane firmy (opcjonalnie)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Nazwa firmy</Label><Input maxLength={255} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
          <div><Label>NIP</Label><Input maxLength={13} value={f.nip} onChange={(e) => setF({ ...f, nip: e.target.value })} placeholder="np. 1234567890" /></div>
          <div><Label>REGON</Label><Input maxLength={14} value={f.regon} onChange={(e) => setF({ ...f, regon: e.target.value.replace(/\D/g, "") })} /></div>
          <div className="md:col-span-2"><Label>KRS</Label><Input maxLength={10} value={f.krs} onChange={(e) => setF({ ...f, krs: e.target.value.replace(/\D/g, "") })} placeholder="10 cyfr (jeśli spółka)" /></div>
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
