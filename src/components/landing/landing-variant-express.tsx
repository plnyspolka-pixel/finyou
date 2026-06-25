import { useMemo, useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Send, Upload, Camera, FileText, Loader2,
  Shield, Clock, Zap, CheckCircle2, ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";

import { PropertyTypesShowcase, PROPERTY_SHOWCASE_KEY_TO_SECURITY } from "@/components/landing/property-types-showcase";
import { computeLoanFigures, formatPLN, type SecurityType } from "@/lib/loan-math";
import { submitLandingLoanApplication } from "@/lib/landing-application.functions";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/fb-pixel";
import { FancyShell } from "@/components/landing/fancy-shell";
import { trackABEvent } from "@/lib/ab-homepage";

const FANCY_INPUT_CLASS =
  "h-12 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40";

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  bucket: string;
  file: File;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

const STEPS = [
  { id: 1, label: "Kwota" },
  { id: 2, label: "Nieruchomość" },
  { id: 3, label: "Dokumenty" },
  { id: 4, label: "Kontakt" },
] as const;

type StepId = 1 | 2 | 3 | 4;

const TRUST_BADGES = [
  { icon: Clock, text: "Decyzja w 24h" },
  { icon: Shield, text: "Bezpieczna hipoteka" },
  { icon: Zap, text: "100% online" },
  { icon: CheckCircle2, text: "Bez BIK" },
];

export function LandingVariantExpress() {
  const submitFn = useServerFn(submitLandingLoanApplication);
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>(1);

  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(36);

  const maxMonths = useMemo(() => {
    if (amount <= 400_000) return 72;
    const t = Math.min(1, Math.max(0, (amount - 400_000) / (1_000_000 - 400_000)));
    return Math.round(36 - t * (36 - 12));
  }, [amount]);

  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [maxMonths, months]);

  const suggestedRate = useMemo(() => {
    const amountT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
    const monthsT = Math.min(1, Math.max(0, (months - 6) / (72 - 6)));
    const raw = 22 + amountT * 18 - monthsT * 8;
    return Math.round(Math.min(45, Math.max(15, raw)) * 2) / 2;
  }, [amount, months]);

  const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
  const feePct = Math.round((10 - feeT * 6) * 10) / 10;
  const fee = Math.round((amount * feePct) / 100);
  const grossPrincipal = amount + fee;
  const r = suggestedRate / 100 / 12;
  const monthlyPayment = months <= 36
    ? Math.round(grossPrincipal * r)
    : Math.round(computeLoanFigures({ amount: grossPrincipal, annualRatePercent: suggestedRate, months }).nominal);

  const [secType, setSecType] = useState<SecurityType>("mieszkanie");
  const [typeSelected, setTypeSelected] = useState(false);
  const [city, setCity] = useState("");
  const [kwNumber, setKwNumber] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const leadFiredRef = useRef(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const next: PhotoItem[] = Array.from(files).map((f) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${f.name}`,
      name: f.name,
      type: f.type,
      url: URL.createObjectURL(f),
      bucket: "property_photos",
      file: f,
    }));
    setPhotos((cur) => [...cur, ...next]);
  };
  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const rm = cur.find((p) => p.id === id);
      if (rm) URL.revokeObjectURL(rm.url);
      return cur.filter((p) => p.id !== id);
    });
  };

  const contactValid = useMemo(() => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = phone.trim().replace(/\D/g, "");
    const em = email.trim();
    return Boolean(fn && ln && ph.length >= 9 && /.+@.+\..+/.test(em));
  }, [firstName, lastName, phone, email]);

  const progressPct = useMemo(() => {
    let done = 0;
    if (amount > 0) done += 25;
    if (typeSelected) done += 25;
    if (kwNumber.trim() || photos.length > 0) done += 25;
    if (contactValid && consentPrivacy && consentTerms && consentMarketing) done += 25;
    return done;
  }, [amount, typeSelected, kwNumber, photos.length, contactValid, consentPrivacy, consentTerms, consentMarketing]);

  const goStep = (s: StepId) => {
    if (s === 2 && step === 1) {
      trackABEvent("B", "step_calculator", { amount, months });
    }
    if (s === 3 && step === 2) {
      if (!typeSelected) { toast.error("Wybierz typ nieruchomości."); return; }
      trackABEvent("B", "step_property", { secType, city });
    }
    if (s === 4 && step === 3) {
      if (!kwNumber.trim() && photos.length === 0) {
        toast.error("Podaj numer KW lub dodaj zdjęcia nieruchomości.");
        return;
      }
      trackABEvent("B", "step_kw", { kwNumber: kwNumber.trim(), photosCount: photos.length });
    }
    setStep(s);
  };

  const fireLead = () => {
    if (leadFiredRef.current || !contactValid) return;
    leadFiredRef.current = true;
    void trackEvent("Lead", {
      value: amount, currency: "PLN", content_category: secType,
      loan_period_months: months,
    }, {
      email: email.trim(), phone: phone.trim(),
      firstName: firstName.trim(), lastName: lastName.trim(),
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactValid) { toast.error("Uzupełnij wszystkie dane kontaktowe."); return; }
    if (!consentPrivacy || !consentTerms || !consentMarketing) {
      toast.error("Zaakceptuj wymagane zgody."); return;
    }
    fireLead();
    trackABEvent("B", "step_contact");
    trackABEvent("B", "submit", { amount, months, secType, kwNumber: kwNumber.trim(), photosCount: photos.length });

    setSubmitting(true);
    try {
      const photoPayload = await Promise.all(
        photos.map(async (p) => ({
          dataUrl: await readAsDataUrl(p.file),
          mimeType: p.type || "application/octet-stream",
          fileName: p.name,
          bucket: p.bucket,
        })),
      );
      const res = await submitFn({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          loan_amount: amount,
          preferred_period_months: months,
          property_type: secType,
          city: city.trim() || null,
          annual_investor_rate: suggestedRate,
          max_monthly_payment: null,
          land_register_number: kwNumber.trim() || null,
          photos: photoPayload,
          source: "landing_ab_variant_b",
        },
      });
      if (!res?.ok) throw new Error("submit failed");
      void trackEvent("CompleteRegistration", {
        value: amount, currency: "PLN", content_category: secType,
        loan_period_months: months, has_kw: !!kwNumber.trim(), photos_count: photos.length,
      }, {
        email: email.trim(), phone: phone.trim(),
        firstName: firstName.trim(), lastName: lastName.trim(),
      });
      toast.success("Wniosek wysłany! Logujemy Cię do panelu...");
      if (res.token_hash) {
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: "magiclink" });
        if (otpErr) toast.message("Sprawdź e-mail z hasłem i danymi logowania.");
      }
      void navigate({ to: "/klient" });
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się wysłać wniosku. Spróbuj jeszcze raz.");
    } finally {
      setSubmitting(false);
    }
  };

  const secToShowcase: Record<string, string> = {
    mieszkanie: "mieszkanie", dom: "dom", lokal_uslugowy: "lokal",
    grunt_rolny: "rolna", dzialka_budowlana: "budowlana",
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Trust badges */}
      <div className="flex flex-wrap justify-center gap-2">
        {TRUST_BADGES.map((b) => (
          <div key={b.text} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur-sm">
            <b.icon className="h-3.5 w-3.5 text-accent" />
            {b.text}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => s.id <= step && setStep(s.id as StepId)}
              className={`transition ${s.id === step ? "font-bold text-foreground" : s.id < step ? "text-accent cursor-pointer" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* Step 1 - Kwota */}
      {step === 1 && (
        <FancyShell>
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-extrabold text-white md:text-3xl">
                Ile potrzebujesz?
              </h2>
              <p className="mt-1 text-sm text-white/80">
                Ustaw kwotę i okres — zobaczysz szacowaną ratę od razu.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold text-white">Kwota pożyczki</Label>
                <span className="text-3xl font-extrabold tabular-nums text-white">{formatPLN(amount)}</span>
              </div>
              <Slider gradient="good-bad" value={[amount]} min={20_000} max={1_000_000} step={5_000}
                onValueChange={(v) => setAmount(v[0] ?? amount)} />
              <div className="flex justify-between text-xs text-white/70">
                <span>20 000 zł</span><span>1 000 000 zł</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold text-white">Okres spłaty</Label>
                <span className="text-3xl font-extrabold tabular-nums text-white">{months} mies.</span>
              </div>
              <Slider gradient="good-bad" value={[Math.min(months, maxMonths)]} min={12} max={maxMonths} step={1}
                onValueChange={(v) => setMonths(v[0] ?? months)} />
              <div className="flex justify-between text-xs text-white/70">
                <span>12 mies.</span><span>{maxMonths} mies.</span>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-white/30 bg-white/10 p-5 text-center shadow-inner backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Szacowana rata miesięczna</p>
              <p className="mt-1 text-4xl font-black tabular-nums text-white md:text-5xl">{formatPLN(monthlyPayment)}</p>
              <p className="mt-1 text-xs text-white/60">
                {months <= 36 ? "same odsetki, kapitał na koniec" : "rata kapitałowo-odsetkowa"} | prowizja {feePct}%
              </p>
            </div>

            <Button type="button" variant="cta" size="lg" onClick={() => goStep(2)} className="w-full text-base">
              Dalej — wybierz nieruchomość <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </div>
        </FancyShell>
      )}

      {/* Step 2 - Typ nieruchomości */}
      {step === 2 && (
        <FancyShell>
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">
                Jaka nieruchomość stanowi zabezpieczenie?
              </h2>
              <p className="mt-1 text-sm text-white/80">
                Wybierz typ — od tego zależy jakie dokumenty będą potrzebne.
              </p>
            </div>

            <PropertyTypesShowcase
              selectedKey={secToShowcase[secType] ?? null}
              onSelect={(key) => {
                const mapped = PROPERTY_SHOWCASE_KEY_TO_SECURITY[key] as SecurityType | undefined;
                if (mapped) setSecType(mapped);
                setTypeSelected(true);
              }}
            />

            <div className="space-y-2">
              <Label className="text-white">Miejscowość nieruchomości</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="np. Warszawa"
                className={FANCY_INPUT_CLASS}
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                Wstecz
              </Button>
              <Button type="button" variant="cta" size="lg" onClick={() => goStep(3)} className="flex-1 text-base">
                Dalej — dokumenty <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </div>
        </FancyShell>
      )}

      {/* Step 3 - KW + zdjęcia */}
      {step === 3 && (
        <FancyShell>
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">
                Księga wieczysta i zdjęcia
              </h2>
              <p className="mt-1 text-sm text-white/80">
                Podaj numer KW i/lub dodaj zdjęcia nieruchomości — to przyspiesza decyzję.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                  <FileText className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <Label htmlFor="kw-b" className="text-base font-bold uppercase tracking-[0.14em] text-white cursor-pointer">
                  Numer księgi wieczystej
                </Label>
              </div>
              <Input
                id="kw-b"
                value={kwNumber}
                onChange={(e) => setKwNumber(e.target.value.toUpperCase())}
                placeholder="np. WA1M/00123456/7"
                className="h-14 rounded-2xl border-2 border-white/30 bg-white/10 pl-4 pr-4 font-mono text-lg font-bold tracking-wider text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40"
              />
              <p className="text-xs text-white/75">
                Numer sprawdzisz w aplikacji mObywatel lub w akcie notarialnym.
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-bold uppercase tracking-[0.14em] text-white">
                Zdjęcia i dokumenty nieruchomości
              </Label>
              <p className="text-xs text-white/75">
                Im więcej zdjęć, tym szybciej przygotujemy ofertę. Dodaj zdjęcia z zewnątrz i wewnątrz.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/40 bg-white/10 px-3 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white/70 hover:bg-white/20"
                >
                  <Upload className="h-4 w-4" /> Dodaj plik
                </button>
                <button
                  type="button"
                  onClick={() => camRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-white/60 bg-white/20 px-3 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 sm:hidden"
                >
                  <Camera className="h-4 w-4" /> Zrób zdjęcie
                </button>
              </div>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { addPhotos(e.target.files); e.currentTarget.value = ""; }} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { addPhotos(e.target.files); e.currentTarget.value = ""; }} />

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((p) => (
                    <div key={p.id} className="relative overflow-hidden rounded-md border border-white/30 bg-white/10">
                      {p.type.startsWith("image/") ? (
                        <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="grid aspect-square place-items-center bg-white/10">
                          <FileText className="h-6 w-6 text-white/80" />
                        </div>
                      )}
                      <button type="button" onClick={() => removePhoto(p.id)}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs font-bold text-foreground shadow"
                        aria-label="Usuń">×</button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length > 0 && (
                <p className="text-xs text-white/75">
                  Dodano {photos.length} {photos.length === 1 ? "plik" : photos.length < 5 ? "pliki" : "plików"}.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                Wstecz
              </Button>
              <Button type="button" variant="cta" size="lg" onClick={() => goStep(4)} className="flex-1 text-base">
                Dalej — dane kontaktowe <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </div>
        </FancyShell>
      )}

      {/* Step 4 - Dane kontaktowe + wyślij */}
      {step === 4 && (
        <FancyShell>
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">
                Ostatni krok — dane kontaktowe
              </h2>
              <p className="mt-1 text-sm text-white/80">
                Podaj dane, żebyśmy mogli przygotować indywidualną ofertę.
              </p>
            </div>

            {/* Podsumowanie wniosku */}
            <div className="rounded-xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Podsumowanie</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white">
                <div><span className="text-white/60">Kwota:</span> <b>{formatPLN(amount)}</b></div>
                <div><span className="text-white/60">Okres:</span> <b>{months} mies.</b></div>
                <div><span className="text-white/60">Rata:</span> <b>{formatPLN(monthlyPayment)}</b></div>
                <div><span className="text-white/60">KW:</span> <b>{kwNumber.trim() || "—"}</b></div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white">Imię *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Anna" className={FANCY_INPUT_CLASS} />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Nazwisko *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)}
                  placeholder="Kowalska" className={FANCY_INPUT_CLASS} />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Telefon *</Label>
                <Input type="tel" inputMode="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+48 600 000 000" className={FANCY_INPUT_CLASS} />
              </div>
              <div className="space-y-2">
                <Label className="text-white">E-mail *</Label>
                <Input type="email" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="anna@example.com" className={FANCY_INPUT_CLASS} />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
              <label className="flex items-start gap-3 text-xs leading-relaxed text-white">
                <Checkbox checked={consentPrivacy} onCheckedChange={(v) => setConsentPrivacy(v === true)}
                  className="mt-0.5 h-6 w-6 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground [&_svg]:size-5" />
                <span>
                  Akceptuję{" "}
                  <a href="/polityka-prywatnosci" target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
                    politykę prywatności
                  </a>{" "}Finance You. *
                </span>
              </label>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-white">
                <Checkbox checked={consentTerms} onCheckedChange={(v) => setConsentTerms(v === true)}
                  className="mt-0.5 h-6 w-6 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground [&_svg]:size-5" />
                <span>
                  Akceptuję{" "}
                  <a href="/regulamin" target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
                    regulamin serwisu
                  </a>. *
                </span>
              </label>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-white">
                <Checkbox checked={consentMarketing} onCheckedChange={(v) => setConsentMarketing(v === true)}
                  className="mt-0.5 h-6 w-6 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground [&_svg]:size-5" />
                <span>
                  Wyrażam zgodę na kontakt marketingowy (e-mail, SMS, telefon) w sprawie ofert Finance You. Mogę ją wycofać w każdej chwili. *
                </span>
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setStep(3)}
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                Wstecz
              </Button>
              <Button type="submit" variant="cta" size="lg" disabled={submitting}
                className={`flex-1 text-base ${(!contactValid || !consentPrivacy || !consentTerms || !consentMarketing) ? "opacity-60" : ""}`}>
                {submitting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek...</>
                ) : (
                  <><Send className="mr-2 h-5 w-5" /> Złóż wniosek</>
                )}
              </Button>
            </div>

            <p className="text-center text-[11px] text-white/60">
              Złożenie wniosku jest darmowe i nie zobowiązuje.
            </p>
          </div>
        </FancyShell>
      )}
    </form>
  );
}
