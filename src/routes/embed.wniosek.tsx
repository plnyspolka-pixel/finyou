import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SecurityTypePicker } from "@/components/security-type-picker";
import {
  monthlyPayment, formatPLN,

  securityTypeLabels, type SecurityType,
} from "@/lib/loan-math";
import { AlertTriangle, Calculator } from "lucide-react";

export const Route = createFileRoute("/embed/wniosek")({
  component: EmbedWniosek,
  head: () => ({
    meta: [
      { title: "Wniosek o pożyczkę" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type BizStatus = "prowadzi" | "zamierza" | "nie_zamierza" | "";
type KwStatus = "znam" | "nie_znam" | "brak" | "";

function EmbedWniosek() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const source = params?.get("source") ?? "embed";

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [amount, setAmount] = useState(200_000);
  const [annualRate, setAnnualRate] = useState(20);
  const [months, setMonths] = useState(24);
  const [maxPayment, setMaxPayment] = useState(5000);
  const [secType, setSecType] = useState<SecurityType | null>(null);

  const [biz, setBiz] = useState<BizStatus>("");
  const [nip, setNip] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [city, setCity] = useState("");
  const [voivodeship, setVoivodeship] = useState("");
  const [street, setStreet] = useState("");
  const [kwStatus, setKwStatus] = useState<KwStatus>("");
  const [kwNumber, setKwNumber] = useState("");
  const [situationDescription, setSituationDescription] = useState("");
  const [consent, setConsent] = useState(false);

  const rataNominal = useMemo(() => monthlyPayment(amount, annualRate, months), [amount, annualRate, months]);
  const rata = useMemo(() => (maxPayment > 0 ? Math.min(rataNominal, maxPayment) : rataNominal), [rataNominal, maxPayment]);
  const balloon = useMemo(() => Math.max(0, (rataNominal - rata) * months), [rataNominal, rata, months]);
  const totalPay = useMemo(() => rata * months + balloon, [rata, months, balloon]);
  const investorComp = useMemo(() => Math.max(0, totalPay - amount), [totalPay, amount]);
  const exceedsMax = balloon > 0;

  const submit = async () => {
    setErr(null);
    if (!consent) { setErr("Wymagana zgoda RODO."); return; }
    if (!secType) { setErr("Wybierz rodzaj zabezpieczenia."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/loan-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName, last_name: lastName, email, phone,
          loan_amount: amount,
          annual_investor_rate: annualRate,
          max_monthly_payment: maxPayment,
          preferred_period_months: months,
          business_status: biz || null,
          nip: nip || null,
          property_type: secType,
          city: city || null,
          street: street || null,
          voivodeship: voivodeship || null,
          kw_status: kwStatus || null,
          land_register_number: kwStatus === "znam" ? kwNumber : null,
          situation_description: situationDescription || null,
          consent_rodo: true,
          source,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Błąd wysyłki");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Błąd wysyłki");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Dziękujemy!</h1>
          <p className="mt-2 text-muted-foreground">Wniosek został przyjęty. Skontaktujemy się wkrótce.</p>
        </div>
      </div>
    );
  }

  const canNext1 = secType !== null;
  const canNext2 = biz === "prowadzi" ? nip.trim().length > 0 : biz === "zamierza";
  const canNext3 = firstName && lastName && email && phone;
  const canSubmit = city && voivodeship && kwStatus && (kwStatus !== "znam" || kwNumber) && consent;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h1 className="text-xl font-bold">Sprawdź orientacyjne warunki pożyczki pod zastaw nieruchomości</h1>
          <p className="text-xs text-muted-foreground">Krok {step} z 4</p>
        </header>

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between"><Label className="flex items-center gap-2"><Calculator className="h-4 w-4" /> Kwota</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-32" /></div>
              <Slider min={20000} max={1_000_000} step={5000} value={[amount]} onValueChange={(v) => setAmount(v[0])} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><Label>Wynagrodzenie roczne</Label>
                <div className="flex items-center gap-1"><Input type="number" step="0.5" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value) || 0)} className="w-20" /><span className="text-sm">%</span></div></div>
              <Slider min={15} max={36} step={0.5} value={[Math.min(36, annualRate)]} onValueChange={(v) => setAnnualRate(v[0])} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><Label>Okres</Label><span className="text-sm">{months} mies.</span></div>
              <Slider min={3} max={72} step={1} value={[months]} onValueChange={(v) => setMonths(v[0])} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><Label>Maksymalna rata</Label>
                <Input type="number" value={maxPayment} onChange={(e) => setMaxPayment(Number(e.target.value) || 0)} className="w-32" /></div>
              <Slider min={500} max={50000} step={250} value={[Math.min(50000, maxPayment)]} onValueChange={(v) => setMaxPayment(v[0])} />
            </div>
            <div className="space-y-2">
              <Label>Co ma być zabezpieczeniem?</Label>
              <SecurityTypePicker value={secType} onChange={setSecType} />
            </div>
            {secType && <InvestorInterestMeter score={score} />}
            <div className="rounded border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Orientacyjna rata</span><b>{formatPLN(rata)}</b></div>
              <div className="flex justify-between"><span>Łączne wynagrodzenie inwestora</span><b>{formatPLN(investorComp)}</b></div>
              <div className="flex justify-between"><span>Łączna kwota do spłaty</span><b>{formatPLN(totalPay)}</b></div>
              <p className="text-xs text-muted-foreground pt-1">To jest kalkulacja orientacyjna. Nie stanowi oferty ani decyzji pożyczkowej.</p>
            </div>
            {exceedsMax && (
              <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Orientacyjna rata może być wyższa niż wskazana przez Ciebie maksymalna rata.</AlertDescription></Alert>
            )}
            <Button className="w-full" disabled={!canNext1} onClick={() => setStep(2)}>Dalej — sprawdź możliwość finansowania</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Label>Czy prowadzisz działalność gospodarczą albo zamierzasz ją założyć?</Label>
            <RadioGroup value={biz} onValueChange={(v) => setBiz(v as BizStatus)}>
              <label className="flex items-center gap-2 border rounded p-3 cursor-pointer"><RadioGroupItem value="prowadzi" /><span>Tak, prowadzę działalność</span></label>
              <label className="flex items-center gap-2 border rounded p-3 cursor-pointer"><RadioGroupItem value="zamierza" /><span>Nie prowadzę, ale zamierzam ją założyć</span></label>
              <label className="flex items-center gap-2 border rounded p-3 cursor-pointer"><RadioGroupItem value="nie_zamierza" /><span>Nie prowadzę i nie zamierzam</span></label>
            </RadioGroup>
            {biz === "prowadzi" && (<div><Label>NIP *</Label><Input value={nip} onChange={(e) => setNip(e.target.value)} /></div>)}
            {biz === "nie_zamierza" && (
              <Alert variant="destructive"><AlertDescription>
                Na ten moment nie możemy przyjąć wniosku. Finansowanie w tym modelu jest przeznaczone dla osób prowadzących działalność gospodarczą albo deklarujących gotowość jej założenia.
              </AlertDescription></Alert>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Wstecz</Button>
              {biz === "nie_zamierza" ? (
                <Button variant="outline" onClick={() => setStep(1)}>Wróć do kalkulatora</Button>
              ) : (
                <Button disabled={!canNext2} onClick={() => setStep(3)}>Dalej</Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Imię *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div><Label>Nazwisko *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              <div><Label>E-mail *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Telefon *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Wstecz</Button>
              <Button disabled={!canNext3} onClick={() => setStep(4)}>Dalej</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Zabezpieczenie: <b>{secType ? securityTypeLabels[secType] : "—"}</b></p>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Województwo *</Label><Input value={voivodeship} onChange={(e) => setVoivodeship(e.target.value)} /></div>
              <div><Label>Miejscowość *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Ulica</Label><Input value={street} onChange={(e) => setStreet(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Czy znasz numer księgi wieczystej?</Label>
              <RadioGroup value={kwStatus} onValueChange={(v) => setKwStatus(v as KwStatus)}>
                <label className="flex items-center gap-2 border rounded p-2 cursor-pointer"><RadioGroupItem value="znam" /><span>Tak, znam</span></label>
                <label className="flex items-center gap-2 border rounded p-2 cursor-pointer"><RadioGroupItem value="nie_znam" /><span>Nie znam / nie mam teraz przy sobie</span></label>
                <label className="flex items-center gap-2 border rounded p-2 cursor-pointer"><RadioGroupItem value="brak" /><span>Nieruchomość nie ma KW</span></label>
              </RadioGroup>
            </div>
            {kwStatus === "znam" && (<div><Label>Numer KW *</Label><Input value={kwNumber} onChange={(e) => setKwNumber(e.target.value)} /></div>)}
            <div><Label>Opis sytuacji (opcjonalnie)</Label><Textarea rows={3} value={situationDescription} onChange={(e) => setSituationDescription(e.target.value)} /></div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              <span>Wyrażam zgodę na przetwarzanie moich danych osobowych w celu rozpatrzenia wniosku (RODO). *</span>
            </label>
            <p className="text-xs text-muted-foreground">Pełen wniosek z dokumentami uzupełnisz po kontakcie z naszej strony.</p>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Wstecz</Button>
              <Button disabled={!canSubmit || submitting} onClick={() => void submit()}>
                {submitting ? "Wysyłanie…" : "Wyślij wniosek"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
