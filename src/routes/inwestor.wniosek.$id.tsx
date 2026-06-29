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
import { ArrowLeft, Send, MessageSquare, FileText, Image as ImageIcon, ExternalLink, Wallet, Eye } from "lucide-react";
import { propertyTypeLabels } from "@/lib/labels";
import { PropertyLocationAnalysis } from "@/components/property-location-analysis";
import { CollateralAnalysisSection } from "@/components/property-analysis/collateral-analysis-section";
import { KwContentSection } from "@/components/kw-content-section";
import { InvestorSummaryCard } from "@/components/property-analysis/investor-summary-card";
import { formatPLN } from "@/lib/loan-math";
import { LoanCalculator, type LoanCalculatorState } from "@/components/loan-calculator";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { openOrCreateThread } from "@/lib/chat.functions";
import { getNbpRates } from "@/lib/nbp-rates.functions";
import { ApplicationInfoBadges } from "@/components/application-info-badges";

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

const docTypeLabels: Record<string, string> = {
  dochod: "Dokumenty dochodowe",
  dokument_wlasnosci: "Prawa do nieruchomości",
  prawo_wlasnosci: "Prawa do nieruchomości",
  zdjecia_pomieszczen: "Zdjęcia pomieszczeń",
  zdjecia_bryly: "Zdjęcia bryły budynku",
  zdjecia_lokalu: "Zdjęcia lokalu",
  mpzp: "MPZP / warunki zabudowy",
  wypis_rejestru: "Wypis z rejestru gruntów",
  inne: "Inne dokumenty",
  klient_upload: "Pozostałe",
};

const PROPERTY_PHOTO_TYPES = new Set([
  "zdjecie_nieruchomosci",
  "zdjecia_nieruchomosci",
  "zdjecia_pomieszczen",
  "zdjecia_bryly",
  "zdjecia_lokalu",
  "klient_upload",
]);

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
    const imgs = list.filter((d: any) => d.file_path && isImage(d.file_name ?? ""));
    const next: Record<string, string> = {};
    await Promise.all(imgs.map(async (d: any) => {
      const { data: u } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      if (u?.signedUrl) next[d.id] = u.signedUrl;
    }));
    setDocUrls(next);

    // Resolve property photos (mix of http URLs, property-photos paths and document uploads).
    const rawPhotos: string[] = [
      ...(((data?.properties?.[0]?.photos ?? []) as string[]).filter((src) => isImage(src))),
      ...list
        .filter((d: any) => d.file_path && PROPERTY_PHOTO_TYPES.has(d.document_type ?? "") && isImage(d.file_name ?? d.file_path))
        .map((d: any) => d.file_path),
    ].filter((src, index, arr) => src && arr.indexOf(src) === index);
    const resolved = await Promise.all(rawPhotos.map(async (src) => {
      if (!src || typeof src !== "string") return null;
      if (/^https?:\/\//i.test(src)) return src;
      for (const bucket of ["documents", "property-photos"] as const) {
        const { data: u } = await supabase.storage.from(bucket).createSignedUrl(src, 3600);
        if (u?.signedUrl) return u.signedUrl;
      }
      return null;
    }));
    setPhotoUrls(resolved.filter((s): s is string => !!s));
  })(); }, [id, user]);

  const openFile = async (d: any) => {
    if (!d.file_path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
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

  // Group docs
  const incomeDocs = docs.filter((d) => d.document_type === "dochod");
  const propertyDocs = docs.filter((d) => d.document_type !== "dochod");
  const propGroups: Record<string, any[]> = {};
  propertyDocs.forEach((d) => {
    const t = d.document_type ?? "inne";
    if (!propGroups[t]) propGroups[t] = [];
    propGroups[t].push(d);
  });

  const renderDocCard = (d: any) => {
    const url = docUrls[d.id];
    const img = url && isImage(d.file_name ?? "");
    return (
      <button key={d.id} onClick={() => void openFile(d)} className="group text-left border rounded-lg overflow-hidden hover:border-primary transition">
        <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
          {img ? <img src={url} alt={d.file_name} className="h-full w-full object-cover group-hover:scale-105 transition" />
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
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Wniosek {formatPLN(app.loan_amount)} · {app.preferred_period_months} mies.</h1>
        {app.annual_investor_rate != null && (
          <Badge className="text-base px-3 py-1"><Wallet className="mr-1 h-4 w-4" />Zysk roczny {Number(app.annual_investor_rate)}%</Badge>
        )}
        <Badge variant="secondary"><Eye className="mr-1 h-3 w-3" />{app.view_count ?? 0} odsłon</Badge>
      </div>

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
            {photoUrls.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {photoUrls.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    <img
                      src={src}
                      alt=""
                      className="aspect-[4/3] w-full object-cover rounded-md hover:opacity-90 transition"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="text-sm grid gap-1 md:grid-cols-2">
              <div><span className="text-muted-foreground">Typ:</span> {propertyTypeLabels[p.property_type]}</div>
              <div><span className="text-muted-foreground">Lokalizacja:</span> {[p.city, p.voivodeship].filter(Boolean).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">Powierzchnia:</span> {p.area_sqm ? `${p.area_sqm} m²` : "—"}</div>
              <div><span className="text-muted-foreground">Wartość:</span> {formatPLN(p.estimated_value)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {p && (p.address || p.city) && (
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



      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Dokumenty dochodowe</CardTitle>
          <CardDescription>Wyciągi bankowe, PIT, zaświadczenia o dochodzie.</CardDescription>
        </CardHeader>
        <CardContent>
          {incomeDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Klient nie dodał jeszcze dokumentów dochodowych.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{incomeDocs.map(renderDocCard)}</div>
          )}
        </CardContent>
      </Card>

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
        initialMonths={maxMonthsForAmount(Number(app.loan_amount) || 100_000)}
        initialAnnualRate={Math.round(maxAnnualRate * 10) / 10}
        initialMaxPayment={Number(app.max_monthly_payment) || 0}
        onChange={setCalc}
      />


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
