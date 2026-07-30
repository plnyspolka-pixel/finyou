// Publiczna Karta oferty — strona dla inwestorów instytucjonalnych (link
// tokenowany, bez logowania). Pełne dossier tematu: dane klienta i wniosku,
// pełna treść księgi wieczystej, lokalizacja z mapą, zaludnienie,
// nieruchomości w okolicy i źródła danych z analizy ryzyka.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  MapPinned,
  BookOpenCheck,
  Users,
  Landmark,
  ShieldAlert,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Images,
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  Download,
} from "lucide-react";
import { getPublicOfferCard, type PublicOfferCard } from "@/lib/offer-card.functions";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { propertyTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/karta/$token")({
  component: OfferCardPage,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

function fmtPln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

function statusIcon(s: string) {
  if (s === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (s === "partial") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (s === "error") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <span className="h-3.5 w-3.5 inline-block rounded-full bg-muted-foreground/40" />;
}

function OfferCardPage() {
  const { token } = Route.useParams();
  const fetchCard = useServerFn(getPublicOfferCard);
  const [card, setCard] = useState<PublicOfferCard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const c = await fetchCard({ data: { token } });
        setCard(c);
      } catch {
        setCard(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Wczytywanie Karty oferty…
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Karta oferty nie istnieje lub link wygasł.
      </div>
    );
  }

  const p = card.property;
  const r = card.risk;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Finance You · Karta oferty
        </p>
        <h1 className="text-2xl font-bold">
          Temat pożyczkowy pod zabezpieczenie hipoteczne — {fmtPln(card.loanAmountPln)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {card.clientName ? `Klient: ${card.clientName} · ` : ""}
          {card.periodMonths ? `Preferowany okres: ${card.periodMonths} mies. · ` : ""}
          {p?.kwNumber ? `KW: ${p.kwNumber}` : ""}
        </p>
      </header>

      {/* Zdjęcia nieruchomości */}
      {card.media.photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Images className="h-5 w-5" /> Zdjęcia nieruchomości
            </CardTitle>
            <CardDescription>
              {card.media.photos.length} {plikiLabel(card.media.photos.length)} — kliknij, aby
              otworzyć w pełnym rozmiarze.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoGallery photos={card.media.photos} />
          </CardContent>
        </Card>
      )}

      {/* Dane wniosku i nieruchomości */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Nieruchomość (zabezpieczenie)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-1 sm:grid-cols-2 text-sm">
          <Row label="Typ" value={p?.type ? (propertyTypeLabels[p.type] ?? p.type) : "—"} />
          <Row label="Adres" value={[p?.address, p?.city].filter(Boolean).join(", ") || "—"} />
          <Row label="Województwo" value={p?.voivodeship ?? "—"} />
          <Row label="Powierzchnia" value={p?.areaSqm ? `${p.areaSqm} m²` : "—"} />
          <Row label="Szacowana wartość" value={fmtPln(p?.estimatedValuePln)} />
          <Row label="Numer KW" value={p?.kwNumber ?? "—"} mono />
          <Row
            label="Hipoteka"
            value={p?.hasMortgage == null ? "—" : p.hasMortgage ? "Tak" : "Nie"}
          />
          <Row label="Wnioskowana kwota" value={fmtPln(card.loanAmountPln)} strong />
          {p?.description && (
            <div className="sm:col-span-2 pt-2">
              <span className="text-muted-foreground">Opis:</span>{" "}
              <span className="whitespace-pre-wrap">{p.description}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lokalizacja z mapą */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="h-5 w-5" /> Lokalizacja
          </CardTitle>
          {card.mapQuery && <CardDescription>{card.mapQuery}</CardDescription>}
        </CardHeader>
        <CardContent>
          {card.mapQuery ? (
            <div className="overflow-hidden rounded-md border">
              <iframe
                title="Mapa lokalizacji nieruchomości"
                src={`https://www.google.com/maps?q=${encodeURIComponent(card.mapQuery)}&output=embed`}
                className="w-full h-80 border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak danych adresowych do mapy.</p>
          )}
        </CardContent>
      </Card>

      {/* Zaludnienie i okolica */}
      {r?.population && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Mieszkańcy i otoczenie
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <Row
              label="Liczba mieszkańców miejscowości"
              value={
                r.population.localityPopulation != null
                  ? r.population.localityPopulation.toLocaleString("pl-PL")
                  : "—"
              }
              strong
            />
            <Row
              label="Liczba mieszkańców w promieniu 20 km"
              value={
                r.population.populationWithin20Km != null
                  ? `~${r.population.populationWithin20Km.toLocaleString("pl-PL")}`
                  : "—"
              }
              strong
            />
            {r.population.populationTrend && (
              <Row label="Trend zaludnienia" value={r.population.populationTrend} />
            )}
            {r.population.nearestLargeCity?.name && (
              <Row
                label="Najbliższe większe miasto"
                value={`${r.population.nearestLargeCity.name}${
                  r.population.nearestLargeCity.distanceKm != null
                    ? ` (${r.population.nearestLargeCity.distanceKm} km)`
                    : ""
                }`}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Nieruchomości w okolicy */}
      {r?.nearbyOffers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Nieruchomości w okolicy
            </CardTitle>
            <CardDescription>
              {r.nearbyOffers.byRadius.length > 0
                ? "Aktywne oferty sprzedaży w promieniu 10, 20 i 30 km od nieruchomości."
                : `Aktywne oferty sprzedaży w promieniu ~${r.nearbyOffers.radiusKm ?? "—"} km: ${r.nearbyOffers.totalActiveListings} (biura: ${r.nearbyOffers.agencyListings}, prywatne: ${r.nearbyOffers.privateListings})${
                    r.nearbyOffers.medianPricePerM2 != null
                      ? ` · mediana ${fmtPln(r.nearbyOffers.medianPricePerM2)}/m²`
                      : ""
                  }`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {r.nearbyOffers.byRadius.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {r.nearbyOffers.byRadius.map((b) => (
                  <div key={b.radiusKm} className="rounded-md border p-3 space-y-0.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Promień {b.radiusKm} km
                    </div>
                    <div className="text-xl font-bold">
                      {b.totalActiveListings.toLocaleString("pl-PL")}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        aktywnych ofert
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      biura: {b.agencyListings} · prywatne: {b.privateListings}
                    </div>
                    {b.medianPricePerM2 != null && (
                      <div className="text-xs text-muted-foreground">
                        mediana {fmtPln(b.medianPricePerM2)}/m²
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              {r.nearbyOffers.sample.length === 0 && (
                <p className="text-muted-foreground">Brak przykładowych ofert.</p>
              )}
              {r.nearbyOffers.sample.map((l, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {l.postedBy === "agency"
                      ? "biuro"
                      : l.postedBy === "private"
                        ? "prywatna"
                        : "?"}
                  </Badge>
                  {l.url ? (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline truncate max-w-[40ch]"
                    >
                      {l.title || l.url}
                    </a>
                  ) : (
                    <span className="truncate max-w-[40ch]">{l.title ?? "—"}</span>
                  )}
                  <span className="text-muted-foreground whitespace-nowrap text-xs">
                    {l.pricePln != null ? fmtPln(l.pricePln) : "—"}
                    {l.pricePerM2 != null ? ` · ${fmtPln(l.pricePerM2)}/m²` : ""}
                    {l.source ? ` · ${l.source}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wycena i ryzyko */}
      {r && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Wycena i ocena ryzyka
            </CardTitle>
            {r.generatedAt && (
              <CardDescription>
                Analiza z {new Date(r.generatedAt).toLocaleDateString("pl-PL")}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {r.investmentScore != null && (
                <Badge className="text-sm">
                  Ocena inwestycji: {r.investmentScore}/100
                  {r.riskGrade ? ` (klasa ${r.riskGrade})` : ""}
                </Badge>
              )}
            </div>
            {r.executiveSummary && <p className="leading-relaxed">{r.executiveSummary}</p>}
            {r.valuation && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Wycena dolna" value={fmtPln(r.valuation.lowPln)} />
                <Stat label="Wycena środkowa" value={fmtPln(r.valuation.midPln)} highlight />
                <Stat label="Wycena górna" value={fmtPln(r.valuation.highPln)} />
              </div>
            )}
            {r.forcedSale && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <Stat
                  label="I licytacja (3/4)"
                  value={fmtPln(r.forcedSale.firstAuctionOpeningPln)}
                />
                <Stat
                  label="II licytacja (2/3)"
                  value={fmtPln(r.forcedSale.secondAuctionOpeningPln)}
                />
                <Stat label="Odzysk — dolny" value={fmtPln(r.forcedSale.expectedLowPln)} />
                <Stat label="Odzysk — górny" value={fmtPln(r.forcedSale.expectedHighPln)} />
              </div>
            )}
            {r.kwLegalSummary && (
              <p className="text-muted-foreground">
                <b>Stan prawny (KW):</b> {r.kwLegalSummary}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wszystkie pliki klienta */}
      {card.media.files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" /> Pliki klienta
            </CardTitle>
            <CardDescription>
              Komplet dokumentów i załączników przekazanych przez klienta —{" "}
              {card.media.files.length} {plikiLabel(card.media.files.length)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {card.media.files.map((f, i) => (
                <FileTile key={i} url={f.url} name={f.name} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pełna treść księgi wieczystej */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5" /> Pełna treść księgi wieczystej
          </CardTitle>
          <CardDescription>
            {card.kw
              ? `Dane z Centralnej Bazy Ksiąg Wieczystych${
                  card.kw.fetchedAt
                    ? ` · pobrano ${new Date(card.kw.fetchedAt).toLocaleDateString("pl-PL")}`
                    : ""
                }`
              : "Treść KW nie została jeszcze pobrana."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {card.kw && card.kw.sections.length > 0 ? (
            <Accordion type="multiple" defaultValue={["dzial_1o", "dzial_2"]}>
              {card.kw.sections.map((s) => (
                <AccordionItem key={s.key} value={s.key}>
                  <AccordionTrigger className="text-left">{s.label}</AccordionTrigger>
                  <AccordionContent>
                    <div
                      className="kw-html prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.html) }}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <p className="text-sm text-muted-foreground">Brak treści KW.</p>
          )}
        </CardContent>
      </Card>

      {/* Źródła danych */}
      {r && r.dataSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" /> Źródła danych
            </CardTitle>
            <CardDescription>Wszystkie źródła wykorzystane w analizie tego tematu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {r.dataSources.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {statusIcon(s.status)}
                <div>
                  <span className="font-medium">{s.source}</span>
                  {s.dataLevel && <span className="text-muted-foreground"> · {s.dataLevel}</span>}
                  <div className="text-xs text-muted-foreground">
                    {s.purpose}
                    {s.note ? ` — ${s.note}` : ""}
                    {s.period ? ` · ${s.period}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <footer className="text-xs text-muted-foreground pb-8">
        Karta przeznaczona wyłącznie dla adresata. Dane mają charakter informacyjny i nie stanowią
        oferty w rozumieniu art. 66 KC. Finance You · kontakt@financeyou.pl
      </footer>
    </div>
  );
}

/** Polska odmiana słowa „plik" dla liczników. */
function plikiLabel(n: number): string {
  if (n === 1) return "plik";
  const d = n % 10;
  const h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? "pliki" : "plików";
}

/** Galeria zdjęć: pierwsze zdjęcie jako duży kadr, reszta w siatce miniatur. */
function PhotoGallery({ photos }: { photos: Array<{ url: string; name: string }> }) {
  const [hero, ...rest] = photos;
  return (
    <div className="space-y-2">
      <a
        href={hero.url}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-lg border bg-muted"
      >
        <img
          src={hero.url}
          alt={hero.name}
          loading="lazy"
          className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </a>
      {rest.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {rest.map((ph, i) => (
            <a
              key={i}
              href={ph.url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-md border bg-muted"
              title={ph.name}
            >
              <img
                src={ph.url}
                alt={ph.name}
                loading="lazy"
                className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const FILE_KIND: Array<{ re: RegExp; icon: typeof FileIcon; badge: string }> = [
  { re: /\.(jpe?g|png|gif|webp|heic|bmp|avif)$/i, icon: FileImage, badge: "IMG" },
  { re: /\.pdf$/i, icon: FileText, badge: "PDF" },
  { re: /\.(docx?|odt|rtf)$/i, icon: FileText, badge: "DOC" },
  { re: /\.(xlsx?|ods|csv)$/i, icon: FileSpreadsheet, badge: "XLS" },
];

/** Kafel pliku klienta — ikona typu, nazwa i link do pobrania (signed URL). */
function FileTile({ url, name }: { url: string; name: string }) {
  const kind = FILE_KIND.find((k) => k.re.test(name));
  const Icon = kind?.icon ?? FileIcon;
  const badge =
    kind?.badge ?? (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 4) : "PLIK");
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-md border p-2.5 transition-colors hover:bg-muted/60"
      title={name}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-muted/40">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="text-[11px] text-muted-foreground">{badge}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className={`${strong ? "font-semibold" : ""} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-primary/50 bg-primary/5" : ""}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
