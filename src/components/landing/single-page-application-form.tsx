import { useMemo, useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Upload, Camera, FileText, Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { SecurityTypePicker } from "@/components/security-type-picker";
import {
  formatPLN,
  securityTypeLabels,
  type SecurityType,
} from "@/lib/loan-math";
import { submitLandingLoanApplication } from "@/lib/landing-application.functions";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/fb-pixel";

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  bucket: string;
  file: File;
};

type BucketDef = { kind: string; label: string; hint?: string; optional?: boolean };

/** Buckets per typ zabezpieczenia — zgodnie z uzgodnioną logiką landinga. */
function bucketsFor(sec: SecurityType): BucketDef[] {
  switch (sec) {
    case "mieszkanie":
      return [
        {
          kind: "property_photos",
          label: "Zdjęcia mieszkania",
          hint: "Wgraj 4–10 zdjęć: każdy pokój, kuchnia, łazienka, widok z okna oraz budynek od zewnątrz (elewacja, klatka schodowa).",
        },
      ];
    case "dom":
      return [
        {
          kind: "property_photos",
          label: "Zdjęcia domu i działki",
          hint: "Wgraj zdjęcia z zewnątrz (4 strony budynku, dach, ogrodzenie) oraz wnętrza (salon, kuchnia, łazienka, sypialnie).",
        },
      ];
    case "lokal_uslugowy":
      return [
        {
          kind: "property_photos",
          label: "Zdjęcia lokalu",
          hint: "Wgraj zdjęcia wnętrza (sala główna, zaplecze, sanitariaty) oraz lokal od zewnątrz wraz z witryną/wejściem.",
        },
      ];
    case "grunt_rolny":
      return [
        {
          kind: "land_registry",
          label: "Wypis z rejestru gruntów",
          hint: "Aktualny wypis z ewidencji gruntów i budynków (możesz pobrać w urzędzie gminy lub przez geoportal).",
        },
        {
          kind: "property_photos",
          label: "Zdjęcia działki (opcjonalnie)",
          hint: "Zdjęcia z poziomu drogi i z różnych narożników działki — pomocne przy szybszej wycenie.",
          optional: true,
        },
      ];
    case "dzialka_budowlana":
      return [
        {
          kind: "mpzp",
          label: "MPZP albo warunki zabudowy",
          hint: "Wypis i wyrys z Miejscowego Planu Zagospodarowania Przestrzennego lub decyzja o warunkach zabudowy (WZ).",
        },
        {
          kind: "property_photos",
          label: "Zdjęcia działki (opcjonalnie)",
          hint: "Zdjęcia z poziomu drogi i z różnych narożników działki, ewentualnie sąsiedniej zabudowy.",
          optional: true,
        },
      ];
    case "inna":
    default:
      return [
        {
          kind: "property_photos",
          label: "Zdjęcia nieruchomości (opcjonalnie)",
          hint: "Wgraj zdjęcia z zewnątrz i wewnątrz — im więcej, tym szybciej przygotujemy ofertę.",
          optional: true,
        },
      ];
  }
}


const BUILDING_TYPES: SecurityType[] = ["dom"];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function PhotoBucket({
  label,
  hint,
  bucket,
  photos,
  onAdd,
  onRemove,
}: {
  label: string;
  hint?: string;
  bucket: string;
  photos: PhotoItem[];
  onAdd: (files: FileList | null, bucket: string) => void;
  onRemove: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const own = photos.filter((p) => p.bucket === bucket);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/50 px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/10"
        >
          <Upload className="h-4 w-4 text-accent" /> Dodaj plik
        </button>
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-accent bg-accent/10 px-3 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/20 sm:hidden"
        >
          <Camera className="h-4 w-4" /> Zrób zdjęcie
        </button>
      </div>
      <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={(e) => { onAdd(e.target.files, bucket); e.currentTarget.value = ""; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onAdd(e.target.files, bucket); e.currentTarget.value = ""; }} />
      {own.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {own.map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded-md border border-border bg-card">
              {p.type.startsWith("image/") ? (
                <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-square place-items-center bg-secondary">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <button type="button" onClick={() => onRemove(p.id)}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-xs font-bold text-foreground shadow"
                aria-label="Usuń">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { id: 1, label: "Kontakt" },
  { id: 2, label: "Wniosek" },
  { id: 3, label: "Parametry" },
] as const;


type StepId = 1 | 2 | 3;

export function SinglePageApplicationForm() {
  const submitFn = useServerFn(submitLandingLoanApplication);
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>(1);
  const [secType, setSecType] = useState<SecurityType>("mieszkanie");
  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(24);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [kwNumber, setKwNumber] = useState("");
  const [extraKwNumbers, setExtraKwNumbers] = useState<string[]>([]);
  const [usableArea, setUsableArea] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const leadFiredRef = useRef(false);
  const deedInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const photoBuckets = useMemo(() => bucketsFor(secType), [secType]);

  const contactValid = useMemo(() => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = phone.trim().replace(/\D/g, "");
    const em = email.trim();
    return Boolean(fn && ln && ph.length >= 9 && /.+@.+\..+/.test(em));
  }, [firstName, lastName, phone, email]);

  const fireLead = () => {
    if (leadFiredRef.current || !contactValid) return;
    leadFiredRef.current = true;
    void trackEvent(
      "Lead",
      {
        value: amount,
        currency: "PLN",
        content_category: secType,
        loan_period_months: months,
      },
      {
        email: email.trim(),
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
    );
  };

  const addPhotos = (files: FileList | null, bucket: string) => {
    if (!files?.length) return;
    const next: PhotoItem[] = Array.from(files).map((f) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${f.name}`,
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

  const goNext = () => {
    if (step === 1) {
      if (!contactValid) {
        toast.error("Uzupełnij imię, nazwisko, telefon i e-mail.");
        return;
      }
      if (!consentPrivacy || !consentTerms) {
        toast.error("Zaakceptuj politykę prywatności i regulamin serwisu.");
        return;
      }
      // Meta: Lead = "Przesłanie zgłoszenia" — po podaniu danych kontaktowych
      fireLead();
    }
    if (step === 2) {
      if (!kwOrDeedOk) {
        toast.error("Podaj numer księgi wieczystej lub dołącz akt własności.");
        return;
      }
      if (missingRequiredBuckets.length > 0) {
        toast.error(`Dołącz wymagane dokumenty: ${missingRequiredBuckets.map((b) => b.label).join(", ")}.`);
        return;
      }
    }
    setStep((s) => (Math.min(3, s + 1) as StepId));

  };
  const goBack = () => setStep((s) => (Math.max(1, s - 1) as StepId));

  const hasOwnershipDeed = useMemo(
    () => photos.some((p) => p.bucket === "ownership_deed"),
    [photos],
  );
  const allKwNumbers = useMemo(
    () => [kwNumber, ...extraKwNumbers].map((k) => k.trim()).filter(Boolean),
    [kwNumber, extraKwNumbers],
  );
  const requiredBuckets = useMemo(
    () => photoBuckets.filter((b) => !b.optional),
    [photoBuckets],
  );
  const missingRequiredBuckets = useMemo(
    () => requiredBuckets.filter((b) => !photos.some((p) => p.bucket === b.kind)),
    [requiredBuckets, photos],
  );
  const kwOrDeedOk = allKwNumbers.length > 0 || hasOwnershipDeed;
  const step4Valid = kwOrDeedOk && missingRequiredBuckets.length === 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) { goNext(); return; }
    if (!kwOrDeedOk) {
      toast.error("Podaj numer księgi wieczystej lub dołącz akt własności.");
      return;
    }
    if (missingRequiredBuckets.length > 0) {
      toast.error(`Dołącz wymagane dokumenty: ${missingRequiredBuckets.map((b) => b.label).join(", ")}.`);
      return;
    }

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
          land_register_number: (() => {
            const parts = [...allKwNumbers];
            const ua = usableArea.trim();
            if (ua && BUILDING_TYPES.includes(secType)) parts.push(`Pow. użytkowa: ${ua} m²`);
            return parts.length > 0 ? parts.join(" | ") : null;
          })(),
          photos: photoPayload,
          source: "landing_single_page",
        },
      });
      if (!res?.ok) throw new Error("submit failed");
      // Meta: CompleteRegistration = "Ukończenie rejestracji" — po finalnym wysłaniu
      void trackEvent(
        "CompleteRegistration",
        {
          value: amount,
          currency: "PLN",
          content_category: secType,
          loan_period_months: months,
          has_kw: allKwNumbers.length > 0,
          photos_count: photos.length,
        },
        {
          email: email.trim(),
          phone: phone.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      );
      toast.success("Wniosek wysłany! Logujemy Cię do panelu…");
      // Auto-login przez magiczny link wygenerowany na backendzie
      if (res.token_hash) {
        try {
          await supabase.auth.signOut();
        } catch {
          /* noop */
        }
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: res.token_hash,
          type: "magiclink",
        });
        if (otpErr) {
          console.error("[landing] auto-login failed", otpErr);
          toast.message("Sprawdź e-mail z hasłem i danymi logowania.");
        }
      }
      void navigate({ to: "/klient" });
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się wysłać wniosku. Spróbuj jeszcze raz.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Stepper kafelki */}
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s) => {
          const active = s.id === step;
          const done = s.id < step;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => (s.id < step ? setStep(s.id as StepId) : undefined)}
                disabled={s.id > step}
                className={[
                  "flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition",
                  active
                    ? "border-accent bg-accent/10 text-foreground shadow-sm"
                    : done
                      ? "border-accent/40 bg-card text-foreground hover:bg-accent/5"
                      : "border-border bg-card text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                    active ? "bg-accent text-accent-foreground" : done ? "bg-accent/80 text-accent-foreground" : "bg-secondary text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? <Check className="h-4 w-4" /> : s.id}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide sm:text-xs">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Step 1 — dane kontaktowe */}
      {step === 1 && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Krok 1 z 3</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Jak się z Tobą skontaktować?</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="f-fn">Imię *</Label>
              <Input id="f-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Anna" /></div>
            <div className="space-y-2"><Label htmlFor="f-ln">Nazwisko *</Label>
              <Input id="f-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Kowalska" /></div>
            <div className="space-y-2"><Label htmlFor="f-ph">Telefon *</Label>
              <Input id="f-ph" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" /></div>
            <div className="space-y-2"><Label htmlFor="f-em">E-mail *</Label>
              <Input id="f-em" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="anna@example.com" /></div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <label className="flex items-start gap-3 text-xs leading-relaxed text-foreground">
              <Checkbox
                checked={consentPrivacy}
                onCheckedChange={(v) => setConsentPrivacy(v === true)}
                className="mt-0.5 h-6 w-6 [className="mt-0.5"_svg]:size-5"
              />
              <span>
                Akceptuję{" "}
                <a href="/polityka-prywatnosci" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
                  politykę prywatności
                </a>{" "}
                Finance You. *
              </span>
            </label>
            <label className="flex items-start gap-3 text-xs leading-relaxed text-foreground">
              <Checkbox
                checked={consentTerms}
                onCheckedChange={(v) => setConsentTerms(v === true)}
                className="mt-0.5 h-6 w-6 [className="mt-0.5"_svg]:size-5"
              />
              <span>
                Akceptuję{" "}
                <a href="/regulamin" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
                  regulamin serwisu
                </a>
                . *
              </span>
            </label>
            <label className="flex items-start gap-3 text-xs leading-relaxed text-foreground">
              <Checkbox
                checked={consentMarketing}
                onCheckedChange={(v) => setConsentMarketing(v === true)}
                className="mt-0.5 h-6 w-6 [className="mt-0.5"_svg]:size-5"
              />
              <span>
                Wyrażam zgodę na kontakt marketingowy (e-mail, SMS, telefon) w sprawie ofert Finance You. Zgoda dobrowolna, mogę ją wycofać w każdej chwili.
              </span>
            </label>
          </div>
        </section>
      )}

      {/* Step 3 — kwota i okres */}
      {step === 3 && (

        <section className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Krok 3 z 3</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Ile i na jak długo?</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold">Kwota pożyczki</Label>
              <span className="text-2xl font-extrabold tabular-nums text-foreground">{formatPLN(amount)}</span>
            </div>
            <Slider value={[amount]} min={20_000} max={1_000_000} step={5_000}
              onValueChange={(v) => setAmount(v[0] ?? amount)} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold">Okres spłaty</Label>
              <span className="text-2xl font-extrabold tabular-nums text-foreground">{months} mies.</span>
            </div>
            <Slider value={[months]} min={6} max={72} step={1}
              onValueChange={(v) => setMonths(v[0] ?? months)} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>6 mies.</span><span>72 mies.</span></div>
          </div>
        </section>
      )}

      {/* Step 2 — wniosek (zabezpieczenie + nieruchomość) */}
      {step === 2 && (
        <section className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Krok 2 z 3</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Wniosek — zabezpieczenie i nieruchomość</h2>
          </div>



          <div className="space-y-3">
            <Label className="text-sm font-semibold">Rodzaj nieruchomości pod zabezpieczenie</Label>
            <SecurityTypePicker value={secType} onChange={(t) => setSecType(t)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="f-kw">Numer księgi wieczystej dla: <span className="text-accent">{securityTypeLabels[secType]}</span></Label>
            <Input id="f-kw" value={kwNumber} onChange={(e) => setKwNumber(e.target.value.toUpperCase())}
              placeholder="np. WA1M/00123456/7" className="font-mono text-lg tracking-wider" />
            <p className="text-xs text-muted-foreground">Wystarczy numer KW LUB dołączony akt własności. Numer sprawdzisz w aplikacji mObywatel.</p>

            {extraKwNumbers.map((val, idx) => (
              <div key={idx} className="flex gap-2 pt-1">
                <Input
                  value={val}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    setExtraKwNumbers((cur) => cur.map((x, i) => (i === idx ? v : x)));
                  }}
                  placeholder={`Dodatkowy numer KW #${idx + 2}`}
                  className="font-mono text-lg tracking-wider"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setExtraKwNumbers((cur) => cur.filter((_, i) => i !== idx))}
                  aria-label="Usuń numer KW"
                >
                  ×
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExtraKwNumbers((cur) => [...cur, ""])}
              >
                + Dodaj kolejny numer KW
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => deedInputRef.current?.click()}
              >
                + Dodaj akt własności
              </Button>
              <input
                ref={deedInputRef}
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
              <ul className="flex flex-wrap gap-2 pt-1">
                {photos
                  .filter((p) => p.bucket === "ownership_deed")
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span className="max-w-[160px] truncate">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="grid h-5 w-5 place-items-center rounded-full bg-background text-sm font-bold text-foreground"
                        aria-label="Usuń akt własności"
                      >
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>


          <div className="grid gap-3 md:grid-cols-2">
            {photoBuckets.map((b) => (
              <PhotoBucket
                key={b.kind}
                label={b.optional ? b.label : `${b.label} *`}
                hint={b.hint}
                bucket={b.kind}
                photos={photos}
                onAdd={addPhotos}
                onRemove={removePhoto}
              />
            ))}
          </div>


          {BUILDING_TYPES.includes(secType) && (
            <div className="space-y-2">
              <Label htmlFor="f-area">
                Powierzchnia użytkowa <span className="text-muted-foreground">(opcjonalnie)</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="f-area"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.1"
                  value={usableArea}
                  onChange={(e) => setUsableArea(e.target.value)}
                  placeholder="np. 58"
                  className="max-w-[180px]"
                />
                <span className="text-sm text-muted-foreground">m²</span>
              </div>
              <p className="text-xs text-muted-foreground">Pomoże nam szybciej przygotować wstępną wycenę — nie jest wymagana.</p>
            </div>
          )}

          {!step4Valid && (
            <p className="text-xs text-muted-foreground">
              Aby wysłać wniosek: podaj <strong>numer księgi wieczystej</strong> lub dołącz <strong>akt własności</strong>
              {requiredBuckets.length > 0 && (
                <> oraz wgraj wymagane dokumenty oznaczone gwiazdką (<strong>{requiredBuckets.map((b) => b.label).join(", ")}</strong>)</>
              )}
              . Pozostałe dokumenty i zdjęcia są opcjonalne, ale przyspieszają wycenę.
            </p>
          )}

        </section>
      )}

      {/* Nawigacja */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-card md:p-4">
        {step > 1 && (
          <Button type="button" variant="outline" size="lg" onClick={goBack} disabled={submitting}>
            <ChevronLeft className="mr-1 h-5 w-5" /> Wstecz
          </Button>
        )}
        {step < 3 ? (
          <Button type="button" variant="cta" size="lg" onClick={goNext} className="ml-auto flex-1 text-base md:flex-none">
            Dalej <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        ) : (
          <Button type="submit" variant="cta" size="lg" disabled={submitting || !step4Valid} className="ml-auto flex-1 text-base md:flex-none">
            {submitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek…</>
            ) : (
              <><Send className="mr-2 h-5 w-5" /> Wyślij wniosek</>
            )}
          </Button>
        )}
      </div>
      {step === 3 && (
        <p className="text-center text-[11px] text-muted-foreground">
          Złożenie wniosku jest darmowe i nie zobowiązuje. Akceptujesz politykę prywatności Finance You.
        </p>
      )}
    </form>
  );
}
