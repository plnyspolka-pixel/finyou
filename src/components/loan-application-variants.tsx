import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { formatPLN, monthlyPayment, securityTypeLabels, type SecurityType } from "@/lib/loan-math";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  FileImage,
  FileText,
  Home,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

type KwChoice = "znam" | "pomoc" | "pozniej";

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  bucket: "wnetrze" | "zewnetrze" | "dokument";
};

type LoanDraft = {
  amount: number;
  months: number;
  annualRate: number;
  maxPayment: number;
  secType: SecurityType | null;
  kwChoice: KwChoice;
  kwNumber: string;
  propertyNote: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const STORAGE_KEY = "finance_you_wniosek_compare_v1";

const emptyDraft: LoanDraft = {
  amount: 200_000,
  months: 24,
  annualRate: 24,
  maxPayment: 3500,
  secType: "mieszkanie",
  kwChoice: "znam",
  kwNumber: "",
  propertyNote: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const linearSteps = [
  "Kwota",
  "Okres",
  "Maksymalna rata",
  "Koszt finansowania",
  "Zabezpieczenie",
  "Księga wieczysta",
  "Zdjęcia",
  "Kontakt",
  "Podsumowanie",
];

function useLoanDraft() {
  const { user, loading } = useAuth();
  const [draft, setDraft] = useState<LoanDraft>(emptyDraft);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setDraft({ ...emptyDraft, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    setDraft((current) => ({ ...current, email: current.email || user.email || "" }));
  }, [user?.email]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* noop */
    }
  }, [draft]);

  useEffect(() => {
    return () => photos.forEach((photo) => URL.revokeObjectURL(photo.url));
  }, [photos]);

  const update = <K extends keyof LoanDraft>(key: K, value: LoanDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const addPhotos = (files: FileList | null | undefined, bucket: PhotoItem["bucket"]) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${file.name}`,
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
      bucket,
    }));
    setPhotos((current) => [...current, ...next]);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((photo) => photo.id !== id);
    });
  };

  const figures = useMemo(() => {
    const nominal = monthlyPayment(draft.amount, draft.annualRate, draft.months);
    const monthly = Math.min(nominal || 0, draft.maxPayment || nominal || 0);
    const balloon = Math.max(0, (nominal - monthly) * draft.months);
    const total = monthly * draft.months + balloon;
    return {
      monthly,
      balloon,
      total,
      investorCompensation: Math.max(0, total - draft.amount),
    };
  }, [draft.amount, draft.annualRate, draft.maxPayment, draft.months]);

  return { draft, update, photos, addPhotos, removePhoto, figures, user, authLoading: loading };
}

function VariantShell({
  title,
  subtitle,
  variant,
  children,
}: {
  title: string;
  subtitle: string;
  variant: "one" | "two";
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">
              {variant === "one" ? "Wniosek 1" : "Wniosek 2"}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Porównanie wersji wniosku">
            <Button asChild variant={variant === "one" ? "default" : "outline"}>
              <a href="/wniosek-1">Wniosek 1</a>
            </Button>
            <Button asChild variant={variant === "two" ? "default" : "outline"}>
              <a href="/wniosek-2">Wniosek 2</a>
            </Button>
            <Button asChild variant="ghost">
              <a href="/wniosek-formularz">Obecny wniosek</a>
            </Button>
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}

function SummaryPanel({
  draft,
  figures,
  photos,
}: {
  draft: LoanDraft;
  figures: { monthly: number; balloon: number; total: number; investorCompensation: number };
  photos: PhotoItem[];
}) {
  return (
    <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <div>
          <div className="text-sm font-bold text-foreground">Podgląd wniosku</div>
          <div className="text-xs text-muted-foreground">Aktualizuje się bez przeładowania strony</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <SummaryMetric icon={Wallet} label="Kwota" value={formatPLN(draft.amount)} />
        <SummaryMetric icon={Clock3} label="Okres" value={`${draft.months} mies.`} />
        <SummaryMetric icon={Home} label="Zabezpieczenie" value={draft.secType ? securityTypeLabels[draft.secType] : "—"} />
        <SummaryMetric icon={FileImage} label="Zdjęcia i pliki" value={`${photos.length}`} />
      </div>

      <div className="rounded-lg bg-secondary p-4">
        <div className="text-xs font-bold uppercase text-muted-foreground">Szacowana rata</div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums text-foreground">{formatPLN(figures.monthly)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Łączna spłata</div>
            <b className="tabular-nums">{formatPLN(figures.total)}</b>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Koszt</div>
            <b className="tabular-nums">{formatPLN(figures.investorCompensation)}</b>
          </div>
        </div>
      </div>

      {figures.balloon > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          Ostatnia rata zawiera dopłatę balonową: <b>{formatPLN(figures.monthly + figures.balloon)}</b>.
        </div>
      )}
    </aside>
  );
}

function SummaryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" />
        {label}
      </div>
      <div className="mt-1 font-bold text-foreground">{value}</div>
    </div>
  );
}

function AmountQuestion({ draft, update }: { draft: LoanDraft; update: ReturnType<typeof useLoanDraft>["update"] }) {
  return (
    <div className="space-y-5">
      <Label htmlFor="linear-amount" className="text-lg font-bold">Jakiej kwoty potrzebujesz?</Label>
      <Input
        id="linear-amount"
        type="number"
        inputMode="numeric"
        value={draft.amount}
        onChange={(event) => update("amount", Number(event.target.value) || 0)}
        className="h-14 text-2xl font-extrabold tabular-nums"
      />
      <Slider value={[draft.amount]} min={20_000} max={1_000_000} step={5_000} onValueChange={(value) => update("amount", value[0] ?? draft.amount)} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>20 000 zł</span>
        <span>1 000 000 zł</span>
      </div>
    </div>
  );
}

function PhotoUploader({
  label,
  bucket,
  photos,
  addPhotos,
  removePhoto,
}: {
  label: string;
  bucket: PhotoItem["bucket"];
  photos: PhotoItem[];
  addPhotos: (files: FileList | null | undefined, bucket: PhotoItem["bucket"]) => void;
  removePhoto: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ownPhotos = photos.filter((photo) => photo.bucket === bucket);

  return (
    <div className="space-y-3">
      <Label className="text-base font-bold">{label}</Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/50 p-5 text-center transition hover:border-accent hover:bg-accent/10"
      >
        <Upload className="h-8 w-8 text-accent" />
        <span className="font-semibold text-foreground">Dodaj zdjęcia albo PDF</span>
        <span className="text-xs text-muted-foreground">Możesz zaznaczyć kilka plików naraz</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          addPhotos(event.target.files, bucket);
          event.currentTarget.value = "";
        }}
      />
      {ownPhotos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ownPhotos.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card">
              {photo.type.startsWith("image/") ? (
                <img src={photo.url} alt={photo.name} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-secondary">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="space-y-2 p-2">
                <div className="truncate text-xs font-medium text-foreground">{photo.name}</div>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-full" onClick={() => removePhoto(photo.id)}>
                  Usuń
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LinearLoanApplication() {
  const { draft, update, photos, addPhotos, removePhoto, figures, user, authLoading } = useLoanDraft();
  const [step, setStep] = useState(0);
  const currentProgress = Math.round(((step + 1) / linearSteps.length) * 100);

  const canContinue = () => {
    if (step === 0) return draft.amount >= 20_000;
    if (step === 1) return draft.months >= 3;
    if (step === 2) return draft.maxPayment >= 500;
    if (step === 3) return draft.annualRate >= 15;
    if (step === 4) return !!draft.secType;
    if (step === 5) return !!draft.city.trim();
    if (step === 6) return draft.kwChoice !== "znam" || !!draft.kwNumber.trim();
    if (step === 7) return photos.length > 0;
    if (step === 8) return !!draft.phone.trim() && !!draft.email.trim();
    return true;
  };

  const next = () => {
    if (!canContinue()) {
      toast.error("Uzupełnij ten krok, zanim przejdziesz dalej");
      return;
    }
    if (step < linearSteps.length - 1) setStep((current) => current + 1);
    else toast.success("Wersja 1 gotowa do dalszego podpięcia po akceptacji");
  };

  return (
    <VariantShell
      variant="one"
      title="Krok po kroku, bez gubienia miejsca"
      subtitle="Jedna decyzja na ekran. Wstecz i Dalej zmieniają tylko aktualny krok — bez przeskoków między trasami."
    >
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="h-fit rounded-lg border border-border bg-card p-4 lg:sticky lg:top-6">
          <div className="mb-4 flex items-center justify-between">
            <Badge variant="secondary">Krok {step + 1} z {linearSteps.length}</Badge>
            <Badge variant={user ? "default" : "outline"}>{authLoading ? "Sprawdzam" : user ? "Zalogowany" : "Podgląd"}</Badge>
          </div>
          <Progress value={currentProgress} />
          <ol className="mt-5 space-y-2">
            {linearSteps.map((label, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <li key={label}>
                  <button
                    type="button"
                    disabled={index > step}
                    onClick={() => setStep(index)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                      active ? "bg-primary text-primary-foreground" : done ? "bg-accent/10 text-foreground hover:bg-accent/20" : "text-muted-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs">
                      {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="min-h-[620px] rounded-lg border border-border bg-card p-5 shadow-sm md:p-8">
          <div className="mb-8">
            <div className="text-xs font-bold uppercase text-accent">{linearSteps[step]}</div>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
              {step === 0 && "Ile pieniędzy chcesz uzyskać?"}
              {step === 1 && "Na jak długo chcesz rozłożyć spłatę?"}
              {step === 2 && "Jaką ratę miesięczną realnie udźwigniesz?"}
              {step === 3 && "Jaki koszt finansowania akceptujesz?"}
              {step === 4 && "Co będzie zabezpieczeniem pożyczki?"}
              {step === 5 && "Gdzie znajduje się nieruchomość?"}
              {step === 6 && "Czy znasz numer księgi wieczystej?"}
              {step === 7 && "Dodaj zdjęcia lub dokumenty nieruchomości"}
              {step === 8 && "Jak mamy się z Tobą skontaktować?"}
              {step === 9 && "Sprawdź całość przed wysłaniem"}
            </h2>
          </div>

          {step === 0 && <AmountQuestion draft={draft} update={update} />}

          {step === 1 && (
            <div className="space-y-5">
              <Label className="text-lg font-bold">Okres finansowania</Label>
              <div className="text-5xl font-extrabold tabular-nums text-foreground">{draft.months} mies.</div>
              <Slider value={[draft.months]} min={3} max={72} step={1} onValueChange={(value) => update("months", value[0] ?? draft.months)} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>3 mies.</span><span>72 mies.</span></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Label htmlFor="linear-max-payment" className="text-lg font-bold">Maksymalna rata miesięczna</Label>
              <Input id="linear-max-payment" type="number" value={draft.maxPayment} onChange={(event) => update("maxPayment", Number(event.target.value) || 0)} className="h-14 text-2xl font-extrabold tabular-nums" />
              <Slider value={[Math.min(50_000, draft.maxPayment)]} min={500} max={50_000} step={250} onValueChange={(value) => update("maxPayment", value[0] ?? draft.maxPayment)} />
              <p className="text-sm text-muted-foreground">Jeśli rata z kalkulacji będzie wyższa, nadwyżkę pokażemy jako ostatnią ratę balonową.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <Label htmlFor="linear-rate" className="text-lg font-bold">Roczne wynagrodzenie inwestora</Label>
              <div className="flex items-center gap-3">
                <Input id="linear-rate" type="number" step="0.5" value={draft.annualRate} onChange={(event) => update("annualRate", Number(event.target.value) || 0)} className="h-14 max-w-40 text-2xl font-extrabold tabular-nums" />
                <span className="text-2xl font-bold">%</span>
              </div>
              <Slider value={[Math.min(60, Math.max(15, draft.annualRate))]} min={15} max={60} step={0.5} onValueChange={(value) => update("annualRate", value[0] ?? draft.annualRate)} />
            </div>
          )}

          {step === 4 && <SecurityTypePicker value={draft.secType} onChange={(value) => update("secType", value)} />}

          {step === 5 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="linear-city">Miasto / miejscowość *</Label>
                <Input id="linear-city" value={draft.city} onChange={(event) => update("city", event.target.value)} placeholder="np. Warszawa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linear-street">Ulica lub opis lokalizacji</Label>
                <Input id="linear-street" value={draft.street} onChange={(event) => update("street", event.target.value)} placeholder="np. Mokotów, okolice metra" />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <RadioGroup value={draft.kwChoice} onValueChange={(value) => update("kwChoice", value as KwChoice)} className="grid gap-3 md:grid-cols-3">
                <KwTile value="znam" current={draft.kwChoice} title="Znam numer" description="Wpiszę KW ręcznie" />
                <KwTile value="pomoc" current={draft.kwChoice} title="Potrzebuję pomocy" description="Dodam dokument lub zdjęcie" />
                <KwTile value="pozniej" current={draft.kwChoice} title="Później" description="Ustalimy telefonicznie" />
              </RadioGroup>
              {draft.kwChoice === "znam" && (
                <div className="space-y-2">
                  <Label htmlFor="linear-kw">Numer księgi wieczystej</Label>
                  <Input id="linear-kw" value={draft.kwNumber} onChange={(event) => update("kwNumber", event.target.value.toUpperCase())} placeholder="LU1I/00012345/6" />
                </div>
              )}
            </div>
          )}

          {step === 7 && <PhotoUploader label="Zdjęcia wnętrza, elewacji albo dokumentów" bucket="wnetrze" photos={photos} addPhotos={addPhotos} removePhoto={removePhoto} />}

          {step === 8 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Imię</Label><Input value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} /></div>
              <div className="space-y-2"><Label>Nazwisko</Label><Input value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} /></div>
              <div className="space-y-2"><Label>E-mail *</Label><Input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></div>
              <div className="space-y-2"><Label>Telefon *</Label><Input type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} /></div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-3 text-sm">
              <ReviewRow label="Kwota" value={formatPLN(draft.amount)} />
              <ReviewRow label="Okres" value={`${draft.months} mies.`} />
              <ReviewRow label="Rata" value={formatPLN(figures.monthly)} />
              <ReviewRow label="Zabezpieczenie" value={draft.secType ? securityTypeLabels[draft.secType] : "—"} />
              <ReviewRow label="Adres" value={[draft.city, draft.street].filter(Boolean).join(", ") || "—"} />
              <ReviewRow label="KW" value={draft.kwChoice === "znam" ? draft.kwNumber || "—" : "Pomoc / później"} />
              <ReviewRow label="Zdjęcia i pliki" value={`${photos.length}`} />
              <ReviewRow label="Kontakt" value={`${draft.email || "—"} · ${draft.phone || "—"}`} />
            </div>
          )}

          <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Wstecz
            </Button>
            <Button type="button" variant="cta" size="cta" onClick={next}>
              {step === linearSteps.length - 1 ? <><Send className="mr-2 h-4 w-4" /> Wyślij testowo</> : <>Dalej <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </div>
        </section>

        <div className="lg:sticky lg:top-6 lg:h-fit">
          <SummaryPanel draft={draft} figures={figures} photos={photos} />
        </div>
      </div>
    </VariantShell>
  );
}

function KwTile({ value, current, title, description }: { value: KwChoice; current: KwChoice; title: string; description: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${current === value ? "border-accent bg-accent/10" : "border-border bg-background hover:border-accent/60"}`}>
      <RadioGroupItem value={value} className="mt-1" />
      <span>
        <span className="block font-bold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function SinglePageLoanApplication() {
  const { draft, update, photos, addPhotos, removePhoto, figures, user, authLoading } = useLoanDraft();

  const saveDraft = () => toast.success("Szkic zapisany w tej sesji");

  return (
    <VariantShell
      variant="two"
      title="Wszystko na jednej płaszczyźnie"
      subtitle="Bez kreatora krokowego — klient widzi cały wniosek, zdjęcia, dokumenty i podsumowanie naraz."
    >
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-primary p-5 text-primary-foreground md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <Badge variant="secondary" className="mb-3">{authLoading ? "Sprawdzam logowanie" : user ? "Zalogowany użytkownik" : "Podgląd UX"}</Badge>
                <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Jeden widok, jedna decyzja na końcu</h2>
                <p className="mt-2 max-w-2xl text-sm text-primary-foreground/80">
                  Układ jest płaski: parametry, nieruchomość, zdjęcia i kontakt są widoczne bez cofania się po krokach.
                </p>
              </div>
              <div className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-4 text-sm">
                <div className="text-primary-foreground/70">Szacowana rata</div>
                <div className="text-3xl font-extrabold tabular-nums">{formatPLN(figures.monthly)}</div>
              </div>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-accent" /> Warunki pożyczki</CardTitle>
              <CardDescription>Najważniejsze liczby są na górze, bez przechodzenia między ekranami.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <AmountQuestion draft={draft} update={update} />
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4"><Label>Okres</Label><b>{draft.months} mies.</b></div>
                  <Slider value={[draft.months]} min={3} max={72} step={1} onValueChange={(value) => update("months", value[0] ?? draft.months)} />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="flat-payment">Maksymalna rata</Label>
                  <Input id="flat-payment" type="number" value={draft.maxPayment} onChange={(event) => update("maxPayment", Number(event.target.value) || 0)} />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="flat-rate">Roczne wynagrodzenie inwestora (%)</Label>
                  <Input id="flat-rate" type="number" step="0.5" value={draft.annualRate} onChange={(event) => update("annualRate", Number(event.target.value) || 0)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5 text-accent" /> Nieruchomość</CardTitle>
              <CardDescription>Typ zabezpieczenia, adres i księga wieczysta są obok siebie.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SecurityTypePicker value={draft.secType} onChange={(value) => update("secType", value)} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="flat-city">Miasto / miejscowość</Label>
                  <Input id="flat-city" value={draft.city} onChange={(event) => update("city", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flat-street">Ulica lub opis lokalizacji</Label>
                  <Input id="flat-street" value={draft.street} onChange={(event) => update("street", event.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                <RadioGroup value={draft.kwChoice} onValueChange={(value) => update("kwChoice", value as KwChoice)} className="space-y-3">
                  <KwTile value="znam" current={draft.kwChoice} title="Znam KW" description="Wpiszę numer" />
                  <KwTile value="pomoc" current={draft.kwChoice} title="Pomoc z KW" description="Dodam dokument" />
                  <KwTile value="pozniej" current={draft.kwChoice} title="Później" description="Ustalimy telefonicznie" />
                </RadioGroup>
                <div className="space-y-2">
                  <Label htmlFor="flat-kw">Numer KW lub notatka</Label>
                  <Textarea
                    id="flat-kw"
                    value={draft.kwChoice === "znam" ? draft.kwNumber : draft.propertyNote}
                    onChange={(event) => draft.kwChoice === "znam" ? update("kwNumber", event.target.value.toUpperCase()) : update("propertyNote", event.target.value)}
                    placeholder={draft.kwChoice === "znam" ? "LU1I/00012345/6" : "Napisz, co wiesz o nieruchomości albo dokumentach"}
                    rows={6}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-accent" /> Zdjęcia i dokumenty</CardTitle>
              <CardDescription>W tej wersji zdjęcia są częścią głównego widoku, nie osobnym krokiem.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-3">
              <PhotoUploader label="Wnętrze" bucket="wnetrze" photos={photos} addPhotos={addPhotos} removePhoto={removePhoto} />
              <PhotoUploader label="Z zewnątrz" bucket="zewnetrze" photos={photos} addPhotos={addPhotos} removePhoto={removePhoto} />
              <PhotoUploader label="Dokumenty" bucket="dokument" photos={photos} addPhotos={addPhotos} removePhoto={removePhoto} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-accent" /> Kontakt</CardTitle>
              <CardDescription>Dane są na końcu płaskiego formularza, ale cały czas w tym samym widoku.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Imię</Label><Input value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} /></div>
              <div className="space-y-2"><Label>Nazwisko</Label><Input value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-2"><Mail className="h-4 w-4" /> E-mail</Label><Input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-2"><Phone className="h-4 w-4" /> Telefon</Label><Input type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} /></div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Widok zapisuje się automatycznie w trakcie porównania.
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={saveDraft}>Zapisz szkic</Button>
              <Button type="button" variant="cta" size="cta" onClick={() => toast.success("Wersja 2 gotowa do dalszego podpięcia po akceptacji")}>
                <Send className="mr-2 h-4 w-4" /> Wyślij testowo
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
          <SummaryPanel draft={draft} figures={figures} photos={photos} />
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-accent" /> Szybki przegląd zdjęć</div>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Po dodaniu zdjęć pojawią się tutaj miniatury, cały czas przy podsumowaniu.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 9).map((photo) => (
                  photo.type.startsWith("image/") ? (
                    <img key={photo.id} src={photo.url} alt={photo.name} className="aspect-square rounded-md object-cover" />
                  ) : (
                    <div key={photo.id} className="grid aspect-square place-items-center rounded-md bg-secondary"><FileText className="h-5 w-5 text-muted-foreground" /></div>
                  )
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </VariantShell>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <b className="max-w-[60%] text-right text-foreground">{value}</b>
    </div>
  );
}