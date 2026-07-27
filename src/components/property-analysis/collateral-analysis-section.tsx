import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatPLN } from "@/lib/labels";
import {
  runPropertyCollateralAnalysis,
  getPropertyAnalysis,
} from "@/lib/property-analysis/property-collateral-analysis.functions";
import type { PropertyAnalysisResult, SourceStatus } from "@/lib/property-analysis/types";
import { PropertyMap } from "./property-map";

function statusIcon(s: SourceStatus) {
  if (s === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (s === "no_data") return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  if (s === "error") return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  return <span className="h-3.5 w-3.5 inline-block rounded-full bg-muted-foreground/40" />;
}

function categoryVariant(c: string): "default" | "secondary" | "destructive" | "outline" {
  if (c === "bardzo_dobre" || c === "dobre") return "default";
  if (c === "akceptowalne") return "secondary";
  return "destructive";
}

export function CollateralAnalysisSection({
  applicationId,
  readOnly = false,
}: {
  applicationId: string;
  readOnly?: boolean;
}) {
  const fetchAnalysis = useServerFn(getPropertyAnalysis);
  const runAnalysis = useServerFn(runPropertyCollateralAnalysis);
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchAnalysis({ data: { applicationId } });
      setRow(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [applicationId]);

  const run = async () => {
    setRunning(true);
    try {
      await runAnalysis({ data: { applicationId } });
      toast.success("Analiza zakończona");
      await load();
    } catch (e: any) {
      toast.error("Błąd analizy", { description: e?.message ?? String(e) });
    } finally {
      setRunning(false);
    }
  };

  if (loading)
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie analizy…
      </div>
    );

  const result = row?.result_json as PropertyAnalysisResult | undefined;

  // W trybie readOnly (widok inwestora) sekcja pojawia się jako bonus tylko gdy analiza jest gotowa.
  if (readOnly && !result) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Analiza zabezpieczenia{" "}
            {readOnly && <span className="text-xs font-normal text-muted-foreground">(bonus)</span>}
          </h3>
          <p className="text-xs text-muted-foreground">
            Automatyczna analiza nieruchomości jako zabezpieczenia pożyczki.
          </p>
        </div>
        {!readOnly && (
          <Button onClick={run} disabled={running} size="sm">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {row ? "Uruchom ponownie" : "Uruchom analizę"}
          </Button>
        )}
      </div>

      {!result && !readOnly && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Brak wyników. Uruchom analizę, aby zebrać dane ze źródeł zewnętrznych.
          </CardContent>
        </Card>
      )}

      {result && (
        <>
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

          {result.property.latitude != null && result.property.longitude != null && (
            <Card>
              <CardHeader>
                <CardTitle>Lokalizacja nieruchomości</CardTitle>
                <CardDescription>{result.property.address}</CardDescription>
              </CardHeader>
              <CardContent>
                <PropertyMap
                  latitude={result.property.latitude}
                  longitude={result.property.longitude}
                  label={result.property.address}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Scoring zabezpieczenia</span>
                <Badge variant={categoryVariant(result.collateralScore.category)}>
                  {result.collateralScore.total}/100
                </Badge>
              </CardTitle>
              <CardDescription>{result.collateralScore.summary}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-5">
              {Object.entries(result.collateralScore.components).map(([k, v]) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="font-medium">{v}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Benchmark wartości</CardTitle>
                <CardDescription>
                  Źródło główne: {result.valuationBenchmark.mainSource}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Mediana zł/m²:</span>{" "}
                  {result.valuationBenchmark.pricePerM2Median?.toLocaleString("pl-PL") ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Średnia zł/m²:</span>{" "}
                  {result.valuationBenchmark.pricePerM2Average?.toLocaleString("pl-PL") ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">zł/ha:</span>{" "}
                  {result.valuationBenchmark.pricePerHa?.toLocaleString("pl-PL") ?? "—"}
                </div>
                <Separator className="my-2" />
                <div>
                  <span className="text-muted-foreground">Szacunek (mediana):</span>{" "}
                  <b>{formatPLN(result.valuationBenchmark.estimatedValueMedianPln)}</b>
                </div>
                <div>
                  <span className="text-muted-foreground">Zakres konserwatywny:</span>{" "}
                  {formatPLN(result.valuationBenchmark.conservativeLowPln)} –{" "}
                  {formatPLN(result.valuationBenchmark.conservativeHighPln)}
                </div>
                <div>
                  <span className="text-muted-foreground">Wartość deklarowana:</span>{" "}
                  {formatPLN(result.valuationBenchmark.declaredValuePln)}
                </div>
                {result.valuationBenchmark.varianceFromDeclaredValuePercent != null && (
                  <div>
                    <span className="text-muted-foreground">Odchylenie od deklaracji:</span>{" "}
                    {result.valuationBenchmark.varianceFromDeclaredValuePercent.toFixed(1)}%
                  </div>
                )}
                {result.perplexityValuation && (
                  <>
                    <Separator className="my-2" />
                    <div className="rounded border bg-muted/30 p-2 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <b>Wycena Perplexity</b>
                        <Badge
                          variant={
                            result.perplexityValuation.status === "success"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {result.perplexityValuation.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          trend: {result.perplexityValuation.marketTrend}
                        </span>
                        <span className="text-muted-foreground">
                          · porównań: {result.perplexityValuation.comparablesFound}
                        </span>
                      </div>
                      {result.perplexityValuation.rationale && (
                        <div className="text-muted-foreground">
                          {result.perplexityValuation.rationale}
                        </div>
                      )}
                      {result.perplexityValuation.liquidityComment && (
                        <div>
                          <span className="text-muted-foreground">Płynność:</span>{" "}
                          {result.perplexityValuation.liquidityComment}
                        </div>
                      )}
                      {(result.perplexityValuation.estimatedValueLowPln ||
                        result.perplexityValuation.estimatedValueHighPln) && (
                        <div>
                          <span className="text-muted-foreground">Zakres wartości:</span>{" "}
                          {result.perplexityValuation.estimatedValueLowPln?.toLocaleString(
                            "pl-PL",
                          ) ?? "—"}{" "}
                          –{" "}
                          {result.perplexityValuation.estimatedValueHighPln?.toLocaleString(
                            "pl-PL",
                          ) ?? "—"}{" "}
                          PLN
                        </div>
                      )}
                      {result.perplexityValuation.citations.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Źródła ({result.perplexityValuation.citations.length})
                          </summary>
                          <ul className="mt-1 list-disc pl-4 space-y-0.5">
                            {result.perplexityValuation.citations.slice(0, 15).map((c, i) => (
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
                      {result.perplexityValuation.errorMessage && (
                        <div className="text-destructive">
                          {result.perplexityValuation.errorMessage}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {result.gusDiagnostics && (
                  <>
                    <Separator className="my-2" />
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Diagnostyka benchmarku GUS BDL
                      </summary>
                      <div className="mt-2 space-y-1 rounded border bg-muted/30 p-2">
                        <div>
                          <b>{result.gusDiagnostics.summaryLine}</b>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Jednostka BDL:</span>{" "}
                          {result.gusDiagnostics.resolvedLocation.bdlUnitName} (id:{" "}
                          <code>{result.gusDiagnostics.resolvedLocation.bdlUnitId}</code>, poziom:{" "}
                          {result.gusDiagnostics.resolvedLocation.bdlUnitLevel}, źródło:{" "}
                          {result.gusDiagnostics.resolvedLocation.source})
                        </div>
                        {result.gusDiagnostics.bdlVariable && (
                          <div>
                            <span className="text-muted-foreground">Wskaźnik:</span>{" "}
                            {result.gusDiagnostics.bdlVariable.variableName} (id:{" "}
                            <code>{result.gusDiagnostics.bdlVariable.variableId}</code>, jedn.:{" "}
                            {result.gusDiagnostics.bdlVariable.unit ?? "—"})
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Okres:</span>{" "}
                          {result.gusDiagnostics.period.label || "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wartość:</span>{" "}
                          {result.gusDiagnostics.value != null
                            ? `${result.gusDiagnostics.value.toLocaleString("pl-PL")} zł/m²`
                            : "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fallback:</span>{" "}
                          {result.gusDiagnostics.fallbackUsed ? (
                            <Badge variant="destructive">
                              tak — {result.gusDiagnostics.fallbackLevel}
                            </Badge>
                          ) : (
                            <Badge variant="default">nie</Badge>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sanity-check:</span>{" "}
                          <Badge
                            variant={
                              result.gusDiagnostics.sanityCheckStatus === "ok"
                                ? "default"
                                : result.gusDiagnostics.sanityCheckStatus === "suspicious"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {result.gusDiagnostics.sanityCheckStatus}
                          </Badge>
                          {result.gusDiagnostics.sanityCheckReason && (
                            <div className="text-muted-foreground mt-1">
                              {result.gusDiagnostics.sanityCheckReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>LTV i płynność</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Wnioskowana kwota:</span>{" "}
                  {formatPLN(result.ltv.requestedLoanAmountPln)}
                </div>
                <div>
                  <span className="text-muted-foreground">Wartość przyjęta:</span>{" "}
                  {formatPLN(result.ltv.estimatedValuePln)}
                </div>
                <div>
                  <span className="text-muted-foreground">LTV:</span>{" "}
                  <b>{result.ltv.ltvPercent ?? "—"}%</b>{" "}
                  <Badge variant="outline" className="ml-1">
                    {result.ltv.ltvCategory}
                  </Badge>
                </div>
                <Separator className="my-2" />
                <div>
                  <span className="text-muted-foreground">Lokalizacja (score):</span>{" "}
                  {result.locationScore.score}/100
                </div>
                <div className="text-xs text-muted-foreground">{result.locationScore.summary}</div>
                <Separator className="my-2" />
                <div>
                  <span className="text-muted-foreground">Płynność:</span>{" "}
                  {result.marketLiquidity.summary}
                </div>
              </CardContent>
            </Card>
          </div>

          {result.rcnDiagnostics && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Diagnostyka RCN (administracyjna)</span>
                  <Badge
                    variant={
                      result.rcnDiagnostics.status === "success"
                        ? "default"
                        : result.rcnDiagnostics.status === "no_features_in_bbox" ||
                            result.rcnDiagnostics.status === "features_found_but_filtered_out"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {result.rcnDiagnostics.status}
                  </Badge>
                </CardTitle>
                <CardDescription>{result.rcnDiagnostics.statusMessage}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Endpoint:</span>{" "}
                  <code className="break-all">{result.rcnDiagnostics.endpoint ?? "—"}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Warstwa użyta:</span>{" "}
                  <code>{result.rcnDiagnostics.layerUsed ?? "—"}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">CRS:</span>{" "}
                  {result.rcnDiagnostics.crsUsed ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Współrzędne wejściowe:</span> lat=
                  {result.rcnDiagnostics.inputCoordinates.lat ?? "—"}, lng=
                  {result.rcnDiagnostics.inputCoordinates.lng ?? "—"} (
                  {result.rcnDiagnostics.inputCoordinates.crs})
                </div>
                {result.rcnDiagnostics.queryBbox && (
                  <div>
                    <span className="text-muted-foreground">Bbox:</span> [
                    {result.rcnDiagnostics.queryBbox.minX.toFixed(4)},{" "}
                    {result.rcnDiagnostics.queryBbox.minY.toFixed(4)},{" "}
                    {result.rcnDiagnostics.queryBbox.maxX.toFixed(4)},{" "}
                    {result.rcnDiagnostics.queryBbox.maxY.toFixed(4)}] (
                    {result.rcnDiagnostics.queryBbox.crs})
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Promień:</span>{" "}
                  {result.rcnDiagnostics.radiusM ?? "—"} m (próbowano:{" "}
                  {result.rcnDiagnostics.radiiTried.join(", ") || "—"})
                </div>
                <div>
                  <span className="text-muted-foreground">Mapowanie typu:</span>{" "}
                  {result.rcnDiagnostics.propertyTypeMapping.applicationType ?? "—"} → [
                  {result.rcnDiagnostics.propertyTypeMapping.keywords.join(", ")}]
                </div>
                <div>
                  <span className="text-muted-foreground">Filtry:</span>{" "}
                  {result.rcnDiagnostics.filtersApplied.join(", ") || "(brak)"}
                </div>
                <Separator className="my-1" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                  <div className="rounded border p-1.5">
                    <div className="text-muted-foreground">Raw count</div>
                    <div className="font-medium">{result.rcnDiagnostics.featuresRawCount}</div>
                  </div>
                  <div className="rounded border p-1.5">
                    <div className="text-muted-foreground">Filtered count</div>
                    <div className="font-medium">{result.rcnDiagnostics.featuresFilteredCount}</div>
                  </div>
                  <div className="rounded border p-1.5">
                    <div className="text-muted-foreground">≤ 12 mies.</div>
                    <div className="font-medium">
                      {result.rcnDiagnostics.periodCounts.countLast12Months}
                    </div>
                  </div>
                  <div className="rounded border p-1.5">
                    <div className="text-muted-foreground">≤ 36 mies.</div>
                    <div className="font-medium">
                      {result.rcnDiagnostics.periodCounts.countLast36Months}
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Wykryte warstwy ({result.rcnDiagnostics.availableLayers.length}):
                  </span>{" "}
                  <code className="break-all">
                    {result.rcnDiagnostics.availableLayers.slice(0, 12).join(", ") || "—"}
                    {result.rcnDiagnostics.availableLayers.length > 12 ? "…" : ""}
                  </code>
                </div>
                {result.rcnDiagnostics.errorTechnical && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs break-all">
                      {result.rcnDiagnostics.errorTechnical}
                    </AlertDescription>
                  </Alert>
                )}
                {result.rcnDiagnostics.sampleFeature && (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Próbka pierwszego obiektu
                    </summary>
                    <pre className="mt-1 overflow-auto rounded border bg-muted/30 p-2 text-[10px] max-h-48">
                      {JSON.stringify(result.rcnDiagnostics.sampleFeature, null, 2)}
                    </pre>
                  </details>
                )}
                {result.rcnDiagnostics.rawResponseSnippet && (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Fragment odpowiedzi technicznej
                    </summary>
                    <pre className="mt-1 overflow-auto rounded border bg-muted/30 p-2 text-[10px] max-h-48">
                      {result.rcnDiagnostics.rawResponseSnippet}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          {result.listingsBenchmark && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Podobne ogłoszenia z portali nieruchomościowych</span>
                  <Badge
                    variant={
                      result.listingsBenchmark.status === "success"
                        ? "default"
                        : result.listingsBenchmark.status === "partial"
                          ? "secondary"
                          : result.listingsBenchmark.status === "error"
                            ? "destructive"
                            : "outline"
                    }
                  >
                    {result.listingsBenchmark.used}/{result.listingsBenchmark.totalFound} ofert
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Źródło: Otodom, OLX, Domiporta, Gratka, Morizon, nieruchomosci-online (scraping
                  przez Firecrawl). Ceny ofertowe (zwykle 5–15% wyższe od transakcyjnych).
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                {result.listingsBenchmark.errorMessage && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{result.listingsBenchmark.errorMessage}</AlertDescription>
                  </Alert>
                )}
                {result.listingsBenchmark.used > 0 && (
                  <div className="grid gap-2 md:grid-cols-4">
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">Mediana zł/m²</div>
                      <div className="font-medium">
                        {result.listingsBenchmark.pricePerM2Median?.toLocaleString("pl-PL") ?? "—"}
                      </div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">Średnia zł/m²</div>
                      <div className="font-medium">
                        {result.listingsBenchmark.pricePerM2Average?.toLocaleString("pl-PL") ?? "—"}
                      </div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">Min zł/m²</div>
                      <div className="font-medium">
                        {result.listingsBenchmark.pricePerM2Min?.toLocaleString("pl-PL") ?? "—"}
                      </div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">Max zł/m²</div>
                      <div className="font-medium">
                        {result.listingsBenchmark.pricePerM2Max?.toLocaleString("pl-PL") ?? "—"}
                      </div>
                    </div>
                  </div>
                )}
                {result.listingsBenchmark.listings.length > 0 && (
                  <div className="space-y-1.5">
                    {result.listingsBenchmark.listings.map((l, i) => (
                      <div key={i} className="flex items-start gap-2 rounded border p-2 text-xs">
                        <Badge variant="outline" className="shrink-0">
                          {l.source}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium hover:underline line-clamp-1"
                          >
                            {l.title || l.url}
                          </a>
                          <div className="text-muted-foreground">
                            {l.pricePln ? `${l.pricePln.toLocaleString("pl-PL")} zł` : "cena —"}
                            {" · "}
                            {l.areaM2 ? `${l.areaM2} m²` : "pow. —"}
                            {l.pricePerM2 ? ` · ${l.pricePerM2.toLocaleString("pl-PL")} zł/m²` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Zapytanie</summary>
                  <code className="mt-1 block break-all">{result.listingsBenchmark.query}</code>
                </details>
              </CardContent>
            </Card>
          )}

          {result.floodRisk && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Ryzyko powodziowe (ISOK / Wody Polskie)</span>
                  <Badge
                    variant={
                      result.floodRisk.riskLevel === "none"
                        ? "default"
                        : result.floodRisk.riskLevel === "low"
                          ? "secondary"
                          : result.floodRisk.riskLevel === "medium"
                            ? "secondary"
                            : "destructive"
                    }
                  >
                    {
                      (
                        {
                          none: "brak",
                          low: "niskie",
                          medium: "średnie",
                          high: "wysokie",
                          very_high: "bardzo wysokie",
                          unknown: "nieznane",
                        } as Record<string, string>
                      )[result.floodRisk.riskLevel]
                    }
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Źródło: mapy zagrożenia powodziowego (MZP) i ryzyka powodziowego (MRP) — Wody
                  Polskie / ISOK.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {result.floodRisk.scenario10Percent ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    Scenariusz 10% (woda 100-letnia, częsty)
                  </div>
                  <div className="flex items-center gap-2">
                    {result.floodRisk.scenario1Percent ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    Scenariusz 1% (raz na 100 lat)
                  </div>
                  <div className="flex items-center gap-2">
                    {result.floodRisk.scenario02Percent ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    Scenariusz 0,2% (raz na 500 lat)
                  </div>
                  {result.floodRisk.specialFloodHazardArea && (
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Obszar szczególnego zagrożenia
                      powodzią
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {result.floodRisk.waterDepth != null && (
                    <div>
                      <span className="text-muted-foreground">Maks. głębokość wody:</span>{" "}
                      {result.floodRisk.waterDepth.toFixed(2)} m
                    </div>
                  )}
                  {result.floodRisk.flowVelocity != null && (
                    <div>
                      <span className="text-muted-foreground">Prędkość przepływu:</span>{" "}
                      {result.floodRisk.flowVelocity.toFixed(2)} m/s
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Wpływ na scoring (D):</span>{" "}
                    {result.floodRisk.score} pkt
                  </div>
                  {result.floodRisk.geometryUsed && (
                    <div className="text-xs text-muted-foreground">
                      Geometria: {result.floodRisk.geometryUsed}
                    </div>
                  )}
                  {!result.floodRisk.available && (
                    <div className="text-xs text-muted-foreground">
                      Usługa chwilowo niedostępna — wynik wstępny.
                    </div>
                  )}
                </div>
                {result.floodAlerts && result.floodAlerts.length > 0 && (
                  <div className="md:col-span-2">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc pl-5 space-y-1">
                          {result.floodAlerts.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {result.legalRisk.warnings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ryzyka prawne</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <ul className="list-disc pl-5 space-y-1">
                  {result.legalRisk.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Źródła danych</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="space-y-1">
                {result.dataSourcesUsed.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {statusIcon(s.status)}
                    <div className="flex-1">
                      <span className="font-medium">{s.source}</span>
                      <span className="text-muted-foreground"> — {s.purpose}</span>
                      {s.dataLevel && s.dataLevel !== "—" && (
                        <span className="text-xs text-muted-foreground"> · {s.dataLevel}</span>
                      )}
                      {s.period && (
                        <span className="text-xs text-muted-foreground"> · {s.period}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tekst do oferty inwestycyjnej</CardTitle>
              <CardDescription>Gotowy materiał do publikacji w sekcji oferty.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3 whitespace-pre-line">
              <div>
                <b>Nieruchomość:</b> {result.investmentOfferText.propertySummary}
              </div>
              <div>
                <b>Wycena:</b> {result.investmentOfferText.valuationSummary}
              </div>
              <div>
                <b>Lokalizacja:</b> {result.investmentOfferText.locationSummary}
              </div>
              <div>
                <b>Stan prawny:</b> {result.investmentOfferText.legalRiskSummary}
              </div>
              <div>
                <b>Ocena zabezpieczenia:</b> {result.investmentOfferText.collateralScoreSummary}
              </div>
              <Separator />
              <div className="text-muted-foreground">
                {result.investmentOfferText.investorShortSummary}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
