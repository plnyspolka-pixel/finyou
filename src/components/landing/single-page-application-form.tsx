import { useMemo, useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Upload, Camera, FileText, Loader2, ChevronLeft, ChevronRight, Check, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

import { PropertyTypesShowcase, PROPERTY_SHOWCASE_KEY_TO_SECURITY, PROPERTY_DOCS_BY_SECURITY } from "@/components/landing/property-types-showcase";
import {
  computeLoanFigures,
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
  { id: 3, label: "Twoja oferta" },
] as const;


type StepId = 1 | 2 | 3;

export function SinglePageApplicationForm() {
  const submitFn = useServerFn(submitLandingLoanApplication);
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>(1);
  const [step2Sub, setStep2Sub] = useState<"type" | "kw" | "docs">("type");
  const [secType, setSecType] = useState<SecurityType>("mieszkanie");
  const [typeSelected, setTypeSelected] = useState(false);

  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(36);
  const [canExtend, setCanExtend] = useState(true);
  const [maxPayment, setMaxPayment] = useState(0);
  const [annualRate, setAnnualRate] = useState(30);
  const rateTouchedRef = useRef(false);

  // Max okres spłaty maleje wraz z kwotą:
  // ≤ 200 000 zł → 72 mies., powyżej liniowo z 36 mies. (>200k) do 12 mies. (1 000 000 zł)
  const maxMonths = useMemo(() => {
    if (amount <= 200_000) return 72;
    const t = Math.min(1, Math.max(0, (amount - 200_000) / (1_000_000 - 200_000)));
    return Math.round(36 - t * (36 - 12));
  }, [amount]);

  useEffect(() => {
    if (months > maxMonths) setMonths(maxMonths);
  }, [maxMonths, months]);

  // Sugerowane wynagrodzenie inwestora: rośnie z kwotą, maleje z okresem.
  // Zakres ~15–45%. Aktualizuje się automatycznie dopóki użytkownik nie ruszy suwaka.
  const suggestedRate = useMemo(() => {
    const amountT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
    const monthsT = Math.min(1, Math.max(0, (months - 6) / (72 - 6)));
    const raw = 22 + amountT * 18 - monthsT * 8;
    const clamped = Math.min(45, Math.max(15, raw));
    return Math.round(clamped * 2) / 2;
  }, [amount, months]);

  useEffect(() => {
    if (!rateTouchedRef.current) setAnnualRate(suggestedRate);
  }, [suggestedRate]);

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
      if (!consentPrivacy || !consentTerms || !consentMarketing) {
        toast.error("Zaakceptuj politykę prywatności i regulamin serwisu.");
        return;
      }
      fireLead();
      setStep(2);
      setStep2Sub("type");
      return;
    }
    if (step === 2) {
      if (step2Sub === "type") {
        if (!typeSelected) {
          toast.error("Wybierz typ nieruchomości.");
          return;
        }
        setStep2Sub("kw");
        return;
      }


      if (step2Sub === "kw") {
        if (!kwOrDeedOk) {
          toast.error("Podaj numer księgi wieczystej lub dołącz akt własności.");
          return;
        }
        setStep2Sub("docs");
        return;
      }
      // docs → przejście do oferty obsługuje submit
    }
    setStep((s) => (Math.min(3, s + 1) as StepId));
  };
  const goBack = () => {
    if (step === 2) {
      if (step2Sub === "docs") { setStep2Sub("kw"); return; }
      if (step2Sub === "kw") { setStep2Sub("type"); return; }
      setStep(1);
      return;
    }
    setStep((s) => (Math.max(1, s - 1) as StepId));
  };

  const hasOwnershipDeed = useMemo(
    () => photos.some((p) => p.bucket === "ownership_deed"),
    [photos],
  );
  const allKwNumbers = useMemo(
    () => [kwNumber, ...extraKwNumbers].map((k) => k.trim()).filter(Boolean),
    [kwNumber, extraKwNumbers],
  );
  const kwOrDeedOk = allKwNumbers.length > 0 || hasOwnershipDeed;
  const step4Valid = kwOrDeedOk;

  // Allow external CTAs (e.g. hero button) to request opening "Twoja oferta" with same gating
  useEffect(() => {
    const handler = () => {
      const step1Done = contactValid && consentPrivacy && consentTerms && consentMarketing;
      if (!step1Done) {
        toast.error("Najpierw uzupełnij dane kontaktowe i zaakceptuj zgody (Krok 1).");
        setStep(1);
      } else if (!step4Valid) {
        toast.error("Najpierw uzupełnij dokumenty i numer KW (Krok 2).");
        setStep(2);
      } else {
        setStep(3);
      }
    };
    window.addEventListener("financeyou:open-offer", handler);
    return () => window.removeEventListener("financeyou:open-offer", handler);
  }, [contactValid, consentPrivacy, consentTerms, consentMarketing, step4Valid]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) { goNext(); return; }
    if (step === 2 && step2Sub !== "docs") { goNext(); return; }
    if (!kwOrDeedOk) {
      toast.error("Podaj numer księgi wieczystej lub dołącz akt własności.");
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

  // Auto-advance: contact + zgody complete → pokaż wniosek (Step 2)
  useEffect(() => {
    const step1Done = contactValid && consentPrivacy && consentTerms && consentMarketing;
    if (step === 1 && step1Done) {
      fireLead();
      setStep(2);
      setStep2Sub("type");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, contactValid, consentPrivacy, consentTerms, consentMarketing]);


  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Elegancki, zachęcający button "Twoja oferta" — zablokowany dopóki wniosek niekompletny */}
      {(() => {
        const step1Done = contactValid && consentPrivacy && consentTerms && consentMarketing;
        const canOpenOffer = step1Done && step4Valid;
        const active = step === 3;
        const handleClick = () => {
          if (!canOpenOffer) {
            if (!step1Done) {
              toast.error("Najpierw uzupełnij dane kontaktowe i zaakceptuj zgody.");
              setStep(1);
              return;
            }
            toast.error("Najpierw uzupełnij dokumenty i numer KW.");
            setStep(2);
            return;
          }
          setStep(3);
        };
        return (
          <button
            type="button"
            onClick={handleClick}
            aria-disabled={!canOpenOffer}
            title={canOpenOffer ? "Zobacz swoją wstępną ofertę" : "Dostępne po uzupełnieniu wniosku"}
            className={[
              "group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl p-[2px] shadow-[0_12px_45px_-15px_oklch(0.40_0.25_268/0.55)] transition-transform duration-300",
              canOpenOffer ? "hover:scale-[1.01] active:scale-[0.99] cursor-pointer" : "cursor-not-allowed",
            ].join(" ")}
          >
            {/* Obrotowy gradient na obwodzie — w kolorystyce marki (granat → indygo → błękit) */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2"
              style={{
                background:
                  "conic-gradient(from 0deg, oklch(0.40 0.25 268), oklch(0.65 0.18 240), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))",
                animation: "fy-offer-spin 6s linear infinite",
                opacity: canOpenOffer ? 1 : 0.55,
              }}
            />
            {/* Wnętrze buttona — abstrakcyjna grafika z kolorystyki logo */}
            <span className="relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-[14px] px-5 py-4 text-white">
              {/* Bazowa warstwa: głęboki granat marki */}
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 140% at 0% 0%, oklch(0.32 0.16 265) 0%, oklch(0.18 0.06 265) 55%, oklch(0.13 0.04 265) 100%)",
                }}
              />
              {/* Abstrakcyjne "bloby" w kolorach marki */}
              <span
                aria-hidden
                className="absolute -left-10 -top-10 h-40 w-40 rounded-full blur-2xl"
                style={{
                  background: "radial-gradient(circle, oklch(0.55 0.22 268 / 0.85), transparent 70%)",
                  animation: "fy-offer-drift-a 9s ease-in-out infinite alternate",
                }}
              />
              <span
                aria-hidden
                className="absolute -right-12 top-2 h-44 w-44 rounded-full blur-2xl"
                style={{
                  background: "radial-gradient(circle, oklch(0.68 0.16 235 / 0.75), transparent 70%)",
                  animation: "fy-offer-drift-b 11s ease-in-out infinite alternate",
                }}
              />
              <span
                aria-hidden
                className="absolute -bottom-10 left-1/3 h-36 w-36 rounded-full blur-2xl"
                style={{
                  background: "radial-gradient(circle, oklch(0.50 0.22 285 / 0.6), transparent 70%)",
                  animation: "fy-offer-drift-c 13s ease-in-out infinite alternate",
                }}
              />
              {/* Subtelna siatka linii — designerski akcent */}
              <span
                aria-hidden
                className="absolute inset-0 opacity-25 mix-blend-overlay"
                style={{
                  backgroundImage:
                    "linear-gradient(115deg, transparent 0 48%, oklch(0.95 0.05 240 / 0.35) 48% 49%, transparent 49% 62%, oklch(0.95 0.05 240 / 0.25) 62% 62.5%, transparent 62.5%)",
                  backgroundSize: "180% 100%",
                  animation: "fy-offer-lines 7s linear infinite",
                }}
              />
              {/* Shimmer */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                <span
                  className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  style={{ animation: "fy-offer-shimmer 3.2s linear infinite" }}
                />
              </span>
              {/* Treść */}
              <span
                className={[
                  "relative grid h-9 w-9 place-items-center rounded-full backdrop-blur-sm",
                  canOpenOffer ? "bg-white/20 ring-1 ring-white/30" : "bg-white/15 ring-1 ring-white/20",
                ].join(" ")}
                aria-hidden
              >
                {canOpenOffer ? <Check className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
              </span>
              <span className="relative flex flex-col items-center leading-tight drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
                <span className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">TWOJA OFERTA</span>
                {!canOpenOffer && (
                  <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/65">
                    Uzupełnij dane, aby odblokować
                  </span>
                )}
              </span>
              {active && (
                <span className="relative ml-1 hidden rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-white/30 sm:inline">
                  Otwarte
                </span>
              )}
            </span>
          </button>
        );
      })()}
      <style>{`
        @keyframes fy-offer-spin { to { transform: rotate(360deg); } }
        @keyframes fy-offer-shimmer { 0% { transform: translateX(0); } 100% { transform: translateX(450%); } }
        @keyframes fy-offer-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(20px,12px) scale(1.15); } }
        @keyframes fy-offer-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-22px,8px) scale(1.1); } }
        @keyframes fy-offer-drift-c { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(15px,-14px) scale(1.2); } }
        @keyframes fy-offer-lines { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }
      `}</style>




      {/* Step 1 — dane kontaktowe */}
      {step === 1 && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
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
                className="mt-0.5 h-6 w-6 [&_svg]:size-5"
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
                className="mt-0.5 h-6 w-6 [&_svg]:size-5"
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
                className="mt-0.5 h-6 w-6 [&_svg]:size-5"
              />
              <span>
                Wyrażam zgodę na kontakt marketingowy (e-mail, SMS, telefon) w sprawie ofert Finance You. Mogę ją wycofać w każdej chwili. *
              </span>

            </label>
          </div>
        </section>
      )}

      {/* Step 3 — Twoja oferta (kalkulator) */}
      {step === 3 && (() => {
        // Prowizja Finance You — skalowana w dół od 10% (małe kwoty) do 4% (duże kwoty),
        // liniowo między 20 000 zł a 1 000 000 zł. Kredytowana do kapitału.
        const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
        const FINANCEYOU_FEE_PCT = 10 - feeT * 6; // 10% → 4%
        const financeYouFee = Math.round((amount * FINANCEYOU_FEE_PCT) / 100);
        const grossPrincipal = amount + financeYouFee;

        // Model bullet/odsetkowy: odsetki naliczane od bieżącego salda.
        // Minimalna rata = same odsetki od pełnego kapitału (saldo nie maleje → max zysk inwestora).
        // Maksymalna rata = annuita (pełna amortyzacja → najszybsza spłata, najmniejszy zysk inwestora).
        const r = annualRate / 100 / 12;
        const nominalFig = computeLoanFigures({ amount: grossPrincipal, annualRatePercent: annualRate, months });
        const monthlyInterestOnlyExact = grossPrincipal * r; // bez zaokrąglenia — saldo nie maleje
        const minCap = Math.max(1, Math.round(monthlyInterestOnlyExact));
        const maxCap = Math.max(minCap, Math.round(nominalFig.nominal));
        // Domyślnie (gdy suwak nieruszony) ustawiamy ratę odsetkową — wtedy zysk inwestora = pełne X% rocznie od kapitału.
        const sliderTouched = maxPayment > 0;
        const chosenPayment = sliderTouched
          ? Math.min(Math.max(maxPayment, minCap), maxCap)
          : minCap;
        // Dla obliczeń używamy dokładnej wartości gdy rata = same odsetki (brak zaokrąglenia → saldo stałe).
        const paymentExact = sliderTouched ? chosenPayment : monthlyInterestOnlyExact;
        const effectiveMax = chosenPayment;

        // Harmonogram spłat: każdy miesiąc rata = chosenPayment (odsetki + ewentualny kapitał).
        // Jeżeli po ostatniej regularnej racie zostaje saldo > 0 — dodajemy osobny wiersz "balon".
        const schedule: Array<{ n: number | "balon"; payment: number; interest: number; principal: number; balance: number }> = [];
        let totalPaid = 0;
        let totalInterest = 0;
        {
          let balance = grossPrincipal;
          for (let n = 1; n <= months; n++) {
            const interest = balance * r;
            const principalPart = Math.max(0, Math.min(paymentExact - interest, balance));
            const payment = interest + principalPart;
            balance = Math.max(0, balance - principalPart);
            totalPaid += payment;
            totalInterest += interest;
            schedule.push({ n, payment, interest, principal: principalPart, balance });
          }
          if (balance > 0.5) {
            // Rata balonowa: spłata pozostałego kapitału (bez dodatkowych odsetek — naliczone już w racie #months).
            totalPaid += balance;
            schedule.push({ n: "balon", payment: balance, interest: 0, principal: balance, balance: 0 });
          }
        }
        const balloonAmount = schedule[schedule.length - 1]?.n === "balon" ? schedule[schedule.length - 1].principal : 0;
        const fig = {
          monthly: chosenPayment,
          balloon: balloonAmount,
          total: totalPaid,
          investorCompensation: totalInterest,
        };

        return (
          <section className="space-y-6 overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 via-background to-background p-5 shadow-[0_20px_60px_-20px_hsl(var(--accent)/0.35)] md:p-7">
            <div className="-mx-5 -mt-5 border-b border-accent/20 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-5 py-4 md:-mx-7 md:-mt-7 md:px-7 md:py-5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground shadow-md">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-accent">Wniosek przyjęty</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold">Kwota pożyczki</Label>
                <span className="text-2xl font-extrabold tabular-nums text-foreground">{formatPLN(amount)}</span>
              </div>
              <Slider gradient="good-bad" value={[amount]} min={20_000} max={1_000_000} step={5_000}
                onValueChange={(v) => setAmount(v[0] ?? amount)} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>20 000 zł</span><span>1 000 000 zł</span></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold">Proponowany okres spłaty</Label>
                <span className="text-2xl font-extrabold tabular-nums text-foreground">{months} mies.</span>
              </div>
              <Slider gradient="good-bad" value={[Math.min(Math.max(months, 12), maxMonths)]} min={12} max={maxMonths} step={1}
                onValueChange={(v) => setMonths(v[0] ?? months)} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>12 mies.</span><span>{maxMonths} mies.</span></div>
              {months <= 36 && (
                <label className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 cursor-pointer">
                  <Checkbox checked={canExtend} onCheckedChange={(v) => setCanExtend(v === true)} className="mt-0.5" />
                  <span className="text-xs text-foreground">
                    <span className="font-semibold">Możliwość przedłużenia pożyczki</span> — chcę mieć opcję wydłużenia okresu spłaty na zakończenie umowy.
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold">Proponowane wynagrodzenie inwestora (rocznie)</Label>
                <span className="text-2xl font-extrabold tabular-nums text-foreground">{annualRate}%</span>
              </div>
              <Slider gradient="bad-good" value={[annualRate]} min={15} max={50} step={0.5}
                onValueChange={(v) => { rateTouchedRef.current = true; setAnnualRate(v[0] ?? annualRate); }} />

              <div className="flex justify-between text-xs text-muted-foreground"><span>15%</span><span>50%</span></div>
              <p className="text-xs text-muted-foreground">
                Im wyższe wynagrodzenie inwestora, tym większa szansa na szybkie znalezienie inwestora dla Twojej pożyczki.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-semibold">Maksymalna rata miesięczna</Label>
                <span className="text-2xl font-extrabold tabular-nums text-foreground">
                  {effectiveMax > 0 ? formatPLN(effectiveMax) : "bez limitu"}
                </span>
              </div>
              <Slider
                gradient="bad-good"
                value={[effectiveMax > 0 ? effectiveMax : maxCap]}
                min={minCap}
                max={maxCap}
                step={50}
                onValueChange={(v) => setMaxPayment(v[0] ?? 0)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>min. {formatPLN(minCap)} <span className="opacity-70">(same odsetki)</span></span>
                <span>bez limitu</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ustaw niżej, jeśli chcesz mniejszą ratę miesięczną. Różnicę dopłacisz jednorazowo na koniec okresu.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/15 via-accent/5 to-background p-5 shadow-inner">
              <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Twoja miesięczna rata</p>
              <p className="mt-1 text-4xl font-black tabular-nums text-foreground md:text-5xl">{formatPLN(fig.monthly)}</p>
              <p className="mt-1 text-xs text-muted-foreground">przez {months} miesięcy{fig.balloon > 0 ? ` + rata balonowa ${formatPLN(fig.balloon)} na końcu` : ""}</p>

              <div className="mt-4 grid gap-3 border-t border-accent/20 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kwota pożyczki</p>
                  <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{formatPLN(amount)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Okres</p>
                  <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{months} mies.</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Średnie miesięczne wynagrodzenie inwestora</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{formatPLN(fig.investorCompensation / Math.max(1, months))}<span className="text-xs font-normal text-muted-foreground"> / mies.</span></p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prowizja Finance You ({FINANCEYOU_FEE_PCT}%)</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{formatPLN(financeYouFee)}</p>
                </div>
                <div className="sm:col-span-2 rounded-xl bg-background/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Łączna spłata (z prowizją FY)</p>
                  <p className="mt-0.5 text-xl font-extrabold tabular-nums text-foreground">{formatPLN(fig.total)}</p>
                </div>
              </div>
            </div>

            <details className="group rounded-2xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/50">
                <span>Harmonogram spłat ({months} rat)</span>
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="max-h-80 overflow-auto border-t border-border">
                <table className="w-full text-right text-xs tabular-nums">
                  <thead className="sticky top-0 bg-secondary/80 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Rata</th>
                      <th className="px-3 py-2 font-semibold">Odsetki</th>
                      <th className="px-3 py-2 font-semibold">Kapitał</th>
                      <th className="px-3 py-2 font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row, idx) => (
                      <tr key={idx} className={`border-t border-border/50 ${row.n === "balon" ? "bg-accent/5 font-semibold" : ""}`}>
                        <td className="px-3 py-1.5 text-left text-foreground">{row.n === "balon" ? "Balon" : row.n}</td>
                        <td className="px-3 py-1.5 font-semibold text-foreground">{formatPLN(row.payment)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{formatPLN(row.interest)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{formatPLN(row.principal)}</td>
                        <td className="px-3 py-1.5 text-foreground">{formatPLN(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-[11px] text-muted-foreground">
                Kapitał startowy: {formatPLN(grossPrincipal)} = kwota pożyczki {formatPLN(amount)} + prowizja Finance You {formatPLN(financeYouFee)} ({FINANCEYOU_FEE_PCT}%, kredytowana zgodnie z regulaminem).
              </p>
            </details>

            <p className="text-[11px] text-muted-foreground">
              Wyliczenia poglądowe przy wynagrodzeniu inwestora {annualRate}% rocznie i prowizji Finance You {FINANCEYOU_FEE_PCT}%. Ostateczne warunki ustalisz indywidualnie z inwestorem.
            </p>
          </section>
        );
      })()}

      {/* Step 2 — wniosek (kafelki → KW → dokumenty) */}
      {step === 2 && (() => {
        const secToShowcase: Record<string, string> = {
          mieszkanie: "mieszkanie",
          dom: "dom",
          lokal_uslugowy: "lokal",
          grunt_rolny: "rolna",
          dzialka_budowlana: "budowlana",
        };
        const selectedShowcaseKey = secToShowcase[secType] ?? null;
        const docPhotos = photos.filter((p) => p.bucket === "property_photos");

        return (
          <section className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-6">
            {/* Sub-step A: kafelki typu nieruchomości */}
            {step2Sub === "type" && (
              <PropertyTypesShowcase
                selectedKey={selectedShowcaseKey}
                onSelect={(key) => {
                  const mapped = PROPERTY_SHOWCASE_KEY_TO_SECURITY[key] as SecurityType | undefined;
                  if (mapped) setSecType(mapped);
                  setTypeSelected(true);
                }}
              />
            )}



            {/* Sub-step B: numer KW / akt własności */}
            {step2Sub === "kw" && (
              <div className="space-y-4">


                <div className="space-y-2">
                  <Label htmlFor="f-kw">Numer księgi wieczystej</Label>
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
                      <Button type="button" variant="outline" size="lg"
                        onClick={() => setExtraKwNumbers((cur) => cur.filter((_, i) => i !== idx))}
                        aria-label="Usuń numer KW">×</Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setExtraKwNumbers((cur) => [...cur, ""])}>
                      + Dodaj kolejny numer KW
                    </Button>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => deedInputRef.current?.click()}>
                      + Dodaj akt własności
                    </Button>
                    <input ref={deedInputRef} type="file" multiple accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => { addPhotos(e.target.files, "ownership_deed"); e.currentTarget.value = ""; }} />
                  </div>
                  {photos.some((p) => p.bucket === "ownership_deed") && (
                    <ul className="flex flex-wrap gap-2 pt-1">
                      {photos.filter((p) => p.bucket === "ownership_deed").map((p) => (
                        <li key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground">
                          <FileText className="h-3.5 w-3.5 text-accent" />
                          <span className="max-w-[160px] truncate">{p.name}</span>
                          <button type="button" onClick={() => removePhoto(p.id)}
                            className="grid h-5 w-5 place-items-center rounded-full bg-background text-sm font-bold text-foreground"
                            aria-label="Usuń akt własności">×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {BUILDING_TYPES.includes(secType) && (
                  <div className="space-y-2">
                    <Label htmlFor="f-area">
                      Powierzchnia użytkowa <span className="text-muted-foreground">(opcjonalnie)</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input id="f-area" type="number" inputMode="decimal" min={1} step="0.1"
                        value={usableArea} onChange={(e) => setUsableArea(e.target.value)}
                        placeholder="np. 58" className="max-w-[180px]" />
                      <span className="text-sm text-muted-foreground">m²</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-step C: zdjęcia / dokumenty */}
            {step2Sub === "docs" && (
              <div className="space-y-4">
                {(() => {
                  const hint = PROPERTY_DOCS_BY_SECURITY[secType];
                  if (!hint) return null;
                  const remaining = hint.docs.filter((d) => !/ksi[ęe]gi wieczystej|numer kw|powierzchnia u[żz]ytkowa/i.test(d));
                  if (remaining.length === 0) return null;
                  return (
                    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-accent">
                        Co jeszcze przygotować — {hint.title}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {remaining.map((d) => (
                          <li key={d} className="flex items-start gap-2 text-sm text-foreground">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                <PhotoBucket
                  label="Zdjęcia i dokumenty nieruchomości"
                  hint="Dodaj zdjęcia z zewnątrz i wewnątrz, dokumenty (np. wypis z rejestru gruntów, MPZP, warunki zabudowy). Akceptujemy JPG, PNG, PDF — wiele plików naraz."
                  bucket="property_photos"
                  photos={photos}
                  onAdd={addPhotos}
                  onRemove={removePhoto}
                />

                {docPhotos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Dodano {docPhotos.length} {docPhotos.length === 1 ? "plik" : docPhotos.length < 5 ? "pliki" : "plików"}.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* Nawigacja */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-card md:p-4">
        {(step > 1 || (step === 2 && step2Sub !== "type")) && (
          <Button type="button" variant="outline" size="lg" onClick={goBack} disabled={submitting}>
            <ChevronLeft className="mr-1 h-5 w-5" /> Wstecz
          </Button>
        )}
        {step === 1 && (
          <Button type="button" variant="cta" size="lg" onClick={goNext} className="ml-auto flex-1 text-base md:flex-none">
            Dalej <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        )}
        {step === 2 && step2Sub === "type" && (
          <Button type="button" variant="cta" size="lg" onClick={goNext} aria-disabled={!typeSelected} className={`ml-auto flex-1 text-base md:flex-none ${!typeSelected ? "opacity-60" : ""}`}>
            Dalej <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        )}
        {step === 2 && step2Sub === "kw" && (
          <Button type="button" variant="cta" size="lg" onClick={goNext} aria-disabled={!kwOrDeedOk} className={`ml-auto flex-1 text-base md:flex-none ${!kwOrDeedOk ? "opacity-60" : ""}`}>
            Dalej <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        )}

        {step === 2 && step2Sub === "docs" && (
          <Button type="submit" variant="cta" size="lg" disabled={submitting} className="ml-auto flex-1 text-base md:flex-none">
            {submitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek…</>
            ) : (
              <><Send className="mr-2 h-5 w-5" /> Przejdź do oferty</>
            )}
          </Button>
        )}
        {step === 3 && (
          <Button type="submit" variant="cta" size="lg" disabled={submitting} className="ml-auto flex-1 text-base md:flex-none">
            {submitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek…</>
            ) : (
              <><Send className="mr-2 h-5 w-5" /> Złóż ofertę</>
            )}
          </Button>
        )}
      </div>
      {(step === 2 || step === 3) && (
        <p className="text-center text-[11px] text-muted-foreground">
          Złożenie wniosku jest darmowe i nie zobowiązuje. Akceptujesz politykę prywatności Finance You.
        </p>
      )}
    </form>
  );
}

