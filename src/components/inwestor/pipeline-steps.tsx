// Formularze kroków 1, 2 i 4 pipeline'u inwestora:
//  1. dane pożyczkodawcy (osoba fizyczna / JDG / spółka + wyszukiwarka GUS/KRS),
//  2. rachunek bankowy do spłaty pożyczki (wymuszony, walidacja NRB/IBAN),
//  4. screening list sankcyjnych (Dilisense) — uruchamiany po KYC.
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Banknote, ShieldAlert, ShieldCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyLookupInline, type ResolvedCompany } from "@/components/company-lookup-inline";
import { detectPolishBankAccount, formatAccountGroups } from "@/lib/polish-bank";
import {
  saveLenderData,
  saveRepaymentAccount,
  runMySanctionsScreening,
} from "@/lib/investor-agreements/pipeline.functions";
import type { ScreeningResult } from "@/lib/investor-plan/pipeline";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

type EntityVariant = "osoba_fizyczna" | "jdg" | "osoba_prawna";

// ── Krok 1: dane pożyczkodawcy ──────────────────────────────────────────────

export function LenderDataStep({
  investor,
  onDone,
}: {
  investor: Record<string, any> | null;
  onDone: () => void;
}) {
  const save = useServerFn(saveLenderData);
  const [variant, setVariant] = useState<EntityVariant | "">(
    (investor?.entity_variant as EntityVariant) ?? "",
  );
  const [isConsumer, setIsConsumer] = useState<boolean>(Boolean(investor?.is_consumer));
  const [lookupSource, setLookupSource] = useState<"gus" | "krs" | "reczne">(
    (investor?.lender_lookup_source as "gus" | "krs" | "reczne") ?? "reczne",
  );
  const [f, setF] = useState({
    firstName: investor?.first_name ?? "",
    lastName: investor?.last_name ?? "",
    pesel: investor?.pesel ?? "",
    companyName: investor?.company_name ?? "",
    nip: investor?.nip ?? "",
    krs: investor?.krs ?? "",
    regon: investor?.regon ?? "",
    legalForm: investor?.legal_form ?? "",
    representativeFirstName: investor?.representative_first_name ?? "",
    representativeLastName: investor?.representative_last_name ?? "",
    representativeRole: investor?.representative_role ?? "",
    street: investor?.street ?? investor?.address ?? "",
    postalCode: investor?.postal_code ?? "",
    city: investor?.city ?? "",
    email: investor?.email ?? "",
    phone: investor?.phone ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const isCompany = variant === "jdg" || variant === "osoba_prawna";

  // Osoba prawna nigdy nie jest Konsumentem — pilnujemy tego też w UI.
  useEffect(() => {
    if (variant === "osoba_prawna" && isConsumer) setIsConsumer(false);
  }, [variant, isConsumer]);

  const onResolved = (c: ResolvedCompany) => {
    setF((prev) => ({
      ...prev,
      companyName: c.name || prev.companyName,
      nip: c.nip || prev.nip,
      krs: c.krs || prev.krs,
      regon: c.regon || prev.regon,
      street: c.street || prev.street,
      postalCode: c.postalCode || prev.postalCode,
      city: c.city || prev.city,
      email: c.email || prev.email,
      phone: c.phone || prev.phone,
    }));
    setLookupSource(c.krs ? "krs" : "gus");
    toast.success("Dane pobrane z rejestru — sprawdź i zapisz.");
  };

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          entityVariant: variant as EntityVariant,
          isConsumer,
          firstName: f.firstName || null,
          lastName: f.lastName || null,
          pesel: f.pesel || null,
          companyName: f.companyName || null,
          nip: f.nip || null,
          krs: f.krs || null,
          regon: f.regon || null,
          legalForm: f.legalForm || null,
          representativeFirstName: f.representativeFirstName || null,
          representativeLastName: f.representativeLastName || null,
          representativeRole: f.representativeRole || null,
          street: f.street,
          postalCode: f.postalCode,
          city: f.city,
          country: "PL",
          email: f.email,
          phone: f.phone,
          lookupSource,
        },
      }),
    onSuccess: () => {
      toast.success("Dane pożyczkodawcy zapisane — system wypełni nimi umowy.");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kto udziela pożyczki?</Label>
          <Select value={variant} onValueChange={(v) => setVariant(v as EntityVariant)}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="osoba_fizyczna">Osoba fizyczna</SelectItem>
              <SelectItem value="jdg">Jednoosobowa działalność gospodarcza</SelectItem>
              <SelectItem value="osoba_prawna">Spółka / osoba prawna</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Checkbox
            id="pipeline-consumer"
            checked={isConsumer}
            disabled={variant === "osoba_prawna"}
            onCheckedChange={(v) => setIsConsumer(v === true)}
          />
          <Label htmlFor="pipeline-consumer" className="text-sm font-normal leading-snug">
            Jestem Konsumentem (umowa bez bezpośredniego związku z działalnością gospodarczą)
          </Label>
        </div>
      </div>

      {isCompany ? (
        <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pobierz dane z rejestru — wpisz NIP, REGON albo KRS
          </div>
          <CompanyLookupInline
            value={{ nip: f.nip, regon: f.regon, krs: f.krs }}
            onChange={(v) =>
              setF((prev) => ({
                ...prev,
                nip: v.nip ?? prev.nip,
                regon: v.regon ?? prev.regon,
                krs: v.krs ?? prev.krs,
              }))
            }
            onResolved={onResolved}
            showKrs={variant === "osoba_prawna"}
            showCrbr={variant === "osoba_prawna"}
          />
        </div>
      ) : null}

      {variant ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isCompany ? (
            <>
              <Field
                label="Pełna nazwa firmy"
                value={f.companyName}
                onChange={(v) => set("companyName", v)}
                className="sm:col-span-2"
              />
              <Field
                label="Forma prawna"
                value={f.legalForm}
                onChange={(v) => set("legalForm", v)}
              />
            </>
          ) : (
            <>
              <Field label="Imię" value={f.firstName} onChange={(v) => set("firstName", v)} />
              <Field label="Nazwisko" value={f.lastName} onChange={(v) => set("lastName", v)} />
              <Field label="PESEL" value={f.pesel} onChange={(v) => set("pesel", v)} />
            </>
          )}

          {variant === "osoba_prawna" ? (
            <>
              <Field
                label="Reprezentant — imię"
                value={f.representativeFirstName}
                onChange={(v) => set("representativeFirstName", v)}
              />
              <Field
                label="Reprezentant — nazwisko"
                value={f.representativeLastName}
                onChange={(v) => set("representativeLastName", v)}
              />
              <Field
                label="Funkcja"
                value={f.representativeRole}
                onChange={(v) => set("representativeRole", v)}
                placeholder="np. Prezes Zarządu"
              />
            </>
          ) : null}

          <Field
            label="Ulica i numer"
            value={f.street}
            onChange={(v) => set("street", v)}
            className="sm:col-span-2"
          />
          <Field
            label="Kod pocztowy"
            value={f.postalCode}
            onChange={(v) => set("postalCode", v)}
            placeholder="00-000"
          />
          <Field label="Miejscowość" value={f.city} onChange={(v) => set("city", v)} />
          <Field label="E-mail" value={f.email} onChange={(v) => set("email", v)} type="email" />
          <Field label="Telefon" value={f.phone} onChange={(v) => set("phone", v)} />
        </div>
      ) : null}

      <Button disabled={!variant || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Zapisz dane pożyczkodawcy
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value ?? ""}
        type={type}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Krok 2: rachunek do spłaty pożyczki ─────────────────────────────────────

export function RepaymentAccountStep({
  bank,
  onDone,
}: {
  bank: { account: string | null; bankName: string | null; confirmedAt: string | null };
  onDone: () => void;
}) {
  const save = useServerFn(saveRepaymentAccount);
  const [account, setAccount] = useState(bank.account ?? "");

  // Walidacja lokalna (ta sama funkcja co na serwerze) — natychmiastowy
  // podgląd banku, zanim cokolwiek poleci na backend.
  const detected = useMemo(
    () => (account.replace(/\s/g, "").length >= 10 ? detectPolishBankAccount(account) : null),
    [account],
  );

  const mut = useMutation({
    mutationFn: () => save({ data: { account } }),
    onSuccess: (res: any) => {
      toast.success(res.bankName ? `Rachunek zapisany — ${res.bankName}.` : "Rachunek zapisany.");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const valid = detected?.success === true;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Na ten rachunek pożyczkobiorca będzie spłacał pożyczkę. Numer trafia do umowy i do
        harmonogramu — bez niego pipeline nie ruszy dalej.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Numer rachunku (NRB albo IBAN)</Label>
          <Input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="PL00 0000 0000 0000 0000 0000 0000"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <Button disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Banknote className="mr-2 h-4 w-4" />
          )}
          Zapisz rachunek
        </Button>
      </div>

      {detected ? (
        detected.success ? (
          <p className="text-xs font-medium text-emerald-700">
            {formatAccountGroups(detected.normalized)}
            {detected.bankName ? ` · ${detected.bankName}` : ""} · suma kontrolna poprawna
          </p>
        ) : (
          <p className="text-xs font-medium text-destructive">{detected.message}</p>
        )
      ) : null}

      {bank.confirmedAt ? (
        <p className="text-xs text-muted-foreground">
          Zapisany {new Date(bank.confirmedAt).toLocaleString("pl-PL")}
          {bank.bankName ? ` · ${bank.bankName}` : ""}
        </p>
      ) : null}
    </div>
  );
}

// ── Krok 4: screening list sankcyjnych ──────────────────────────────────────

const SCREENING_LABELS: Record<ScreeningResult, { label: string; tone: string }> = {
  clear: { label: "Brak trafień na listach", tone: "text-emerald-700" },
  possible_match: {
    label: "Możliwe trafienie sankcyjne — analiza Finance You",
    tone: "text-amber-700",
  },
  manual_review: { label: "Skierowane do ręcznej analizy", tone: "text-amber-700" },
  confirmed_sanctions_match: {
    label: "Potwierdzone trafienie sankcyjne",
    tone: "text-destructive",
  },
  pep_review_required: { label: "PEP — wymagana analiza", tone: "text-amber-700" },
};

export function SanctionsScreeningStep({
  screening,
  kycApproved,
  onDone,
}: {
  screening: { result: ScreeningResult | null; updatedAt: string | null };
  kycApproved: boolean;
  onDone: () => void;
}) {
  const run = useServerFn(runMySanctionsScreening);
  const mut = useMutation({
    mutationFn: () => run(),
    onSuccess: (res: any) => {
      const r = SCREENING_LABELS[res.result as ScreeningResult];
      toast.success(`Screening zakończony: ${r?.label ?? res.result}`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const current = screening.result ? SCREENING_LABELS[screening.result] : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sprawdzamy listy sankcyjne, PEP i listy ostrzegawcze u dostawcy Dilisense — to osobne
        badanie niż weryfikacja tożsamości Didit. Potwierdzenie trafienia jest zawsze decyzją
        człowieka po stronie compliance Finance You.
      </p>

      {current ? (
        <p className={`flex items-center gap-2 text-sm font-medium ${current.tone}`}>
          {screening.result === "clear" ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          {current.label}
          {screening.updatedAt ? (
            <span className="font-normal text-muted-foreground">
              · {new Date(screening.updatedAt).toLocaleString("pl-PL")}
            </span>
          ) : null}
        </p>
      ) : null}

      <Button
        size="sm"
        variant={screening.result === "clear" ? "outline" : "default"}
        disabled={!kycApproved || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ShieldAlert className="mr-2 h-4 w-4" />
        )}
        {screening.result ? "Uruchom screening ponownie" : "Uruchom screening"}
      </Button>

      {!kycApproved ? (
        <p className="text-xs text-muted-foreground">
          Screening uruchamiamy po pozytywnej weryfikacji tożsamości (krok 3).
        </p>
      ) : null}
    </div>
  );
}
