import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Scale,
  UserRound,
  MessagesSquare,
  Landmark,
  Sparkles,
  HeartPulse,
  TrendingUp,
  Gavel,
  Users,
  MapPinned,
  Building2,
} from "lucide-react";

import { toast } from "sonner";
import {
  runInvestmentRiskAssessment,
  getInvestmentRiskAssessment,
} from "@/lib/risk-assessment/risk-assessment.functions";

import { ensureKwReady } from "@/lib/kw-ensure";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";
import { recommendationLabel } from "@/lib/risk-assessment/types";
import { bandLabel } from "@/lib/risk-assessment/life-expectancy";
import { auctionOutcomeLabel, saleabilityBandLabel } from "@/lib/risk-assessment/forced-sale";
import {
  plotCategoryLabel,
  buyerPoolLabel,
  valuationBasisLabel,
} from "@/lib/risk-assessment/plot-buildability";
import { InvestmentScoreGauge, ComponentScoresChart, ValuationLadderChart } from "./risk-charts";
import { RiskDisclaimer } from "./risk-disclaimer";
import { DATA_SOURCE_CATALOG, CATEGORY_LABELS } from "@/lib/risk-assessment/data-sources";
import type { SourceStatus, DataSourceUsage } from "@/lib/property-analysis/types";

function fmtPln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(v);
}

function statusIcon(s: SourceStatus) {
  if (s === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (s === "partial") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (s === "error") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <span className="h-3.5 w-3.5 inline-block rounded-full bg-muted-foreground/40" />;
}

function recVariant(r: string): "default" | "secondary" | "destructive" | "outline" {
  if (r === "rekomendowana") return "default";
  if (r === "warunkowa") return "secondary";
  if (r === "odradzana") return "destructive";
  return "outline";
}

export function RiskAssessmentSection({ applicationId }: { applicationId: string }) {
  const fetchRA = useServerFn(getInvestmentRiskAssessment);
  const runRA = useServerFn(runInvestmentRiskAssessment);
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  // Diagnostyka RCN wyłączona (moduł RCN/GUS został usunięty z pipeline).

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchRA({ data: { applicationId } });
      setRow(r);
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [applicationId]);

  const [stage, setStage] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setStage("Pobieranie treści księgi wieczystej…");
    try {
      // Najpierw skutecznie dowieź KW do stanu "ready" — bez ingerencji użytkownika.
      const kw = await ensureKwReady(applicationId, {
        onStatus: (s) => {
          if (s === "processing") setStage("Pobieranie treści księgi wieczystej…");
          else if (s === "ready") setStage("KW pobrana — analiza ryzyka…");
        },
      });
      if (!kw.ok) {
        // BRAMKA KW: bez poprawnie pobranej treści księgi wieczystej ocena nie
        // startuje (serwer i tak by ją odrzucił) — przerywamy z czytelnym błędem.
        toast.error("Ocena przerwana — brak poprawnie pobranej KW", { description: kw.message });
        return;
      }
      setStage("Analiza ryzyka i wycena…");
      const computed = await runRA({ data: { applicationId, force: !!row } });
      toast.success(row ? "Ocena przeliczona ponownie" : "Ocena ryzyka zakończona");
      const saved = await fetchRA({ data: { applicationId } }).catch(() => null);
      setRow(saved ?? (computed ? { result_json: computed } : null));
    } catch (e: any) {
      toast.error("Błąd oceny ryzyka", { description: e?.message ?? String(e) });
    } finally {
      setStage(null);
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie oceny…
      </div>
    );
  }

  const result = row?.result_json as InvestmentRiskAssessment | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Wycena i ocena ryzyka inwestycji
          </h3>
          <p className="text-xs text-muted-foreground">
            Pipeline: KW (bramka — wymagane poprawne pobranie z KW Engine) → właściciel (PESEL/KRS)
            → korespondencja → scraping rynku (deweloperuch + otodom) → wycena rynkowa (GUS
            pomocniczo — grunty rolne).
          </p>
        </div>
        <Button onClick={run} disabled={running} size="sm">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {row ? "Uruchom ponownie" : "Uruchom ocenę"}
        </Button>
      </div>

      {running && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            {stage ?? "Trwa zaciąganie i analiza danych ze wszystkich źródeł."} To może potrwać
            kilka minut (KW Engine + scraping rynku + Gemini).
          </AlertDescription>
        </Alert>
      )}

      {!result && !running && (
        <>
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Brak wyników. Uruchom ocenę, aby zebrać dane ze wszystkich źródeł i wygenerować wycenę
              rynkową oraz automatyczną klasyfikację ryzyka. Warunkiem startu jest poprawnie pobrana
              treść księgi wieczystej (KW Engine).
            </CardContent>
          </Card>
          <RiskDisclaimer />
          <DataSourceCatalog />
        </>
      )}

      {result && (
        <>
          {/* Nagłówek: miernik oceny + klasyfikacja ryzyka */}
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-5 flex-wrap">
                <InvestmentScoreGauge score={result.investmentScore} grade={result.riskGrade} />
                <div className="flex-1 min-w-[220px]">
                  <Badge variant={recVariant(result.recommendation)} className="text-sm">
                    {recommendationLabel(result.recommendation)}
                  </Badge>
                  <p className="text-sm mt-3 leading-relaxed">{result.executiveSummary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <RiskDisclaimer />

          {result.warnings?.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Oceny cząstkowe */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Oceny cząstkowe</CardTitle>
              <CardDescription>0–100, wyżej = bezpieczniej.</CardDescription>
            </CardHeader>
            <CardContent>
              <ComponentScoresChart scores={result.componentScores} />
            </CardContent>
          </Card>

          {/* Ryzyka i mocne strony */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Kluczowe ryzyka
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.keyRisks.length ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {result.keyRisks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nie zidentyfikowano krytycznych ryzyk.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Mocne strony
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.keyStrengths.length ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {result.keyStrengths.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sekcja „Dane rządowe (RCN + GUS BDL)" została wyłączona — bazujemy na rynku porównawczym. */}

          {/* Wycena rynkowa — scraping deweloperuch + otodom, GUS pomocniczo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Wycena rynkowa (deweloperuch + otodom)
              </CardTitle>
              <CardDescription>
                Wycena ze scrapingu rynku (Firecrawl): transakcje deweloperuch.pl (domy/mieszkania)
                + oferty otodom.pl (mieszkania/domy/działki). Dane GUS pomocniczo — dla gruntów
                rolnych ceny zł/ha.
                {result.masterValuation.basisSource ? (
                  <>
                    {" "}
                    Podstawa: <b>{result.masterValuation.basisSource}</b>.
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {result.masterValuation.status === "success" ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat
                      label="Dolna"
                      value={fmtPln(result.masterValuation.estimatedValueLowPln)}
                    />
                    <Stat
                      label="Środkowa"
                      value={fmtPln(result.masterValuation.estimatedValueMidPln)}
                      highlight
                    />
                    <Stat
                      label="Górna"
                      value={fmtPln(result.masterValuation.estimatedValueHighPln)}
                    />
                  </div>
                  <Separator />
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>
                      <span className="text-muted-foreground">Kwota przy pułapie LTV:</span>{" "}
                      <b>{fmtPln(result.masterValuation.suggestedMaxLoanAmountPln)}</b>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pułap LTV:</span>{" "}
                      <b>{result.masterValuation.suggestedLtvCapPercent ?? "—"}%</b>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Trend:</span>{" "}
                      {result.masterValuation.marketTrend}
                    </div>
                  </div>
                  {result.masterValuation.rationale && (
                    <p className="text-muted-foreground">{result.masterValuation.rationale}</p>
                  )}
                  {result.masterValuation.citations.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Źródła ({result.masterValuation.citations.length})
                      </summary>
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {result.masterValuation.citations.slice(0, 10).map((c, i) => (
                          <li key={i}>
                            <a
                              href={c}
                              target="_blank"
                              rel="noreferrer"
                              className="underline break-all"
                            >
                              {c}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {result.masterValuation.errorMessage ??
                    "Brak wyceny rynkowej — wymagana ręczna weryfikacja."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cena sprzedaży i wymuszonej sprzedaży (licytacje komornicze) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Gavel className="h-4 w-4" /> Cena sprzedaży i wymuszonej sprzedaży (licytacje)
              </CardTitle>
              <CardDescription>
                Prognoza odzysku z egzekucji komorniczej wg KPC — dwie licytacje.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {result.forcedSale.basisValuePln ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <Stat
                      label="Wartość rynkowa"
                      value={fmtPln(result.forcedSale.basisValuePln)}
                      highlight
                    />
                    <Stat
                      label="I licytacja (3/4)"
                      value={fmtPln(result.forcedSale.firstAuctionOpeningPln)}
                    />
                    <Stat
                      label="II licytacja (2/3)"
                      value={fmtPln(result.forcedSale.secondAuctionOpeningPln)}
                    />
                    <Stat
                      label="Odzysk (zakres)"
                      value={`${fmtPln(result.forcedSale.expectedForcedSaleLowPln)}–${fmtPln(result.forcedSale.expectedForcedSaleHighPln)}`}
                    />
                  </div>
                  <ValuationLadderChart
                    input={{
                      marketMidPln: result.forcedSale.basisValuePln,
                      firstAuctionPln: result.forcedSale.firstAuctionOpeningPln,
                      secondAuctionPln: result.forcedSale.secondAuctionOpeningPln,
                      expectedLowPln: result.forcedSale.expectedForcedSaleLowPln,
                      loanAmountPln: result.collateralAnalysis?.ltv?.requestedLoanAmountPln ?? null,
                    }}
                  />
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="outline">
                      Prawdopodobny wynik:{" "}
                      {auctionOutcomeLabel(result.forcedSale.likelyAuctionOutcome)}
                    </Badge>
                    {result.forcedSale.loanToForcedSalePercent != null && (
                      <Badge
                        variant={
                          result.forcedSale.loanToForcedSalePercent > 100
                            ? "destructive"
                            : result.forcedSale.loanToForcedSalePercent > 80
                              ? "secondary"
                              : "default"
                        }
                      >
                        Pożyczka / cena wywołania: {result.forcedSale.loanToForcedSalePercent}%
                      </Badge>
                    )}
                  </div>
                  {result.forcedSale.residentialAuctionBlock?.blocked && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <b>Blokada licytacji (art. 952¹ § 2 KPC).</b>{" "}
                        {result.forcedSale.residentialAuctionBlock.message}
                      </AlertDescription>
                    </Alert>
                  )}
                  <p className="text-muted-foreground">{result.forcedSale.recoveryComment}</p>
                  <p className="text-[11px] text-muted-foreground italic">
                    Podstawa wyceny: {result.forcedSale.basisSource}. {result.forcedSale.legalBasis}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">{result.forcedSale.recoveryComment}</p>
              )}
            </CardContent>
          </Card>

          {/* Prognozowana łatwość sprzedaży */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Prognozowana łatwość sprzedaży
              </CardTitle>
              <CardDescription>
                Popyt z otoczenia (20/50 km) i płynność wyjścia z inwestycji.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {result.saleability.available ? (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge
                      className="text-sm"
                      variant={
                        result.saleability.score >= 62
                          ? "default"
                          : result.saleability.score >= 45
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {result.saleability.score}/100 ·{" "}
                      {saleabilityBandLabel(result.saleability.band)}
                    </Badge>
                    <Badge
                      variant={result.saleability.reasonableMarket ? "default" : "destructive"}
                    >
                      {result.saleability.reasonableMarket
                        ? "rynek rozsądny (>20 tys. / grunt rolny)"
                        : "poniżej 20 tys. mieszk."}
                    </Badge>
                    {result.saleability.estimatedDaysOnMarket != null && (
                      <span className="text-muted-foreground">
                        Szac. czas sprzedaży: ~{result.saleability.estimatedDaysOnMarket} dni
                      </span>
                    )}
                  </div>
                  {result.saleability.floorFactor?.available && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>
                        Kondygnacja:{" "}
                        <b>
                          {result.saleability.floorFactor.floorPietro === 0
                            ? "parter"
                            : `${result.saleability.floorFactor.floorPietro}. piętro`}
                        </b>
                        {result.saleability.floorFactor.kondygnacja != null
                          ? ` (kondygnacja ${result.saleability.floorFactor.kondygnacja} w KW)`
                          : ""}
                        {" — "}
                        <span className="text-muted-foreground">
                          {result.saleability.floorFactor.label}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    {result.saleability.localityPopulation != null && (
                      <div>
                        <span className="text-muted-foreground">Zaludnienie:</span>{" "}
                        {result.saleability.localityPopulation.toLocaleString("pl-PL")} (
                        {result.saleability.populationTrend})
                      </div>
                    )}
                    {result.saleability.nearestLargeCity.name && (
                      <div>
                        <span className="text-muted-foreground">Większe miasto:</span>{" "}
                        {result.saleability.nearestLargeCity.name}
                        {result.saleability.nearestLargeCity.distanceKm != null
                          ? ` (${result.saleability.nearestLargeCity.distanceKm} km)`
                          : ""}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Popyt na najem:</span>{" "}
                      {result.saleability.rentalDemand}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.saleability.demandDrivers.largeCityWithin50km && (
                      <Badge variant="outline">
                        <MapPinned className="h-3 w-3 mr-1" />
                        duże miasto ≤50 km
                      </Badge>
                    )}
                    {result.saleability.demandDrivers.waterBodyWithin20km && (
                      <Badge variant="outline">zbiornik wodny ≤20 km</Badge>
                    )}
                    {result.saleability.demandDrivers.spaResortWithin20km && (
                      <Badge variant="outline">kurort/uzdrowisko ≤20 km</Badge>
                    )}
                    {result.saleability.demandDrivers.sanatoriumWithin20km && (
                      <Badge variant="outline">sanatorium ≤20 km</Badge>
                    )}
                    {result.saleability.demandDrivers.touristAttractionWithin20km && (
                      <Badge variant="outline">atrakcja turystyczna ≤20 km</Badge>
                    )}
                    {result.saleability.demandDrivers.majorRoadWithin10km && (
                      <Badge variant="outline">droga S/A/DK ≤10 km</Badge>
                    )}
                  </div>
                  <LocalOffersBlock offers={result.saleability.localMarketOffers} />
                  {result.saleability.purchasingPowerComment && (
                    <p className="text-muted-foreground">
                      Siła nabywcza: {result.saleability.purchasingPowerComment}
                    </p>
                  )}
                  {result.saleability.rationale && (
                    <p className="text-muted-foreground">{result.saleability.rationale}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{result.saleability.summary}</p>
                  <LocalOffersBlock offers={result.saleability.localMarketOffers} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Prawo zabudowy działki */}
          {result.plotBuildability?.applicable && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPinned className="h-4 w-4" /> Prawo zabudowy działki
                </CardTitle>
                <CardDescription>
                  Status gruntu, krąg nabywców i zalecana podstawa wyceny.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {plotCategoryLabel(result.plotBuildability.category)}
                  </Badge>
                  <Badge
                    variant={
                      result.plotBuildability.buyerPool === "szeroki" ? "default" : "destructive"
                    }
                  >
                    krąg nabywców: {buyerPoolLabel(result.plotBuildability.buyerPool)}
                  </Badge>
                  <Badge variant="outline">
                    wycena: {valuationBasisLabel(result.plotBuildability.valuationBasis)}
                  </Badge>
                  {result.plotBuildability.onlyFarmerCanBuild && (
                    <Badge variant="destructive">budowa tylko dla rolnika</Badge>
                  )}
                </div>
                {result.plotBuildability.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-amber-700 dark:text-amber-400 space-y-1">
                    {result.plotBuildability.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* Właściciel — PESEL / trwanie życia */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserRound className="h-4 w-4" /> Analiza właściciela
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Właściciel:</span>{" "}
                <b>{result.owner.fullName ?? "—"}</b>
              </div>
              <div>
                <span className="text-muted-foreground">Wiek / płeć:</span>{" "}
                {result.owner.age ?? "—"}{" "}
                {result.owner.sex ? `(${result.owner.sex === "M" ? "M" : "K"})` : ""} · PESEL{" "}
                {result.owner.peselValid ? "✓ poprawny" : "✗ brak/niepoprawny"}
              </div>
              {result.owner.lifeExpectancy.available && (
                <>
                  <div className="flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-rose-500" />
                    <span>
                      Dalsze trwanie życia (GUS):{" "}
                      <b>{result.owner.lifeExpectancy.remainingYears} lat</b> · przewidywany wiek
                      dożycia ≈ {result.owner.lifeExpectancy.projectedAgeAtDeath}
                    </span>
                  </div>
                  <div>
                    <Badge variant="outline">
                      {bandLabel(result.owner.lifeExpectancy.longevityRiskBand)}
                    </Badge>
                    {result.owner.lifeExpectancy.survivalProbabilityOverTerm != null && (
                      <span className="text-muted-foreground ml-2">
                        P(przeżycia okresu) ≈{" "}
                        {Math.round(result.owner.lifeExpectancy.survivalProbabilityOverTerm * 100)}%
                      </span>
                    )}
                  </div>
                  {result.owner.lifeExpectancy.survivalByLoanYear?.length > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">
                        Dożycie dla pożyczek 1–5 lat (P przeżycia okresu):
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {result.owner.lifeExpectancy.survivalByLoanYear.map((s) => (
                          <Badge key={s.years} variant="outline" className="text-[10px]">
                            {s.years} {s.years === 1 ? "rok" : "lat"}:{" "}
                            {Math.round(s.probability * 100)}%
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div>
                <span className="text-muted-foreground">Zgodność z właścicielem w KW:</span>{" "}
                {result.owner.matchesKwOwner === null ? (
                  "nieustalona"
                ) : result.owner.matchesKwOwner ? (
                  <span className="text-emerald-600">zgodny</span>
                ) : (
                  <span className="text-destructive font-medium">NIEZGODNY</span>
                )}
              </div>
              {result.owner.businessActivity && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Działalność gospodarcza (CEIDG):</span>
                  {result.owner.businessActivity.isEntrepreneur ? (
                    <Badge variant="default">
                      przedsiębiorca
                      {result.owner.businessActivity.company?.startDate
                        ? ` od ${result.owner.businessActivity.company.startDate}`
                        : ""}{" "}
                      · obniża ryzyko
                    </Badge>
                  ) : result.owner.businessActivity.available ? (
                    <span>brak aktywnej działalności</span>
                  ) : (
                    <span className="text-muted-foreground">nie sprawdzono</span>
                  )}
                </div>
              )}
              {result.owner.notes.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground text-xs mt-1">
                  {result.owner.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground italic mt-1">
                {result.owner.lifeExpectancy.disclaimer}
              </p>
            </CardContent>
          </Card>

          {/* Stan prawny KW */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4" /> Stan prawny (Księga wieczysta)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {result.kwLegal.available ? (
                <>
                  <p>{result.kwLegal.summary}</p>
                  {result.kwLegal.address?.fullAddress && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPinned className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <span className="text-muted-foreground">Adres z KW (dz. I-O):</span>{" "}
                        <b>{result.kwLegal.address.fullAddress}</b>
                      </span>
                    </div>
                  )}
                  {result.kwLegal.propertyParams &&
                    (result.kwLegal.propertyParams.kind ||
                      result.kwLegal.propertyParams.usableAreaM2 != null ||
                      result.kwLegal.propertyParams.landAreaHa != null ||
                      result.kwLegal.propertyParams.roomCount != null ||
                      result.kwLegal.propertyParams.landUse) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">
                          Parametry z KW (dz. I-O) — podstawa wyceny:
                        </span>
                        {result.kwLegal.propertyParams.kind && (
                          <span>
                            rodzaj: <b>{result.kwLegal.propertyParams.kind}</b>
                          </span>
                        )}
                        {result.kwLegal.propertyParams.usableAreaM2 != null && (
                          <span>
                            pow. użytkowa: <b>{result.kwLegal.propertyParams.usableAreaM2} m²</b>
                          </span>
                        )}
                        {result.kwLegal.propertyParams.landAreaHa != null && (
                          <span>
                            obszar: <b>{result.kwLegal.propertyParams.landAreaHa} ha</b>
                          </span>
                        )}
                        {result.kwLegal.propertyParams.roomCount != null && (
                          <span>
                            izby/pokoje: <b>{result.kwLegal.propertyParams.roomCount}</b>
                          </span>
                        )}
                        {result.kwLegal.propertyParams.landUse && (
                          <span>
                            sposób korzystania: <b>{result.kwLegal.propertyParams.landUse}</b>
                          </span>
                        )}
                      </div>
                    )}
                  <div className="flex flex-wrap gap-2">
                    {result.kwLegal.hasEnforcement && (
                      <Badge variant="destructive">Egzekucja / zajęcie</Badge>
                    )}
                    {result.kwLegal.hasUsufruct && (
                      <Badge variant="secondary">Służebność / dożywocie</Badge>
                    )}
                    {result.kwLegal.mortgages.length > 0 && (
                      <Badge variant="secondary">Hipoteki: {result.kwLegal.mortgages.length}</Badge>
                    )}
                    {result.kwLegal.owners.length > 1 && (
                      <Badge variant="outline">
                        Współwłaściciele: {result.kwLegal.owners.length}
                      </Badge>
                    )}
                  </div>
                  {result.kwLegal.warnings.length > 0 && (
                    <ul className="list-disc pl-5 text-amber-700 dark:text-amber-400">
                      {result.kwLegal.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Brak pobranej treści KW. Pobierz księgę w zakładce „Nieruchomość", aby ocenić stan
                  prawny.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Korespondencja — wyłącznie twarde fakty */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessagesSquare className="h-4 w-4" /> Korespondencja — twarde fakty
              </CardTitle>
              <CardDescription>
                Tylko konkretne fakty, rozbieżności i sygnały ryzyka z treści — bez oceny
                zaangażowania czy sentymentu.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {result.correspondence.available || result.correspondence.messagesAnalyzed > 0 ? (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>
                      <span className="text-muted-foreground">Wiadomości:</span>{" "}
                      {result.correspondence.messagesAnalyzed}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Kanały:</span>{" "}
                      {result.correspondence.channels.join(", ") || "—"}
                    </div>
                  </div>
                  {result.correspondence.statedFacts.length > 0 && (
                    <div>
                      <span className="font-medium">Fakty podane przez klienta:</span>
                      <ul className="list-disc pl-5">
                        {result.correspondence.statedFacts.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.correspondence.redFlags.length > 0 && (
                    <div>
                      <span className="text-destructive font-medium">Twarde sygnały ryzyka:</span>
                      <ul className="list-disc pl-5">
                        {result.correspondence.redFlags.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.correspondence.inconsistencies.length > 0 && (
                    <div>
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        Niespójności z wnioskiem/KW:
                      </span>
                      <ul className="list-disc pl-5">
                        {result.correspondence.inconsistencies.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.correspondence.summary && (
                    <p className="text-muted-foreground">{result.correspondence.summary}</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{result.correspondence.summary}</p>
              )}
            </CardContent>
          </Card>

          {/* Sekcja „OCR dokumentów" wyłączona — moduł OCR został usunięty. */}

          {/* Wykorzystane źródła danych */}
          <UsedSources sources={result.dataSources} />
        </>
      )}
    </div>
  );
}

function LocalOffersBlock({
  offers,
}: {
  offers: InvestmentRiskAssessment["saleability"]["localMarketOffers"];
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span>
          Oferty sprzedaży w okolicy (~{offers.radiusKm} km): <b>{offers.totalActiveListings}</b> —
          w tym biura: <b>{offers.agencyListings}</b>, prywatne: {offers.privateListings}
          {offers.available ? (
            <span className="text-emerald-600"> — rynek obsługiwany przez biura</span>
          ) : (
            <span className="text-amber-600"> — brak/płytki rynek ofert biur</span>
          )}
        </span>
      </div>
      {offers.medianPricePerM2 != null && (
        <div className="text-xs text-muted-foreground">
          Mediana ceny ofertowej w okolicy: <b>{fmtPln(offers.medianPricePerM2)}/m²</b>
        </div>
      )}
      {offers.sample.length > 0 && (
        <div className="space-y-0.5">
          {offers.sample.map((l, i) => (
            <div key={i} className="text-xs flex items-center gap-1.5">
              <Badge
                variant={l.postedBy === "agency" ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {l.postedBy === "agency" ? "biuro" : l.postedBy === "private" ? "prywatna" : "?"}
              </Badge>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="underline truncate max-w-[38ch]"
              >
                {l.title || l.url}
              </a>
              <span className="text-muted-foreground whitespace-nowrap">
                {l.pricePln != null ? fmtPln(l.pricePln) : "—"}
                {l.pricePerM2 != null ? ` · ${fmtPln(l.pricePerM2)}/m²` : ""} · {l.source}
              </span>
            </div>
          ))}
        </div>
      )}
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

function UsedSources({ sources }: { sources: DataSourceUsage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" /> Wykorzystane źródła danych
        </CardTitle>
        <CardDescription>Wszystkie źródła zaciągnięte do tej oceny.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {sources.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {statusIcon(s.status)}
            <div>
              <span className="font-medium">{s.source}</span>
              {s.dataLevel && <span className="text-muted-foreground"> · {s.dataLevel}</span>}
              <div className="text-xs text-muted-foreground">
                {s.purpose}
                {s.note ? ` — ${s.note}` : ""}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DataSourceCatalog() {
  const byCat = DATA_SOURCE_CATALOG.reduce<Record<string, typeof DATA_SOURCE_CATALOG>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" /> Katalog źródeł danych
        </CardTitle>
        <CardDescription>
          Wszystkie źródła, z których korzysta system wyceny i oceny ryzyka.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(byCat).map(([cat, list]) => (
          <div key={cat}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
            </div>
            <div className="space-y-1">
              {list.map((s) => (
                <div key={s.key} className="text-sm flex items-start gap-2">
                  {s.governmental ? (
                    <Landmark className="h-3.5 w-3.5 mt-0.5 text-blue-600" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                  )}
                  <div>
                    <span className="font-medium">{s.name}</span>
                    {s.governmental && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        rządowe
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {s.provides} · <span className="italic">{s.provider}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
