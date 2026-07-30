import { useMemo, useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Upload, Camera, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

import {
  PropertyTypesShowcase,
  PROPERTY_SHOWCASE_KEY_TO_SECURITY,
  PROPERTY_DOCS_BY_SECURITY,
} from "@/components/landing/property-types-showcase";
import { OfferCalculatorPanel } from "@/components/landing/offer-calculator-panel";
import {
  computeLoanFigures,
  formatPLN,
  securityTypeLabels,
  type SecurityType,
} from "@/lib/loan-math";
import {
  submitLandingLoanApplication,
  submitBrokerLoanApplication,
} from "@/lib/landing-application.functions";
import { uploadLandingAttachment } from "@/lib/uploads/landing-upload.functions";
import { compressImageIfNeeded, fileToDataUrl } from "@/lib/uploads/client-image-compress";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/fb-pixel";
import { FancyShell } from "@/components/landing/fancy-shell";

const FANCY_INPUT_CLASS =
  "h-12 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40";

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  bucket: string;
  file: File;
  status: "uploading" | "ready" | "error";
  storagePath?: string;
  uploadedMime?: string;
  uploadedName?: string;
  errorMsg?: string;
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
  onRetry,
}: {
  label: string;
  hint?: string;
  bucket: string;
  photos: PhotoItem[];
  onAdd: (files: FileList | null, bucket: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const own = photos.filter((p) => p.bucket === bucket);
  return (
    <div className="space-y-3">
      <Label className="text-base font-bold uppercase tracking-[0.14em] text-white drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
        {label}
      </Label>
      {hint && <p className="text-xs leading-relaxed text-white/75">{hint}</p>}
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
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          onAdd(e.target.files, bucket);
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
          onAdd(e.target.files, bucket);
          e.currentTarget.value = "";
        }}
      />
      {own.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {own.map((p) => (
            <div
              key={p.id}
              className="relative overflow-hidden rounded-md border border-white/30 bg-white/10"
            >
              {p.type.startsWith("image/") ? (
                <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-square place-items-center bg-white/10">
                  <FileText className="h-6 w-6 text-white/80" />
                </div>
              )}
              {p.status === "uploading" && (
                <div className="absolute inset-0 grid place-items-center bg-black/55 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {p.status === "ready" && (
                <div className="absolute bottom-1 left-1 rounded-full bg-emerald-500/90 p-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              {p.status === "error" && (
                <button
                  type="button"
                  onClick={() => onRetry(p.id)}
                  className="absolute inset-0 grid place-items-center bg-red-600/70 text-[10px] font-semibold text-white"
                  title={p.errorMsg ?? "Błąd — kliknij, aby ponowić"}
                >
                  <AlertCircle className="h-5 w-5" />
                  <span className="mt-1">Ponów</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(p.id)}
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
  );
}

const STEPS = [
  { id: 1, label: "Kontakt" },
  { id: 2, label: "Ścieżka" },
  { id: 3, label: "Wniosek i kalkulator" },
] as const;

export type PrefilledContact = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type BrokerMode = {
  assignedOperatorId: string;
  redirectTo?: string;
  sourceLabel?: string;
};

export function SinglePageApplicationForm({
  prefilledContact,
  brokerMode,
}: { prefilledContact?: PrefilledContact; brokerMode?: BrokerMode } = {}) {
  const landingSubmitFn = useServerFn(submitLandingLoanApplication);
  const brokerSubmitFn = useServerFn(submitBrokerLoanApplication);
  const navigate = useNavigate();

  const skipContact = Boolean(prefilledContact?.email) && !brokerMode;
  const isBroker = Boolean(brokerMode);
  const submitFn = isBroker ? brokerSubmitFn : landingSubmitFn;
  const [limitModalOpen, setLimitModalOpen] = useState(false);

  const [secType, setSecType] = useState<SecurityType>("mieszkanie");
  const [typeSelected, setTypeSelected] = useState(false);

  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(36);
  const [maxPayment, setMaxPayment] = useState(0);
  const [annualRate, setAnnualRate] = useState(30);
  const rateTouchedRef = useRef(false);

  // Max okres spłaty maleje wraz z kwotą:
  // ≤ 400 000 zł → 72 mies., powyżej liniowo z 36 mies. (>400k) do 12 mies. (1 000 000 zł)
  const maxMonths = useMemo(() => {
    if (amount <= 400_000) return 72;
    const t = Math.min(1, Math.max(0, (amount - 400_000) / (1_000_000 - 400_000)));
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

  const [firstName, setFirstName] = useState(prefilledContact?.firstName ?? "");
  const [lastName, setLastName] = useState(prefilledContact?.lastName ?? "");
  const [phone, setPhone] = useState(prefilledContact?.phone ?? "");
  const [email, setEmail] = useState(prefilledContact?.email ?? "");
  const [kwNumber, setKwNumber] = useState("");
  const [extraKwNumbers, setExtraKwNumbers] = useState<string[]>([]);
  const [usableArea, setUsableArea] = useState("");
  const [city, setCity] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [consentPrivacy, setConsentPrivacy] = useState(skipContact || isBroker);
  const [consentTerms, setConsentTerms] = useState(skipContact || isBroker);
  const [consentMarketing, setConsentMarketing] = useState(skipContact || isBroker);
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

  const uploadFn = useServerFn(uploadLandingAttachment);

  const uploadOne = async (id: string, file: File, bucket: string) => {
    try {
      const { blob, mimeType, fileName } = await compressImageIfNeeded(file);
      const dataUrl = await fileToDataUrl(blob);
      const res = await uploadFn({ data: { dataUrl, mimeType, fileName, bucket } });
      setPhotos((cur) =>
        cur.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "ready",
                storagePath: res.path,
                uploadedMime: mimeType,
                uploadedName: fileName,
              }
            : p,
        ),
      );
    } catch (e: any) {
      console.error("[landing-form] upload failed", e);
      setPhotos((cur) =>
        cur.map((p) =>
          p.id === id ? { ...p, status: "error", errorMsg: e?.message ?? "Błąd wysyłki" } : p,
        ),
      );
    }
  };

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
      status: "uploading" as const,
    }));
    setPhotos((cur) => [...cur, ...next]);
    for (const item of next) void uploadOne(item.id, item.file, bucket);
  };

  const retryUpload = (id: string) => {
    setPhotos((cur) =>
      cur.map((p) => (p.id === id ? { ...p, status: "uploading", errorMsg: undefined } : p)),
    );
    const item = photos.find((p) => p.id === id);
    if (item) void uploadOne(id, item.file, item.bucket);
  };

  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const r = cur.find((p) => p.id === id);
      if (r) URL.revokeObjectURL(r.url);
      return cur.filter((p) => p.id !== id);
    });
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

  // Allow external CTAs (e.g. hero button) to scroll to the form
  useEffect(() => {
    const handler = () => {
      document
        .getElementById("financeyou-application-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("financeyou:open-offer", handler);
    return () => window.removeEventListener("financeyou:open-offer", handler);
  }, []);

  const hasPropertyPhotos = photos.some((p) => p.bucket === "property_photos");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!skipContact) {
      if (!contactValid) {
        toast.error("Uzupełnij imię, nazwisko, telefon i e-mail.");
        return;
      }
      if (!isBroker && (!consentPrivacy || !consentTerms || !consentMarketing)) {
        toast.error("Zaakceptuj politykę prywatności i regulamin serwisu.");
        return;
      }
      fireLead();
    }

    if (!typeSelected) {
      toast.error("Wybierz typ nieruchomości.");
      return;
    }
    if (!kwOrDeedOk) {
      toast.error("Podaj numer księgi wieczystej lub dołącz akt własności.");
      return;
    }
    if (!hasPropertyPhotos) {
      toast.error(
        "Dodaj przynajmniej jeden plik (zdjęcie lub dokument nieruchomości), aby przejść do oferty.",
      );
      return;
    }
    if (photos.some((p) => p.status === "uploading")) {
      toast.error("Poczekaj — trwa wysyłanie plików w tle.");
      return;
    }
    if (photos.some((p) => p.status === "error")) {
      toast.error("Niektóre pliki nie zostały wysłane — kliknij ikonę, aby ponowić.");
      return;
    }

    setSubmitting(true);
    try {
      const photoPayload = await Promise.all(
        photos.map(async (p) =>
          p.storagePath
            ? {
                storagePath: p.storagePath,
                mimeType: p.uploadedMime || p.type || "application/octet-stream",
                fileName: p.uploadedName || p.name,
                bucket: p.bucket,
              }
            : {
                dataUrl: await readAsDataUrl(p.file),
                mimeType: p.type || "application/octet-stream",
                fileName: p.name,
                bucket: p.bucket,
              },
        ),
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
          source: brokerMode?.sourceLabel ?? "landing_single_page",
          assigned_operator_id: brokerMode?.assignedOperatorId ?? null,
        },
      });
      if (!res?.ok) {
        if ((res as { code?: string })?.code === "BROKER_OFFER_LIMIT") {
          setLimitModalOpen(true);
          return;
        }
        throw new Error("submit failed");
      }
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
      if (brokerMode) {
        toast.success("Wniosek utworzony i przypisany do Ciebie.");
        void navigate({ to: brokerMode.redirectTo ?? "/posrednik/wnioski" });
      } else {
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
      }
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się wysłać wniosku. Spróbuj jeszcze raz.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Dane kontaktowe */}
      {!skipContact && (
        <FancyShell>
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="f-fn" className="text-white">
                  Imię *
                </Label>
                <Input
                  id="f-fn"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Anna"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-ln" className="text-white">
                  Nazwisko *
                </Label>
                <Input
                  id="f-ln"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Kowalska"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-ph" className="text-white">
                  Telefon *
                </Label>
                <Input
                  id="f-ph"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+48 600 000 000"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-em" className="text-white">
                  E-mail *
                </Label>
                <Input
                  id="f-em"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="anna@example.com"
                  className={FANCY_INPUT_CLASS}
                />
              </div>
            </div>

            {!isBroker && (
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
                    Finance You. Mogę ją wycofać w każdej chwili. *
                  </span>
                </label>
              </div>
            )}
          </div>
        </FancyShell>
      )}

      {/* Wniosek — typ → KW → dokumenty → kalkulator */}
      {(() => {
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
          <div className="space-y-6">
            {/* A: typ nieruchomości */}
            <FancyShell>
              <PropertyTypesShowcase
                selectedKey={selectedShowcaseKey}
                onSelect={(key) => {
                  const mapped = PROPERTY_SHOWCASE_KEY_TO_SECURITY[key] as SecurityType | undefined;
                  if (mapped) setSecType(mapped);
                  setTypeSelected(true);
                }}
              />
              <div className="mt-6 space-y-2">
                <Label
                  htmlFor="f-city"
                  className="text-base font-bold uppercase tracking-[0.14em] text-white"
                >
                  Miejscowość nieruchomości
                </Label>
                <Input
                  id="f-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="np. Warszawa"
                  className={FANCY_INPUT_CLASS}
                />
                <p className="text-xs text-white/75">
                  Miasto / wieś, w której znajduje się nieruchomość — pomaga inwestorom ocenić
                  lokalizację.
                </p>
              </div>
            </FancyShell>

            {/* B: numer KW / akt własności */}
            <FancyShell>
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                    <FileText className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <Label
                    htmlFor="f-kw"
                    className="text-base font-bold uppercase tracking-[0.18em] text-white sm:text-lg cursor-pointer"
                  >
                    Numer księgi wieczystej
                  </Label>
                </div>
                <Input
                  id="f-kw"
                  value={kwNumber}
                  onChange={(e) => setKwNumber(e.target.value.toUpperCase())}
                  placeholder="np. WA1M/00123456/7"
                  className="h-14 rounded-2xl border-2 border-white/30 bg-white/10 pl-4 pr-4 font-mono text-lg font-bold tracking-wider text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40"
                />
                <p className="text-xs text-white/75">
                  Wystarczy numer KW LUB dołączony akt własności. Numer sprawdzisz w aplikacji
                  mObywatel.
                </p>

                {extraKwNumbers.map((val, idx) => (
                  <div key={idx} className="flex gap-2 pt-1">
                    <Input
                      value={val}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase();
                        setExtraKwNumbers((cur) => cur.map((x, i) => (i === idx ? v : x)));
                      }}
                      placeholder={`Dodatkowy numer KW #${idx + 2}`}
                      className={`${FANCY_INPUT_CLASS} font-mono text-lg tracking-wider`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setExtraKwNumbers((cur) => cur.filter((_, i) => i !== idx))}
                      className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
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
                          className="flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="max-w-[160px] truncate">{p.name}</span>
                          <button
                            type="button"
                            onClick={() => removePhoto(p.id)}
                            className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-sm font-bold text-foreground"
                            aria-label="Usuń akt własności"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                  </ul>
                )}

                {BUILDING_TYPES.includes(secType) && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="f-area" className="text-white">
                      Powierzchnia użytkowa <span className="text-white/60">(opcjonalnie)</span>
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
                        className={`${FANCY_INPUT_CLASS} max-w-[180px]`}
                      />
                      <span className="text-sm text-white/75">m²</span>
                    </div>
                  </div>
                )}
              </div>
            </FancyShell>

            {/* C: zdjęcia / dokumenty */}
            <FancyShell>
              <div className="space-y-4">
                {(() => {
                  const hint = PROPERTY_DOCS_BY_SECURITY[secType];
                  if (!hint) return null;
                  const remaining = hint.docs.filter(
                    (d) => !/ksi[ęe]gi wieczystej|numer kw|powierzchnia u[żz]ytkowa/i.test(d),
                  );
                  if (remaining.length === 0) return null;
                  return (
                    <div className="rounded-xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-white">
                        Co jeszcze przygotować — {hint.title}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {remaining.map((d) => (
                          <li key={d} className="flex items-start gap-2 text-sm text-white/90">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                <PhotoBucket
                  label="Zdjęcia i dokumenty nieruchomości"
                  bucket="property_photos"
                  photos={photos}
                  onAdd={addPhotos}
                  onRemove={removePhoto}
                  onRetry={retryUpload}
                />

                {docPhotos.length > 0 && (
                  <p className="text-xs text-white/75">
                    Dodano {docPhotos.length}{" "}
                    {docPhotos.length === 1 ? "plik" : docPhotos.length < 5 ? "pliki" : "plików"}.
                  </p>
                )}
              </div>
            </FancyShell>

            {/* D: kalkulator raty (ukryty dla pośrednika) — zablokowany do czasu uzupełnienia typu, KW/aktu i zdjęć */}
            {!isBroker && (
              <OfferCalculatorPanel
                amount={amount}
                setAmount={setAmount}
                months={months}
                setMonths={setMonths}
                maxMonths={maxMonths}
                annualRate={annualRate}
                setAnnualRate={setAnnualRate}
                rateTouchedRef={rateTouchedRef}
                maxPayment={maxPayment}
                setMaxPayment={setMaxPayment}
                headerLabel="Kalkulator raty"
                locked={!typeSelected || !kwOrDeedOk || !hasPropertyPhotos}
                lockedMessage="Wybierz typ nieruchomości, podaj numer KW (lub dodaj akt własności) oraz wgraj zdjęcia — wtedy odblokujemy kalkulator raty."
              />
            )}
          </div>
        );
      })()}

      {/* Nawigacja */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-card md:p-4">
        <Button
          type="submit"
          variant="cta"
          size="lg"
          disabled={submitting}
          aria-disabled={!typeSelected || !kwOrDeedOk || !hasPropertyPhotos}
          className={`ml-auto flex-1 text-base md:flex-none ${!typeSelected || !kwOrDeedOk || !hasPropertyPhotos ? "opacity-60" : ""}`}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek…
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" /> Złóż wniosek
            </>
          )}
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Złożenie wniosku jest darmowe i nie zobowiązuje. Akceptujesz politykę prywatności Finance
        You.
      </p>

      {/* Limit 5 ofert na darmowym koncie pośrednika (egzekwowany w bazie —
          modal tylko komunikuje wynik). */}
      <Dialog open={limitModalOpen} onOpenChange={setLimitModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limit ofert darmowego konta</DialogTitle>
            <DialogDescription>
              W darmowym koncie możesz posiadać maksymalnie 5 ofert jednocześnie. Usuń jedną z
              istniejących ofert albo wykup pełny dostęp.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setLimitModalOpen(false);
                void navigate({ to: "/posrednik/wnioski" });
              }}
            >
              Zobacz moje oferty
            </Button>
            <Button
              onClick={() => {
                setLimitModalOpen(false);
                void navigate({ to: "/posrednik/abonament" });
              }}
            >
              Wykup pełny dostęp
            </Button>
            <Button variant="ghost" onClick={() => setLimitModalOpen(false)}>
              Anuluj
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
