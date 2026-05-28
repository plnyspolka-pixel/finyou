import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, Download } from "lucide-react";
import { gusCompanyLookup } from "@/lib/gus-bir.functions";

export const Route = createFileRoute("/inwestor/profil")({
  component: InwestorProfil,
});

type EntityType = "osoba_fizyczna" | "firma";

function InwestorProfil() {
  const { user } = useAuth();
  const lookupGus = useServerFn(gusCompanyLookup);
  const [inv, setInv] = useState<any | null>(null);
  const [fetching, setFetching] = useState(false);
  const [f, setF] = useState({
    entity_type: "osoba_fizyczna" as EntityType,
    // osoba fizyczna
    first_name: "", last_name: "", pesel: "",
    // firma
    company_name: "", nip: "", krs: "", regon: "", legal_form: "",
    // reprezentant (firma)
    representative_first_name: "", representative_last_name: "", representative_role: "",
    // kontakt
    phone: "", email: "",
    // adres
    street: "", postal_code: "", city: "", country: "Polska",
    // bank
    bank_account: "",
  });

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase.from("investors").select("*").eq("user_id", user.id).maybeSingle();
    setInv(data);
    if (data) setF({
      entity_type: (data.entity_type ?? "osoba_fizyczna") as EntityType,
      first_name: data.first_name ?? "", last_name: data.last_name ?? "",
      pesel: data.pesel ?? "",
      company_name: data.company_name ?? "", nip: data.nip ?? "",
      krs: data.krs ?? "", regon: data.regon ?? "", legal_form: data.legal_form ?? "",
      representative_first_name: data.representative_first_name ?? "",
      representative_last_name: data.representative_last_name ?? "",
      representative_role: data.representative_role ?? "",
      phone: data.phone ?? "", email: data.email ?? user.email ?? "",
      street: data.street ?? "", postal_code: data.postal_code ?? "",
      city: data.city ?? "", country: data.country ?? "Polska",
      bank_account: data.bank_account ?? "",
    });
    else setF((x) => ({ ...x, email: user.email ?? "" }));
  })(); }, [user]);

  const autoFill = async () => {
    const nipDigits = f.nip.replace(/\D/g, "");
    if (nipDigits.length !== 10) { toast.error("NIP musi mieć 10 cyfr"); return; }
    setFetching(true);
    try {
      const res: any = await fetchByNip({ data: { nip: nipDigits, knownKrs: f.krs || undefined } });
      if (!res?.ok) { toast.error(res?.message ?? "Nie znaleziono danych"); return; }
      const d = res.data ?? {};
      // Parse address from registeredAddress or businessAddress if present
      const addr: string = d.registeredAddress ?? d.businessAddress ?? "";
      let street = "", postal = "", city = "";
      // Try simple split: "ul. X 1, 00-000 Miasto"
      const m = addr.match(/^(.*?),\s*(\d{2}-\d{3})\s+(.+)$/);
      if (m) { street = m[1].trim(); postal = m[2]; city = m[3].trim(); }
      setF((x) => ({
        ...x,
        company_name: d.companyName ?? x.company_name,
        nip: d.nip ?? nipDigits,
        krs: d.krs ?? x.krs,
        regon: d.regon ?? x.regon,
        legal_form: d.legalForm ?? x.legal_form,
        first_name: d.firstName ?? x.first_name,
        last_name: d.lastName ?? x.last_name,
        pesel: d.pesel ?? x.pesel,
        phone: d.phone ?? x.phone,
        email: d.email ?? x.email,
        street: street || x.street,
        postal_code: postal || x.postal_code,
        city: city || x.city,
        representative_role: d.representationDescription ?? x.representative_role,
      }));
      toast.success(`Pobrano dane z ${res.source}`);
      if (res.warnings?.length) res.warnings.forEach((w: string) => toast.warning(w));
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania");
    } finally { setFetching(false); }
  };

  const save = async () => {
    if (!user) return;
    if (f.entity_type === "firma" && f.nip && !/^\d{10}$/.test(f.nip.replace(/\D/g, ""))) {
      toast.error("NIP musi mieć 10 cyfr"); return;
    }
    if (f.entity_type === "osoba_fizyczna" && f.pesel && !/^\d{11}$/.test(f.pesel.replace(/\D/g, ""))) {
      toast.error("PESEL musi mieć 11 cyfr"); return;
    }
    // Map entity_type → legacy investor_type (NOT NULL column)
    const investorType = f.entity_type === "firma" ? "instytucjonalny" : "indywidualny";
    const payload: any = {
      entity_type: f.entity_type,
      investor_type: investorType,
      first_name: f.first_name.trim() || null,
      last_name: f.last_name.trim() || null,
      pesel: f.entity_type === "osoba_fizyczna" ? (f.pesel.replace(/\D/g, "") || null) : null,
      company_name: f.entity_type === "firma" ? (f.company_name.trim() || null) : null,
      nip: f.entity_type === "firma" ? (f.nip.replace(/\D/g, "") || null) : null,
      krs: f.entity_type === "firma" ? (f.krs.trim() || null) : null,
      regon: f.entity_type === "firma" ? (f.regon.trim() || null) : null,
      legal_form: f.entity_type === "firma" ? (f.legal_form.trim() || null) : null,
      representative_first_name: f.entity_type === "firma" ? (f.representative_first_name.trim() || null) : null,
      representative_last_name: f.entity_type === "firma" ? (f.representative_last_name.trim() || null) : null,
      representative_role: f.entity_type === "firma" ? (f.representative_role.trim() || null) : null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
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

  const isFirma = f.entity_type === "firma";

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Profil inwestora</h1>

      <Card>
        <CardHeader><CardTitle>Status prawny</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup
            value={f.entity_type}
            onValueChange={(v) => setF({ ...f, entity_type: v as EntityType })}
            className="flex gap-6"
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="osoba_fizyczna" id="ef-of" />
              <span>Osoba fizyczna</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="firma" id="ef-f" />
              <span>Firma / spółka</span>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {isFirma && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dane firmy</span>
              <Button size="sm" variant="outline" onClick={autoFill} disabled={fetching}>
                {fetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Pobierz z NIP / KRS
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>NIP</Label><Input maxLength={13} value={f.nip} onChange={(e) => setF({ ...f, nip: e.target.value })} placeholder="10 cyfr" /></div>
            <div><Label>KRS</Label><Input maxLength={20} value={f.krs} onChange={(e) => setF({ ...f, krs: e.target.value })} placeholder="np. 0000123456" /></div>
            <div className="md:col-span-2"><Label>Nazwa firmy</Label><Input maxLength={200} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
            <div><Label>REGON</Label><Input maxLength={20} value={f.regon} onChange={(e) => setF({ ...f, regon: e.target.value })} /></div>
            <div><Label>Forma prawna</Label><Input maxLength={100} value={f.legal_form} onChange={(e) => setF({ ...f, legal_form: e.target.value })} placeholder="np. Sp. z o.o." /></div>
          </CardContent>
        </Card>
      )}

      {isFirma ? (
        <Card>
          <CardHeader><CardTitle>Reprezentacja</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>Imię reprezentanta</Label><Input maxLength={100} value={f.representative_first_name} onChange={(e) => setF({ ...f, representative_first_name: e.target.value })} /></div>
            <div><Label>Nazwisko reprezentanta</Label><Input maxLength={100} value={f.representative_last_name} onChange={(e) => setF({ ...f, representative_last_name: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Funkcja / sposób reprezentacji</Label><Input maxLength={500} value={f.representative_role} onChange={(e) => setF({ ...f, representative_role: e.target.value })} placeholder="np. Prezes Zarządu — reprezentacja jednoosobowa" /></div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Dane osobowe</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>Imię</Label><Input maxLength={100} value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
            <div><Label>Nazwisko</Label><Input maxLength={100} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>PESEL</Label><Input maxLength={11} value={f.pesel} onChange={(e) => setF({ ...f, pesel: e.target.value })} placeholder="11 cyfr" /></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Dane kontaktowe</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>E-mail</Label><Input type="email" maxLength={255} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Telefon</Label><Input maxLength={32} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{isFirma ? "Adres siedziby" : "Adres"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Ulica i numer</Label><Input maxLength={255} value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} placeholder="np. Marszałkowska 1/2" /></div>
          <div><Label>Kod pocztowy</Label><Input maxLength={10} value={f.postal_code} onChange={(e) => setF({ ...f, postal_code: e.target.value })} placeholder="00-000" /></div>
          <div><Label>Miasto</Label><Input maxLength={100} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Kraj</Label><Input maxLength={100} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></div>
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
