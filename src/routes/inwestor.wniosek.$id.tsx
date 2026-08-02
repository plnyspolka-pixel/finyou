import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  FileText,
  ExternalLink,
  Eye,
  AlertTriangle,
  FolderOpen,
  Lock,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { residentialAuctionBlockRisk } from "@/lib/risk-assessment/forced-sale";
import { RiskDisclaimer } from "@/components/risk-assessment/risk-disclaimer";
import { propertyTypeLabels } from "@/lib/labels";

import { KwContentSection } from "@/components/kw-content-section";
import { InvestorSummaryCard } from "@/components/property-analysis/investor-summary-card";
import { InvestorValuationCard } from "@/components/risk-assessment/investor-valuation-card";
import { formatPLN } from "@/lib/loan-math";
import { CLIENT_FILES_BUCKET, CLIENT_FILES_LABEL } from "@/lib/storage-buckets";
import { signStoragePath } from "@/lib/property-photos";
import { LoanCalculator, type LoanCalculatorState } from "@/components/loan-calculator";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { openOrCreateThread } from "@/lib/chat.functions";
import { getNbpRates } from "@/lib/nbp-rates.functions";
import { ApplicationInfoBadges } from "@/components/application-info-badges";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { useAccessState } from "@/hooks/use-access";

// Reguły z kalkulatora na /klient: max okres maleje wraz z kwotą.
function maxMonthsForAmount(amount: number): number {
  if (!amount) return 12;
  if (amount <= 400_000) return 72;
  const t = Math.min(1, Math.max(0, (amount - 400_000) / (1_000_000 - 400_000)));
  return Math.round(36 - t * (36 - 12));
}

export const Route = createFileRoute("/inwestor/wniosek/$id")({
  component: InwestorWniosekGate,
});

// Szczegół wniosku wymaga aktywnego pełnego dostępu inwestora — bez niego
// pokazujemy zamkniętą kartę (layout i tak przekierowuje na /inwestor/abonament).
function InwestorWniosekGate() {
  const { loading, hasFullAccess } = useAccessState("investor");
  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Ładowanie…</div>;
  }
  if (!hasFullAccess) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Lock className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Szczegóły wniosku wymagają pełnego dostępu</CardTitle>
            <CardDescription>
              Pełne dane wniosku, dokumenty, księga wieczysta i składanie ofert są dostępne po
              aktywacji pełnego dostępu inwestora.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/inwestor/abonament">Zobacz pakiety dostępu</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <InwestorWniosek />;
}

function isImage(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(name);
}

function InwestorWniosek() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<any | null>(null);
  const [investorId, setInvestorId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const openThread = useServerFn(openOrCreateThread);
  const fetchRates = useServerFn(getNbpRates);
  const ratesQ = useQuery({
    queryKey: ["nbp-rates"],
    queryFn: () => fetchRates(),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const maxAnnualRate = ((ratesQ.data?.referenceRate ?? 3.75) + 3.5) * 2;

  // Calc state — wypełniana przez LoanCalculator (onChange)
  const [calc, setCalc] = useState<LoanCalculatorState | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select("*, properties(*)")
        .eq("id", id)
        .maybeSingle();
      setApp(data);
      if (data) {
        void supabase.rpc("increment_loan_view" as any, { _loan_id: id });
      }
      if (user) {
        const { data: inv } = await supabase
          .from("investors")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (inv) setInvestorId(inv.id);
      }
      const { data: ds } = await supabase
        .from("documents")
        .select("*")
        .eq("loan_application_id", id)
        .order("created_at", { ascending: false });
      const list = ds ?? [];
      setDocs(list);
      // Podpisane URL-e dla każdego pliku klienta (obrazy pokazujemy jako miniaturki, reszta jako kafle).
      const next: Record<string, string> = {};
      await Promise.all(
        list.map(async (d: any) => {
          if (!d.file_path) return;
          const url = await signStoragePath(d.file_path, 3600);
          if (url) next[d.id] = url;
        }),
      );
      setDocUrls(next);

      // Zdjęcia z properties.photos (starszy format) — nie duplikujemy tych, które są już w documents.
      const knownDocPaths = new Set(list.map((d: any) => d.file_path).filter(Boolean));
      const rawPhotos: string[] = ((data?.properties?.[0]?.photos ?? []) as string[]).filter(
        (src) => isImage(src) && !knownDocPaths.has(src),
      );
      const resolved = await Promise.all(rawPhotos.map((src) => signStoragePath(src, 3600)));
      setPhotoUrls(resolved.filter((s): s is string => !!s));
    })();
  }, [id, user]);

  const openFile = async (d: any) => {
    if (!d.file_path) return;
    const url = await signStoragePath(d.file_path, 3600);
    if (url) window.open(url, "_blank");
    else toast.error("Nie udało się otworzyć pliku");
  };

  const submit = async (status: "szkic" | "zlozona") => {
    if (!investorId) {
      toast.error("Brak profilu inwestora");
      return;
    }
    if (!calc || !calc.amount || !calc.months) {
      toast.error("Uzupełnij parametry oferty w kalkulatorze");
      return;
    }
    setSubmitting(true);
    const payload = {
      loan_application_id: id,
      investor_id: investorId,
      offer_status: status as any,
      proposed_amount: calc.amount,
      period_months: calc.months,
      expected_yearly_yield: calc.annualRate,
      commission: calc.commissionPln,
      collection_protection: false,
      has_balloon: calc.balloon > 0,
      balloon_amount: calc.balloon > 0 ? calc.balloon : null,
      repayment_type: (calc.balloon > 0 ? "mieszana" : "miesieczna") as any,
      estimated_monthly_payment: calc.cappedRata,
      estimated_total_cost: calc.totalToRepay,
      schedule: calc.schedule.map((r) => ({
        idx: r.idx,
        date: r.date,
        rata: r.rata,
        kapital: r.kap,
        odsetki: r.ods,
        saldo: r.saldo,
      })) as any,
      investor_note: note || null,
      submitted_at: status === "zlozona" ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("investor_offers").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "zlozona" ? "Oferta złożona" : "Zapisano szkic");
    void navigate({ to: "/inwestor/oferty" });
  };

  if (!app) return <div className="text-muted-foreground">Ładowanie…</div>;
  const p = app.properties?.[0];

  // Wszystkie pliki klienta w jednym worku — bez dzielenia na "zdjęcia" / "dokumenty".
  const imageDocs = docs.filter((d) => d.file_path && isImage(d.file_name ?? d.file_path));
  const otherDocs = docs.filter((d) => d.file_path && !isImage(d.file_name ?? d.file_path));
  const totalFiles = imageDocs.length + otherDocs.length + photoUrls.length;

  const renderDocCard = (d: any) => {
    const url = docUrls[d.id];
    const img = url && isImage(d.file_name ?? "");
    return (
      <button
        key={d.id}
        onClick={() => void openFile(d)}
        className="group text-left border rounded-lg overflow-hidden hover:border-primary transition"
      >
        <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
          {img ? (
            <img
              src={url}
              alt={d.file_name}
              className="h-full w-full object-cover group-hover:scale-105 transition"
              loading="lazy"
            />
          ) : (
            <FileText className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
        <div className="px-2 py-1.5 text-xs flex items-center justify-between gap-1">
          <span className="truncate">{d.file_name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        to="/inwestor"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Wróć
      </Link>
      <FancyPageHeader
        eyebrow="Wniosek inwestycyjny"
        title={
          <>
            {p?.property_type ? propertyTypeLabels[p.property_type] : "Wniosek"}{" "}
            {formatPLN(app.loan_amount)}
            {p?.land_register_number ? (
              <>
                {" "}
                · <span className="font-mono">{p.land_register_number}</span>
              </>
            ) : null}
          </>
        }
        subtitle={p ? [p.city, p.voivodeship].filter(Boolean).join(", ") || undefined : undefined}
        actions={
          <Badge className="bg-white/15 text-white border-white/20 backdrop-blur">
            <Eye className="mr-1 h-3 w-3" />
            {app.view_count ?? 0} odsłon
          </Badge>
        }
      />

      <ApplicationInfoBadges app={app} loanApplicationId={id} />

      {app.situation_description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opis sytuacji klienta</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {app.situation_description}
          </CardContent>
        </Card>
      )}

      {totalFiles > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              {CLIENT_FILES_LABEL}{" "}
              <span className="text-xs font-normal text-muted-foreground">({totalFiles})</span>
            </CardTitle>
            <CardDescription>
              Zdjęcia nieruchomości, skany dokumentów i wszystkie inne załączniki wgrane przez
              klienta — w jednym miejscu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(imageDocs.length > 0 || photoUrls.length > 0) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {imageDocs.map(renderDocCard)}
                {photoUrls.map((src, i) => (
                  <a
                    key={`ph-${i}`}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="group text-left border rounded-lg overflow-hidden hover:border-primary transition"
                  >
                    <div className="aspect-[4/3] bg-muted overflow-hidden">
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </a>
                ))}
              </div>
            )}
            {otherDocs.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {otherDocs.map(renderDocCard)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <KwContentSection applicationId={id} canFetch={false} />

      <InvestorSummaryCard applicationId={id} />

      <InvestorValuationCard applicationId={id} />

      <LoanCalculator
        key={`calc-${ratesQ.data?.referenceRate ?? "loading"}`}
        initialAmount={Number(app.loan_amount) || 100_000}
        initialMonths={12}
        initialAnnualRate={Math.round(maxAnnualRate * 10) / 10}
        initialMaxPayment={Number(app.max_monthly_payment) || 0}
        onChange={setCalc}
      />

      {(() => {
        // Ostrzeżenie art. 952¹ § 2 KPC — kwota pożyczki < 5% wartości nieruchomości
        // mieszkalnej może zablokować licytację (ochrona potrzeb mieszkaniowych dłużnika).
        const propValue = Number(p?.estimated_value) || 0;
        const loanNow = Number(calc?.amount) || Number(app.loan_amount) || 0;
        const block = residentialAuctionBlockRisk({
          propertyType: p?.property_type ?? "",
          loanAmountPln: loanNow,
          propertyValuePln: propValue,
        });
        return block.blocked ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <b>Uwaga — możliwa blokada licytacji (art. 952¹ § 2 KPC).</b> {block.message}
              <span className="block mt-1 text-xs opacity-80">{block.legalBasis}</span>
            </AlertDescription>
          </Alert>
        ) : null;
      })()}

      <RiskDisclaimer />

      <Card>
        <CardHeader>
          <CardTitle>Notatka dla administratora</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="sr-only">Notatka</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcjonalna notatka do oferty…"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end flex-wrap">
        <Button
          variant="secondary"
          onClick={async () => {
            if (!investorId || !app?.client_id) return toast.error("Brak danych");
            try {
              await openThread({
                data: { loanApplicationId: id, investorId, clientId: app.client_id },
              });
              void navigate({ to: "/inwestor/wiadomosci" });
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Czat z klientem
        </Button>
        <Button variant="outline" disabled={submitting} onClick={() => void submit("szkic")}>
          Zapisz jako szkic
        </Button>
        <Button disabled={submitting} onClick={() => void submit("zlozona")}>
          <Send className="mr-2 h-4 w-4" />
          Złóż ofertę
        </Button>
      </div>
    </div>
  );
}
