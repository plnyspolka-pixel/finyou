import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send, Upload, Camera, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { FancyShell } from "@/components/landing/fancy-shell";
import { formatPLN, type SecurityType } from "@/lib/loan-math";
import { submitLandingLoanApplication } from "@/lib/landing-application.functions";
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
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/** Otwórz /klient na najwyższym poziomie (nie w iframe), żeby klient trafił do panelu. */
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

export function EmbedApplicationForm() {
  const submitFn = useServerFn(submitLandingLoanApplication);

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

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const next: PhotoItem[] = Array.from(files).map((f) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${f.name}`,
      name: f.name,
      type: f.type,
      url: URL.createObjectURL(f),
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

  const contactValid =
    firstName.trim() &&
    lastName.trim() &&
    phone.trim().replace(/\D/g, "").length >= 9 &&
    /.+@.+\..+/.test(email.trim());

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactValid) {
      toast.error("Uzupełnij imię, nazwisko, telefon i e-mail.");
      return;
    }
    if (!kwNumber.trim()) {
      toast.error("Podaj numer księgi wieczystej.");
      return;
    }
    if (photos.length === 0) {
      toast.error("Dodaj przynajmniej jedno zdjęcie nieruchomości.");
      return;
    }
    if (!consent) {
      toast.error("Zaakceptuj politykę prywatności i regulamin.");
      return;
    }

    setSubmitting(true);
    try {
      const photoPayload = await Promise.all(
        photos.map(async (p) => ({
          dataUrl: await readAsDataUrl(p.file),
          mimeType: p.type || "application/octet-stream",
          fileName: p.name,
          bucket: "property_photos",
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
          land_register_number: kwNumber.trim(),
          photos: photoPayload,
          source: "embed_wniosek",
        },
      });
      if (!res?.ok) throw new Error("submit failed");

      void trackEvent(
        "CompleteRegistration",
        { value: amount, currency: "PLN", content_category: secType, loan_period_months: months },
        { email: email.trim(), phone: phone.trim(), firstName: firstName.trim(), lastName: lastName.trim() },
      );

      if (res.token_hash) {
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: "magiclink" });
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FancyShell>
        <div className="space-y-6">
          {/* Kwota */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold text-white">Kwota pożyczki</Label>
              <span className="text-2xl font-extrabold tabular-nums text-white">{formatPLN(amount)}</span>
            </div>
            <Slider
              gradient="good-bad"
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

          {/* Okres */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-semibold text-white">Okres spłaty</Label>
              <span className="text-2xl font-extrabold tabular-nums text-white">{months} mies.</span>
            </div>
            <Slider
              gradient="good-bad"
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

          {/* Kontakt */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white">Imię *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Anna" className={INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Nazwisko *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Kowalska" className={INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Telefon *</Label>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" className={INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label className="text-white">E-mail *</Label>
              <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="anna@example.com" className={INPUT_CLASS} />
            </div>
          </div>

          {/* Nieruchomość */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white">Typ nieruchomości *</Label>
              <select
                value={secType}
                onChange={(e) => setSecType(e.target.value as SecurityType)}
                className={`${INPUT_CLASS} w-full px-3`}
              >
                {PROPERTY_TYPES.map((p) => (
                  <option key={p.value} value={p.value} className="text-foreground">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-white">Numer księgi wieczystej *</Label>
              <Input value={kwNumber} onChange={(e) => setKwNumber(e.target.value)} placeholder="WA1M/00000000/0" className={INPUT_CLASS} />
            </div>
          </div>

          {/* Zdjęcia */}
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
                  <div key={p.id} className="relative overflow-hidden rounded-md border border-white/30 bg-white/10">
                    {p.type.startsWith("image/") ? (
                      <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
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

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/25 bg-white/10 p-3 text-xs text-white backdrop-blur-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5 border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-foreground"
            />
            <span>
              Akceptuję politykę prywatności i regulamin serwisu Finance You oraz zgadzam się na kontakt w sprawie mojego wniosku.
            </span>
          </label>

          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className="w-full h-14 text-base font-bold rounded-xl bg-white text-foreground hover:bg-white/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłanie…
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" /> Wyślij wniosek
              </>
            )}
          </Button>
        </div>
      </FancyShell>
    </form>
  );
}
