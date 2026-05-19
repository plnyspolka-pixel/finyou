import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { propertyTypeLabels, contactChannelLabels } from "@/lib/labels";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Send, Loader2 } from "lucide-react";

export const Route = createFileRoute("/klient/")({
  component: KlientWniosek,
});

type ClientF = { first_name: string; last_name: string; phone: string; email: string; consent_rodo: boolean; consent_email: boolean; consent_phone: boolean; consent_sms: boolean };
type LoanF = { loan_amount: string; preferred_period_months: string; fast_decision: boolean; preferred_contact_channel: string; situation_description: string };
type PropF = { property_type: string; voivodeship: string; city: string; address: string; area_sqm: string; estimated_value: string; land_register_number: string; has_mortgage: boolean; has_co_owners: boolean; description: string };

const STEPS = ["Dane kontaktowe", "Zgody", "Wniosek", "Nieruchomość", "Szczegóły nieruchomości", "Dokumenty", "Podsumowanie"];

function KlientWniosek() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loanId, setLoanId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [returnToken, setReturnToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [client, setClient] = useState<ClientF>({ first_name: "", last_name: "", phone: "", email: "", consent_rodo: false, consent_email: false, consent_phone: false, consent_sms: false });
  const [loan, setLoan] = useState<LoanF>({ loan_amount: "", preferred_period_months: "", fast_decision: false, preferred_contact_channel: "telefon", situation_description: "" });
  const [prop, setProp] = useState<PropF>({ property_type: "mieszkanie", voivodeship: "", city: "", address: "", area_sqm: "", estimated_value: "", land_register_number: "", has_mortgage: false, has_co_owners: false, description: "" });

  // Load existing
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: c } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
      if (c) {
        setClientId(c.id);
        setClient({ first_name: c.first_name ?? "", last_name: c.last_name ?? "", phone: c.phone ?? "", email: c.email ?? user.email ?? "", consent_rodo: !!c.consent_rodo, consent_email: !!c.consent_email, consent_phone: !!c.consent_phone, consent_sms: !!c.consent_sms });
        const { data: l } = await supabase.from("loan_applications").select("*").eq("client_id", c.id).order("created_at", { ascending: false }).maybeSingle();
        if (l) {
          setLoanId(l.id); setReturnToken(l.return_link_token); setStep(l.current_form_step ?? 1);
          setLoan({ loan_amount: l.loan_amount?.toString() ?? "", preferred_period_months: l.preferred_period_months?.toString() ?? "", fast_decision: !!l.fast_decision, preferred_contact_channel: l.preferred_contact_channel ?? "telefon", situation_description: l.situation_description ?? "" });
          const { data: p } = await supabase.from("properties").select("*").eq("loan_application_id", l.id).maybeSingle();
          if (p) {
            setPropertyId(p.id);
            setProp({ property_type: p.property_type, voivodeship: p.voivodeship ?? "", city: p.city ?? "", address: p.address ?? "", area_sqm: p.area_sqm?.toString() ?? "", estimated_value: p.estimated_value?.toString() ?? "", land_register_number: p.land_register_number ?? "", has_mortgage: !!p.has_mortgage, has_co_owners: !!p.has_co_owners, description: p.description ?? "" });
          }
          const { data: ds } = await supabase.from("documents").select("*").eq("loan_application_id", l.id);
          setDocs(ds ?? []);
        }
      } else {
        setClient((c) => ({ ...c, email: user.email ?? "" }));
      }
    })();
  }, [user]);

  const ensureLoan = async (): Promise<{ cid: string; lid: string } | null> => {
    if (!user) return null;
    let cid = clientId;
    if (!cid) {
      const { data, error } = await supabase.from("clients").insert({ user_id: user.id, first_name: client.first_name || "—", last_name: client.last_name || "—", email: client.email || user.email, phone: client.phone || null, source: "panel_klienta" }).select("id").single();
      if (error || !data) { toast.error("Błąd zapisu klienta", { description: error?.message }); return null; }
      cid = data.id; setClientId(cid);
    }
    let lid = loanId;
    if (!lid) {
      const token = crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await supabase.from("loan_applications").insert({ client_id: cid, status: "w_trakcie_uzupelniania", source: "panel_klienta", current_form_step: step, return_link_token: token, return_link: `${window.location.origin}/wniosek/${token}` }).select("id, return_link_token").single();
      if (error || !data) { toast.error("Błąd zapisu wniosku", { description: error?.message }); return null; }
      lid = data.id; setLoanId(lid); setReturnToken(data.return_link_token);
    }
    return { cid, lid };
  };

  const saveStep = async (next: number) => {
    setSaving(true);
    const ids = await ensureLoan();
    if (!ids) { setSaving(false); return; }
    await supabase.from("clients").update({
      first_name: client.first_name, last_name: client.last_name, phone: client.phone, email: client.email,
      consent_rodo: client.consent_rodo, consent_email: client.consent_email, consent_phone: client.consent_phone, consent_sms: client.consent_sms,
    }).eq("id", ids.cid);
    const completeness = computeCompleteness();
    await supabase.from("loan_applications").update({
      loan_amount: loan.loan_amount ? Number(loan.loan_amount) : null,
      preferred_period_months: loan.preferred_period_months ? Number(loan.preferred_period_months) : null,
      fast_decision: loan.fast_decision, preferred_contact_channel: loan.preferred_contact_channel as any,
      situation_description: loan.situation_description, current_form_step: next, completeness_percent: completeness,
    }).eq("id", ids.lid);
    if (step >= 4 || propertyId) {
      const payload = { loan_application_id: ids.lid, property_type: prop.property_type as any, voivodeship: prop.voivodeship || null, city: prop.city || null, address: prop.address || null, area_sqm: prop.area_sqm ? Number(prop.area_sqm) : null, estimated_value: prop.estimated_value ? Number(prop.estimated_value) : null, land_register_number: prop.land_register_number || null, has_mortgage: prop.has_mortgage, has_co_owners: prop.has_co_owners, description: prop.description || null };
      if (propertyId) await supabase.from("properties").update(payload).eq("id", propertyId);
      else {
        const { data } = await supabase.from("properties").insert(payload).select("id").single();
        if (data) setPropertyId(data.id);
      }
    }
    setSaving(false);
    setStep(next);
  };

  const computeCompleteness = (): number => {
    let filled = 0; const total = 14;
    if (client.first_name) filled++; if (client.last_name) filled++; if (client.phone) filled++; if (client.email) filled++;
    if (client.consent_rodo) filled++;
    if (loan.loan_amount) filled++; if (loan.preferred_period_months) filled++; if (loan.situation_description) filled++;
    if (prop.property_type) filled++; if (prop.city) filled++; if (prop.estimated_value) filled++; if (prop.area_sqm) filled++;
    if (docs.length > 0) filled++; if (prop.land_register_number) filled++;
    return Math.round((filled / total) * 100);
  };

  const uploadDoc = async (file: File, docType: string) => {
    if (!loanId || !user) { toast.error("Najpierw zapisz wniosek"); return; }
    setUploading(true);
    const path = `${user.id}/${loanId}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("documents").upload(path, file);
    if (ue) { toast.error("Błąd uploadu", { description: ue.message }); setUploading(false); return; }
    const { error: ie } = await supabase.from("documents").insert({ loan_application_id: loanId, file_name: file.name, file_path: path, document_type: docType, uploaded_by: user.id });
    if (ie) { toast.error("Błąd zapisu", { description: ie.message }); setUploading(false); return; }
    toast.success("Dodano dokument");
    const { data: ds } = await supabase.from("documents").select("*").eq("loan_application_id", loanId);
    setDocs(ds ?? []); setUploading(false);
  };

  const removeDoc = async (d: any) => {
    if (d.file_path) await supabase.storage.from("documents").remove([d.file_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    setDocs((cur) => cur.filter((x) => x.id !== d.id));
  };

  const submitFinal = async () => {
    if (!loanId) { toast.error("Brak wniosku"); return; }
    if (!client.consent_rodo) { toast.error("Wymagana zgoda RODO"); return; }
    await saveStep(7);
    await supabase.from("loan_applications").update({ status: "wniosek_kompletny" as any, completeness_percent: 100 }).eq("id", loanId);
    toast.success("Wniosek wysłany");
    void navigate({ to: "/klient/status" });
  };

  const requiredDocsByType: Record<string, string[]> = {
    mieszkanie: ["Dowód osobisty", "Odpis z księgi wieczystej", "Zdjęcia mieszkania"],
    dom: ["Dowód osobisty", "Odpis z księgi wieczystej", "Zdjęcia domu", "Wypis z rejestru gruntów"],
    lokal_uslugowy: ["Dowód osobisty", "Odpis KW", "Umowy najmu", "Zdjęcia"],
    dzialka_budowlana: ["Dowód osobisty", "Wypis i wyrys", "Decyzja o warunkach zabudowy"],
    grunt_rolny: ["Dowód osobisty", "Wypis z rejestru gruntów", "Mapa"],
    udzial_w_nieruchomosci: ["Dowód osobisty", "Odpis KW", "Akt notarialny"],
    inna: ["Dowód osobisty", "Dokumenty własności"],
  };

  const completeness = computeCompleteness();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mój wniosek</h1>
        <p className="text-sm text-muted-foreground">Krok {step} z {STEPS.length}: <b>{STEPS[step - 1]}</b></p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Kompletność</span><span>{completeness}%</span></div>
        <Progress value={completeness} />
      </div>
      {returnToken && <Card className="bg-muted/50"><CardContent className="py-3 text-xs"><span className="text-muted-foreground">Twój link powrotny: </span><code className="break-all">{window.location.origin}/wniosek/{returnToken}</code></CardContent></Card>}

      <Card>
        <CardHeader><CardTitle>{STEPS[step - 1]}</CardTitle><CardDescription>Dane zapisują się automatycznie po kliknięciu „Dalej".</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Imię *</Label><Input value={client.first_name} onChange={(e) => setClient({ ...client, first_name: e.target.value })} /></div>
            <div><Label>Nazwisko *</Label><Input value={client.last_name} onChange={(e) => setClient({ ...client, last_name: e.target.value })} /></div>
            <div><Label>Telefon *</Label><Input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></div>
            <div><Label>E-mail *</Label><Input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></div>
          </div>}
          {step === 2 && <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2"><Checkbox checked={client.consent_rodo} onCheckedChange={(v) => setClient({ ...client, consent_rodo: !!v })} /><span>Zgoda na przetwarzanie danych osobowych (RODO) *</span></label>
            <label className="flex items-start gap-2"><Checkbox checked={client.consent_email} onCheckedChange={(v) => setClient({ ...client, consent_email: !!v })} /><span>Zgoda na kontakt e-mail</span></label>
            <label className="flex items-start gap-2"><Checkbox checked={client.consent_phone} onCheckedChange={(v) => setClient({ ...client, consent_phone: !!v })} /><span>Zgoda na kontakt telefoniczny</span></label>
            <label className="flex items-start gap-2"><Checkbox checked={client.consent_sms} onCheckedChange={(v) => setClient({ ...client, consent_sms: !!v })} /><span>Zgoda na SMS</span></label>
          </div>}
          {step === 3 && <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Kwota pożyczki (PLN) *</Label><Input type="number" value={loan.loan_amount} onChange={(e) => setLoan({ ...loan, loan_amount: e.target.value })} /></div>
            <div><Label>Okres (miesiące) *</Label><Input type="number" value={loan.preferred_period_months} onChange={(e) => setLoan({ ...loan, preferred_period_months: e.target.value })} /></div>
            <div><Label>Preferowany kanał kontaktu</Label>
              <Select value={loan.preferred_contact_channel} onValueChange={(v) => setLoan({ ...loan, preferred_contact_channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(contactChannelLabels).filter(([k]) => k !== "system" && k !== "notatka").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2"><Checkbox checked={loan.fast_decision} onCheckedChange={(v) => setLoan({ ...loan, fast_decision: !!v })} /><span>Potrzebuję szybkiej decyzji</span></label>
            <div className="md:col-span-2"><Label>Opis sytuacji</Label><Textarea rows={4} value={loan.situation_description} onChange={(e) => setLoan({ ...loan, situation_description: e.target.value })} /></div>
          </div>}
          {step === 4 && <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Typ nieruchomości *</Label>
              <Select value={prop.property_type} onValueChange={(v) => setProp({ ...prop, property_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(propertyTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Województwo</Label><Input value={prop.voivodeship} onChange={(e) => setProp({ ...prop, voivodeship: e.target.value })} /></div>
            <div><Label>Miasto *</Label><Input value={prop.city} onChange={(e) => setProp({ ...prop, city: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Adres</Label><Input value={prop.address} onChange={(e) => setProp({ ...prop, address: e.target.value })} /></div>
          </div>}
          {step === 5 && <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Powierzchnia (m²)</Label><Input type="number" value={prop.area_sqm} onChange={(e) => setProp({ ...prop, area_sqm: e.target.value })} /></div>
            <div><Label>Szacowana wartość (PLN) *</Label><Input type="number" value={prop.estimated_value} onChange={(e) => setProp({ ...prop, estimated_value: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Numer KW</Label><Input value={prop.land_register_number} onChange={(e) => setProp({ ...prop, land_register_number: e.target.value })} /></div>
            <label className="flex items-center gap-2"><Checkbox checked={prop.has_mortgage} onCheckedChange={(v) => setProp({ ...prop, has_mortgage: !!v })} /><span>Hipoteka na nieruchomości</span></label>
            <label className="flex items-center gap-2"><Checkbox checked={prop.has_co_owners} onCheckedChange={(v) => setProp({ ...prop, has_co_owners: !!v })} /><span>Współwłaściciele</span></label>
            <div className="md:col-span-2"><Label>Opis</Label><Textarea rows={3} value={prop.description} onChange={(e) => setProp({ ...prop, description: e.target.value })} /></div>
          </div>}
          {step === 6 && <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Wymagane dokumenty dla typu „{propertyTypeLabels[prop.property_type]}":</p>
            <ul className="text-sm list-disc pl-5 text-muted-foreground">{(requiredDocsByType[prop.property_type] ?? []).map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="border-2 border-dashed rounded-lg p-4">
              <Label>Dodaj dokument</Label>
              <div className="grid gap-2 md:grid-cols-[1fr_auto] mt-2">
                <Input ref={fileRef} type="file" />
                <Button disabled={uploading} onClick={() => {
                  const f = fileRef.current?.files?.[0]; if (!f) return;
                  void uploadDoc(f, "klient_upload");
                  if (fileRef.current) fileRef.current.value = "";
                }}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Wyślij"}</Button>
              </div>
            </div>
            <div className="space-y-2">
              {docs.length === 0 ? <p className="text-sm text-muted-foreground">Brak dokumentów.</p> :
                docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                    <span>{d.file_name}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeDoc(d)}>Usuń</Button>
                  </div>
                ))}
            </div>
          </div>}
          {step === 7 && <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Sprawdź dane i wyślij wniosek do analizy.</p>
            <div className="grid gap-1 rounded-md border p-3">
              <div><b>{client.first_name} {client.last_name}</b> · {client.phone} · {client.email}</div>
              <div>Kwota: <b>{loan.loan_amount} PLN</b> · Okres: <b>{loan.preferred_period_months} mies.</b></div>
              <div>Nieruchomość: <b>{propertyTypeLabels[prop.property_type]}</b>, {prop.city} · wartość: <b>{prop.estimated_value} PLN</b></div>
              <div>Dokumenty: <b>{docs.length}</b> · Kompletność: <b>{completeness}%</b></div>
            </div>
            {!client.consent_rodo && <p className="text-destructive">Musisz zaakceptować zgodę RODO (krok 2).</p>}
          </div>}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 1 || saving} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Wstecz</Button>
        {step < 7 ? (
          <Button disabled={saving} onClick={() => void saveStep(step + 1)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Dalej <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
        ) : (
          <Button disabled={saving || !client.consent_rodo} onClick={() => void submitFinal()}><Send className="mr-2 h-4 w-4" /> Wyślij wniosek</Button>
        )}
      </div>
    </div>
  );
}
