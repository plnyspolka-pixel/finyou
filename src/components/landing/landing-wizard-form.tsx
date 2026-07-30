import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Send,
  Upload,
  Camera,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  Home,
  MapPin,
  BookText,
  UserRound,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FancyShell } from "@/components/landing/fancy-shell";
import { PROPERTY_DOCS_BY_SECURITY } from "@/components/landing/property-types-showcase";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { submitLandingLoanApplication } from "@/lib/landing-application.functions";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/fb-pixel";

import type { SecurityType } from "@/lib/loan-math";

const FANCY_INPUT_CLASS =
  "h-12 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40";

const BUILDING_TYPES: SecurityType[] = ["dom"];

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

type StepId = 1 | 2 | 3;

export function LandingWizardForm() {
  const submitFn = useServerFn(submitLandingLoanApplication);
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>(1);
  const [secType, setSecType] = useState<SecurityType>("mieszkanie");
  const [typeSelected, setTypeSelected] = useState(false);
  const [city, setCity] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [kwNumber, setKwNumber] = useState("");
  const [extraKwNumbers, setExtraKwNumbers] = useState<string[]>([]);
  const [usableArea, setUsableArea] = useState("");
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
  const deedRef = useRef<HTMLInputElement>(null);

  // Calculator state (defaults submitted with the application; the interactive
  // calculator lives on /kalkulator-pozyczki)
  const [amount] = useState(200_000);
  const [months, setMonths] = useState(36);
  const [maxPayment] = useState(0);
  const [annualRate, setAnnualRate] = useState(30);
  const rateTouchedRef = useRef(false);

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
    return Math.round(Math.min(45, Math.max(15, 22 + amountT * 18 - monthsT * 8)) * 2) / 2;
  }, [amount, months]);
  useEffect(() => {
    if (!rateTouchedRef.current) setAnnualRate(suggestedRate);
  }, [suggestedRate]);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const addPhotos = (files: FileList | null, bucket: string) => {
    if (!files?.length) return;
    const next: PhotoItem[] = Array.from(files).map((f) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${f.name}`,
      name: f.name,
      type: f.type,
      url: URL.createObjectURL(f),
      bucket,
      file: f,
    }));
    setPhotos((cur) => [...cur, ...next]);
  };
  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const r = cur.find((p) => p.id === id);
      if (r) URL.revokeObjectURL(r.url);
      return cur.filter((p) => p.id !== id);
    });
  };

  const propertyPhotos = photos.filter((p) => p.bucket === "property_photos");
  const hasPropertyPhotos = propertyPhotos.length > 0;
  const allKwNumbers = useMemo(
    () => [kwNumber, ...extraKwNumbers].map((k) => k.trim()).filter(Boolean),
    [kwNumber, extraKwNumbers],
  );
  const hasOwnershipDeed = photos.some((p) => p.bucket === "ownership_deed");
  const kwOk = allKwNumbers.length > 0 || hasOwnershipDeed;

  const contactValid = useMemo(() => {
    const ph = phone.trim().replace(/\D/g, "");
    return Boolean(
      firstName.trim() &&
      lastName.trim() &&
      ph.length >= 9 &&
      /.+@.+\..+/.test(email.trim()) &&
      consentPrivacy &&
      consentTerms &&
      consentMarketing,
    );
  }, [firstName, lastName, phone, email, consentPrivacy, consentTerms, consentMarketing]);

  const stepDone: Record<StepId, boolean> = {
    1: typeSelected && city.trim().length > 0,
    2: hasPropertyPhotos && kwOk,
    3: contactValid,
  };
  const allDone = stepDone[1] && stepDone[2] && stepDone[3];

  const fireLead = () => {
    if (leadFiredRef.current || !contactValid) return;
    leadFiredRef.current = true;
    void trackEvent(
      "Lead",
      { value: amount, currency: "PLN", content_category: secType, loan_period_months: months },
      {
        email: email.trim(),
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
    );
  };

  const goNext = () => {
    if (!stepDone[step]) {
      const msgs: Record<StepId, string> = {
        1: "Wybierz typ nieruchomości i podaj miejscowość.",
        2: "Dodaj zdjęcia oraz numer księgi wieczystej (lub akt własności).",
        3: "Uzupełnij dane kontaktowe i zaakceptuj zgody.",
      };
      toast.error(msgs[step]);
      return;
    }
    setStep((s) => Math.min(3, s + 1) as StepId);
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1) as StepId);

  useEffect(() => {
    const handler = () => {
      document
        .getElementById("landing-wizard-top")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("financeyou:open-offer", handler);
    return () => window.removeEventListener("financeyou:open-offer", handler);
  }, []);

  const onSubmit = async () => {
    if (!allDone) {
      toast.error("Uzupełnij wszystkie kroki wizarda, aby wysłać wniosek.");
      return;
    }
    fireLead();
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
          annual_investor_rate: annualRate,
          max_monthly_payment: maxPayment > 0 ? maxPayment : null,
          land_register_number: (() => {
            const parts = [...allKwNumbers];
            const ua = usableArea.trim();
            if (ua && BUILDING_TYPES.includes(secType)) parts.push(`Pow. użytkowa: ${ua} m²`);
            return parts.length > 0 ? parts.join(" | ") : null;
          })(),
          photos: photoPayload,
          source: "landing_wizard",
          assigned_operator_id: null,
        },
      });
      if (!res?.ok) throw new Error("submit failed");
      void trackEvent(
        "CompleteRegistration",
        { value: amount, currency: "PLN", content_category: secType, loan_period_months: months },
        {
          email: email.trim(),
          phone: phone.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      );
      if (res.token_hash) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: res.token_hash,
          type: "magiclink",
        });
        if (!otpErr) {
          toast.success("Wniosek wysłany. Zalogowaliśmy Cię automatycznie.");
          void navigate({ to: "/klient" });
          return;
        }
      }
      toast.success("Wniosek wysłany! Sprawdź e-mail — wysłaliśmy dane do logowania.");
      void navigate({ to: "/" });
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się wysłać wniosku. Spróbuj jeszcze raz.");
    } finally {
      setSubmitting(false);
    }
  };

  const docHint = PROPERTY_DOCS_BY_SECURITY[secType];

  return (
    <div id="landing-wizard-top" className="space-y-6">
      {/* Step 1: Typ nieruchomości + miejscowość */}
      {step === 1 && (
        <FancyShell>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-white/85">
              <Home className="h-5 w-5" />
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest">
                Krok 1 · Nieruchomość
              </span>
            </div>
            <SecurityTypePicker
              value={typeSelected ? secType : null}
              onChange={(t) => {
                setSecType(t);
                setTypeSelected(true);
              }}
            />
            <div className="space-y-2 pt-2">
              <Label
                htmlFor="lw-city"
                className="flex items-center gap-2 text-base font-bold uppercase tracking-[0.14em] text-white"
              >
                <MapPin className="h-4 w-4" /> Miejscowość *
              </Label>
              <Input
                id="lw-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="np. Warszawa"
                className={FANCY_INPUT_CLASS}
              />
              <p className="text-xs text-white/75">
                Miasto/wieś, w której znajduje się nieruchomość.
              </p>
            </div>
          </div>
        </FancyShell>
      )}

      {/* Step 2: Zdjęcia + numer KW */}
      {step === 2 && (
        <FancyShell>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-white/85">
              <Upload className="h-5 w-5" />
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest">
                Krok 2 · Zdjęcia i numer KW
              </span>
            </div>

            {docHint && (
              <div className="rounded-xl border border-white/25 bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/85">
                  Co przygotować — {docHint.title}
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-white/85">
                  {docHint.docs.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                <Upload className="h-4 w-4" /> Zdjęcia nieruchomości
              </Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/40 bg-white/10 px-3 py-4 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition hover:border-white/70 hover:bg-white/20"
                >
                  <Upload className="h-4 w-4" /> Dodaj plik
                </button>
                <button
                  type="button"
                  onClick={() => camRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-white/60 bg-white/20 px-3 py-4 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition hover:bg-white/30 sm:hidden"
                >
                  <Camera className="h-4 w-4" /> Zrób zdjęcie
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files, "property_photos");
                  e.currentTarget.value = "";
                }}
              />
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files, "property_photos");
                  e.currentTarget.value = "";
                }}
              />
              {propertyPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {propertyPhotos.map((p) => (
                    <div
                      key={p.id}
                      className="relative overflow-hidden rounded-md border border-white/30 bg-white/10"
                    >
                      {p.type.startsWith("image/") ? (
                        <img
                          src={p.url}
                          alt={p.name}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="grid aspect-square place-items-center bg-white/10">
                          <FileText className="h-6 w-6 text-white/80" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-xs font-bold text-foreground shadow"
                        aria-label="Usuń"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <Label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                <BookText className="h-4 w-4" /> Numer księgi wieczystej
              </Label>
              <Input
                value={kwNumber}
                onChange={(e) => setKwNumber(e.target.value.toUpperCase())}
                placeholder="np. WA1M/00123456/7"
                className="h-14 rounded-2xl border-2 border-white/30 bg-white/10 px-4 font-mono text-lg font-bold tracking-wider text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40"
              />
              <p className="text-xs text-white/75">
                Numer sprawdzisz w mObywatelu. Alternatywnie dołącz akt własności.
              </p>
              {extraKwNumbers.map((val, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={val}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setExtraKwNumbers((cur) => cur.map((x, i) => (i === idx ? v : x)));
                    }}
                    placeholder={`Dodatkowy numer KW #${idx + 2}`}
                    className={`${FANCY_INPUT_CLASS} font-mono tracking-wider`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setExtraKwNumbers((cur) => cur.filter((_, i) => i !== idx))}
                    className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => setExtraKwNumbers((cur) => [...cur, ""])}
                >
                  + Dodaj kolejny numer KW
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => deedRef.current?.click()}
                >
                  + Dodaj akt własności
                </Button>
                <input
                  ref={deedRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    addPhotos(e.target.files, "ownership_deed");
                    e.currentTarget.value = "";
                  }}
                />
              </div>
              {photos.some((p) => p.bucket === "ownership_deed") && (
                <ul className="flex flex-wrap gap-2">
                  {photos
                    .filter((p) => p.bucket === "ownership_deed")
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span className="max-w-[160px] truncate">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-sm font-bold text-foreground"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                </ul>
              )}
              {BUILDING_TYPES.includes(secType) && (
                <div className="space-y-2 pt-2">
                  <Label className="text-white">
                    Powierzchnia użytkowa <span className="text-white/60">(opcjonalnie)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="0.1"
                      value={usableArea}
                      onChange={(e) => setUsableArea(e.target.value)}
                      placeholder="np. 58"
                      className={`${FANCY_INPUT_CLASS} max-w-[180px]`}
                    />
                    <span className="text-sm text-white/75">m²</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </FancyShell>
      )}

      {/* Step 3: Dane kontaktowe */}
      {step === 3 && (
        <FancyShell>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-white/85">
              <UserRound className="h-5 w-5" />
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest">
                Krok 3 · Dane kontaktowe
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lw-fn" className="text-white">
                  Imię *
                </Label>
                <Input
                  id="lw-fn"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Anna"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lw-ln" className="text-white">
                  Nazwisko *
                </Label>
                <Input
                  id="lw-ln"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Kowalska"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lw-ph" className="text-white">
                  Telefon *
                </Label>
                <Input
                  id="lw-ph"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+48 600 000 000"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lw-em" className="text-white">
                  E-mail *
                </Label>
                <Input
                  id="lw-em"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="anna@example.com"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
              <label className="flex items-start gap-3 text-xs leading-relaxed text-white">
                <Checkbox
                  checked={consentPrivacy}
                  onCheckedChange={(v) => setConsentPrivacy(v === true)}
                  className="mt-0.5 h-6 w-6 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground [&_svg]:size-5"
                />
                <span>
                  Akceptuję{" "}
                  <a
                    href="/polityka-prywatnosci"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-white underline underline-offset-2"
                  >
                    politykę prywatności
                  </a>{" "}
                  Finance You. *
                </span>
              </label>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-white">
                <Checkbox
                  checked={consentTerms}
                  onCheckedChange={(v) => setConsentTerms(v === true)}
                  className="mt-0.5 h-6 w-6 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground [&_svg]:size-5"
                />
                <span>
                  Akceptuję{" "}
                  <a
                    href="/regulamin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-white underline underline-offset-2"
                  >
                    regulamin serwisu
                  </a>
                  . *
                </span>
              </label>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-white">
                <Checkbox
                  checked={consentMarketing}
                  onCheckedChange={(v) => setConsentMarketing(v === true)}
                  className="mt-0.5 h-6 w-6 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground [&_svg]:size-5"
                />
                <span>
                  Wyrażam zgodę na kontakt marketingowy (e-mail, SMS, telefon) w sprawie ofert
                  Finance You. *
                </span>
              </label>
            </div>
          </div>
        </FancyShell>
      )}

      {/* Nawigacja */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-card md:p-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={goBack}
          disabled={step === 1 || submitting}
        >
          <ChevronLeft className="mr-1 h-5 w-5" /> Wstecz
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            variant="cta"
            size="lg"
            onClick={goNext}
            className="ml-auto flex-1 text-base md:flex-none"
          >
            Dalej <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="cta"
            size="lg"
            onClick={() => void onSubmit()}
            disabled={submitting}
            className="ml-auto flex-1 text-base md:flex-none"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek…
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" /> Wyślij wniosek
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
