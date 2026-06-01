import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SecurityTypePicker } from "@/components/security-type-picker";
import {
  monthlyPayment,
  formatPLN,
  securityTypeLabels,
  type SecurityType,
} from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { ArrowLeft, ArrowRight, Send, Loader2, Upload, AlertTriangle, Calculator, CheckCircle2, Pencil, Sparkles, FileText, Camera } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/klient/")({
  component: KlientWniosek,
});

const STEPS = ["Kalkulator", "Dane kontaktowe", "Działalność", "Nieruchomość", "Dokumenty", "Podsumowanie"];

type BusinessStatus = "prowadzi" | "zamierza" | "";
type KwStatus = "znam" | "nie_znam" | "brak" | "";

function KlientWniosek() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [clientId, setClientId] = useState<string | null>(null);
  const [loanId, setLoanId] = useState<string | null>(null);
  const [loanStatus, setLoanStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  // Kalkulator
  const [amount, setAmount] = useState<number>(200_000);
  const [annualRate, setAnnualRate] = useState<number>(20);
  // slider wynagrodzenia: 15-60%
  const [months, setMonths] = useState<number>(24);
  const [maxPayment, setMaxPayment] = useState<number>(5000);
  const [secType, setSecType] = useState<SecurityType | null>(null);

  // Działalność
  const [bizStatus, setBizStatus] = useState<BusinessStatus>("");
  const [nip, setNip] = useState("");

  // Kontakt
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Nieruchomość
  const [voivodeship, setVoivodeship] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [kwStatus, setKwStatus] = useState<KwStatus>("");
  const [kwNumber, setKwNumber] = useState("");
  const [kwDescription, setKwDescription] = useState("");

  // Dokumenty
  const [areaSqm, setAreaSqm] = useState("");
  const [mpzpInfo, setMpzpInfo] = useState("");
  const [landRegistryExtract, setLandRegistryExtract] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  


  // Wyliczenia
  // Wyliczenia: nadwyżka ponad maks. ratę trafia do raty balonowej na koniec
  const rataNominal = useMemo(() => monthlyPayment(amount, annualRate, months), [amount, annualRate, months]);
  const rata = useMemo(() => (maxPayment > 0 ? Math.min(rataNominal, maxPayment) : rataNominal), [rataNominal, maxPayment]);
  const balloon = useMemo(() => Math.max(0, (rataNominal - rata) * months), [rataNominal, rata, months]);
  const totalPay = useMemo(() => rata * months + balloon, [rata, months, balloon]);
  const investorComp = useMemo(() => Math.max(0, totalPay - amount), [totalPay, amount]);
  const exceedsMax = balloon > 0;

  const schedule = useMemo(() => {
    if (!months || !rata) return [];
    const today = new Date();
    const rows: { idx: number; date: string; payment: number }[] = [];
    for (let i = 1; i <= months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());
      rows.push({
        idx: i,
        date: d.toLocaleDateString("pl-PL"),
        payment: i === months ? rata + balloon : rata,
      });
    }
    return rows;
  }, [months, rata, balloon]);

  useEffect(() => {
    if (!user) return;
    setEmail((e) => e || user.email || "");
    void (async () => {
      const { data: c } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
      if (!c) return;
      setClientId(c.id);
      setFirstName(c.first_name ?? "");
      setLastName(c.last_name ?? "");
      setPhone(c.phone ?? "");
      setEmail(c.email ?? user.email ?? "");

      const { data: la } = await supabase.from("loan_applications").select("*")
        .eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!la) return;
      setLoanId(la.id);
      setLoanStatus(la.status);
      if (la.loan_amount) setAmount(Number(la.loan_amount));
      if (la.annual_investor_rate) setAnnualRate(Number(la.annual_investor_rate));
      if (la.max_monthly_payment) setMaxPayment(Number(la.max_monthly_payment));
      if (la.preferred_period_months) setMonths(la.preferred_period_months);
      if (la.business_status) setBizStatus(la.business_status as BusinessStatus);
      if (la.nip) setNip(la.nip);
      if (la.kw_status) setKwStatus(la.kw_status as KwStatus);

      const { data: prop } = await supabase.from("properties").select("*")
        .eq("loan_application_id", la.id).maybeSingle();
      if (prop) {
        setPropertyId(prop.id);
        setSecType((prop.property_type as SecurityType) ?? null);
        setVoivodeship(prop.voivodeship ?? "");
        setCity(prop.city ?? "");
        setStreet(prop.street ?? "");
        setKwNumber(prop.land_register_number ?? "");
        setKwDescription(prop.description ?? "");
        setAreaSqm(prop.area_sqm ? String(prop.area_sqm) : "");
        setMpzpInfo(prop.mpzp_info ?? "");
        setLandRegistryExtract(prop.land_registry_extract ?? "");
      }

      const { data: ds } = await supabase.from("documents").select("*")
        .eq("loan_application_id", la.id).order("created_at", { ascending: false });
      setDocs(ds ?? []);
    })();
  }, [user]);

  const ensureClient = async (): Promise<string | null> => {
    if (!user) return null;
    if (clientId) {
      await supabase.from("clients").update({
        first_name: firstName || "—", last_name: lastName || "—",
        phone: phone || null, email: email || user.email,
        consent_rodo: true,
      }).eq("id", clientId);
      return clientId;
    }
    const { data, error } = await supabase.from("clients").insert({
      user_id: user.id, first_name: firstName || "—", last_name: lastName || "—",
      email: email || user.email, phone: phone || null, source: "panel_klienta", consent_rodo: true,
    }).select("id").single();
    if (error || !data) { toast.error("Błąd zapisu klienta", { description: error?.message }); return null; }
    setClientId(data.id);
    return data.id;
  };

  const ensureLoan = async (cid: string): Promise<string | null> => {
    if (loanId) return loanId;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await supabase.from("loan_applications").insert({
      client_id: cid, status: "w_trakcie_uzupelniania", source: "panel_klienta",
      current_form_step: step, return_link_token: token,
      return_link: `${window.location.origin}/wniosek/${token}`,
    }).select("id").single();
    if (error || !data) { toast.error("Błąd zapisu wniosku", { description: error?.message }); return null; }
    setLoanId(data.id);
    return data.id;
  };

  const persistAll = async (nextStep: number) => {
    setSaving(true);
    try {
      const cid = await ensureClient();
      if (!cid) return;
      const lid = await ensureLoan(cid);
      if (!lid) return;

      await supabase.from("loan_applications").update({
        loan_amount: amount,
        annual_investor_rate: annualRate,
        max_monthly_payment: maxPayment,
        preferred_period_months: months,
        business_status: bizStatus || null,
        nip: nip || null,
        kw_status: kwStatus || null,
        interest_score: null,
        current_form_step: nextStep,
      }).eq("id", lid);

      if (secType) {
        const propPayload = {
          loan_application_id: lid,
          property_type: secType as any,
          voivodeship: voivodeship || null,
          city: city || null,
          street: street || null,
          land_register_number: kwStatus === "znam" ? kwNumber || null : null,
          description: kwStatus === "brak" ? kwDescription || null : (otherDescription || null),
          area_sqm: areaSqm ? Number(areaSqm) : null,
          mpzp_info: mpzpInfo || null,
          land_registry_extract: landRegistryExtract || null,
        };
        if (propertyId) {
          await supabase.from("properties").update(propPayload).eq("id", propertyId);
        } else {
          const { data: p } = await supabase.from("properties").insert(propPayload).select("id").single();
          if (p) setPropertyId(p.id);
        }
      }
      setStep(nextStep);
    } finally {
      setSaving(false);
    }
  };

  // Auto-zapis formularza (debounce) — utworzy klienta i wniosek po wprowadzeniu danych kontaktowych
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user) return;
    // Wymagamy minimum danych do utworzenia rekordu klienta
    const hasContact = firstName.trim() && lastName.trim() && (email.trim() || phone.trim());
    if (!hasContact && !clientId) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      void (async () => {
        const cid = await ensureClient();
        if (!cid) return;
        const lid = await ensureLoan(cid);
        if (!lid) return;
        await supabase.from("loan_applications").update({
          loan_amount: amount,
          annual_investor_rate: annualRate,
          max_monthly_payment: maxPayment,
          preferred_period_months: months,
          business_status: bizStatus || null,
          nip: nip || null,
          kw_status: kwStatus || null,
          current_form_step: step,
        }).eq("id", lid);
      })();
    }, 1200);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, firstName, lastName, email, phone, amount, annualRate, months, maxPayment, bizStatus, nip, kwStatus, secType, step]);

  const uploadDoc = async (file: File, docType: string) => {
    if (!loanId || !user) { toast.error("Najpierw przejdź dalej, aby utworzyć wniosek"); return; }
    setUploading(true);
    const path = `${user.id}/${loanId}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("documents").upload(path, file);
    if (ue) { toast.error("Błąd uploadu", { description: ue.message }); setUploading(false); return; }
    const { error: ie } = await supabase.from("documents").insert({
      loan_application_id: loanId, file_name: file.name, file_path: path,
      document_type: docType, uploaded_by: user.id,
    });
    if (ie) { toast.error("Błąd zapisu", { description: ie.message }); setUploading(false); return; }
    const { data: ds } = await supabase.from("documents").select("*").eq("loan_application_id", loanId);
    setDocs(ds ?? []);
    setUploading(false);
    toast.success("Dodano dokument");
  };

  const docsByType = (t: string) => docs.filter((d) => d.document_type === t);

  // Walidacja kroków
  const canNext = (): { ok: boolean; msg?: string } => {
    if (step === 1) {
      if (!secType) return { ok: false, msg: "Wybierz rodzaj zabezpieczenia." };
      if (!amount || !months || !annualRate) return { ok: false, msg: "Uzupełnij parametry kalkulatora." };
      return { ok: true };
    }
    if (step === 2) {
      if (!firstName.trim() || !lastName.trim()) return { ok: false, msg: "Podaj imię i nazwisko." };
      if (!email.trim()) return { ok: false, msg: "Podaj e-mail." };
      if (!phone.trim()) return { ok: false, msg: "Podaj numer telefonu." };
      return { ok: true };
    }
    if (step === 3) {
      if (!bizStatus) return { ok: false, msg: "Wybierz status działalności." };
      if (bizStatus === "prowadzi" && !nip.trim()) return { ok: false, msg: "Podaj NIP." };
      return { ok: true };
    }
    if (step === 4) {
      if (!kwStatus) return { ok: false, msg: "Wskaż status księgi wieczystej." };
      if (kwStatus === "znam") {
        if (!kwNumber.trim()) return { ok: false, msg: "Podaj numer KW." };
        if (!/^[A-Z]{2}\d[A-Z]\/\d{8}\/\d$/.test(kwNumber.trim()))
          return { ok: false, msg: "Niepoprawny format KW. Wzór: AAcyfraA/00000000/0 (np. WA1M/00000000/0)." };
      }
      if (kwStatus === "nie_znam" && docsByType("dokument_wlasnosci").length === 0)
        return { ok: false, msg: "Wgraj zdjęcia dokumentu własności." };
      if (kwStatus === "brak") {
        if (!kwDescription.trim()) return { ok: false, msg: "Opisz sytuację nieruchomości." };
        if (docsByType("dokument_wlasnosci").length === 0) return { ok: false, msg: "Wgraj dokumenty potwierdzające prawa." };
      }
      return { ok: true };
    }
    if (step === 5) {
      if (!secType) return { ok: false, msg: "Brak typu zabezpieczenia." };
      if (secType === "mieszkanie" && docsByType("zdjecia_pomieszczen").length === 0)
        return { ok: false, msg: "Wgraj zdjęcia pomieszczeń." };
      if (secType === "dom") {
        if (!areaSqm) return { ok: false, msg: "Podaj powierzchnię użytkową domu." };
        if (docsByType("zdjecia_pomieszczen").length === 0) return { ok: false, msg: "Wgraj zdjęcia pomieszczeń." };
        if (docsByType("zdjecia_bryly").length === 0) return { ok: false, msg: "Wgraj zdjęcia bryły budynku." };
      }
      if (secType === "lokal_uslugowy") {
        if (!areaSqm) return { ok: false, msg: "Podaj powierzchnię użytkową lokalu." };
        if (docsByType("zdjecia_lokalu").length === 0) return { ok: false, msg: "Wgraj zdjęcia lokalu." };
      }
      if (secType === "dzialka_budowlana" && !mpzpInfo.trim() && docsByType("mpzp").length === 0)
        return { ok: false, msg: "Dodaj informację o MPZP / warunkach zabudowy." };
      if (secType === "grunt_rolny" && !landRegistryExtract.trim() && docsByType("wypis_rejestru").length === 0)
        return { ok: false, msg: "Dodaj wypis z rejestru gruntów." };
      if (secType === "inna") {
        if (!otherDescription.trim()) return { ok: false, msg: "Opisz nieruchomość." };
        if (docsByType("inne").length === 0) return { ok: false, msg: "Wgraj dokumenty lub zdjęcia." };
      }
      return { ok: true };
    }
    return { ok: true };
  };

  const goNext = async () => {
    const v = canNext();
    if (!v.ok) { toast.error(v.msg ?? "Uzupełnij pola"); return; }
    await persistAll(step + 1);
  };

  const submit = async () => {
    if (!loanId) { toast.error("Brak wniosku"); return; }
    setSubmitting(true);
    try {
      await persistAll(6);
      await supabase.from("loan_applications").update({
        status: "wniosek_kompletny" as any,
        completeness_percent: 100,
        available_to_investors: true,
      }).eq("id", loanId);
      setLoanStatus("wniosek_kompletny");
      setEditing(false);
      setStep(1);
      toast.success("Wniosek wysłany do analizy");
    } finally {
      setSubmitting(false);
    }
  };

  const incomeDocs = useMemo(() => docs.filter((d) => d.document_type === "dochod"), [docs]);
  const isSubmitted = loanStatus !== null && loanStatus !== "w_trakcie_uzupelniania";

  if (isSubmitted && !editing) {
    return (
      <SubmittedView
        loanStatus={loanStatus!}
        amount={amount}
        annualRate={annualRate}
        months={months}
        rata={rata}
        balloon={balloon}
        totalPay={totalPay}
        investorComp={investorComp}
        firstName={firstName}
        lastName={lastName}
        email={email}
        phone={phone}
        secType={secType}
        kwStatus={kwStatus}
        kwNumber={kwNumber}
        docs={docs}
        incomeDocs={incomeDocs}
        uploading={uploading}
        onUpload={uploadDoc}
        onEdit={() => { setEditing(true); setStep(1); }}
      />
    );
  }


  const progress = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wniosek o pożyczkę pod zastaw nieruchomości</h1>
        <p className="text-sm text-muted-foreground">Krok {step} z {STEPS.length}: <b>{STEPS[step - 1]}</b></p>
      </div>
      <Progress value={progress} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" /> Sprawdź warunki pożyczki pod zastaw nieruchomości
            </CardTitle>
            <CardDescription>Ustaw parametry — od razu zobaczysz wysokość raty i koszt finansowania.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Jakiej kwoty potrzebujesz?</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-40" />
              </div>
              <Slider min={20000} max={1_000_000} step={5000} value={[amount]} onValueChange={(v) => setAmount(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Jaki max koszt pożyczki akceptujesz</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.5" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value) || 0)} className="w-24" />
                  <span className="text-sm">%</span>
                </div>
              </div>
              <Slider min={15} max={60} step={0.5} value={[Math.min(60, Math.max(15, annualRate))]} onValueChange={(v) => setAnnualRate(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>15%</span><span>60%</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Na jaki okres chcesz zaciągnąć zobowiązanie?</Label>
                <span className="text-sm tabular-nums">{months} mies.</span>
              </div>
              <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>3 mies.</span><span>72 mies.</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Jaką maksymalną ratę miesięczną możesz płacić?</Label>
                <Input type="number" value={maxPayment} onChange={(e) => setMaxPayment(Number(e.target.value) || 0)} className="w-40" />
              </div>
              <Slider min={500} max={50000} step={250} value={[Math.min(50000, maxPayment)]} onValueChange={(v) => setMaxPayment(v[0])} />
            </div>

            <div className="space-y-3">
              <Label>Co ma być zabezpieczeniem?</Label>
              <SecurityTypePicker value={secType} onChange={setSecType} />
            </div>



            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Rata miesięczna</span><b className="tabular-nums">{formatPLN(rata)}</b></div>
              {balloon > 0 && (
                <div className="flex justify-between text-sm"><span>Ostatnia rata (zawiera nadwyżkę balonową)</span><b className="tabular-nums">{formatPLN(rata + balloon)}</b></div>
              )}
              <div className="flex justify-between text-sm"><span>Łączna kwota wynagrodzenia inwestora</span><b className="tabular-nums">{formatPLN(investorComp)}</b></div>
              <div className="flex justify-between text-sm"><span>Łączna kwota do spłaty</span><b className="tabular-nums">{formatPLN(totalPay)}</b></div>
              <p className="text-xs text-muted-foreground pt-2">
                Kalkulacja poglądowa. Nie stanowi oferty ani decyzji pożyczkowej. Ostateczne warunki zależą od analizy nieruchomości, dokumentów oraz decyzji inwestora.
              </p>
            </div>

            {exceedsMax && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Część zobowiązania przekraczająca maksymalną ratę zostanie rozliczona w racie balonowej na koniec okresu umowy.
                </AlertDescription>
              </Alert>
            )}

            {schedule.length > 0 && (
              <div className="rounded-lg border bg-card">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-semibold text-sm">Harmonogram spłat</h3>
                  <p className="text-xs text-muted-foreground">Pierwsza rata płatna za miesiąc od dziś.</p>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Data spłaty</th>
                        <th className="px-3 py-2 font-medium text-right">Rata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((r) => (
                        <tr key={r.idx} className="border-t">
                          <td className="px-3 py-2 tabular-nums">{r.idx}</td>
                          <td className="px-3 py-2 tabular-nums">{r.date}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{formatPLN(r.payment)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Dane kontaktowe</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>Imię *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div><Label>Nazwisko *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div><Label>E-mail *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Telefon *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Czy prowadzisz działalność gospodarczą albo zamierzasz ją założyć?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={bizStatus} onValueChange={(v) => setBizStatus(v as BusinessStatus)}>
              <label className="flex items-start gap-2 cursor-pointer rounded border p-3 hover:bg-accent">
                <RadioGroupItem value="prowadzi" className="mt-0.5" />
                <span>Tak, prowadzę działalność gospodarczą</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer rounded border p-3 hover:bg-accent">
                <RadioGroupItem value="zamierza" className="mt-0.5" />
                <span>Nie prowadzę, ale zamierzam ją założyć</span>
              </label>
            </RadioGroup>

            {bizStatus === "prowadzi" && (
              <div>
                <Label>Podaj NIP *</Label>
                <Input value={nip} onChange={(e) => setNip(e.target.value)} placeholder="np. 1234567890" />
              </div>
            )}

          </CardContent>
        </Card>
      )}




      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Gdzie leży ta nieruchomość?</CardTitle>
            <CardDescription>Wybrany typ: <b>{secType ? securityTypeLabels[secType] : "—"}</b>{" "}
              <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setStep(1)}>Zmień rodzaj zabezpieczenia</Button>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Czy znasz numer księgi wieczystej?</Label>
              <RadioGroup value={kwStatus} onValueChange={(v) => setKwStatus(v as KwStatus)}>
                <label className="flex items-center gap-2 cursor-pointer rounded border p-3"><RadioGroupItem value="znam" /><span>Tak, znam</span></label>
                <label className="flex items-center gap-2 cursor-pointer rounded border p-3"><RadioGroupItem value="nie_znam" /><span>Nie znam / nie mam teraz przy sobie</span></label>
                <label className="flex items-center gap-2 cursor-pointer rounded border p-3"><RadioGroupItem value="brak" /><span>Nieruchomość nie ma księgi wieczystej</span></label>
              </RadioGroup>
            </div>

            {kwStatus === "znam" && (() => {
              const kwValid = /^[A-Z]{2}\d[A-Z]\/\d{8}\/\d$/.test(kwNumber.trim());
              return (
                <div className="space-y-1">
                  <Label>Numer księgi wieczystej *</Label>
                  <Input
                    value={kwNumber}
                    onChange={(e) => {
                      // Format: AAcyfraA/00000000/0 — auto-uppercase, tylko dozwolone znaki, auto slashe
                      const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 13);
                      let out = raw;
                      if (raw.length > 4) out = raw.slice(0, 4) + "/" + raw.slice(4);
                      if (raw.length > 12) out = raw.slice(0, 4) + "/" + raw.slice(4, 12) + "/" + raw.slice(12);
                      setKwNumber(out);
                    }}
                    placeholder="np. WA1M/00000000/0"
                    inputMode="text"
                    maxLength={15}
                    aria-invalid={kwNumber.length > 0 && !kwValid}
                  />
                  <p className={`text-xs ${kwNumber.length > 0 && !kwValid ? "text-destructive" : "text-muted-foreground"}`}>
                    Format: 2 litery + cyfra + litera / 8 cyfr / 1 cyfra — np. WA1M/00000000/0
                  </p>
                </div>
              );
            })()}

            {kwStatus === "nie_znam" && (
              <DocUploader
                label="Wgraj zdjęcia dokumentu, na podstawie którego stałeś/aś się właścicielem nieruchomości *"
                docType="dokument_wlasnosci"
                docs={docsByType("dokument_wlasnosci")}
                uploading={uploading}
                onUpload={uploadDoc}
              />
            )}

            {kwStatus === "brak" && (
              <>
                <div><Label>Opisz sytuację nieruchomości *</Label><Textarea rows={3} value={kwDescription} onChange={(e) => setKwDescription(e.target.value)} /></div>
                <DocUploader label="Wgraj dokumenty potwierdzające Twoje prawa do nieruchomości *"
                  docType="dokument_wlasnosci" docs={docsByType("dokument_wlasnosci")} uploading={uploading} onUpload={uploadDoc} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 5 && secType && (
        <Card>
          <CardHeader>
            <CardTitle>Dokumenty — {securityTypeLabels[secType]}</CardTitle>
            <CardDescription>Uzupełnij wymagane informacje i załączniki.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {secType === "mieszkanie" && (
              <DocUploader label="Zdjęcia każdego pomieszczenia *" docType="zdjecia_pomieszczen"
                docs={docsByType("zdjecia_pomieszczen")} uploading={uploading} onUpload={uploadDoc} multiple />
            )}

            {secType === "dom" && (
              <>
                <div><Label>Powierzchnia użytkowa domu (m²) *</Label><Input type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} /></div>
                <DocUploader label="Zdjęcia każdego pomieszczenia *" docType="zdjecia_pomieszczen"
                  docs={docsByType("zdjecia_pomieszczen")} uploading={uploading} onUpload={uploadDoc} multiple />
                <DocUploader label="Zdjęcia bryły budynku z zewnątrz *" docType="zdjecia_bryly"
                  docs={docsByType("zdjecia_bryly")} uploading={uploading} onUpload={uploadDoc} multiple />
              </>
            )}

            {secType === "lokal_uslugowy" && (
              <>
                <div><Label>Powierzchnia użytkowa lokalu (m²) *</Label><Input type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} /></div>
                <DocUploader label="Zdjęcia lokalu z zewnątrz i wewnątrz *" docType="zdjecia_lokalu"
                  docs={docsByType("zdjecia_lokalu")} uploading={uploading} onUpload={uploadDoc} multiple />
              </>
            )}

            {secType === "dzialka_budowlana" && (
              <>
                <div><Label>Zaświadczenie z MPZP albo warunki zabudowy — informacja *</Label>
                  <Textarea rows={3} value={mpzpInfo} onChange={(e) => setMpzpInfo(e.target.value)} placeholder="Opisz lub załącz dokument" />
                </div>
                <DocUploader label="Załącz dokument (MPZP / warunki zabudowy)" docType="mpzp"
                  docs={docsByType("mpzp")} uploading={uploading} onUpload={uploadDoc} multiple />
              </>
            )}

            {secType === "grunt_rolny" && (
              <>
                <div><Label>Wypis z rejestru gruntów — informacja *</Label>
                  <Textarea rows={3} value={landRegistryExtract} onChange={(e) => setLandRegistryExtract(e.target.value)} />
                </div>
                <DocUploader label="Załącz wypis z rejestru gruntów" docType="wypis_rejestru"
                  docs={docsByType("wypis_rejestru")} uploading={uploading} onUpload={uploadDoc} multiple />
              </>
            )}

            {secType === "inna" && (
              <>
                <div><Label>Opis nieruchomości *</Label><Textarea rows={4} value={otherDescription} onChange={(e) => setOtherDescription(e.target.value)} /></div>
                <DocUploader label="Dokumenty lub zdjęcia nieruchomości *" docType="inne"
                  docs={docsByType("inne")} uploading={uploading} onUpload={uploadDoc} multiple />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card>
          <CardHeader><CardTitle>Podsumowanie wniosku</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row k="Kwota pożyczki" v={formatPLN(amount)} />
            <Row k="Wynagrodzenie inwestora" v={`${annualRate}% rocznie`} />
            <Row k="Okres finansowania" v={`${months} mies.`} />
            <Row k="Rata miesięczna" v={formatPLN(rata)} />
            <Row k="Maksymalna rata klienta" v={formatPLN(maxPayment)} />
            <Row k="Łączne wynagrodzenie inwestora" v={formatPLN(investorComp)} />
            <Row k="Łączna kwota do spłaty" v={formatPLN(totalPay)} />
            <Row k="Status działalności" v={bizStatus === "prowadzi" ? "Prowadzi działalność" : bizStatus === "zamierza" ? "Zamierza założyć" : "—"} />
            {nip && <Row k="NIP" v={nip} />}
            <Row k="Imię i nazwisko" v={`${firstName} ${lastName}`} />
            <Row k="E-mail" v={email} />
            <Row k="Telefon" v={phone} />
            <Row k="Typ zabezpieczenia" v={secType ? securityTypeLabels[secType] : "—"} />
            
            <Row k="Księga wieczysta" v={kwStatus === "znam" ? kwNumber : kwStatus === "nie_znam" ? "Dokument własności (załączony)" : kwStatus === "brak" ? "Brak KW — opis i dokumenty" : "—"} />
            <Row k="Załączone dokumenty" v={`${docs.length}`} />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 1 || saving} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Wstecz
        </Button>
        {step < STEPS.length ? (
          <Button disabled={saving} onClick={() => void goNext()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{step === 1 ? "Dalej — sprawdź możliwość finansowania" : "Dalej"} <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
        ) : (
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" /> Wyślij kompletny wniosek do analizy</>}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b py-1.5"><span className="text-muted-foreground">{k}</span><b className="text-right">{v}</b></div>
  );
}

function DocUploader({
  label, docType, docs, uploading, onUpload, multiple,
}: {
  label: string; docType: string; docs: any[]; uploading: boolean;
  onUpload: (f: File, t: string) => Promise<void>; multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const handleFiles = async (files: FileList | null | undefined) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) await onUpload(f, docType);
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Input ref={ref} type="file" multiple={multiple} accept="image/*,application/pdf" className="flex-1" />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => { await handleFiles(e.target.files); if (camRef.current) camRef.current.value = ""; }}
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={uploading} className="sm:hidden flex-1" onClick={() => camRef.current?.click()}>
            <Camera className="h-4 w-4 mr-1" /> Zrób zdjęcie
          </Button>
          <Button type="button" disabled={uploading} className="flex-1 sm:flex-none" onClick={async () => {
            await handleFiles(ref.current?.files);
            if (ref.current) ref.current.value = "";
          }}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1" /> Wyślij</>}
          </Button>
        </div>
      </div>
      {docs.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {docs.map((d) => <li key={d.id}>• {d.file_name}</li>)}
        </ul>
      )}
    </div>
  );
}


function SubmittedView(props: {
  loanStatus: string;
  amount: number; annualRate: number; months: number;
  rata: number; balloon: number; totalPay: number; investorComp: number;
  firstName: string; lastName: string; email: string; phone: string;
  secType: SecurityType | null; kwStatus: string; kwNumber: string;
  docs: any[]; incomeDocs: any[]; uploading: boolean;
  onUpload: (f: File, t: string) => Promise<void>;
  onEdit: () => void;
}) {
  const { loanStatus, amount, annualRate, months, rata, balloon, totalPay, investorComp,
    firstName, lastName, email, phone, secType, kwStatus, kwNumber, docs, incomeDocs, uploading, onUpload, onEdit } = props;
  const otherDocs = docs.filter((d) => d.document_type !== "dochod");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Twój wniosek został złożony</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Status: <Badge variant="secondary">{loanStatusLabels[loanStatus] ?? loanStatus}</Badge>
          </p>
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Edytuj wniosek
        </Button>
      </div>

      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>Zwiększ szansę na pozytywną decyzję — dodaj dokumenty dochodowe</AlertTitle>
        <AlertDescription className="text-sm leading-relaxed">
          Dodaj dokumenty pokazujące Twoje dochody lub wpływy na konto. Może to być
          wyciąg bankowy, PIT, zaświadczenie od pracodawcy, dokument od księgowej albo
          inne potwierdzenie dochodu. Im więcej dokumentów dodasz, tym szybciej inwestor
          będzie mógł przeanalizować wniosek i podjąć decyzję.
          <div className="mt-2 text-xs text-muted-foreground">
            Nie musisz dodawać wszystkiego — wystarczy, że dodasz dokumenty, które posiadasz.
            Przykłady: wyciąg z konta za ostatnie 3–6 miesięcy, PIT, zaświadczenie od pracodawcy,
            umowa, decyzja o emeryturze / rencie, podsumowanie od księgowej, KPiR, ewidencja
            przychodów, dokumenty finansowe spółki.
          </div>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Dokumenty dochodowe</CardTitle>
          <CardDescription>
            Dodaj dowolne dokumenty potwierdzające Twoje dochody lub wpływy. Możesz wgrać kilka plików naraz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocUploader
            label={`Wgraj dokumenty dochodowe (dodano: ${incomeDocs.length})`}
            docType="dochod"
            docs={incomeDocs}
            uploading={uploading}
            onUpload={onUpload}
            multiple
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Podsumowanie wniosku</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Kwota pożyczki" v={formatPLN(amount)} />
          <Row k="Wynagrodzenie inwestora" v={`${annualRate}% rocznie`} />
          <Row k="Okres finansowania" v={`${months} mies.`} />
          <Row k="Rata miesięczna" v={formatPLN(rata)} />
          {balloon > 0 && <Row k="Rata balonowa (ostatnia)" v={formatPLN(rata + balloon)} />}
          <Row k="Łączne wynagrodzenie inwestora" v={formatPLN(investorComp)} />
          <Row k="Łączna kwota do spłaty" v={formatPLN(totalPay)} />
          <Row k="Imię i nazwisko" v={`${firstName} ${lastName}`} />
          <Row k="E-mail" v={email} />
          <Row k="Telefon" v={phone} />
          <Row k="Typ zabezpieczenia" v={secType ? securityTypeLabels[secType] : "—"} />
          <Row k="Księga wieczysta" v={kwStatus === "znam" ? kwNumber : kwStatus === "nie_znam" ? "Dokument własności (załączony)" : kwStatus === "brak" ? "Brak KW — opis i dokumenty" : "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pozostałe dokumenty ({otherDocs.length})</CardTitle>
          <CardDescription>
            Dokumenty załączone w trakcie składania wniosku. Możesz dodawać kolejne w zakładce{" "}
            <Link to="/klient/dokumenty" className="underline">Dokumenty</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {otherDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak dodatkowych dokumentów.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {otherDocs.map((d) => (
                <li key={d.id} className="flex justify-between border-b py-1.5">
                  <span>{d.file_name}</span>
                  <span className="text-xs text-muted-foreground">{d.document_type}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
