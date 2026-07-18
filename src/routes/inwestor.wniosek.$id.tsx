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
import { ArrowLeft, Send, MessageSquare, FileText, ExternalLink, Eye, AlertTriangle, FolderOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { residentialAuctionBlockRisk } from "@/lib/risk-assessment/forced-sale";
import { RiskDisclaimer } from "@/components/risk-assessment/risk-disclaimer";
import { propertyTypeLabels } from "@/lib/labels";
import { PropertyLocationAnalysis } from "@/components/property-location-analysis";
import { CollateralAnalysisSection } from "@/components/property-analysis/collateral-analysis-section";
import { KwContentSection } from "@/components/kw-content-section";
import { InvestorSummaryCard } from "@/components/property-analysis/investor-summary-card";
import { InvestorValuationCard } from "@/components/risk-assessment/investor-valuation-card";
import { formatPLN } from "@/lib/loan-math";
import { CLIENT_FILES_BUCKET, CLIENT_FILES_LABEL } from "@/lib/storage-buckets";
import { LoanCalculator, type LoanCalculatorState } from "@/components/loan-calculator";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { openOrCreateThread } from "@/lib/chat.functions";
import { getNbpRates } from "@/lib/nbp-rates.functions";
import { ApplicationInfoBadges } from "@/components/application-info-badges";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

// Reguły z kalkulatora na /klient: max okres maleje wraz z kwotą.
function maxMonthsForAmount(amount: number): number {
  if (!amount) return 12;
  if (amount <= 400_000) return 72;
  const t = Math.min(1, Math.max(0, (amount - 400_000) / (1_000_000 - 400_000)));
  return Math.round(36 - t * (36 - 12));
}

export const Route = createFileRoute("/inwestor/wniosek/$id")({
  component: InwestorWniosek,
});

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
  const ratesQ = useQuery({ queryKey: ["nbp-rates"], queryFn: () => fetchRates(), staleTime: 12 * 60 * 60 * 1000 });
  const maxAnnualRate = ((ratesQ.data?.referenceRate ?? 3.75) + 3.5) * 2;

  // Calc state — wypełniana przez LoanCalculator (onChange)
  const [calc, setCalc] = useState<LoanCalculatorState | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => { void (async () => {
    const { data } = await supabase.from("loan_applications").select("*, properties(*)").eq("id", id).maybeSingle();
    setApp(data);
    if (data) {
      void supabase.rpc("increment_loan_view" as any, { _loan_id: id });
    }
    if (user) {
      const { data: inv } = await supabase.from("investors").select("id").eq("user_id", user.id).maybeSingle();
      if (inv) setInvestorId(inv.id);
    }
    const { data: ds } = await supabase.from("documents").select("*").eq("loan_application_id", id).order("created_at", { ascending: false });
    const list = ds ?? [];
    setDocs(list);
    // Podpisane URL-e dla każdego pliku klienta (obrazy pokazujemy jako miniaturki, reszta jako kafle).
    const next: Record<string, string> = {};
    await Promise.all(list.map(async (d: any) => {
      if (!d.file_path) return;
      const { data: u } = await supabase.storage.from(CLIENT_FILES_BUCKET).createSignedUrl(d.file_path, 3600);
      if (u?.signedUrl) next[d.id] = u.signedUrl;
    }));
    setDocUrls(next);

    // Zdjęcia z properties.photos (starszy format, luźne URL-e/ścieżki) — nie duplikujemy tych, które są już w documents.
    const knownDocPaths = new Set(list.map((d: any) => d.file_path).filter(Boolean));
    const rawPhotos: string[] = ((data?.properties?.[0]?.photos ?? []) as string[])
      .filter((src) => isImage(src) && !knownDocPaths.has(src));
    const resolved = await Promise.all(rawPhotos.map(async (src) => {
      if (!src || typeof src !== "string") return null;
      if (/^https?:\/\//i.test(src)) return src;
      const { data: u } = await supabase.storage.from(CLIENT_FILES_BUCKET).createSignedUrl(src, 3600);
      return u?.signedUrl ?? null;
    }));
    setPhotoUrls(resolved.filter((s): s is string => !!s));
  })(); }, [id, user]);

  const openFile = async (d: any) => {
    if (!d.file_path) return;
    const { data } = await supabase.storage.from(CLIENT_FILES_BUCKET).createSignedUrl(d.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const submit = async (status: "szkic" | "zlozona") => {
    if (!investorId) { toast.error("Brak profilu inwestora"); return; }
    if (!calc || !calc.amount || !calc.months) { toast.error("Uzupełnij parametry oferty w kalkulatorze"); return; }
    setSubmitting(true);
    const payload = {
      loan_application_id: id, investor_id: investorId, offer_status: status as any,
      proposed_amount: calc.amount, period_months: calc.months,
      expected_yearly_yield: calc.annualRate, commission: calc.commissionPln,
      collection_protection: false, has_balloon: calc.balloon > 0,
      balloon_amount: calc.balloon > 0 ? calc.balloon : null,
      repayment_type: (calc.balloon > 0 ? "mieszana" : "miesieczna") as any,
      estimated_monthly_payment: calc.cappedRata, estimated_total_cost: calc.totalToRepay,
      schedule: calc.schedule.map(r => ({ idx: r.idx, date: r.date, rata: r.rata, kapital: r.kap, odsetki: r.ods, saldo: r.saldo })) as any,
      investor_note: note || null,
      submitted_at: status === "zlozona" ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("investor_offers").insert(payload);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
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
      <button key={d.id} onClick={() => void openFile(d)} className="group text-left border rounded-lg overflow-hidden hover:border-primary transition">
        <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
          {img ? <img src={url} alt={d.file_name} className="h-full w-full object-cover group-hover:scale-105 transition" loading="lazy" />
            : <FileText className="h-10 w-10 text-muted-foreground" />}
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
      <Link to="/inwestor" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Wróć</Link>
      <FancyPageHeader
        eyebrow="Wniosek inwestycyjny"
        title={<>Wniosek {formatPLN(app.loan_amount)} · {app.preferred_period_months} mies.</>}
        subtitle={p ? [propertyTypeLabels[p.property_type], [p.city, p.voivodeship].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : undefined}
        actions={
          <Badge className="bg-white/15 text-white border-white/20 backdrop-blur"><Eye className="mr-1 h-3 w-3" />{app.view_count ?? 0} odsłon</Badge>
        }
      />

      <ApplicationInfoBadges app={app} loanApplicationId={id} />



      {app.situation_description && (
        <Card><CardHeader><CardTitle className="text-base">Opis sytuacji klienta</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{app.situation_description}</CardContent>
        </Card>
      )}

      {p && (
        <Card>
          <CardHeader><CardTitle>Nieruchomość</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const loc = [p.city, p.voivodeship].filter(Boolean).join(", ");
              return (
                <div className="text-sm grid gap-1 md:grid-cols-2">
                  <div><span className="text-muted-foreground">Typ:</span> {propertyTypeLabels[p.property_type]}</div>
                  {loc && <div><span className="text-muted-foreground">Lokalizacja:</span> {loc}</div>}
                  {p.area_sqm && <div><span className="text-muted-foreground">Powierzchnia:</span> {p.area_sqm} m²</div>}
                  {p.estimated_value && <div><span className="text-muted-foreground">Wartość:</span> {formatPLN(p.estimated_value)}</div>}
                  {p.land_register_number && (
                    <div className="md:col-span-2"><span className="text-muted-foreground">Numer KW:</span> <span className="font-mono font-medium">{p.land_register_number}</span></div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {p && (
        <PropertyLocationAnalysis
          propertyAddress={[p.address, p.street].filter(Boolean).join(" ") || p.address || ""}
          city={p.city}
          postalCode={p.postal_code}
          propertyType={p.property_type}
        />
      )}

      <CollateralAnalysisSection applicationId={id} readOnly />

      <KwContentSection applicationId={id} canFetch={false} />

      <InvestorSummaryCard applicationId={id} />

      <InvestorValuationCard applicationId={id} />

      {incomeDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Dokumenty dochodowe <span className="text-xs font-normal text-muted-foreground">(bonus)</span></CardTitle>
            <CardDescription>Wyciągi bankowe, PIT, zaświadczenia o dochodzie.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{incomeDocs.map(renderDocCard)}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parametry wnioskowane przez klienta</CardTitle>
          <CardDescription>Tak klient określił swoje potrzeby — możesz złożyć ofertę zgodną lub kontrofertę.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="flex justify-between rounded-md border bg-muted/30 p-3"><span className="text-muted-foreground">Kwota pożyczki</span><b className="tabular-nums">{formatPLN(Number(app.loan_amount) || 0)}</b></div>
          <div className="flex justify-between rounded-md border bg-muted/30 p-3"><span className="text-muted-foreground">Okres</span><b className="tabular-nums">{app.preferred_period_months ?? "—"} mies.</b></div>
          <div className="flex justify-between rounded-md border bg-muted/30 p-3"><span className="text-muted-foreground">Maks. rata miesięczna</span><b className="tabular-nums">{app.max_monthly_payment ? formatPLN(Number(app.max_monthly_payment)) : "—"}</b></div>
          <div className="flex justify-between rounded-md border bg-muted/30 p-3"><span className="text-muted-foreground">Oczekiwane oprocentowanie roczne</span><b className="tabular-nums">{app.annual_investor_rate != null ? `${Number(app.annual_investor_rate)}%` : "—"}</b></div>
        </CardContent>
      </Card>

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
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcjonalna notatka do oferty…" />
        </CardContent>
      </Card>


      <div className="flex gap-2 justify-end flex-wrap">
        <Button variant="secondary" onClick={async () => {
          if (!investorId || !app?.client_id) return toast.error("Brak danych");
          try {
            await openThread({ data: { loanApplicationId: id, investorId, clientId: app.client_id }});
            void navigate({ to: "/inwestor/wiadomosci" });
          } catch (e: any) { toast.error(e.message); }
        }}><MessageSquare className="mr-2 h-4 w-4"/>Czat z klientem</Button>
        <Button variant="outline" disabled={submitting} onClick={() => void submit("szkic")}>Zapisz jako szkic</Button>
        <Button disabled={submitting} onClick={() => void submit("zlozona")}><Send className="mr-2 h-4 w-4" />Złóż ofertę</Button>
      </div>
    </div>
  );
}
