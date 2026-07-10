import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getFakturowoStatus } from "@/lib/fakturowo.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Pencil, MapPin, ShieldCheck, Wallet, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SELLER,
  SELLER_KEY,
  loadSeller,
  type SellerSettings,
  type IssueFormDefaults,
  SellerForm,
  IssueForm,
  DocumentList,
} from "@/components/invoicing/fakturowo-form";

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
  const [seller, setSeller] = useState<SellerSettings>(DEFAULT_SELLER);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const checkStatus = useServerFn(getFakturowoStatus);

  useEffect(() => {
    setSeller(loadSeller());
    checkStatus({}).then((r) => setConfigured(r.configured)).catch(() => setConfigured(false));
  }, [checkStatus]);

  const saveSeller = (next: SellerSettings) => {
    setSeller(next);
    try {
      localStorage.setItem(SELLER_KEY, JSON.stringify(next));
      toast.success("Zapisano dane sprzedawcy");
    } catch {
      toast.error("Nie udało się zapisać ustawień");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wystawianie faktur</h1>
          <p className="text-sm text-muted-foreground">
            Najpierw uzupełnij dane transakcji, potem przejdź do systemu fakturowania.
          </p>
        </div>
        <Badge variant={configured ? "default" : "destructive"}>
          {configured === null ? "…" : configured ? "Klucz API skonfigurowany" : "Brak klucza API"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wystaw">Wystaw fakturę</TabsTrigger>
          <TabsTrigger value="lista">Moje dokumenty</TabsTrigger>
          <TabsTrigger value="ustawienia">Dane sprzedawcy</TabsTrigger>
        </TabsList>

        <TabsContent value="wystaw" className="mt-4">
          <IssueFlow seller={seller} configured={configured ?? false} />
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
          <DocumentList mineOnly />
        </TabsContent>

        <TabsContent value="ustawienia" className="mt-4">
          <SellerForm seller={seller} onSave={saveSeller} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IssueFlow({ seller, configured }: { seller: SellerSettings; configured: boolean }) {
  const [step, setStep] = useState<"context" | "invoice">("context");
  const [deal, setDeal] = useState<DealContext>(EMPTY_DEAL);
  const [confirmed, setConfirmed] = useState<DealContext | null>(null);

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
    setStep("invoice");
  };

  const defaults: IssueFormDefaults | undefined = useMemo(() => {
    if (!confirmed) return undefined;
    const security = resolvedSecurity(confirmed);
    const notes = [
      "Dane transakcji:",
      `Miasto: ${confirmed.city.trim()}`,
      `Rodzaj zabezpieczenia: ${security}`,
      `Kwota pożyczki: ${confirmed.loanAmount.trim()}`,
      `Zysk inwestora rocznie: ${confirmed.investorProfitAnnual.trim()}`,
    ].join("\n");
    return { notes, place: confirmed.city.trim() };
  }, [confirmed]);

  if (step === "context") {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Dane transakcji</CardTitle>
          <p className="text-sm text-muted-foreground">
            Te informacje są wymagane przed wystawieniem faktury i zostaną dołączone do dokumentu.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Miasto</Label>
            <Input
              value={deal.city}
              onChange={(e) => setDeal({ ...deal, city: e.target.value })}
              placeholder="np. Warszawa"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Rodzaj zabezpieczenia</Label>
            <Select value={deal.security} onValueChange={(v) => setDeal({ ...deal, security: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECURITY_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
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
            <Label className="text-xs flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Kwota pożyczki (PLN)</Label>
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
            <Label className="text-xs flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Zysk inwestora rocznie</Label>
            <Input
              value={deal.investorProfitAnnual}
              onChange={(e) => setDeal({ ...deal, investorProfitAnnual: e.target.value })}
              placeholder="np. 10% lub 25 000 PLN"
            />
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
    <IssueForm
      seller={seller}
      configured={configured}
      defaults={defaults}
      headerSlot={
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Dane transakcji</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setStep("context")}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Zmień
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
      }
    />
  );
}

function DealItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-medium break-words">{value || "—"}</div>
    </div>
  );
}
