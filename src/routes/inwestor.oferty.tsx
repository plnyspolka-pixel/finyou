// Lista „Moje oferty" panelu inwestora — karty zamiast tabeli (siedem kolumn
// łamało się na telefonie do pojedynczych liter). Każda oferta pokazuje
// parametry, odsetki, prowizję inwestora, prowizję Finance You, zysk, numer
// księgi wieczystej i zdjęcia nieruchomości, a po rozwinięciu — pełny raport
// z analizy (ten sam panel, co moduł „Analityka").
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BarChart3,
  ChevronDown,
  FileDown,
  FileSignature,
  ImageOff,
  Images,
  Landmark,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatPLN, offerStatusLabels, propertyTypeLabels } from "@/lib/labels";
import { downloadOfferPdf } from "@/lib/offer-pdf";
import { computeOfferEconomics } from "@/lib/offer-economics";
import { IMAGE_EXT, isShowablePropertyPhoto, signStoragePathsMap } from "@/lib/property-photos";
import { toDisplayableImageUrl } from "@/lib/heic-preview";
import { ApplicationInfoBadges } from "@/components/application-info-badges";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { AnalyticsDetailPanel } from "@/components/inwestor/analytics-detail-panel";

export const Route = createFileRoute("/inwestor/oferty")({
  component: InwestorOferty,
});

// Wniosek z nieruchomością (numer KW, zdjęcia) i plikami klienta (zdjęcia
// z tabeli documents) — RLS inwestora obejmuje wnioski z jego ofertą.
const OFFER_SELECT =
  "*, loan_application:loan_applications(id, loan_amount, is_startup, startup_funding_dependency, business_status, business_legal_form, nip, business_nip_verified_at, investor_purpose, client:clients(bik_report_uploaded_at, bank_account_verified_at, phone_verified_at), properties(id, property_type, city, voivodeship, land_register_number, additional_land_register_numbers, estimated_value, area_sqm, photos), documents(id, file_path, file_name, document_type))";

/** Zdjęcia nieruchomości przy ofercie: `properties.photos` (klucze Storage)
 *  plus obrazki z tabeli `documents`, bez duplikatów, w kolejności wejściowej. */
function offerPhotoPaths(app: any): string[] {
  const property = app?.properties?.[0];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (p: unknown) => {
    if (typeof p !== "string" || !p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  ((property?.photos ?? []) as unknown[]).forEach((p) => {
    if (typeof p === "string" && isShowablePropertyPhoto(p)) push(p);
  });
  ((app?.documents ?? []) as any[]).forEach((d) => {
    if (d?.file_path && IMAGE_EXT.test(d.file_name ?? d.file_path)) push(d.file_path);
  });
  return out;
}

const pct = (n: number) => `${n.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;

function InwestorOferty() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Ścieżka Storage → podpisany (i wyświetlalny — HEIC skonwertowany) URL. */
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data: inv } = await supabase
        .from("investors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!inv) {
        if (!cancelled) {
          setOffers([]);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("investor_offers")
        .select(OFFER_SELECT)
        .eq("investor_id", inv.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const rows: any[] = data ?? [];
      setOffers(rows);
      setLoading(false);

      // Zdjęcia: jeden batch podpisów dla wszystkich ofert; HEIC konwertowany w locie.
      const paths = Array.from(new Set(rows.flatMap((o) => offerPhotoPaths(o.loan_application))));
      if (paths.length === 0) return;
      const signed = await signStoragePathsMap(paths, 3600);
      const entries = await Promise.all(
        Array.from(signed.entries()).map(
          async ([path, url]) => [path, await toDisplayableImageUrl(url, path)] as const,
        ),
      );
      if (cancelled) return;
      setPhotoUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const accepted = offers.filter((o) => o.offer_status === "zaakceptowana_przez_klienta");
  const openContract = (offerId: string) =>
    void navigate({ to: "/inwestor/umowa/$offerId", params: { offerId } });

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Twoje portfolio"
        title={`Moje oferty (${offers.length})`}
        subtitle="Oferty wysłane do klientów — śledź statusy, sprawdzaj zabezpieczenie i podpisuj umowy."
      />
      {accepted.length > 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-6 text-sm space-y-3">
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                {accepted.length === 1
                  ? "Klient zaakceptował Twoją ofertę — uzupełnij dane do umowy."
                  : `Klienci zaakceptowali ${accepted.length} Twoich ofert — uzupełnij dane do umów.`}
              </p>
              <p className="text-muted-foreground mt-1">
                Uzupełnij swoje dane (adres, rachunek bankowy, reprezentacja). Klient uzupełnia
                swoje pola równolegle. Gdy obie strony skończą — umowa będzie gotowa do podpisu.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {accepted.map((o) => (
                <Button key={o.id} size="sm" variant="default" onClick={() => openContract(o.id)}>
                  <FileSignature className="mr-2 h-4 w-4" />
                  Umowa {formatPLN(o.proposed_amount)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie ofert…
        </div>
      ) : offers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nie masz jeszcze żadnej oferty. Oferty składasz z poziomu okazji inwestycyjnych.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {offers.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              photoUrls={photoUrls}
              onContract={() => openContract(o.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Karta oferty ────────────────────────────────────────────────────────────

function OfferCard({
  offer: o,
  photoUrls,
  onContract,
}: {
  offer: any;
  photoUrls: Record<string, string>;
  onContract: () => void;
}) {
  const app = o.loan_application;
  const property = app?.properties?.[0];
  const eco = useMemo(() => computeOfferEconomics(o), [o]);
  const photos = useMemo(
    () =>
      offerPhotoPaths(app)
        .map((path) => ({ path, url: photoUrls[path] }))
        .filter((p): p is { path: string; url: string } => !!p.url),
    [app, photoUrls],
  );
  const hero = photos[0]?.url;
  const [reportOpen, setReportOpen] = useState(false);

  const accepted = o.offer_status === "zaakceptowana_przez_klienta";
  const kw: string | null = property?.land_register_number ?? null;
  const extraKw: string[] = property?.additional_land_register_numbers ?? [];
  const place = [property?.city, property?.voivodeship].filter(Boolean).join(", ");
  const typeLabel = property?.property_type
    ? (propertyTypeLabels[property.property_type] ?? property.property_type)
    : null;
  const rate =
    o.expected_yearly_yield != null
      ? `${Number(o.expected_yearly_yield).toLocaleString("pl-PL")}%`
      : "—";

  return (
    <Card className="overflow-hidden">
      <Collapsible open={reportOpen} onOpenChange={setReportOpen}>
        <div className="flex flex-col md:flex-row">
          {/* Zdjęcie główne */}
          <div className="relative aspect-[16/9] w-full shrink-0 bg-muted md:aspect-auto md:w-60">
            {hero ? (
              <a
                href={hero}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0"
                title="Otwórz zdjęcie"
              >
                <img src={hero} alt="" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ) : (
              <div className="absolute inset-0 flex min-h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImageOff className="h-7 w-7" />
                <span className="text-xs">Brak zdjęć</span>
              </div>
            )}
            {photos.length > 0 && (
              <Badge className="absolute left-2 top-2 border-0 bg-black/60 text-white backdrop-blur-sm">
                <Images className="mr-1 h-3 w-3" />
                {photos.length}
              </Badge>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3 p-4">
            {/* Nagłówek: kwota, okres, data, nieruchomość, status */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-lg font-bold leading-tight">
                  {formatPLN(o.proposed_amount)}{" "}
                  <span className="font-medium text-muted-foreground">
                    · {o.period_months ?? "—"} mies.
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{formatDate(o.created_at)}</span>
                  {(typeLabel || place) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[typeLabel, place].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {property?.estimated_value != null && (
                    <span>wartość szac. {formatPLN(property.estimated_value)}</span>
                  )}
                </div>
              </div>
              <Badge variant={accepted ? "default" : "secondary"} className="shrink-0">
                {offerStatusLabels[o.offer_status] ?? o.offer_status}
              </Badge>
            </div>

            {/* Księga wieczysta */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Landmark className="h-4 w-4" /> KW
              </span>
              {kw ? (
                <span className="font-mono font-medium">{kw}</span>
              ) : (
                <span className="text-muted-foreground">brak numeru</span>
              )}
              {extraKw.map((k) => (
                <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {k}
                </span>
              ))}
            </div>

            {/* Ekonomia oferty */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Oprocentowanie" value={rate} />
              <Stat
                label="Rata"
                value={formatPLN(eco?.monthlyPayment ?? o.estimated_monthly_payment)}
                hint={eco && eco.balloon > 0 ? `balon ${formatPLN(eco.balloon)}` : undefined}
              />
              <Stat label="Odsetki łącznie" value={formatPLN(eco?.interest)} />
              <Stat
                label="Prowizja inwestora"
                value={formatPLN(eco?.investorCommission ?? o.commission)}
                hint={eco ? pct(eco.investorCommissionPct) : undefined}
              />
              <Stat
                label="Prowizja Finance You"
                value={formatPLN(eco?.financeYouFee)}
                hint={
                  eco
                    ? `${pct(eco.financeYouFeePct)}${eco.financeYouFeeEstimated ? " · szac." : ""}`
                    : undefined
                }
                title="Koszt klienta (faktura VAT od Finance You), rozłożony na raty — dla inwestora przelotowa: wykładana przy uruchomieniu, wraca w ratach."
              />
              <Stat
                label="Zysk inwestora"
                value={formatPLN(eco?.investorProfit)}
                hint="odsetki + prowizja"
                accent
              />
            </dl>

            {app && (
              <ApplicationInfoBadges
                app={app}
                client={app.client}
                loanApplicationId={app.id}
                variant="compact"
              />
            )}

            {/* Pozostałe zdjęcia */}
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p) => (
                  <a
                    key={p.path}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-muted transition hover:border-primary"
                    title="Otwórz zdjęcie"
                  >
                    <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}

            {/* Akcje */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                title="Pobierz PDF oferty z pełnym harmonogramem spłat"
                onClick={() => {
                  if (!downloadOfferPdf(o)) {
                    toast.error("Oferta nie ma kompletu danych do wygenerowania PDF.");
                  }
                }}
              >
                <FileDown className="mr-1 h-3.5 w-3.5" />
                PDF
              </Button>
              {accepted && (
                <Button size="sm" variant="outline" onClick={onContract}>
                  <FileSignature className="mr-1 h-3.5 w-3.5" />
                  Umowa
                </Button>
              )}
              {app && (
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant={reportOpen ? "secondary" : "outline"}>
                    <BarChart3 className="mr-1 h-3.5 w-3.5" />
                    Pełny raport z analizy
                    <ChevronDown
                      className={cn(
                        "ml-1 h-3.5 w-3.5 transition-transform",
                        reportOpen && "rotate-180",
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </div>
        </div>

        {/* Rozwijany pełny raport — panel pobiera dane dopiero po rozwinięciu. */}
        {app && (
          <CollapsibleContent>
            <div className="border-t bg-muted/30 p-3 sm:p-4">
              {reportOpen && <AnalyticsDetailPanel applicationId={app.id} />}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
  title,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          accent && "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {value}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}
