import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useServerFn } from "@tanstack/react-start";
import { extractKwFromUpload } from "@/lib/kw-ocr.functions";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { formatPLN, monthlyPayment, securityTypeLabels, type SecurityType } from "@/lib/loan-math";
import { REQUIREMENTS_BY_TYPE, PROPERTY_TYPE_LABELS, type DocRequirement, type DocRequirementKind } from "@/lib/property-documents";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileImage,
  FileText,
  Home,
  Smartphone,
  Send,
  ShieldCheck,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

// Mapping SecurityType -> property_documents key
const SEC_TO_PROP: Record<SecurityType, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  lokal_uslugowy: "lokal_uslugowy",
  dzialka_budowlana: "dzialka_budowlana",
  grunt_rolny: "grunt_rolny",
  inna: "inna",
};

type KwChoice = "znam" | "mobywatel" | "pomoc";

type PhotoItem = {
  id: string;
  name: string;
  type: string;
  url: string;
  bucket: string;
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
  "Poznaj ofertę",
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
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Wniosek</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
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
  hint,
  bucket,
  photos,
  addPhotos,
  removePhoto,
}: {
  label: string;
  hint?: string;
  bucket: PhotoItem["bucket"];
  photos: PhotoItem[];
  addPhotos: (files: FileList | null | undefined, bucket: PhotoItem["bucket"]) => void;
  removePhoto: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ownPhotos = photos.filter((photo) => photo.bucket === bucket);

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-base font-bold">{label}</Label>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
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

export function LinearLoanApplication({ embedded = false }: { embedded?: boolean } = {}) {
  const { draft, update, photos, addPhotos, removePhoto, figures, user, authLoading } = useLoanDraft();
  const [step, setStep] = useState(0);
  const currentProgress = Math.round(((step + 1) / linearSteps.length) * 100);

  // Krok 2 ("Poznaj ofertę / Zostaw kontakt") jest tylko dla niezalogowanych —
  // zalogowanego klienta przeskakujemy automatycznie.
  useEffect(() => {
    if (user && step === 2) setStep(3);
  }, [user, step]);

  const gateUnlocked =
    !!user ||
    (!!draft.firstName.trim() && !!draft.email.trim() && !!draft.phone.trim());

  const canContinue = () => {
    if (step === 0) return draft.amount >= 20_000;
    if (step === 1) return draft.months >= 3;
    if (step === 2) return gateUnlocked;
    if (step === 3) return draft.maxPayment >= 500;
    if (step === 4) return draft.annualRate >= 15;
    if (step === 5) return !!draft.secType;
    if (step === 6) return !!draft.kwNumber.trim();
    if (step === 7) return photos.length > 0;
    if (step === 8) return !!draft.phone.trim() && !!draft.email.trim();
    return true;
  };

  const advance = (delta: 1 | -1) => {
    let target = step + delta;
    // Omijaj krok 2 dla zalogowanych w obie strony
    if (user && target === 2) target += delta;
    return Math.max(0, Math.min(linearSteps.length - 1, target));
  };

  const next = () => {
    if (!canContinue()) {
      toast.error("Uzupełnij ten krok, zanim przejdziesz dalej");
      return;
    }
    if (step < linearSteps.length - 1) setStep(advance(1));
    else toast.success("Wniosek gotowy — wyślemy Ci link aktywacyjny");
  };

  const Shell = embedded
    ? ({ children }: { children: ReactNode }) => <div className="bg-background">{children}</div>
    : ({ children }: { children: ReactNode }) => (
        <VariantShell
          title="Krok po kroku, bez gubienia miejsca"
          subtitle="Jedna decyzja na ekran. Wstecz i Dalej zmieniają tylko aktualny krok — bez przeskoków między trasami."
        >
          {children}
        </VariantShell>
      );

  return (
    <Shell>
      <div className={embedded
        ? "mx-auto max-w-3xl px-4 py-6 md:px-6"
        : "mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[280px_minmax(0,1fr)_320px]"}>
        {!embedded && (
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
        )}

        <section className="min-h-[620px] rounded-lg border border-border bg-card p-5 shadow-sm md:p-8">
          <div className="mb-8">
            <div className="text-xs font-bold uppercase text-accent">{linearSteps[step]}</div>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
              {step === 0 && "Ile pieniędzy chcesz uzyskać?"}
              {step === 1 && "Na jak długo chcesz rozłożyć spłatę?"}
              {step === 2 && "Zostaw kontakt"}
              {step === 3 && "Jaką ratę miesięczną realnie udźwigniesz?"}
              {step === 4 && "Jaki koszt finansowania akceptujesz?"}
              {step === 5 && "Co będzie zabezpieczeniem pożyczki?"}
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
            <OfferGate
              user={user}
              authLoading={authLoading}
              draft={draft}
              update={update}
              figures={figures}
            />
          )}

          {step === 3 && (
            <div className="space-y-5">
              <Label htmlFor="linear-max-payment" className="text-lg font-bold">Maksymalna rata miesięczna</Label>
              <Input id="linear-max-payment" type="number" value={draft.maxPayment} onChange={(event) => update("maxPayment", Number(event.target.value) || 0)} className="h-14 text-2xl font-extrabold tabular-nums" />
              <Slider value={[Math.min(50_000, draft.maxPayment)]} min={500} max={50_000} step={250} onValueChange={(value) => update("maxPayment", value[0] ?? draft.maxPayment)} />
              <p className="text-sm text-muted-foreground">Jeśli rata z kalkulacji będzie wyższa, nadwyżkę pokażemy jako ostatnią ratę balonową.</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <Label htmlFor="linear-rate" className="text-lg font-bold">Roczne wynagrodzenie inwestora</Label>
              <div className="flex items-center gap-3">
                <Input id="linear-rate" type="number" step="0.5" value={draft.annualRate} onChange={(event) => update("annualRate", Number(event.target.value) || 0)} className="h-14 max-w-40 text-2xl font-extrabold tabular-nums" />
                <span className="text-2xl font-bold">%</span>
              </div>
              <Slider value={[Math.min(60, Math.max(15, draft.annualRate))]} min={15} max={60} step={0.5} onValueChange={(value) => update("annualRate", value[0] ?? draft.annualRate)} />
            </div>
          )}

          {step === 5 && <SecurityTypePicker value={draft.secType} onChange={(value) => update("secType", value)} />}

          {step === 6 && (
            <div className="space-y-5">
              <RadioGroup value={draft.kwChoice} onValueChange={(value) => update("kwChoice", value as KwChoice)} className="grid gap-3 md:grid-cols-3">
                <KwTile value="znam" current={draft.kwChoice} title="Znam numer KW" description="Wpiszę go ręcznie" />
                <KwTile value="mobywatel" current={draft.kwChoice} title="Sprawdzę w mObywatelu" description="Pokażemy krok po kroku" />
                <KwTile value="pomoc" current={draft.kwChoice} title="Wgram dokument z KW" description="Skan, akt notarialny, zdjęcie" />
              </RadioGroup>

              {draft.kwChoice === "znam" && (
                <div className="space-y-2">
                  <Label htmlFor="linear-kw">Numer księgi wieczystej</Label>
                  <Input id="linear-kw" value={draft.kwNumber} onChange={(event) => update("kwNumber", event.target.value.toUpperCase())} placeholder="LU1I/00012345/6" />
                  <p className="text-xs text-muted-foreground">Adres i dane nieruchomości pobierzemy automatycznie z KW.</p>
                </div>
              )}

              {draft.kwChoice === "mobywatel" && (
                <MobywatelKwGuide
                  kwNumber={draft.kwNumber}
                  onChange={(value) => update("kwNumber", value.toUpperCase())}
                />
              )}

              {draft.kwChoice === "pomoc" && (
                <KwDocumentOcr
                  kwNumber={draft.kwNumber}
                  onDetected={(num) => update("kwNumber", num)}
                  onSwitchToMobywatel={() => update("kwChoice", "mobywatel")}
                />
              )}
            </div>
          )}

          {step === 7 && (
            <RequirementsPhotoStep
              secType={draft.secType}
              photos={photos}
              addPhotos={addPhotos}
              removePhoto={removePhoto}
            />
          )}

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
              <ReviewRow label="KW" value={draft.kwNumber || (draft.kwChoice === "pomoc" ? "Z wgranego dokumentu" : draft.kwChoice === "mobywatel" ? "Sprawdzę w mObywatelu" : "—")} />
              <ReviewRow label="Zdjęcia i pliki" value={`${photos.length}`} />
              <ReviewRow label="Kontakt" value={`${draft.email || "—"} · ${draft.phone || "—"}`} />
            </div>
          )}

          <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep(advance(-1))}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Wstecz
            </Button>
            <Button type="button" variant="cta" size="lg" className="min-w-0 flex-1 whitespace-normal text-center leading-tight sm:flex-none" onClick={next}>
              {step === linearSteps.length - 1
                ? <><Send className="mr-2 h-4 w-4" /> Wyślij wniosek</>
                : step === 2
                  ? <>Przejdź do kalkulacji <ArrowRight className="ml-2 h-4 w-4" /></>
                  : <>Dalej <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </div>
        </section>

        {!embedded && (
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <SummaryPanel draft={draft} figures={figures} photos={photos} />
        </div>
        )}
      </div>
    </Shell>
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

function MobywatelKwGuide({ kwNumber, onChange }: { kwNumber: string; onChange: (value: string) => void }) {
  const steps: { title: string; body: string }[] = [
    { title: "Otwórz aplikację mObywatel", body: "Zaloguj się profilem zaufanym albo e-dowodem. Usługa działa od kwietnia 2026, więc upewnij się, że masz najnowszą wersję aplikacji ze sklepu Google Play lub App Store." },
    { title: "Wejdź w usługę „Księgi wieczyste”", body: "Na ekranie głównym dotknij „Usługi” → „Księgi wieczyste” → „Twoje księgi”. mObywatel po Twoim numerze PESEL pokaże WSZYSTKIE księgi, w których jesteś właścicielem, współwłaścicielem lub użytkownikiem wieczystym — nie musisz znać numeru." },
    { title: "Wybierz właściwą nieruchomość", body: "Z listy wybierz tę, którą chcesz oddać w zabezpieczenie. Zobaczysz: numer KW, typ nieruchomości, sąd prowadzący i położenie." },
    { title: "Skopiuj numer KW i wklej poniżej", body: "Format: KOD_WYDZIAŁU/NUMER/CYFRA KONTROLNA, np. WA1M/00123456/7. Przepisz lub wklej numer w pole obok — resztę danych (adres, powierzchnię, właściciela, obciążenia) odczytamy automatycznie z rejestru." },
  ];
  const isMobile = useIsMobile();
  const mobywatelUrl = "https://www.mobywatel.gov.pl";
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-accent">Sprawdź numer KW w mObywatelu</div>
            <p className="mt-1 text-sm text-foreground/80">
              Nie musisz nigdzie dzwonić ani jechać do sądu. mObywatel pokaże Twoje księgi po PESEL-u.
            </p>
          </div>
        </div>
        {!isMobile && (
          <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-accent/30 bg-background p-3">
            <QRCodeSVG value={mobywatelUrl} size={104} />
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Zeskanuj telefonem</div>
            <div className="text-[10px] text-muted-foreground">otworzy mObywatel</div>
          </div>
        )}
      </div>

      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-lg bg-background/70 p-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{i + 1}</span>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">{s.title}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button asChild type="button" variant="outline" size="sm">
          <a href="https://www.mobywatel.gov.pl" target="_blank" rel="noreferrer">Pobierz mObywatel</a>
        </Button>
        <Button asChild type="button" variant="ghost" size="sm">
          <a href="https://info.mobywatel.gov.pl/aktualnosci/twoje-ksiegi-wieczyste-w-telefonie" target="_blank" rel="noreferrer">Oficjalna instrukcja Ministerstwa</a>
        </Button>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="mobywatel-kw">Wklej skopiowany numer KW</Label>
        <Input
          id="mobywatel-kw"
          value={kwNumber}
          onChange={(event) => onChange(event.target.value)}
          placeholder="np. WA1M/00123456/7"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">Po wpisaniu numeru pobierzemy adres, powierzchnię, dane właściciela i obciążenia bezpośrednio z rejestru — nic więcej nie musisz uzupełniać.</p>
      </div>
    </div>
  );
}


function KwDocumentOcr({
  kwNumber,
  onDetected,
  onSwitchToMobywatel,
}: {
  kwNumber: string;
  onDetected: (num: string) => void;
  onSwitchToMobywatel: () => void;
}) {
  const runOcr = useServerFn(extractKwFromUpload);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Plik jest za duży (maks. 10 MB).");
      return;
    }
    setError(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const result = await runOcr({ data: { dataUrl, mimeType: file.type || "application/octet-stream", fileName: file.name } });
      if (result.found && result.numbers[0]) {
        onDetected(result.numbers[0]);
        toast.success(`Znaleziono numer KW: ${result.numbers[0]}`);
      } else if (result.reason === "not_found") {
        setError("Nie znaleźliśmy numeru KW w tym dokumencie. Wgraj inny plik (np. akt notarialny lub wypis z KW) albo sprawdź numer w mObywatelu.");
      } else if (result.reason === "unsupported") {
        setError("Nieobsługiwany format. Wgraj PDF lub zdjęcie (JPG, PNG).");
      } else if (result.reason === "ai_quota") {
        setError("Skończył się limit AI — sprawdź numer w mObywatelu lub wpisz ręcznie.");
      } else {
        setError("Nie udało się odczytać dokumentu. Spróbuj jeszcze raz lub sprawdź numer w mObywatelu.");
      }
    } catch {
      setError("Nie udało się przetworzyć pliku. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
            <Upload className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold uppercase tracking-wide text-accent">Wgraj dokument z numerem KW</div>
            <p className="mt-1 text-sm text-foreground/80">
              Akt notarialny, wypis z księgi wieczystej, zaświadczenie. Automatycznie odczytamy numer KW.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="cta"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Odczytujemy dokument..." : "Wybierz plik"}
          </Button>
          {fileName && !busy && (
            <span className="self-center text-xs text-muted-foreground truncate">{fileName}</span>
          )}
        </div>
      </div>

      {kwNumber && !error && !busy && (
        <div className="flex items-start gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div className="text-sm">
            <div className="font-bold text-foreground">Znaleźliśmy numer KW</div>
            <div className="font-mono text-base text-foreground">{kwNumber}</div>
            <p className="mt-1 text-xs text-muted-foreground">Adres i dane nieruchomości pobierzemy automatycznie z rejestru. Możesz przejść dalej.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm text-foreground">{error}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Wgraj inny dokument
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onSwitchToMobywatel}>
              Sprawdzę w mObywatelu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}



function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function RequirementsPhotoStep({
  secType,
  photos,
  addPhotos,
  removePhoto,
}: {
  secType: SecurityType | null;
  photos: PhotoItem[];
  addPhotos: (files: FileList | null | undefined, bucket: PhotoItem["bucket"]) => void;
  removePhoto: (id: string) => void;
}) {
  const propKey = secType ? SEC_TO_PROP[secType] : "inna";
  const reqs: DocRequirement[] = REQUIREMENTS_BY_TYPE[propKey] ?? REQUIREMENTS_BY_TYPE.inna;
  // KW number i powierzchnia użytkowa to dane tekstowe — nie sloty plikowe.
  const fileReqs = reqs.filter((r) => r.kind !== "kw_number" && r.kind !== "usable_area");
  const typeLabel = PROPERTY_TYPE_LABELS[propKey] ?? "nieruchomość";

  const hints: Partial<Record<DocRequirementKind, string>> = {
    photos_interior: "Po jednym zdjęciu z każdego pomieszczenia. Dobre światło, cała przestrzeń w kadrze.",
    photos_exterior: "Elewacja z każdej strony, podjazd, najbliższe otoczenie.",
    mpzp: "Wydruk z systemu gminy albo zdjęcie decyzji o warunkach zabudowy.",
    land_registry: "Aktualny wypis z rejestru gruntów (PDF lub zdjęcie).",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
        <div className="font-bold text-foreground">
          Dla typu „{typeLabel}” potrzebujemy {fileReqs.length} kompletów plików:
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {fileReqs.map((r) => (
            <li key={r.kind}>{r.label}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {fileReqs.map((r) => (
          <PhotoUploader
            key={r.kind}
            label={r.label}
            hint={hints[r.kind]}
            bucket={r.kind}
            photos={photos}
            addPhotos={addPhotos}
            removePhoto={removePhoto}
          />
        ))}
      </div>
    </div>
  );
}

function OfferGate({
  user,
  authLoading,
  draft,
  update,
  figures,
}: {
  user: ReturnType<typeof useAuth>["user"];
  authLoading: boolean;
  draft: LoanDraft;
  update: ReturnType<typeof useLoanDraft>["update"];
  figures: { monthly: number; total: number; investorCompensation: number };
}) {
  if (user) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" /> Jesteś zalogowany jako {user.email}
        </div>
        <p className="mt-2 text-sm text-foreground/80">Kliknij „Przejdź do kalkulacji".</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gate-firstname">Imię *</Label>
          <Input id="gate-firstname" value={draft.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder="Anna" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gate-phone">Telefon *</Label>
          <Input id="gate-phone" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+48 600 000 000" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="gate-email">E-mail *</Label>
          <Input id="gate-email" type="email" inputMode="email" value={draft.email} onChange={(e) => update("email", e.target.value)} placeholder="anna@example.com" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Masz już konto?{" "}
        <a href="/logowanie" className="font-semibold text-accent underline-offset-2 hover:underline">Zaloguj się</a>.
        {authLoading && <span className="ml-2">(sprawdzam logowanie…)</span>}
      </p>
    </div>
  );
}

function OfferPreviewCard({
  amount,
  months,
  figures,
}: {
  amount: number;
  months: number;
  figures: { monthly: number; total: number; investorCompensation: number };
}) {
  return (
    <div className="rounded-xl border border-border bg-primary p-5 text-primary-foreground">
      <div className="text-xs font-bold uppercase tracking-wide text-primary-foreground/70">
        Twoja wstępna kalkulacja
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-primary-foreground/70">Kwota</div>
          <div className="text-xl font-extrabold tabular-nums">{formatPLN(amount)}</div>
        </div>
        <div>
          <div className="text-xs text-primary-foreground/70">Okres</div>
          <div className="text-xl font-extrabold tabular-nums">{months} mies.</div>
        </div>
        <div>
          <div className="text-xs text-primary-foreground/70">Szacowana rata</div>
          <div className="text-xl font-extrabold tabular-nums">{formatPLN(figures.monthly)}</div>
        </div>
      </div>
    </div>
  );
}
