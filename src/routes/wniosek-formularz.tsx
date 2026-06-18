import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { detectKwNumbers } from "@/lib/kw-ocr.functions";
import { captureLeadFromApplication } from "@/lib/voicebot.functions";
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

export const Route = createFileRoute("/wniosek-formularz")({
  component: KlientWniosek,
});

const STEPS = ["Kalkulator", "Zabezpieczenie", "Zdjęcia i dokumenty", "Twoja propozycja dla inwestora", "Dane kontaktowe"];

type BusinessStatus = "prowadzi" | "zamierza" | "";
type KwStatus = "znam" | "nie_znam" | "nie_pewien" | "";

function KlientWniosek() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const captureLead = useServerFn(captureLeadFromApplication);
  const leadFiredRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/logowanie" });
  }, [authLoading, user, navigate]);


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
  const [maxPayment, setMaxPayment] = useState<number>(1500);
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
  const [kwNumbers, setKwNumbers] = useState<string[]>([""]);
  const [kwNoDocsContact, setKwNoDocsContact] = useState<boolean>(false);
  const [kwDetected, setKwDetected] = useState<string[]>([]);
  const [kwScanning, setKwScanning] = useState<boolean>(false);
  const [mobywatelOpen, setMobywatelOpen] = useState<boolean>(false);
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

  // Pre-fill z embed (wniosek-start zapisuje paramy kalkulatora do sessionStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("embed_calc_v1");
      if (!raw) return;
      const p = JSON.parse(raw) as {
        amount?: number; annualRate?: number; months?: number; maxPayment?: number;
        secType?: SecurityType | null; source?: string; startStep?: number;
      };
      if (p.amount) setAmount(p.amount);
      if (p.annualRate) setAnnualRate(p.annualRate);
      if (p.months) setMonths(p.months);
      if (p.maxPayment) setMaxPayment(p.maxPayment);
      if (p.secType) setSecType(p.secType);
      // przeskocz krok 1 — kalkulator już wypełniony w embedzie / na wniosek-warunki
      const targetStep = p.startStep && p.startStep >= 1 && p.startStep <= 5 ? p.startStep : 2;
      setStep(targetStep);
      // wymuś tryb edycji, żeby SubmittedView nie blokował dostępu do kroku KW
      setEditing(true);
      sessionStorage.removeItem("embed_calc_v1");
    } catch {
      /* noop */
    }
  }, []);


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
      // Wznów wniosek w ostatnio zapisanym kroku (jeśli nie nadpisano przez embed)
      const savedStep = (la as { current_form_step?: number | null }).current_form_step;
      if (savedStep && savedStep >= 1 && savedStep <= STEPS.length) {
        setStep((cur) => (cur > 1 ? cur : savedStep));
      }

      const { data: prop } = await supabase.from("properties").select("*")
        .eq("loan_application_id", la.id).maybeSingle();
      if (prop) {
        setPropertyId(prop.id);
        setSecType((prop.property_type as SecurityType) ?? null);
        setVoivodeship(prop.voivodeship ?? "");
        setCity(prop.city ?? "");
        setStreet(prop.street ?? "");
        const lr = prop.land_register_number ?? "";
        const parsedKw = lr.split(",").map((s: string) => s.trim()).filter(Boolean);
        setKwNumbers(parsedKw.length ? parsedKw : [""]);
        const desc = prop.description ?? "";
        setKwNoDocsContact(/\[KONTAKT_BEZ_KW\]/.test(desc));
        setKwDescription(desc.replace(/\s*\[KONTAKT_BEZ_KW\]\s*/g, "").trim());
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
          land_register_number: (kwNumbers.map((s) => s.trim()).filter(Boolean).join(",") || null),
          description: [
            otherDescription || "",
            kwDescription || "",
            kwNoDocsContact ? "[KONTAKT_BEZ_KW]" : "",
          ].filter(Boolean).join("\n").trim() || null,
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
    // Sanityzacja nazwy pliku — Supabase Storage odrzuca polskie znaki, spacje i znaki specjalne.
    const safeName = file.name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .replace(/ł/g, "l").replace(/Ł/g, "L")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120) || "plik";
    const path = `${user.id}/${loanId}/${Date.now()}-${safeName}`;
    const { error: ue } = await supabase.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
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


  const runKwOcr = useServerFn(detectKwNumbers);
  const scanKwFromDocs = async () => {
    if (!loanId) return;
    setKwScanning(true);
    try {
      const res = await runKwOcr({ data: { loanApplicationId: loanId } });
      const found = res?.detected ?? [];
      setKwDetected(found);
      if (found.length === 0) {
        toast.info("Nie udało się automatycznie odczytać numeru KW. Możesz wpisać go ręcznie lub kontynuować bez numeru.");
      } else {
        toast.success(found.length === 1 ? "Znaleziono numer KW — sprawdź propozycję." : "Znaleziono kilka numerów KW — wybierz właściwe.");
      }
    } catch (e: any) {
      toast.error("Nie udało się przeskanować dokumentów", { description: e?.message });
    } finally {
      setKwScanning(false);
    }
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
      if (!kwStatus) return { ok: false, msg: "Zaznacz jedną z opcji dotyczących numeru księgi wieczystej." };
      if (kwStatus === "znam") {
        const valid = kwNumbers.map((s) => s.trim()).filter(Boolean);
        if (valid.length === 0) return { ok: false, msg: "Wpisz numer księgi wieczystej." };
      }
      if (kwStatus === "nie_znam") {
        const hasDocs = docsByType("dokument_wlasnosci").length > 0;
        const hasKw = kwNumbers.some((s) => s.trim());
        if (!hasDocs && !hasKw && !kwNoDocsContact) {
          return { ok: false, msg: "Dodaj dokument, wpisz numer KW lub zaznacz prośbę o kontakt." };
        }
      }
      if (kwStatus === "nie_pewien") {
        const hasDocs = docsByType("dokument_wlasnosci").length > 0;
        if (!hasDocs) return { ok: false, msg: "Dodaj zdjęcie dokumentu — spróbujemy odczytać numer KW." };
      }
      return { ok: true };
    }
    if (step === 3) {
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
      if (secType === "dzialka_budowlana" && docsByType("mpzp").length === 0)
        return { ok: false, msg: "Wgraj dokument MPZP lub warunki zabudowy." };
      if (secType === "grunt_rolny" && docsByType("wypis_rejestru").length === 0)
        return { ok: false, msg: "Wgraj wypis z rejestru gruntów." };
      if (secType === "inna" && docsByType("inne").length === 0) {
        return { ok: false, msg: "Wgraj dokumenty lub zdjęcia nieruchomości." };
      }
      return { ok: true };
    }
    if (step === 4) {
      if (!firstName.trim() || !lastName.trim()) return { ok: false, msg: "Podaj imię i nazwisko." };
      if (!email.trim()) return { ok: false, msg: "Podaj e-mail." };
      if (!phone.trim()) return { ok: false, msg: "Podaj numer telefonu." };
      return { ok: true };
    }
    if (step === 5) {
      if (!amount || amount < 20000) return { ok: false, msg: "Podaj kwotę pożyczki (min. 20 000 zł)." };
      if (!months || months < 3) return { ok: false, msg: "Podaj okres spłaty (min. 3 mies.)." };
      if (!annualRate || annualRate < 15) return { ok: false, msg: "Podaj wynagrodzenie inwestora (min. 15% rocznie)." };
      return { ok: true };
    }
    return { ok: true };
  };

  const goNext = async () => {
    const v = canNext();
    if (!v.ok) { toast.error(v.msg ?? "Uzupełnij pola"); return; }
    await persistAll(step + 1);
  };

  // Krok 4 → 5: zapisz kontakt, odpal lead capture, pokaż propozycję dla inwestora (kalkulator-magnes)
  const advanceToProposal = async () => {
    const v = canNext();
    if (!v.ok) { toast.error(v.msg ?? "Uzupełnij pola"); return; }
    setSubmitting(true);
    try {
      await persistAll(5);
      if (loanId && !leadFiredRef.current && phone.trim()) {
        leadFiredRef.current = true;
        try {
          await captureLead({ data: { loanApplicationId: loanId, phone: phone.trim(), firstName: firstName || null } });
          const { trackEvent } = await import("@/lib/fb-pixel");
          await trackEvent(
            "Lead",
            { content_name: "Wniosek pożyczkowy — kontakt zapisany", value: amount, currency: "PLN" },
            { phone: phone.trim(), firstName: firstName || undefined },
          );
        } catch (e: any) {
          console.warn("[lead-capture]", e);
        }
      }
      toast.success("Dane zapisane. Dopasuj propozycję dla inwestora.");
    } finally {
      setSubmitting(false);
    }
  };

  // Krok 5: zapisz propozycję i wyślij wniosek do inwestora
  const saveProposalAndSubmit = async () => {
    const v = canNext();
    if (!v.ok) { toast.error(v.msg ?? "Uzupełnij pola"); return; }
    setSubmitting(true);
    try {
      await persistAll(STEPS.length);
      toast.success("Propozycja zapisana — wniosek trafia do inwestora.");
      void navigate({ to: "/wniosek-opis" });
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
        kwNumber={kwNumbers.filter((s) => s.trim()).join(", ")}
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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wniosek o pożyczkę pod zastaw nieruchomości</h1>
        <p className="text-sm text-muted-foreground">Krok {step} z {STEPS.length}: <b>{STEPS[step - 1]}</b></p>
      </div>
      <Progress value={progress} />

      {step < 5 && (
        <Alert className="border-accent/40 bg-accent/5">
          <Sparkles className="h-4 w-4 text-accent" />
          <AlertTitle>Twoja propozycja dla inwestora — czeka na Ciebie na końcu</AlertTitle>
          <AlertDescription className="text-sm">
            Po wypełnieniu wniosku zobaczysz interaktywny kalkulator: ratę, harmonogram spłaty i pełną propozycję dla inwestora. Możesz tam jeszcze zmienić kwotę, okres i wynagrodzenie inwestora.
          </AlertDescription>
        </Alert>
      )}

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
              <Slider min={20000} max={1_000_000} step={100} value={[amount]} onValueChange={(v) => setAmount(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
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

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Dane kontaktowe</CardTitle>
            <CardDescription>Ostatni krok — podaj dane, na które wyślemy wniosek do inwestora. Po kliknięciu „Wyślij wniosek do inwestora” skontaktuje się z Tobą Ania, nasza asystentka.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>Imię *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div><Label>Nazwisko *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div><Label>E-mail *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Telefon *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {/* Hero zabezpieczenia */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary via-primary to-[oklch(0.15_0.09_265)] p-6 text-primary-foreground shadow-2xl md:p-8">
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(ellipse_at_top_left,oklch(0.65_0.13_235/0.5),transparent_60%),radial-gradient(ellipse_at_bottom_right,oklch(0.78_0.18_85/0.35),transparent_60%)]" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Krok 2 z 4 · Zabezpieczenie
                </div>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
                  Numer księgi wieczystej Twojej nieruchomości
                </h2>
                <p className="mt-2 text-sm text-white/85 md:text-base">
                  To kluczowy dokument — pozwala inwestorowi błyskawicznie zweryfikować nieruchomość i wydać decyzję do 24 h.
                  Jeśli nie znasz numeru, pomożemy Ci go znaleźć w mObywatelu lub odczytamy go ze zdjęcia dokumentu.
                </p>
              </div>
              <div className="hidden h-24 w-24 shrink-0 place-items-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur md:grid">
                <FileText className="h-12 w-12 text-accent" />
              </div>
            </div>
            <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/90 backdrop-blur">
              <span className="text-white/70">Wybrany typ zabezpieczenia:</span>
              <b className="text-white">{secType ? securityTypeLabels[secType] : "—"}</b>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-accent hover:text-accent/80" onClick={() => setStep(1)}>
                Zmień
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-3">
                <Label className="text-base font-semibold">Czy znasz numer księgi wieczystej?</Label>
                <RadioGroup value={kwStatus} onValueChange={(v) => setKwStatus(v as KwStatus)} className="grid gap-3 md:grid-cols-2">
                  <label className={`group relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition hover:border-accent/60 hover:bg-accent/5 ${kwStatus === "znam" ? "border-accent bg-accent/10" : "border-border bg-card"}`}>
                    <RadioGroupItem value="znam" className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                        Tak, znam numer
                      </div>
                      <p className="text-xs text-muted-foreground">Wpiszesz go ręcznie. Format np. <span className="font-mono">LU1I/00012345/6</span>.</p>
                    </div>
                  </label>
                  <label className={`group relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition hover:border-accent/60 hover:bg-accent/5 ${kwStatus === "nie_znam" ? "border-accent bg-accent/10" : "border-border bg-card"}`}>
                    <RadioGroupItem value="nie_znam" className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <Sparkles className="h-4 w-4 text-accent" />
                        Nie znam — pomóżcie mi
                      </div>
                      <p className="text-xs text-muted-foreground">Sprawdzimy mObywatel albo odczytamy ze zdjęcia dokumentu.</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

            {kwStatus === "znam" && (
              <div className="space-y-3">
                {kwNumbers.map((kw, idx) => {
                  const trimmed = kw.trim();
                  const looksOdd = trimmed.length > 0 && !/^[A-Z]{2}\d[A-Z]\/\d{8}\/\d$/.test(trimmed);
                  return (
                    <div key={idx} className="space-y-1">
                      <Label>{kwNumbers.length > 1 ? `Numer księgi wieczystej #${idx + 1}` : "Wpisz numer księgi wieczystej"}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={kw}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase().replace(/[^A-Z0-9\/]/g, "").slice(0, 16);
                            setKwNumbers((arr) => arr.map((x, i) => (i === idx ? v : x)));
                          }}
                          placeholder="Np. LU1I/00012345/6"
                          inputMode="text"
                        />
                        {kwNumbers.length > 1 && (
                          <Button type="button" variant="ghost" onClick={() => setKwNumbers((arr) => arr.filter((_, i) => i !== idx))}>Usuń</Button>
                        )}
                      </div>
                      {looksOdd && (
                        <p className="text-xs text-amber-600">Sprawdź proszę, czy numer KW jest wpisany w całości, np. LU1I/00012345/6</p>
                      )}
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => setKwNumbers((arr) => [...arr, ""])}>
                  + Dodaj kolejną księgę wieczystą
                </Button>
              </div>
            )}

            {kwStatus === "nie_znam" && (
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>Nie znasz numeru księgi wieczystej? Spokojnie — pomożemy Ci go ustalić.</AlertTitle>
                  <AlertDescription>
                    Numer księgi wieczystej często znajdziesz w dokumentach dotyczących nieruchomości albo w aplikacji mObywatel. Nie musisz samodzielnie sprawdzać księgi. Wystarczy, że wpiszesz numer, jeśli go znajdziesz, albo prześlesz nam zdjęcie dokumentu — sprawdzimy to po naszej stronie.
                  </AlertDescription>
                </Alert>

                {/* KAFELEK 1 — mObywatel */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="font-semibold">Sprawdź w aplikacji mObywatel</div>
                  <p className="text-sm text-muted-foreground">
                    Jeżeli masz aplikację mObywatel, możesz spróbować znaleźć dane nieruchomości lub dokumenty, w których widoczny jest numer księgi wieczystej.
                  </p>
                  <details open={mobywatelOpen} onToggle={(e) => setMobywatelOpen((e.target as HTMLDetailsElement).open)}>
                    <summary className="cursor-pointer text-sm font-medium">Pokaż instrukcję krok po kroku</summary>
                    <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1 mt-2">
                      <li>Otwórz aplikację mObywatel na swoim telefonie.</li>
                      <li>Zaloguj się do aplikacji.</li>
                      <li>Wejdź w sekcję usług lub dokumentów.</li>
                      <li>Poszukaj informacji dotyczących nieruchomości, mieszkania, domu, działki albo dokumentów powiązanych z nieruchomością.</li>
                      <li>Jeżeli zobaczysz numer księgi wieczystej, przepisz go do formularza.</li>
                      <li>Jeżeli nie wiesz, który to numer, zrób zdjęcie ekranu albo zdjęcie dokumentu i dodaj je poniżej.</li>
                    </ol>
                  </details>
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                    <Button asChild type="button" className="sm:w-auto w-full">
                      <a href="https://www.gov.pl/web/mobywatel" target="_blank" rel="noopener noreferrer">Otwórz mObywatel / e-Obywatel</a>
                    </Button>
                    <div className="hidden sm:flex flex-col items-center">
                      <img
                        src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=https%3A%2F%2Fwww.gov.pl%2Fweb%2Fmobywatel"
                        alt="QR kod do strony mObywatel"
                        width={140}
                        height={140}
                        className="rounded border bg-white p-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1 text-center max-w-[160px]">Zeskanuj kod telefonem, żeby przejść do informacji o aplikacji mObywatel.</p>
                    </div>
                  </div>
                </div>

                {/* KAFELEK 2 — Upload dokumentu */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="font-semibold">Dodaj zdjęcie dokumentu</div>
                  <p className="text-sm text-muted-foreground">
                    Jeżeli masz akt notarialny, umowę, wypis z rejestru gruntów, zawiadomienie z sądu, decyzję, dokument ze spółdzielni albo inny dokument dotyczący nieruchomości — dodaj jego zdjęcie. Spróbujemy odczytać numer księgi wieczystej.
                  </p>
                  <DocUploader
                    label="Dodaj dokument albo zdjęcie dokumentu"
                    docType="dokument_wlasnosci"
                    docs={docsByType("dokument_wlasnosci")}
                    uploading={uploading}
                    onUpload={uploadDoc}
                    multiple
                  />
                  <p className="text-xs text-muted-foreground">Zrób zdjęcie tak, żeby dokument był czytelny, dobrze oświetlony i obejmował całą stronę.</p>
                  {docsByType("dokument_wlasnosci").length > 0 && (
                    <Button type="button" variant="outline" size="sm" disabled={kwScanning || !loanId} onClick={() => void scanKwFromDocs()}>
                      {kwScanning ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Skanuję dokumenty…</> : <><Sparkles className="h-3 w-3 mr-1" /> Spróbuj odczytać numer KW z dokumentów</>}
                    </Button>
                  )}
                </div>

              </div>
            )}

            {kwStatus === "nie_pewien" && (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    Dodaj zdjęcie dokumentu lub plik PDF. Nie musisz wiedzieć, gdzie dokładnie znajduje się numer księgi wieczystej — spróbujemy go odczytać po naszej stronie.
                  </AlertDescription>
                </Alert>
                <DocUploader
                  label="Dodaj dokument albo zdjęcie dokumentu"
                  docType="dokument_wlasnosci"
                  docs={docsByType("dokument_wlasnosci")}
                  uploading={uploading}
                  onUpload={uploadDoc}
                  multiple
                />
                <p className="text-xs text-muted-foreground">Dokumenty zostaną zapisane przy Twoim wniosku. Spróbujemy odczytać z nich numer KW.</p>
                {docsByType("dokument_wlasnosci").length > 0 && (
                  <Button type="button" variant="outline" size="sm" disabled={kwScanning || !loanId} onClick={() => void scanKwFromDocs()}>
                    {kwScanning ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Skanuję dokumenty…</> : <><Sparkles className="h-3 w-3 mr-1" /> Spróbuj odczytać numer KW z dokumentów</>}
                  </Button>
                )}
              </div>
            )}

            {/* Wyniki OCR — wspólne dla nie_znam / nie_pewien */}
            {kwDetected.length > 0 && (kwStatus === "nie_znam" || kwStatus === "nie_pewien") && (
              <Alert>
                <AlertTitle>
                  {kwDetected.length === 1
                    ? `Znaleźliśmy prawdopodobny numer księgi wieczystej: ${kwDetected[0]}. Sprawdź proszę, czy wygląda poprawnie.`
                    : "Znaleźliśmy kilka możliwych numerów ksiąg wieczystych. Zaznacz te, które dotyczą nieruchomości stanowiącej zabezpieczenie pożyczki."}
                </AlertTitle>
                <AlertDescription>
                  <div className="space-y-2 mt-2">
                    {kwDetected.map((d) => {
                      const checked = kwNumbers.map((s) => s.trim()).includes(d);
                      return (
                        <label key={d} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setKwNumbers((arr) => {
                                  const cleaned = arr.filter((s) => s.trim());
                                  return [...cleaned, d];
                                });
                                setKwStatus("znam");
                              } else {
                                setKwNumbers((arr) => arr.filter((s) => s.trim() !== d));
                              }
                            }}
                          />
                          <span className="font-mono text-sm">{d}</span>
                        </label>
                      );
                    })}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        </div>
      )}

      {step === 3 && secType && (
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
              <DocUploader label="MPZP lub warunki zabudowy *" docType="mpzp"
                docs={docsByType("mpzp")} uploading={uploading} onUpload={uploadDoc} multiple />
            )}

            {secType === "grunt_rolny" && (
              <DocUploader label="Wypis z rejestru gruntów *" docType="wypis_rejestru"
                docs={docsByType("wypis_rejestru")} uploading={uploading} onUpload={uploadDoc} multiple />
            )}

            {secType === "inna" && (
              <DocUploader label="Dokumenty lub zdjęcia nieruchomości *" docType="inne"
                docs={docsByType("inne")} uploading={uploading} onUpload={uploadDoc} multiple />
            )}
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" /> Twoja propozycja dla inwestora
            </CardTitle>
            <CardDescription>
              Dane są zapisane. Dopasuj jeszcze raz kwotę, okres i wynagrodzenie inwestora — od razu zobaczysz nową ratę i harmonogram spłaty. Kiedy będzie pasować, kliknij „Zapisz propozycję dla inwestora”.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="prop-amount">Kwota pożyczki</Label>
                <Input id="prop-amount" type="number" inputMode="numeric" value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-40 text-right tabular-nums" />
              </div>
              <Slider min={20000} max={1_000_000} step={100} value={[amount]} onValueChange={(v) => setAmount(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Okres spłaty</Label>
                <span className="tabular-nums text-sm font-medium">{months} mies.</span>
              </div>
              <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>3 mies.</span><span>72 mies.</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="prop-rate">Wynagrodzenie inwestora (rocznie)</Label>
                <div className="flex items-center gap-1">
                  <Input id="prop-rate" type="number" step="0.5" value={annualRate}
                    onChange={(e) => setAnnualRate(Number(e.target.value) || 0)} className="w-24 text-right tabular-nums" />
                  <span className="text-sm font-semibold">%</span>
                </div>
              </div>
              <Slider min={15} max={60} step={0.5} value={[Math.min(60, Math.max(15, annualRate))]}
                onValueChange={(v) => setAnnualRate(v[0])} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>15%</span><span>60%</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="prop-max">Maksymalna rata miesięczna</Label>
                <Input id="prop-max" type="number" inputMode="numeric" value={maxPayment}
                  onChange={(e) => setMaxPayment(Number(e.target.value) || 0)} className="w-40 text-right tabular-nums" />
              </div>
              <Slider min={500} max={50000} step={100} value={[Math.min(50000, maxPayment)]} onValueChange={(v) => setMaxPayment(v[0])} />
              <p className="text-xs text-muted-foreground">Nadwyżka ponad maks. ratę trafia do raty balonowej na koniec okresu.</p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Rata miesięczna</span><b className="tabular-nums">{formatPLN(rata)}</b></div>
              {balloon > 0 && (
                <div className="flex justify-between text-sm"><span>Ostatnia rata (z nadwyżką balonową)</span><b className="tabular-nums">{formatPLN(rata + balloon)}</b></div>
              )}
              <div className="flex justify-between text-sm"><span>Łączne wynagrodzenie inwestora</span><b className="tabular-nums">{formatPLN(investorComp)}</b></div>
              <div className="flex justify-between text-sm"><span>Łączna kwota do spłaty</span><b className="tabular-nums">{formatPLN(totalPay)}</b></div>
            </div>

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

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 1 || saving} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Wstecz
        </Button>
        {step < 4 ? (
          <Button variant="cta" size="cta" disabled={saving} onClick={() => void goNext()}>
            {saving ? <Loader2 className="animate-spin" /> : <>{step === 1 ? "Dalej — sprawdź możliwość finansowania" : "Dalej"} <ArrowRight className="ml-2" /></>}
          </Button>
        ) : step === 4 ? (
          <Button variant="cta" size="cta" disabled={submitting} onClick={() => void advanceToProposal()}>
            {submitting ? <Loader2 className="animate-spin" /> : <><Calculator className="mr-2" /> Dalej — Twoja propozycja dla inwestora <ArrowRight className="ml-2" /></>}
          </Button>
        ) : (
          <Button variant="cta" size="cta" disabled={submitting} onClick={() => void saveProposalAndSubmit()}>
            {submitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> Zapisz propozycję dla inwestora</>}
          </Button>
        )}
      </div>
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
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null | undefined) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) await onUpload(f, docType);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ref.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          await handleFiles(e.dataTransfer?.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition cursor-pointer ${
          dragOver ? "border-accent bg-accent/10" : "border-border bg-muted/30 hover:bg-muted/50"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
        <div className="text-sm font-medium">
          {uploading ? "Przesyłanie…" : "Dodaj albo przeciągnij plik"}
        </div>
        <div className="text-xs text-muted-foreground">
          Zdjęcie lub PDF{multiple ? " — możesz dodać kilka" : ""}. Wysyłka startuje od razu po wyborze.
        </div>

        <input
          ref={ref}
          type="file"
          multiple={multiple}
          accept="image/*,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            for (const f of files) await onUpload(f, docType);
            if (ref.current) ref.current.value = "";
          }}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            for (const f of files) await onUpload(f, docType);
            if (camRef.current) camRef.current.value = "";
          }}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          className="sm:hidden mt-1"
          onClick={(e) => { e.stopPropagation(); camRef.current?.click(); }}
        >
          <Camera className="h-4 w-4 mr-1" /> Zrób zdjęcie
        </Button>
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
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <span>Status:</span> <Badge variant="secondary">{loanStatusLabels[loanStatus] ?? loanStatus}</Badge>
          </div>
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
            Dokumenty załączone w trakcie składania wniosku. Możesz dodawać kolejne w{" "}
            <Link to="/klient/wniosek" className="underline">wniosku</Link>.
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
