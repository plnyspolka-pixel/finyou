import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  Gavel,
  Users,
  MapPinned,
  Building2,
  Landmark,
  AlertTriangle,
} from "lucide-react";
import {
  getInvestorValuationSummary,
  type InvestorValuationSummary,
} from "@/lib/risk-assessment/risk-assessment.functions";
import { saleabilityBandLabel, auctionOutcomeLabel } from "@/lib/risk-assessment/forced-sale";
import {
  plotCategoryLabel,
  buyerPoolLabel,
  valuationBasisLabel,
} from "@/lib/risk-assessment/plot-buildability";
import { ValuationLadderChart } from "./risk-charts";
import { RiskDisclaimer } from "./risk-disclaimer";

function fmtPln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Karta dla kalkulatora inwestora — pokazuje przy danym temacie inwestycyjnym
 * prognozowaną wartość nieruchomości, wartość szybkiej (wymuszonej) sprzedaży
 * oraz otoczenie/ludność. Dane wrażliwe właściciela i korespondencji nie są tu
 * ujawniane (serwer zwraca wyłącznie bezpieczny podzbiór).
 */
export function InvestorValuationCard({ applicationId }: { applicationId: string }) {
  const fetchSummary = useServerFn(getInvestorValuationSummary);
  const [data, setData] = useState<InvestorValuationSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetchSummary({ data: { applicationId } })
      .then((r) => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoaded(true));
  }, [applicationId]);

  // Bez oceny albo brak danych — nie pokazujemy pustej karty.
  if (!loaded || !data) return null;

  const { predictedValue: pv, quickSale: qs, saleability: sa } = data;
  const drivers: string[] = [];
  if (sa.demandDrivers.largeCityWithin50km) drivers.push("duże miasto ≤50 km");
  if (sa.demandDrivers.waterBodyWithin20km) drivers.push("zbiornik wodny ≤20 km");
  if (sa.demandDrivers.spaResortWithin20km) drivers.push("kurort/uzdrowisko ≤20 km");
  if (sa.demandDrivers.sanatoriumWithin20km) drivers.push("sanatorium ≤20 km");
  if (sa.demandDrivers.touristAttractionWithin20km) drivers.push("atrakcja turystyczna ≤20 km");
  if (sa.demandDrivers.majorRoadWithin10km) drivers.push("droga S/A/DK ≤10 km");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Prognoza wartości i sprzedaży
        </CardTitle>
        <CardDescription>
          Automatyczna prognoza dla tego tematu inwestycyjnego (dane rynkowe, bez danych osobowych
          klienta).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Prognozowana wartość nieruchomości */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            Prognozowana wartość nieruchomości
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">Dolna</div>
              <div className="font-semibold">{fmtPln(pv.lowPln)}</div>
            </div>
            <div className="rounded-md border border-primary/50 bg-primary/5 p-2">
              <div className="text-[11px] text-muted-foreground">Środkowa</div>
              <div className="font-semibold text-primary">{fmtPln(pv.midPln)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">Górna</div>
              <div className="font-semibold">{fmtPln(pv.highPln)}</div>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>Trend rynku: {pv.marketTrend}</span>
            {pv.suggestedLtvCapPercent != null && (
              <span>Pułap LTV (analiza): {pv.suggestedLtvCapPercent}%</span>
            )}
            {pv.suggestedMaxLoanAmountPln != null && (
              <span>
                Kwota przy LTV do {pv.suggestedLtvCapPercent ?? "—"}%:{" "}
                {fmtPln(pv.suggestedMaxLoanAmountPln)}
              </span>
            )}
          </div>
          {data.govBenchmark?.available && (
            <div className="mt-1 text-xs flex items-center gap-1 text-blue-700 dark:text-blue-400">
              <Landmark className="h-3.5 w-3.5" /> Dane rządowe{" "}
              {data.govBenchmark.primarySource === "RCN"
                ? `(RCN — ${data.govBenchmark.rcnTransactions} transakcji)`
                : `(GUS, ${data.govBenchmark.unitName ?? "—"})`}
              :
              {data.govBenchmark.pricePerHa != null && (
                <b> {data.govBenchmark.pricePerHa.toLocaleString("pl-PL")} zł/ha</b>
              )}
              {data.govBenchmark.pricePerM2Median != null && (
                <b> {data.govBenchmark.pricePerM2Median.toLocaleString("pl-PL")} zł/m²</b>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Szybka / wymuszona sprzedaż */}
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Gavel className="h-3.5 w-3.5" /> Wartość szybkiej (wymuszonej) sprzedaży — licytacja
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">I licytacja (3/4)</div>
              <div className="font-semibold">{fmtPln(qs.firstAuctionOpeningPln)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">II licytacja (2/3)</div>
              <div className="font-semibold">{fmtPln(qs.secondAuctionOpeningPln)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">Realny odzysk</div>
              <div className="font-semibold">
                {fmtPln(qs.expectedLowPln)}–{fmtPln(qs.expectedHighPln)}
              </div>
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Prawdopodobny wynik: {auctionOutcomeLabel(qs.likelyAuctionOutcome as never)}
          </div>
          <div className="mt-2">
            <ValuationLadderChart
              input={{
                marketMidPln: pv.midPln,
                firstAuctionPln: qs.firstAuctionOpeningPln,
                secondAuctionPln: qs.secondAuctionOpeningPln,
                expectedLowPln: qs.expectedLowPln,
                loanAmountPln: null,
              }}
            />
          </div>
          {qs.residentialAuctionBlocked && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <b>Możliwa blokada licytacji (art. 952¹ § 2 KPC).</b> {qs.residentialBlockMessage}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        {/* Łatwość sprzedaży + ludność/otoczenie */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={sa.score >= 62 ? "default" : sa.score >= 45 ? "secondary" : "destructive"}
            >
              {sa.available
                ? `${sa.score}/100 · ${saleabilityBandLabel(sa.band)}`
                : "łatwość sprzedaży: brak danych"}
            </Badge>
            <Badge variant={sa.reasonableMarket ? "default" : "destructive"}>
              {sa.reasonableMarket ? "rynek rozsądny" : "poniżej 20 tys. mieszk."}
            </Badge>
            {sa.estimatedDaysOnMarket != null && (
              <span className="text-xs text-muted-foreground">
                szac. czas sprzedaży ~{sa.estimatedDaysOnMarket} dni
              </span>
            )}
          </div>
          {sa.floor?.available && (
            <div className="text-xs flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Kondygnacja:{" "}
              <b>
                {sa.floor.floorPietro === 0 ? "parter" : `${sa.floor.floorPietro}. piętro`}
              </b> — {sa.floor.label}
            </div>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {sa.localityPopulation != null && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" /> Ludność:{" "}
                <b>{sa.localityPopulation.toLocaleString("pl-PL")}</b> ({sa.populationTrend})
              </span>
            )}
            {sa.nearestLargeCity.name && (
              <span className="flex items-center gap-1">
                <MapPinned className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                {sa.nearestLargeCity.name}
                {sa.nearestLargeCity.distanceKm != null
                  ? ` (${sa.nearestLargeCity.distanceKm} km)`
                  : ""}
              </span>
            )}
            {sa.offersTotal > 0 && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Oferty w okolicy:{" "}
                <b>{sa.offersTotal}</b> (biura: {sa.offersAgency})
              </span>
            )}
            {sa.medianPricePerM2 != null && (
              <span>
                Mediana ofert: <b>{fmtPln(sa.medianPricePerM2)}/m²</b>
              </span>
            )}
          </div>
          {drivers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {drivers.map((d, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {d}
                </Badge>
              ))}
            </div>
          )}
          {data.buildability?.applicable && (
            <div className="flex flex-wrap gap-1.5 items-center text-xs">
              <Badge variant="secondary" className="text-[10px]">
                {plotCategoryLabel(data.buildability.category as never)}
              </Badge>
              <Badge
                variant={data.buildability.buyerPool === "szeroki" ? "outline" : "destructive"}
                className="text-[10px]"
              >
                nabywcy: {buyerPoolLabel(data.buildability.buyerPool as never)}
              </Badge>
              <span className="text-muted-foreground">
                wycena {valuationBasisLabel(data.buildability.valuationBasis as never)}
              </span>
            </div>
          )}
        </div>

        <RiskDisclaimer compact />
      </CardContent>
    </Card>
  );
}
