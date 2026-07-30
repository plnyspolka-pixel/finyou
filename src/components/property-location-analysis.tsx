import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyzePropertyLocation } from "@/lib/property-location-analysis.functions";
import { useKwAddress } from "@/lib/kw-address";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Props = {
  propertyAddress?: string | null;
  city?: string | null;
  postalCode?: string | null;
  propertyType?: string | null;
  /** Numer KW — jeśli podany, brakujący adres/miasto zostaną uzupełnione z treści KW (cache kw_documents). */
  kwNumber?: string | null;
  readOnly?: boolean;
  initial?: any;
  onAnalyzed?: (result: any) => void;
};

function scoreColor(score: number) {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-700 border-emerald-300";
  if (score >= 60) return "bg-lime-500/15 text-lime-700 border-lime-300";
  if (score >= 40) return "bg-amber-500/15 text-amber-700 border-amber-300";
  return "bg-rose-500/15 text-rose-700 border-rose-300";
}

export function PropertyLocationAnalysis({
  propertyAddress,
  city,
  postalCode,
  propertyType,
  kwNumber,
  readOnly,
  initial,
  onAnalyzed,
}: Props) {
  const analyze = useServerFn(analyzePropertyLocation);
  const [result, setResult] = useState<any>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const kwAddr = useKwAddress(kwNumber);

  const effectiveAddress = propertyAddress || kwAddr?.fullAddress || null;
  const effectiveCity = city || kwAddr?.city || null;

  const run = async (forceRefresh = false) => {
    if (!effectiveAddress && !effectiveCity) {
      toast.error("Brak adresu nieruchomości do analizy.");
      return;
    }
    setLoading(true);
    try {
      const res = (await analyze({
        data: {
          propertyAddress: effectiveAddress,
          city: effectiveCity,
          postalCode: postalCode ?? null,
          propertyType: propertyType ?? "inne",
          forceRefresh,
        },
      })) as any;
      setResult(res);
      onAnalyzed?.(res);
      if (res?.success === false)
        toast.error(res.message ?? "Nie udało się przeanalizować lokalizacji.");
    } catch {
      toast.error("Nie udało się przeanalizować lokalizacji.");
    } finally {
      setLoading(false);
    }
  };

  const ok = result?.success === true;
  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const mapEmbedUrl =
    ok && browserKey
      ? `https://www.google.com/maps/embed/v1/place?key=${browserKey}&q=${encodeURIComponent(
          result.property.formattedAddress,
        )}&language=pl`
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Analiza lokalizacji
            </CardTitle>
            <CardDescription>
              Ocena otoczenia nieruchomości na podstawie danych z map.
            </CardDescription>
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              {!result && (
                <Button size="sm" onClick={() => run(false)} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                  Analizuj lokalizację
                </Button>
              )}
              {result && (
                <Button size="sm" variant="outline" onClick={() => run(true)} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Odśwież analizę
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && !loading && (
          <p className="text-sm text-muted-foreground">
            Analiza nie została jeszcze wykonana. Kliknij „Analizuj lokalizację”, aby pobrać dane.
          </p>
        )}
        {loading && !result && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Pobieram dane lokalizacyjne…
          </div>
        )}
        {result?.success === false && <p className="text-sm text-destructive">{result.message}</p>}
        {ok && (
          <>
            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
              {mapEmbedUrl ? (
                <iframe
                  title="Mapa lokalizacji"
                  src={mapEmbedUrl}
                  className="w-full h-64 rounded-md border"
                  loading="lazy"
                />
              ) : (
                <a
                  href={result.map.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="grid place-items-center h-64 rounded-md border bg-muted/30 text-sm text-muted-foreground"
                >
                  Otwórz w Google Maps
                </a>
              )}
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Adres</div>
                  <div className="text-sm font-medium">{result.property.formattedAddress}</div>
                </div>
                <div
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 ${scoreColor(result.locationScore.total)}`}
                >
                  <span className="text-2xl font-bold">{result.locationScore.total}</span>
                  <span className="text-sm">/ 100 · {result.locationScore.category}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    Infrastruktura: <b>{result.locationScore.infrastructureScore}</b>/25
                  </div>
                  <div>
                    Komunikacja: <b>{result.locationScore.transportScore}</b>/20
                  </div>
                  <div>
                    Atrakcyjność: <b>{result.locationScore.attractivenessScore}</b>/20
                  </div>
                  <div>
                    Płynność: <b>{result.locationScore.liquidityScore}</b>/20
                  </div>
                  <div>
                    Ryzyko: <b>{result.locationScore.riskScore}</b>/15
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                Sklepy 1km: {result.counts.groceryStoresWithin1000m}
              </Badge>
              <Badge variant="secondary">Apteki 1km: {result.counts.pharmaciesWithin1000m}</Badge>
              <Badge variant="secondary">Szkoły 1km: {result.counts.schoolsWithin1000m}</Badge>
              <Badge variant="secondary">
                Przystanki 1km: {result.counts.publicTransportWithin1000m}
              </Badge>
              <Badge variant="secondary">Parki 1km: {result.counts.parksWithin1000m}</Badge>
              <Badge variant="secondary">Usługi 1km: {result.counts.servicesWithin1000m}</Badge>
            </div>

            <div className="space-y-2 text-sm">
              <p>{result.investmentOfferText.locationSummary}</p>
              <p className="text-muted-foreground">{result.investmentOfferText.liquidityComment}</p>
              <p className="text-xs text-muted-foreground">
                {result.investmentOfferText.riskComment}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
