import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  MapPin,
  ShieldCheck,
  Wallet,
  TrendingUp,
  Landmark,
  FileText,
  ExternalLink,
  Building2,
  User,
  CheckCircle2,
  Clock,
  Coins,
} from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  listInvoiceEntities,
  listInstitutionalPartners,
  createOperatorInvoice,
  listMyOperatorInvoices,
  setLoanPaidOut,
  setInvoiceDeal,
} from "@/lib/invoicing/operator-invoices.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CompanyLookupInline, VerifiedBadge } from "@/components/company-lookup-inline";

export const Route = createFileRoute("/operator/faktury")({
  component: OperatorFakturyPage,
});

// Rodzaj zabezpieczenia = typ nieruchomości/zabezpieczenia pożyczki.
const SECURITY_OPTIONS = [
  "Mieszkanie",
  "Dom",
  "Działka budowlana",
  "Działka rolna",
  "Inne",
] as const;

const VAT_RATES = ["23", "8", "5", "0", "zw"] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Robocza",
  issued: "Wystawiona",
  sent: "Wysłana",
  paid: "Opłacona",
  cancelled: "Anulowana",
};

type BuyerType = "instytucja" | "klient_indywidualny";

type DealContext = {
  city: string;
  security: string;
  securityOther: string;
  loanAmount: string;
  investorProfitAnnual: string;
};

const EMPTY_DEAL: DealContext = {
  city: "",
  security: SECURITY_OPTIONS[0],
  securityOther: "",
  loanAmount: "",
  investorProfitAnnual: "",
};

function resolvedSecurity(d: DealContext): string {
  return d.security === "Inne" ? d.securityOther.trim() : d.security;
}

function OperatorFakturyPage() {
  const [tab, setTab] = useState("wystaw");

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Wystawianie faktur</h1>
        <p className="text-sm text-muted-foreground">
          Faktury wystawiane w całości w aplikacji. Dane transakcji i prowizje zapisujemy
          wewnętrznie — nie pojawiają się na fakturze.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wystaw">Wystaw fakturę</TabsTrigger>
          <TabsTrigger value="lista">Moje faktury</TabsTrigger>
        </TabsList>

        <TabsContent value="wystaw" className="mt-4" forceMount hidden={tab !== "wystaw"}>
          <IssueFlow onIssued={() => setTab("lista")} />
        </TabsContent>

        <TabsContent value="lista" className="mt-4" forceMount hidden={tab !== "lista"}>
          <MyInvoices />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IssueFlow({ onIssued }: { onIssued: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const entitiesFn = useServerFn(listInvoiceEntities);
  const partnersFn = useServerFn(listInstitutionalPartners);
  const createFn = useServerFn(createOperatorInvoice);
  const setDealFn = useServerFn(setInvoiceDeal);

  const [busy, setBusy] = useState(false);

  // Persystencja formularza w sessionStorage — nie tracimy danych, gdy user
  // przełącza karty Chrome, minimalizuje przeglądarkę albo klika inną zakładkę.
  const FORM_KEY = "operator.faktury.form.v1";
  const DEAL_KEY = "operator.faktury.deal.v1";
  const ISSUED_KEY = "operator.faktury.issued.v1";

  const defaultForm = {
    buyerType: "instytucja" as BuyerType,
    entityId: "",
    buyerName: "",
    buyerNip: "",
    buyerRegon: "",
    buyerKrs: "",
    buyerEmail: "",
    buyerStreet: "",
    buyerCity: "",
    buyerPostalCode: "",
    buyerVerified: false,
    description: "Usługa pośrednictwa finansowego",
    grossAmount: "",
    vatRate: "zw",
    bankAccount: "",
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    operatorCommission: "",
  };

  const readStored = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return { ...(fallback as any), ...(parsed as any) } as T;
    } catch {
      return fallback;
    }
  };
  const readStoredRaw = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const [issued, setIssued] = useState<{ id: string; invoiceNumber: string } | null>(() =>
    readStoredRaw<{ id: string; invoiceNumber: string } | null>(ISSUED_KEY, null),
  );
  const [deal, setDeal] = useState<DealContext>(() =>
    readStored<DealContext>(DEAL_KEY, EMPTY_DEAL),
  );
  const [savingDeal, setSavingDeal] = useState(false);

  const entitiesQ = useQuery({ queryKey: ["invoice-entities"], queryFn: () => entitiesFn() });
  const entities = (entitiesQ.data as any[]) ?? [];
  const partnersQ = useQuery({ queryKey: ["institutional-partners"], queryFn: () => partnersFn() });
  const partners = (partnersQ.data as any[]) ?? [];

  const [form, setForm] = useState(() => readStored(FORM_KEY, defaultForm));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch {}
  }, [form]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(DEAL_KEY, JSON.stringify(deal));
    } catch {}
  }, [deal]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (issued) window.sessionStorage.setItem(ISSUED_KEY, JSON.stringify(issued));
      else window.sessionStorage.removeItem(ISSUED_KEY);
    } catch {}
  }, [issued]);

  const clearPersisted = () => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(FORM_KEY);
      window.sessionStorage.removeItem(DEAL_KEY);
      window.sessionStorage.removeItem(ISSUED_KEY);
    } catch {}
  };

  // Domyślny podmiot + numer rachunku po wczytaniu listy.
  useEffect(() => {
    if (!entities.length || form.entityId) return;
    const def = entities.find((e) => e.is_default) ?? entities[0];
    setForm((s) => ({
      ...s,
      entityId: def.id,
      bankAccount: s.bankAccount || def.bank_account || "",
    }));
  }, [entities, form.entityId]);

  // Domyślna prowizja wewnętrzna operatora = 50% kwoty brutto (edytowalna).
  const [commissionTouched, setCommissionTouched] = useState(false);
  useEffect(() => {
    if (commissionTouched) return;
    const gross = Number(form.grossAmount);
    const auto = Number.isFinite(gross) && gross > 0 ? (gross * 0.5).toFixed(2) : "";
    setForm((s) => (s.operatorCommission === auto ? s : { ...s, operatorCommission: auto }));
  }, [form.grossAmount, commissionTouched]);

  const selectedEntity = entities.find((e) => e.id === form.entityId);

  const onEntityChange = (id: string) => {
    const e = entities.find((x) => x.id === id);
    setForm((s) => ({
      ...s,
      entityId: id,
      bankAccount: e?.bank_account || s.bankAccount,
      vatRate: e?.default_vat_rate || s.vatRate,
    }));
  };

  const submit = async () => {
    if (!form.entityId) return toast.error("Wybierz podmiot wystawiający.");
    if (!form.buyerName.trim()) return toast.error("Podaj nazwę nabywcy.");
    if (!form.description.trim()) return toast.error("Podaj opis pozycji.");
    const gross = Number(form.grossAmount);
    if (!gross || gross <= 0) return toast.error("Podaj poprawną kwotę brutto.");
    setBusy(true);
    try {
      const r = await createFn({
        data: {
          buyerType: form.buyerType,
          entityId: form.entityId,
          buyerName: form.buyerName.trim(),
          buyerNip: form.buyerNip.trim() || undefined,
          buyerEmail: form.buyerEmail.trim() || undefined,
          buyerStreet: form.buyerStreet.trim() || undefined,
          buyerCity: form.buyerCity.trim() || undefined,
          buyerPostalCode: form.buyerPostalCode.trim() || undefined,
          description: form.description.trim(),
          grossAmount: gross,
          vatRate: form.vatRate,
          bankAccount: form.bankAccount.trim() || undefined,
          dueDate: form.dueDate || undefined,
          operatorCommission: form.operatorCommission ? Number(form.operatorCommission) : undefined,
        },
      });
      toast.success(`Faktura ${r.invoiceNumber} wystawiona`);
      void qc.invalidateQueries({ queryKey: ["my-operator-invoices"] });
      setIssued({ id: r.id, invoiceNumber: r.invoiceNumber });
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się wystawić faktury.");
    } finally {
      setBusy(false);
    }
  };

  const canSaveDeal =
    deal.city.trim().length > 0 &&
    resolvedSecurity(deal).length > 0 &&
    deal.loanAmount.trim().length > 0 &&
    deal.investorProfitAnnual.trim().length > 0;

  const saveDeal = async () => {
    if (!issued) return;
    if (!canSaveDeal) return toast.error("Uzupełnij wszystkie dane transakcji.");
    setSavingDeal(true);
    try {
      await setDealFn({
        data: {
          id: issued.id,
          deal: {
            city: deal.city.trim(),
            security: resolvedSecurity(deal),
            loanAmount: deal.loanAmount.trim(),
            investorProfitAnnual: deal.investorProfitAnnual.trim(),
          },
        },
      });
      toast.success("Dane transakcji zapisane");
      void qc.invalidateQueries({ queryKey: ["my-operator-invoices"] });
      const id = issued.id;
      setIssued(null);
      setDeal(EMPTY_DEAL);
      setForm(defaultForm);
      clearPersisted();
      onIssued();
      void navigate({ to: "/faktura/$id", params: { id } });
      void navigate({ to: "/faktura/$id", params: { id } });
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się zapisać danych transakcji.");
    } finally {
      setSavingDeal(false);
    }
  };

  const skipDeal = () => {
    if (!issued) return;
    const id = issued.id;
    setIssued(null);
    setDeal(EMPTY_DEAL);
    setForm(defaultForm);
    clearPersisted();
    onIssued();
    void navigate({ to: "/faktura/$id", params: { id } });
  };

  const isIndividual = form.buyerType === "klient_indywidualny";

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Typ faktury */}
      <Card>
        <CardHeader>
          <CardTitle>Typ faktury</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <BuyerTypeButton
              active={form.buyerType === "instytucja"}
              onClick={() => setForm({ ...form, buyerType: "instytucja" })}
              icon={<Building2 className="h-4 w-4" />}
              title="Instytucja"
              desc="Faktura na dane instytucji (B2B)."
            />
            <BuyerTypeButton
              active={isIndividual}
              onClick={() => setForm({ ...form, buyerType: "klient_indywidualny" })}
              icon={<User className="h-4 w-4" />}
              title="Klient indywidualny"
              desc="Faktura na dane klienta pożyczkowego."
            />
          </div>
          {isIndividual && (
            <p className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-[12px] text-amber-800">
              Faktura wystawiana na dane klienta pożyczkowego. Inwestor wypłaci tę kwotę jako część
              pożyczki na konto Finance You.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sprzedawca i rachunek</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Podmiot wystawiający</Label>
            <Select value={form.entityId} onValueChange={onEntityChange}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz podmiot" />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.is_default ? " (domyślny)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEntity && (
              <p className="text-[11px] text-muted-foreground">
                {selectedEntity.legal_name}
                {selectedEntity.nip ? ` · NIP ${selectedEntity.nip}` : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> Numer rachunku na fakturze
            </Label>
            <Input
              value={form.bankAccount}
              onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
              placeholder="np. 00 0000 0000 0000 0000 0000 0000"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Domyślnie z danych podmiotu — możesz potwierdzić lub zmienić dla tej faktury.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>
              {isIndividual ? "Nabywca — dane klienta pożyczkowego" : "Nabywca — instytucja"}
            </span>
            <VerifiedBadge verified={form.buyerVerified} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!isIndividual && (
            <div className="rounded-md border border-dashed p-3 space-y-2">
              <Label className="text-xs">Wybierz z naszych partnerów instytucjonalnych</Label>
              <Select
                value=""
                onValueChange={(id) => {
                  const p = partners.find((x) => x.id === id);
                  if (!p) return;
                  setForm((s) => ({
                    ...s,
                    buyerName:
                      p.company_name ||
                      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                      s.buyerName,
                    buyerNip: p.nip || "",
                    buyerRegon: p.regon || "",
                    buyerKrs: p.krs || "",
                    buyerStreet: p.street || "",
                    buyerPostalCode: p.postal_code || "",
                    buyerCity: p.city || "",
                    buyerEmail: p.email || "",
                    buyerVerified: !!p.nip,
                  }));
                  toast.success(`Wczytano dane: ${p.company_name ?? p.email ?? "partner"}`);
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      partnersQ.isLoading
                        ? "Ładowanie partnerów…"
                        : `Wybierz partnera (${partners.length})`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.company_name ||
                        [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                        p.email ||
                        "—"}
                      {p.nip ? ` · NIP ${p.nip}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Lub wpisz NIP/REGON/KRS poniżej, żeby zaciągnąć nowego nabywcę z GUS.
              </p>
            </div>
          )}
          <div className="rounded-md border border-dashed p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Wpisz {isIndividual ? "NIP (opcjonalnie)" : "NIP, REGON lub KRS"} i pobierz dane firmy
              z GUS/KRS — resztę pól uzupełnimy automatycznie.
            </p>
            <CompanyLookupInline
              compact
              showRegon={!isIndividual}
              showKrs={!isIndividual}
              value={{ nip: form.buyerNip, regon: form.buyerRegon, krs: form.buyerKrs }}
              onChange={(v) =>
                setForm({
                  ...form,
                  buyerNip: v.nip ?? "",
                  buyerRegon: v.regon ?? "",
                  buyerKrs: v.krs ?? "",
                  buyerVerified: false,
                })
              }
              onResolved={(c) =>
                setForm((s) => ({
                  ...s,
                  buyerName: c.name || s.buyerName,
                  buyerNip: c.nip || s.buyerNip,
                  buyerRegon: c.regon || s.buyerRegon,
                  buyerKrs: c.krs || s.buyerKrs,
                  buyerStreet: c.street || s.buyerStreet,
                  buyerPostalCode: c.postalCode || s.buyerPostalCode,
                  buyerCity: c.city || s.buyerCity,
                  buyerEmail: c.email || s.buyerEmail,
                  buyerVerified: true,
                }))
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">
                {isIndividual ? "Imię i nazwisko klienta" : "Nazwa nabywcy"}
              </Label>
              <Input
                value={form.buyerName}
                onChange={(e) =>
                  setForm({ ...form, buyerName: e.target.value, buyerVerified: false })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ulica i numer</Label>
              <Input
                value={form.buyerStreet}
                onChange={(e) => setForm({ ...form, buyerStreet: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kod pocztowy</Label>
                <Input
                  value={form.buyerPostalCode}
                  onChange={(e) => setForm({ ...form, buyerPostalCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Miasto</Label>
                <Input
                  value={form.buyerCity}
                  onChange={(e) => setForm({ ...form, buyerCity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.buyerEmail}
                onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pozycja i kwota</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Opis pozycji (widoczny na fakturze)</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Kwota brutto (PLN)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.grossAmount}
              onChange={(e) => setForm({ ...form, grossAmount: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stawka VAT</Label>
            <Select value={form.vatRate} onValueChange={(v) => setForm({ ...form, vatRate: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAT_RATES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === "zw" ? "zw." : `${r}%`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Termin płatności</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Rozliczenie wewnętrzne — nie trafia na fakturę */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4" /> Rozliczenie wewnętrzne
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Nie pojawia się na fakturze. Prowizja z faktury (kwota brutto) trafia do rejestru
            zrealizowanych.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Prowizja wewnętrzna operatora (PLN)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.operatorCommission}
              onChange={(e) => {
                setCommissionTouched(true);
                setForm({ ...form, operatorCommission: e.target.value });
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Domyślnie 50% kwoty brutto faktury. Możesz edytować. Wypłacana po wypłacie pożyczki.
              </p>
              {commissionTouched && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    const gross = Number(form.grossAmount);
                    const auto =
                      Number.isFinite(gross) && gross > 0 ? (gross * 0.5).toFixed(2) : "";
                    setCommissionTouched(false);
                    setForm((s) => ({ ...s, operatorCommission: auto }));
                  }}
                >
                  Przywróć 50%
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Wystawianie…" : "Wystaw fakturę"}
        </Button>
      </div>

      <Dialog
        open={!!issued}
        onOpenChange={(open) => {
          if (!open) skipDeal();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dane transakcji {issued ? `— ${issued.invoiceNumber}` : ""}</DialogTitle>
            <DialogDescription>
              Zapisujemy je wewnętrznie (jako zrealizowane) — nie pojawiają się na fakturze.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Miasto
              </Label>
              <Input
                value={deal.city}
                onChange={(e) => setDeal({ ...deal, city: e.target.value })}
                placeholder="np. Warszawa"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Rodzaj zabezpieczenia
              </Label>
              <Select
                value={deal.security}
                onValueChange={(v) => setDeal({ ...deal, security: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECURITY_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {deal.security === "Inne" && (
                <Input
                  className="mt-2"
                  value={deal.securityOther}
                  onChange={(e) => setDeal({ ...deal, securityOther: e.target.value })}
                  placeholder="Wpisz rodzaj zabezpieczenia"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Kwota pożyczki (PLN)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={deal.loanAmount}
                onChange={(e) => setDeal({ ...deal, loanAmount: e.target.value })}
                placeholder="np. 250000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Zysk inwestora rocznie
              </Label>
              <Input
                value={deal.investorProfitAnnual}
                onChange={(e) => setDeal({ ...deal, investorProfitAnnual: e.target.value })}
                placeholder="np. 10% lub 25 000 PLN"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={skipDeal} disabled={savingDeal}>
              Uzupełnię później
            </Button>
            <Button onClick={saveDeal} disabled={savingDeal || !canSaveDeal}>
              {savingDeal ? "Zapisywanie…" : "Zapisz dane transakcji"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BuyerTypeButton({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      }`}
    >
      <span className={`mt-0.5 ${active ? "text-primary" : "text-muted-foreground"}`}>{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}

function MyInvoices() {
  const listFn = useServerFn(listMyOperatorInvoices);
  const paidFn = useServerFn(setLoanPaidOut);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-operator-invoices"], queryFn: () => listFn() });
  const invoices = (q.data as any[]) ?? [];

  const togglePaid = async (id: string, paidOut: boolean) => {
    try {
      await paidFn({ data: { id, paidOut } });
      toast.success(paidOut ? "Oznaczono: pożyczka wypłacona" : "Cofnięto oznaczenie wypłaty");
      void qc.invalidateQueries({ queryKey: ["my-operator-invoices"] });
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się zmienić statusu.");
    }
  };

  const commissionPaid = invoices
    .filter((i) => i.loan_paid_out)
    .reduce((s, i) => s + Number(i.operator_commission || 0), 0);
  const commissionPending = invoices
    .filter((i) => !i.loan_paid_out)
    .reduce((s, i) => s + Number(i.operator_commission || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Faktury"
          value={String(invoices.length)}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Prowizja operatora — wypłacona"
          value={formatPLN(commissionPaid)}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        />
        <StatCard
          label="Prowizja operatora — oczekująca"
          value={formatPLN(commissionPending)}
          icon={<Clock className="h-4 w-4 text-amber-600" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moje faktury</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Ładowanie…</p>
          ) : invoices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" /> Brak faktur.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numer</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Nabywca</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Prowizja operatora</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.invoice_number ?? "—"}</TableCell>
                      <TableCell className="text-xs">{formatDate(i.issue_date)}</TableCell>
                      <TableCell className="text-sm">
                        {i.buyer_name ?? "—"}
                        <div className="mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4">
                            {i.buyer_type === "klient_indywidualny"
                              ? "Klient indyw."
                              : "Instytucja"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatPLN(i.gross_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{STATUS_LABELS[i.status] ?? i.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(i.operator_commission) > 0 ? (
                          <div className="space-y-1">
                            <div className="tabular-nums font-medium">
                              {formatPLN(i.operator_commission)}
                            </div>
                            {i.loan_paid_out ? (
                              <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-800">
                                Wypłacona
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-4 bg-amber-100 text-amber-800"
                              >
                                Oczekuje
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={
                              i.loan_paid_out
                                ? "Cofnij: pożyczka wypłacona"
                                : "Oznacz: pożyczka wypłacona"
                            }
                            onClick={() => togglePaid(i.id, !i.loan_paid_out)}
                          >
                            <CheckCircle2
                              className={`h-3.5 w-3.5 ${i.loan_paid_out ? "text-emerald-600" : "text-muted-foreground"}`}
                            />
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/faktura/$id" params={{ id: i.id }}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-muted">{icon}</div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
