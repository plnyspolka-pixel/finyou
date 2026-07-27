import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Upload,
  Camera,
  FileText,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { FancyShell } from "@/components/landing/fancy-shell";
import { formatPLN, type SecurityType } from "@/lib/loan-math";
import { submitLandingLoanApplication } from "@/lib/landing-application.functions";
import { uploadLandingAttachment } from "@/lib/uploads/landing-upload.functions";
import { compressImageIfNeeded, fileToDataUrl } from "@/lib/uploads/client-image-compress";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/fb-pixel";

const INPUT_CLASS =
  "h-12 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40";

const PROPERTY_TYPES: Array<{ value: SecurityType; label: string }> = [
  { value: "mieszkanie", label: "Mieszkanie" },
  { value: "dom", label: "Dom" },
  { value: "lokal_uslugowy", label: "Lokal usługowy" },
  { value: "dzialka_budowlana", label: "Działka budowlana" },
  { value: "grunt_rolny", label: "Grunt rolny" },
  { value: "inna", label: "Inna" },
];

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  file: File;
  status: "uploading" | "ready" | "error";
  storagePath?: string;
  uploadedMime?: string;
  uploadedName?: string;
  errorMsg?: string;
};

function openClientPanel(path = "/klient") {
  try {
    const url = `${window.location.origin}${path}`;
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch {
    window.open(`${window.location.origin}${path}`, "_top");
  }
}

// 5 kroków (bez wyświetlania numeracji): parametry, dane, nieruchomość+KW, zdjęcia, wyślij.
const STEPS = ["params", "contact", "property", "photos", "consent"] as const;
type StepKey = (typeof STEPS)[number];

export function EmbedApplicationForm() {
  const submitFn = useServerFn(submitLandingLoanApplication);

  const [step, setStep] = useState(0);

  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(36);
  const [secType, setSecType] = useState<SecurityType>("mieszkanie");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [kwNumber, setKwNumber] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const uploadFn = useServerFn(uploadLandingAttachment);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const uploadOne = async (id: string, file: File) => {
    try {
      const { blob, mimeType, fileName } = await compressImageIfNeeded(file);
      const dataUrl = await fileToDataUrl(blob);
      const res = await uploadFn({
        data: { dataUrl, mimeType, fileName, bucket: "property_photos" },
      });
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
      console.error("[embed-form] upload failed", e);
      setPhotos((cur) =>
        cur.map((p) =>
          p.id === id ? { ...p, status: "error", errorMsg: e?.message ?? "Błąd wysyłki" } : p,
        ),
      );
    }
  };

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const next: PhotoItem[] = Array.from(files).map((f) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${f.name}`,
      name: f.name,
      type: f.type,
      url: URL.createObjectURL(f),
      file: f,
      status: "uploading" as const,
    }));
    setPhotos((cur) => [...cur, ...next]);
    // Uruchom upload w tle dla każdego pliku niezależnie — nie blokujemy UI.
    for (const item of next) void uploadOne(item.id, item.file);
  };

  const retryUpload = (id: string) => {
    setPhotos((cur) =>
      cur.map((p) => (p.id === id ? { ...p, status: "uploading", errorMsg: undefined } : p)),
    );
    const target = photos.find((p) => p.id === id);
    if (target) void uploadOne(id, target.file);
  };

  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const r = cur.find((p) => p.id === id);
      if (r) URL.revokeObjectURL(r.url);
      return cur.filter((p) => p.id !== id);
    });
  };

  const contactValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phone.trim().replace(/\D/g, "").length >= 9 &&
    /.+@.+\..+/.test(email.trim());

  const currentStep: StepKey = STEPS[step];
  const allPhotosReady = photos.length > 0 && photos.every((p) => p.status === "ready");
  const anyUploading = photos.some((p) => p.status === "uploading");

  const canAdvance = (() => {
    switch (currentStep) {
      case "params":
        return amount >= 20_000 && months >= 12;
      case "contact":
        return contactValid;
      case "property":
        return !!secType && kwNumber.trim().length > 0;
      case "photos":
        return allPhotosReady;
      case "consent":
        return consent && allPhotosReady;
      default:
        return false;
    }
  })();

  const isLast = step === STEPS.length - 1;

  const onSubmit = async () => {
    if (!consent) {
      toast.error("Zaakceptuj politykę prywatności i regulamin.");
      return;
    }
    if (!allPhotosReady) {
      toast.error(
        anyUploading ? "Poczekaj — trwa wysyłanie zdjęć." : "Nie wszystkie pliki zostały wysłane.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const photoPayload = photos
        .filter((p) => p.storagePath)
        .map((p) => ({
          storagePath: p.storagePath!,
          mimeType: p.uploadedMime ?? p.type ?? "application/octet-stream",
          fileName: p.uploadedName ?? p.name,
          bucket: "property_photos",
        }));
      const res = await submitFn({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          loan_amount: amount,
          preferred_period_months: months,
          property_type: secType,
          land_register_number: kwNumber.trim(),
          photos: photoPayload,
          source: "embed_wniosek",
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
          toast.success("Wniosek wysłany. Przenosimy Cię do panelu klienta.");
          openClientPanel("/klient");
          return;
        }
      }
      toast.success("Wniosek wysłany! Sprawdź e-mail — wysłaliśmy dane do logowania.");
      openClientPanel("/klient");
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się wysłać wniosku. Spróbuj jeszcze raz.");
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      void onSubmit();
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        goNext();
      }}
      className="space-y-4"
    >
      <FancyShell>
        <div className="space-y-6">
          {/* Progress bar (bez etykiet i numeracji kroków) */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                background:
                  "linear-gradient(to right, hsl(199 89% 60%), hsl(217 91% 60%), hsl(263 78% 62%))",
              }}
            />
          </div>

          <div className="min-h-[220px]">
            {currentStep === "params" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-sm font-semibold text-white">Kwota pożyczki</Label>
                    <span className="text-2xl font-extrabold tabular-nums text-white">
                      {formatPLN(amount)}
                    </span>
                  </div>
                  <Slider
                    gradient="brand"
                    value={[amount]}
                    min={20_000}
                    max={1_000_000}
                    step={5_000}
                    onValueChange={(v) => setAmount(v[0] ?? amount)}
                  />
                  <div className="flex justify-between text-xs text-white/70">
                    <span>20 000 zł</span>
                    <span>1 000 000 zł</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-sm font-semibold text-white">Okres spłaty</Label>
                    <span className="text-2xl font-extrabold tabular-nums text-white">
                      {months} mies.
                    </span>
                  </div>
                  <Slider
                    gradient="brand"
                    value={[months]}
                    min={12}
                    max={72}
                    step={1}
                    onValueChange={(v) => setMonths(v[0] ?? months)}
                  />
                  <div className="flex justify-between text-xs text-white/70">
                    <span>12 mies.</span>
                    <span>72 mies.</span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === "contact" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white">Imię *</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Anna"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Nazwisko *</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Kowalska"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Telefon *</Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+48 600 000 000"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">E-mail *</Label>
                  <Input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="anna@example.com"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            )}

            {currentStep === "property" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-white">Typ nieruchomości *</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PROPERTY_TYPES.map((p) => {
                      const active = secType === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setSecType(p.value)}
                          className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold backdrop-blur-sm transition ${
                            active
                              ? "border-white bg-white text-foreground shadow-lg"
                              : "border-white/30 bg-white/10 text-white hover:border-white/70 hover:bg-white/20"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Numer księgi wieczystej *</Label>
                  <Input
                    value={kwNumber}
                    onChange={(e) => setKwNumber(e.target.value)}
                    placeholder="WA1M/00000000/0"
                    className={INPUT_CLASS}
                  />
                  <p className="text-xs text-white/70">
                    Format: kod sądu / numer / cyfra kontrolna.
                  </p>
                </div>
              </div>
            )}

            {currentStep === "photos" && (
              <div className="space-y-3">
                <Label className="text-white">Zdjęcia nieruchomości *</Label>
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
                    addPhotos(e.target.files);
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
                    addPhotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map((p) => (
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
                            onClick={() => retryUpload(p.id)}
                            className="absolute inset-0 grid place-items-center bg-red-600/70 text-[10px] font-semibold text-white"
                            title={p.errorMsg ?? "Błąd — kliknij, aby ponowić"}
                          >
                            <AlertCircle className="h-5 w-5" />
                            <span className="mt-1">Ponów</span>
                          </button>
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
                {photos.length > 0 && (
                  <p className="text-xs text-white/70">
                    {allPhotosReady
                      ? `Wysłano ${photos.length} ${photos.length === 1 ? "plik" : "plików"}.`
                      : anyUploading
                        ? "Wysyłanie w tle — możesz dodawać kolejne pliki."
                        : "Kliknij ikonę alertu, aby ponowić upload."}
                  </p>
                )}
              </div>
            )}

            {currentStep === "consent" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/25 bg-white/10 p-4 text-sm text-white backdrop-blur-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-white/70">Kwota</span>
                    <span className="font-semibold">{formatPLN(amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Okres</span>
                    <span className="font-semibold">{months} mies.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Nieruchomość</span>
                    <span className="font-semibold">
                      {PROPERTY_TYPES.find((p) => p.value === secType)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">KW</span>
                    <span className="font-semibold">{kwNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Zdjęcia</span>
                    <span className="font-semibold">{photos.length}</span>
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/25 bg-white/10 p-3 text-xs text-white backdrop-blur-sm">
                  <Checkbox
                    checked={consent}
                    onCheckedChange={(v) => setConsent(v === true)}
                    className="mt-0.5 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground"
                  />
                  <span>
                    Akceptuję politykę prywatności i regulamin serwisu Finance You oraz zgadzam się
                    na kontakt w sprawie mojego wniosku.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Nav */}
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={goBack}
                disabled={submitting}
                className="h-14 rounded-xl border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> Wstecz
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={!canAdvance || submitting}
              className="h-14 flex-1 rounded-xl bg-white text-base font-bold text-foreground hover:bg-white/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłanie…
                </>
              ) : isLast ? (
                <>
                  <Send className="mr-2 h-5 w-5" /> Wyślij wniosek
                </>
              ) : (
                <>
                  Dalej <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </FancyShell>
    </form>
  );
}
