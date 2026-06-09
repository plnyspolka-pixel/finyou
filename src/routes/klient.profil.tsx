import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Download, Loader2, Phone, MessageSquare, Mail, Lock } from "lucide-react";
import { gusCompanyLookup } from "@/lib/gus-bir.functions";
import { krsCompanyLookup } from "@/lib/krs.functions";

export const Route = createFileRoute("/klient/profil")({
  component: KlientProfil,
});

function KlientProfil() {
  const { user } = useAuth();
  const [row, setRow] = useState<any | null>(null);
  const [fetching, setFetching] = useState(false);
  const [f, setF] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    pesel: "", address: "", bank_account: "",
    company_name: "", nip: "", regon: "", krs: "",
  });
  const [prefs, setPrefs] = useState({ do_not_call: false, do_not_sms: false, do_not_email: false });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [pwd, setPwd] = useState({ next: "", confirm: "" });
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
    setRow(data);
    if (data) {
      setF({
        first_name: data.first_name ?? "", last_name: data.last_name ?? "",
        email: data.email ?? user.email ?? "", phone: data.phone ?? "",
        pesel: data.pesel ?? "", address: data.address ?? "", bank_account: data.bank_account ?? "",
        company_name: data.company_name ?? "", nip: data.nip ?? "", regon: data.regon ?? "", krs: (data as any).krs ?? "",
      });
      setPrefs({
        do_not_call: (data as any).do_not_call === true,
        do_not_sms: (data as any).do_not_sms === true,
        do_not_email: (data as any).do_not_email === true,
      });
    }
    else setF((x) => ({ ...x, email: user.email ?? "" }));
  })(); }, [user]);

  const updatePref = async (key: "do_not_call" | "do_not_sms" | "do_not_email", value: boolean) => {
    if (!row) { toast.error("Najpierw zapisz profil"); return; }
    setSavingPrefs(true);
    setPrefs((p) => ({ ...p, [key]: value }));
    const patch: any = { [key]: value };
    if (key === "do_not_call" && value) {
      patch.do_not_call_at = new Date().toISOString();
      patch.do_not_call_reason = "Wyłączone w panelu klienta";
      patch.do_not_call_source = "client_panel";
    }
    const { error } = await supabase.from("clients").update(patch).eq("id", row.id);
    setSavingPrefs(false);
    if (error) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      toast.error(error.message);
      return;
    }
    toast.success(value ? "Powiadomienia wyłączone" : "Powiadomienia włączone");
  };

  const changePassword = async () => {
    if (pwd.next.length < 8) { toast.error("Hasło musi mieć min. 8 znaków"); return; }
    if (pwd.next !== pwd.confirm) { toast.error("Hasła nie są takie same"); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.next });
    setSavingPwd(false);
    if (error) { toast.error(error.message); return; }
    setPwd({ next: "", confirm: "" });
    toast.success("Hasło zostało zmienione");
  };



  const autoFill = async () => {
    const payload: { nip?: string; regon?: string; krs?: string } = {};
    if (f.nip.replace(/\D/g, "")) payload.nip = f.nip.replace(/\D/g, "");
    else if (f.regon.replace(/\D/g, "")) payload.regon = f.regon.replace(/\D/g, "");
    else if (f.krs.replace(/\D/g, "")) payload.krs = f.krs.replace(/\D/g, "");
    else { toast.error("Wpisz NIP, REGON albo KRS"); return; }

    setFetching(true);
    const t = toast.loading("Pobieram dane firmy z GUS…");
    try {
      const res: any = await gusCompanyLookup({ data: payload });
      if (!res?.success) {
        toast.error(res?.message ?? "Nie udało się pobrać danych", { id: t });
        return;
      }
      const c = res.company;
      const street = [c.address?.street, c.address?.buildingNumber].filter(Boolean).join(" ")
        + (c.address?.apartmentNumber ? `/${c.address.apartmentNumber}` : "");
      const addr = [street, c.address?.postalCode, c.address?.city].filter(Boolean).join(", ");
      setF((x) => ({
        ...x,
        company_name: c.name || x.company_name,
        nip: c.nip || x.nip,
        regon: c.regon || x.regon,
        krs: c.krs || x.krs,
        address: addr || x.address,
        phone: c.contact?.phone || x.phone,
        email: c.contact?.email || x.email,
      }));
      const krsNumber = (c.krs || "").replace(/\D/g, "");
      if (krsNumber) {
        toast.success("Dane z GUS. Pobieram odpis KRS…", { id: t });
        try {
          const kres: any = await krsCompanyLookup({ data: { krs: krsNumber, forceRefresh: false } });
          if (kres?.success) {
            const k = kres.company;
            setF((x) => ({ ...x, company_name: k.name || x.company_name, krs: k.krs || x.krs }));
          }
        } catch { /* ignore */ }
      } else {
        toast.success("Dane firmy zostały pobrane.", { id: t });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się pobrać danych firmy.", { id: t });
    } finally { setFetching(false); }
  };

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
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Dane firmy (opcjonalnie)</span>
            <Button size="sm" variant="outline" onClick={autoFill} disabled={fetching}>
              {fetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Pobierz dane
            </Button>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Wpisz NIP, REGON albo KRS — aplikacja pobierze dane z GUS i (jeśli to spółka) odpis z KRS.</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>NIP</Label><Input maxLength={13} value={f.nip} onChange={(e) => setF({ ...f, nip: e.target.value })} placeholder="10 cyfr" /></div>
          <div><Label>KRS</Label><Input maxLength={10} value={f.krs} onChange={(e) => setF({ ...f, krs: e.target.value.replace(/\D/g, "") })} placeholder="np. 0000123456" /></div>
          <div className="md:col-span-2"><Label>Nazwa firmy</Label><Input maxLength={255} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>REGON</Label><Input maxLength={14} value={f.regon} onChange={(e) => setF({ ...f, regon: e.target.value.replace(/\D/g, "") })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rachunek bankowy</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div><Label>Numer konta (IBAN)</Label><Input maxLength={40} value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} placeholder="PL00 0000 0000 0000 0000 0000 0000" /></div>
        </CardContent>
      </Card>

      <Button onClick={save}>Zapisz</Button>

      <Card>
        <CardHeader>
          <CardTitle>Powiadomienia o wniosku</CardTitle>
          <p className="text-xs text-muted-foreground">
            Decyduj, jak mamy Ci przypominać o dokończeniu wniosku. Możesz w każdej chwili zmienić ustawienia.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <PrefRow
            icon={<Phone className="h-4 w-4" />}
            title="Połączenia telefoniczne"
            desc="Asystent głosowy nie będzie do Ciebie dzwonił."
            checked={!prefs.do_not_call}
            disabled={savingPrefs || !row}
            onChange={(on) => updatePref("do_not_call", !on)}
          />
          <PrefRow
            icon={<MessageSquare className="h-4 w-4" />}
            title="Powiadomienia SMS"
            desc="Nie wyślemy Ci przypomnień SMS o wniosku."
            checked={!prefs.do_not_sms}
            disabled={savingPrefs || !row}
            onChange={(on) => updatePref("do_not_sms", !on)}
          />
          <PrefRow
            icon={<Mail className="h-4 w-4" />}
            title="Powiadomienia e-mail"
            desc="Nie wyślemy Ci przypomnień e-mail o wniosku."
            checked={!prefs.do_not_email}
            disabled={savingPrefs || !row}
            onChange={(on) => updatePref("do_not_email", !on)}
          />
          {!row && <p className="text-xs text-muted-foreground">Zapisz najpierw dane profilu, aby zarządzać powiadomieniami.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Zmiana hasła</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Nowe hasło</Label>
            <Input type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} placeholder="min. 8 znaków" />
          </div>
          <div>
            <Label>Powtórz hasło</Label>
            <Input type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={changePassword} disabled={savingPwd || !pwd.next || !pwd.confirm}>
              {savingPwd && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Zmień hasło
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PrefRow({ icon, title, desc, checked, disabled, onChange }: {
  icon: React.ReactNode; title: string; desc: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
