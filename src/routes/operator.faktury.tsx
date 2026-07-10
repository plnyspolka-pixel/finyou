import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowRight, Pencil, MapPin, ShieldCheck, Wallet, TrendingUp, Landmark, FileText, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  listInvoiceEntities,
  createOperatorInvoice,
  listMyOperatorInvoices,
} from "@/lib/invoicing/operator-invoices.functions";

export const Route = createFileRoute("/operator/faktury")({
  component: OperatorFakturyPage,
});

const SECURITY_OPTIONS = [
  "Hipoteka",
  "Weksel",
  "Poręczenie",
  "Zastaw rejestrowy",
  "Przewłaszczenie na zabezpieczenie",
  "Cesja wierzytelności",
  "Inne",
] as const;

const VAT_RATES = ["23", "8", "5", "0", "zw"] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Robocza", issued: "Wystawiona", sent: "Wysłana", paid: "Opłacona", cancelled: "Anulowana",
};

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
          Faktury wystawiane w całości w aplikacji. Najpierw uzupełnij dane transakcji, potem dane faktury.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wystaw">Wystaw fakturę</TabsTrigger>
          <TabsTrigger value="lista">Moje dokumenty</TabsTrigger>
        </TabsList>

        <TabsContent value="wystaw" className="mt-4">
          <IssueFlow onIssued={() => setTab("lista")} />
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
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
  const createFn = useServerFn(createOperatorInvoice);

  const [step, setStep] = useState<"context" | "invoice">("context");
  const [deal, setDeal] = useState<DealContext>(EMPTY_DEAL);
  const [confirmed, setConfirmed] = useState<DealContext | null>(null);
  const [busy, setBusy] = useState(false);

  const entitiesQ = useQuery({ queryKey: ["invoice-entities"], queryFn: () => entitiesFn() });
  const entities = (entitiesQ.data as any[]) ?? [];

  const [form, setForm] = useState({
    entityId: "",
    buyerName: "",
    buyerNip: "",
    buyerEmail: "",
    buyerStreet: "",
    buyerCity: "",
    buyerPostalCode: "",
    description: "",
    grossAmount: "",
    vatRate: "23",
    bankAccount: "",
    dueDate: "",
  });

  // Domyślny podmiot + numer rachunku po wczytaniu listy.
  useEffect(() => {
    if (!entities.length || form.entityId) return;
    const def = entities.find((e) => e.is_default) ?? entities[0];
    setForm((s) => ({
      ...s,
      entityId: def.id,
      bankAccount: s.bankAccount || def.bank_account || "",
      vatRate: def.default_vat_rate || s.vatRate,
    }));
  }, [entities, form.entityId]);

  const selectedEntity = entities.find((e) => e.id === form.entityId);

  const canProceed =
    deal.city.trim().length > 0 &&
    resolvedSecurity(deal).length > 0 &&
    deal.loanAmount.trim().length > 0 &&
    deal.investorProfitAnnual.trim().length > 0;

  const proceed = () => {
    if (!canProceed) {
      toast.error("Uzupełnij wszystkie dane transakcji, aby przejść dalej.");
      return;
    }
    setConfirmed(deal);
    // Zaproponuj opis pozycji na podstawie transakcji.
    setForm((s) => ({
      ...s,
      description:
        s.description ||
        `Wynagrodzenie za usługę — pożyczka zabezpieczona (${resolvedSecurity(deal)}), ${deal.city.trim()}`,
    }));
    setStep("invoice");
  };

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
          deal: confirmed
            ? {
                city: confirmed.city.trim(),
                security: resolvedSecurity(confirmed),
                loanAmount: confirmed.loanAmount.trim(),
                investorProfitAnnual: confirmed.investorProfitAnnual.trim(),
              }
            : undefined,
        },
      });
      toast.success(`Faktura ${r.invoiceNumber} wystawiona`);
      void qc.invalidateQueries({ queryKey: ["my-operator-invoices"] });
      onIssued();
      void navigate({ to: "/faktura/$id", params: { id: r.id } });
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się wystawić faktury.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "context") {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Dane transakcji</CardTitle>
          <p className="text-sm text-muted-foreground">
            Wymagane przed wystawieniem faktury — trafią na dokument.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Miasto</Label>
            <Input value={deal.city} onChange={(e) => setDeal({ ...deal, city: e.target.value })} placeholder="np. Warszawa" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Rodzaj zabezpieczenia</Label>
            <Select value={deal.security} onValueChange={(v) => setDeal({ ...deal, security: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECURITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
            <Label className="text-xs flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Kwota pożyczki (PLN)</Label>
            <Input type="number" step="0.01" min="0" value={deal.loanAmount} onChange={(e) => setDeal({ ...deal, loanAmount: e.target.value })} placeholder="np. 250000" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Zysk inwestora rocznie</Label>
            <Input value={deal.investorProfitAnnual} onChange={(e) => setDeal({ ...deal, investorProfitAnnual: e.target.value })} placeholder="np. 10% lub 25 000 PLN" />
          </div>

          <div className="md:col-span-2 flex justify-end pt-2">
            <Button onClick={proceed} disabled={!canProceed}>
              Przejdź do fakturowania
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const security = confirmed ? resolvedSecurity(confirmed) : "";

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Podsumowanie transakcji */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Dane transakcji</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setStep("context")}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Zmień
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <DealItem icon={<MapPin className="h-3.5 w-3.5" />} label="Miasto" value={confirmed?.city} />
          <DealItem icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Zabezpieczenie" value={security} />
          <DealItem icon={<Wallet className="h-3.5 w-3.5" />} label="Kwota pożyczki" value={confirmed?.loanAmount} />
          <DealItem icon={<TrendingUp className="h-3.5 w-3.5" />} label="Zysk inwestora / rok" value={confirmed?.investorProfitAnnual} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sprzedawca i rachunek</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Podmiot wystawiający</Label>
            <Select value={form.entityId} onValueChange={onEntityChange}>
              <SelectTrigger><SelectValue placeholder="Wybierz podmiot" /></SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}{e.is_default ? " (domyślny)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEntity && (
              <p className="text-[11px] text-muted-foreground">
                {selectedEntity.legal_name}{selectedEntity.nip ? ` · NIP ${selectedEntity.nip}` : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> Numer rachunku na fakturze</Label>
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
        <CardHeader><CardTitle>Nabywca</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">Nazwa nabywcy</Label><Input value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">NIP</Label><Input value={form.buyerNip} onChange={(e) => setForm({ ...form, buyerNip: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Ulica i numer</Label><Input value={form.buyerStreet} onChange={(e) => setForm({ ...form, buyerStreet: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Kod pocztowy</Label><Input value={form.buyerPostalCode} onChange={(e) => setForm({ ...form, buyerPostalCode: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Miasto</Label><Input value={form.buyerCity} onChange={(e) => setForm({ ...form, buyerCity: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label className="text-xs">E-mail</Label><Input type="email" value={form.buyerEmail} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pozycja i kwota</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2"><Label className="text-xs">Opis pozycji</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Kwota brutto (PLN)</Label><Input type="number" step="0.01" min="0" value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stawka VAT</Label>
            <Select value={form.vatRate} onValueChange={(v) => setForm({ ...form, vatRate: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VAT_RATES.map((r) => <SelectItem key={r} value={r}>{r === "zw" ? "zw." : `${r}%`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Termin płatności</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep("context")}>
          <Pencil className="h-4 w-4 mr-2" /> Wróć do danych transakcji
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Wystawianie…" : "Wystaw fakturę"}
        </Button>
      </div>
    </div>
  );
}

function MyInvoices() {
  const listFn = useServerFn(listMyOperatorInvoices);
  const q = useQuery({ queryKey: ["my-operator-invoices"], queryFn: () => listFn() });
  const invoices = (q.data as any[]) ?? [];

  return (
    <Card>
      <CardHeader><CardTitle>Moje faktury</CardTitle></CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Ładowanie…</p>
        ) : invoices.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" /> Brak faktur.</p>
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.invoice_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{formatDate(i.issue_date)}</TableCell>
                    <TableCell className="text-sm">{i.buyer_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatPLN(i.gross_amount)}</TableCell>
                    <TableCell><Badge variant="secondary">{STATUS_LABELS[i.status] ?? i.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/faktura/$id" params={{ id: i.id }}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Otwórz / drukuj
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DealItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="font-medium break-words">{value || "—"}</div>
    </div>
  );
}
