import { useMemo, useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Upload, Camera, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SecurityTypePicker } from "@/components/security-type-picker";
import {
  formatPLN,
  computeLoanFigures,
  securityTypeLabels,
  type SecurityType,
} from "@/lib/loan-math";
import { REQUIREMENTS_BY_TYPE } from "@/lib/property-documents";
import { submitLandingLoanApplication } from "@/lib/landing-application.functions";
import { trackEvent } from "@/lib/fb-pixel";

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  bucket: string;
  file: File;
};

const SEC_TO_PROP: Record<SecurityType, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  lokal_uslugowy: "lokal_uslugowy",
  dzialka_budowlana: "dzialka_budowlana",
  grunt_rolny: "grunt_rolny",
  inna: "inna",
};

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
  bucket,
  photos,
  onAdd,
  onRemove,
}: {
  label: string;
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/50 px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/10"
        >
          <Upload className="h-4 w-4 text-accent" /> Dodaj
        </button>
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-accent bg-accent/10 px-3 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/20 sm:hidden"
        >
          <Camera className="h-4 w-4" /> Zdjęcie
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

export function SinglePageApplicationForm() {
  const submitFn = useServerFn(submitLandingLoanApplication);
  const navigate = useNavigate();

  const [secType, setSecType] = useState<SecurityType>("mieszkanie");
  const [amount, setAmount] = useState(200_000);
  const [months, setMonths] = useState(24);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [kwNumber, setKwNumber] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const leadFiredRef = useRef(false);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  // Fire Meta "Lead" (Przesłanie zgłoszenia) once contact data is complete
  useEffect(() => {
    if (leadFiredRef.current) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = phone.trim();
    const em = email.trim();
    if (!fn || !ln || ph.length < 9 || !/.+@.+\..+/.test(em)) return;
    leadFiredRef.current = true;
    void trackEvent(
      "Lead",
      {
        value: amount,
        currency: "PLN",
        content_category: secType,
        loan_period_months: months,
      },
      { email: em, phone: ph, firstName: fn, lastName: ln },
    );
  }, [firstName, lastName, phone, email, amount, months, secType]);

  const figures = useMemo(
    () => computeLoanFigures({ amount, annualRatePercent: 24, months }),
    [amount, months],
  );

  const reqs = REQUIREMENTS_BY_TYPE[SEC_TO_PROP[secType]] ?? REQUIREMENTS_BY_TYPE.inna;
  const photoBuckets = useMemo(() => {
    const out: { kind: string; label: string }[] = [];
    for (const r of reqs) {
      if (r.kind === "kw_number" || r.kind === "usable_area") continue;
      out.push({ kind: r.kind, label: r.label });
    }
    return out;
  }, [reqs]);

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { toast.error("Podaj imię i nazwisko"); return; }
    if (!phone.trim()) { toast.error("Podaj numer telefonu"); return; }
    if (!email.trim()) { toast.error("Podaj adres e-mail"); return; }
    if (!kwNumber.trim() && photos.length === 0) {
      toast.error("Podaj numer KW lub dołącz zdjęcia/dokumenty nieruchomości");
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
          land_register_number: kwNumber.trim() || null,
          photos: photoPayload,
          source: "landing_single_page",
        },
      });
      if (!res?.ok) throw new Error("submit failed");
      void trackEvent(
        "CompleteRegistration",
        {
          value: amount,
          currency: "PLN",
          content_category: secType,
          loan_period_months: months,
          has_kw: Boolean(kwNumber.trim()),
          photos_count: photos.length,
        },
        {
          email: email.trim(),
          phone: phone.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      );
      toast.success("Wniosek wysłany! Skontaktujemy się do 24 h.");
      void navigate({ to: "/wniosek-opis" });
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się wysłać wniosku. Spróbuj jeszcze raz.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* 1. Typ zabezpieczenia */}
      <section className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">1. Typ zabezpieczenia</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Wybierz rodzaj nieruchomości</h2>
        </div>
        <SecurityTypePicker value={secType} onChange={(t) => setSecType(t)} />
      </section>

      {/* 2. Kwota i okres */}
      <section className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">2. Parametry pożyczki</p>
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
        <div className="rounded-xl bg-secondary p-4">
          <div className="text-xs font-bold uppercase text-muted-foreground">Szacowana rata miesięczna</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-foreground">{formatPLN(figures.monthly)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Wstępna kalkulacja — ostateczne warunki ustalają inwestorzy po analizie.</div>
        </div>
      </section>

      {/* 3. Kontakt */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">3. Dane kontaktowe</p>
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
      </section>

      {/* 4. KW + dokumenty wg typu */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">4. Nieruchomość</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">
            Numer KW i dokumenty dla: <span className="text-accent">{securityTypeLabels[secType]}</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Wystarczy numer księgi wieczystej LUB komplet zdjęć/dokumentów.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="f-kw">Numer księgi wieczystej</Label>
          <Input id="f-kw" value={kwNumber} onChange={(e) => setKwNumber(e.target.value.toUpperCase())}
            placeholder="np. WA1M/00123456/7" className="font-mono text-lg tracking-wider" />
          <p className="text-xs text-muted-foreground">Jeśli nie znasz numeru — sprawdź w aplikacji mObywatel albo dołącz akt własności jako plik poniżej.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {photoBuckets.map((b) => (
            <PhotoBucket key={b.kind} label={b.label} bucket={b.kind}
              photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
          ))}
          <PhotoBucket label="Akt własności / inne dokumenty (opcjonalnie)" bucket="ownership_deed"
            photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-card md:p-4">
        <Button type="submit" variant="cta" size="lg" disabled={submitting} className="w-full text-base">
          {submitting ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wysyłam wniosek…</>
          ) : (
            <><Send className="mr-2 h-5 w-5" /> Wyślij wniosek — bezpłatnie, do 24 h</>
          )}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Złożenie wniosku jest darmowe i nie zobowiązuje. Akceptujesz politykę prywatności Finance You.
        </p>
      </div>
    </form>
  );
}
