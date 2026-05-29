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

export function CollateralAnalysisSection({ applicationId }: { applicationId: string }) {
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

  useEffect(() => { void load(); }, [applicationId]);

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

  if (loading) return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie analizy…</div>;

  const result = row?.result_json as PropertyAnalysisResult | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Analiza zabezpieczenia</h3>
          <p className="text-xs text-muted-foreground">Automatyczna analiza nieruchomości jako zabezpieczenia pożyczki.</p>
        </div>
        <Button onClick={run} disabled={running} size="sm">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {row ? "Uruchom ponownie" : "Uruchom analizę"}
        </Button>
      </div>

      {!result && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          Brak wyników. Uruchom analizę, aby zebrać dane ze źródeł zewnętrznych.
        </CardContent></Card>
      )}

      {result && (
        <>
          {result.warnings?.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
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
              <CardHeader><CardTitle>Benchmark wartości</CardTitle>
                <CardDescription>Źródło główne: {result.valuationBenchmark.mainSource}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Mediana zł/m²:</span> {result.valuationBenchmark.pricePerM2Median?.toLocaleString("pl-PL") ?? "—"}</div>
                <div><span className="text-muted-foreground">Średnia zł/m²:</span> {result.valuationBenchmark.pricePerM2Average?.toLocaleString("pl-PL") ?? "—"}</div>
                <div><span className="text-muted-foreground">zł/ha:</span> {result.valuationBenchmark.pricePerHa?.toLocaleString("pl-PL") ?? "—"}</div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">Szacunek (mediana):</span> <b>{formatPLN(result.valuationBenchmark.estimatedValueMedianPln)}</b></div>
                <div><span className="text-muted-foreground">Zakres konserwatywny:</span> {formatPLN(result.valuationBenchmark.conservativeLowPln)} – {formatPLN(result.valuationBenchmark.conservativeHighPln)}</div>
                <div><span className="text-muted-foreground">Wartość deklarowana:</span> {formatPLN(result.valuationBenchmark.declaredValuePln)}</div>
                {result.valuationBenchmark.varianceFromDeclaredValuePercent != null && (
                  <div><span className="text-muted-foreground">Odchylenie od deklaracji:</span> {result.valuationBenchmark.varianceFromDeclaredValuePercent.toFixed(1)}%</div>
                )}
                {result.gusDiagnostics && (
                  <>
                    <Separator className="my-2" />
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Diagnostyka benchmarku GUS BDL
                      </summary>
                      <div className="mt-2 space-y-1 rounded border bg-muted/30 p-2">
                        <div><b>{result.gusDiagnostics.summaryLine}</b></div>
                        <div><span className="text-muted-foreground">Jednostka BDL:</span> {result.gusDiagnostics.resolvedLocation.bdlUnitName} (id: <code>{result.gusDiagnostics.resolvedLocation.bdlUnitId}</code>, poziom: {result.gusDiagnostics.resolvedLocation.bdlUnitLevel}, źródło: {result.gusDiagnostics.resolvedLocation.source})</div>
                        {result.gusDiagnostics.bdlVariable && (
                          <div><span className="text-muted-foreground">Wskaźnik:</span> {result.gusDiagnostics.bdlVariable.variableName} (id: <code>{result.gusDiagnostics.bdlVariable.variableId}</code>, jedn.: {result.gusDiagnostics.bdlVariable.unit ?? "—"})</div>
                        )}
                        <div><span className="text-muted-foreground">Okres:</span> {result.gusDiagnostics.period.label || "—"}</div>
                        <div><span className="text-muted-foreground">Wartość:</span> {result.gusDiagnostics.value != null ? `${result.gusDiagnostics.value.toLocaleString("pl-PL")} zł/m²` : "—"}</div>
                        <div>
                          <span className="text-muted-foreground">Fallback:</span>{" "}
                          {result.gusDiagnostics.fallbackUsed
                            ? <Badge variant="destructive">tak — {result.gusDiagnostics.fallbackLevel}</Badge>
                            : <Badge variant="default">nie</Badge>}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sanity-check:</span>{" "}
                          <Badge variant={
                            result.gusDiagnostics.sanityCheckStatus === "ok" ? "default" :
                            result.gusDiagnostics.sanityCheckStatus === "suspicious" ? "secondary" : "destructive"
                          }>{result.gusDiagnostics.sanityCheckStatus}</Badge>
                          {result.gusDiagnostics.sanityCheckReason && (
                            <div className="text-muted-foreground mt-1">{result.gusDiagnostics.sanityCheckReason}</div>
                          )}
                        </div>
                      </div>
                    </details>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>LTV i płynność</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Wnioskowana kwota:</span> {formatPLN(result.ltv.requestedLoanAmountPln)}</div>
                <div><span className="text-muted-foreground">Wartość przyjęta:</span> {formatPLN(result.ltv.estimatedValuePln)}</div>
                <div><span className="text-muted-foreground">LTV:</span> <b>{result.ltv.ltvPercent ?? "—"}%</b> <Badge variant="outline" className="ml-1">{result.ltv.ltvCategory}</Badge></div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">Lokalizacja (score):</span> {result.locationScore.score}/100</div>
                <div className="text-xs text-muted-foreground">{result.locationScore.summary}</div>
                <Separator className="my-2" />
                <div><span className="text-muted-foreground">Płynność:</span> {result.marketLiquidity.summary}</div>
              </CardContent>
            </Card>
          </div>


          {result.floodRisk && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Ryzyko powodziowe (ISOK / Wody Polskie)</span>
                  <Badge variant={
                    result.floodRisk.riskLevel === "none" ? "default" :
                    result.floodRisk.riskLevel === "low" ? "secondary" :
                    result.floodRisk.riskLevel === "medium" ? "secondary" :
                    "destructive"
                  }>
                    {({
                      none: "brak",
                      low: "niskie",
                      medium: "średnie",
                      high: "wysokie",
                      very_high: "bardzo wysokie",
                      unknown: "nieznane",
                    } as Record<string, string>)[result.floodRisk.riskLevel]}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Źródło: mapy zagrożenia powodziowego (MZP) i ryzyka powodziowego (MRP) — Wody Polskie / ISOK.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {result.floodRisk.scenario10Percent ? <CheckCircle2 className="h-3.5 w-3.5 text-destructive" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    Scenariusz 10% (woda 100-letnia, częsty)
                  </div>
                  <div className="flex items-center gap-2">
                    {result.floodRisk.scenario1Percent ? <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    Scenariusz 1% (raz na 100 lat)
                  </div>
                  <div className="flex items-center gap-2">
                    {result.floodRisk.scenario02Percent ? <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    Scenariusz 0,2% (raz na 500 lat)
                  </div>
                  {result.floodRisk.specialFloodHazardArea && (
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Obszar szczególnego zagrożenia powodzią
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {result.floodRisk.waterDepth != null && (
                    <div><span className="text-muted-foreground">Maks. głębokość wody:</span> {result.floodRisk.waterDepth.toFixed(2)} m</div>
                  )}
                  {result.floodRisk.flowVelocity != null && (
                    <div><span className="text-muted-foreground">Prędkość przepływu:</span> {result.floodRisk.flowVelocity.toFixed(2)} m/s</div>
                  )}
                  <div><span className="text-muted-foreground">Wpływ na scoring (D):</span> {result.floodRisk.score} pkt</div>
                  {result.floodRisk.geometryUsed && (
                    <div className="text-xs text-muted-foreground">Geometria: {result.floodRisk.geometryUsed}</div>
                  )}
                  {!result.floodRisk.available && (
                    <div className="text-xs text-muted-foreground">Usługa chwilowo niedostępna — wynik wstępny.</div>
                  )}
                </div>
                {result.floodAlerts && result.floodAlerts.length > 0 && (
                  <div className="md:col-span-2">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc pl-5 space-y-1">
                          {result.floodAlerts.map((a, i) => <li key={i}>{a}</li>)}
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
              <CardHeader><CardTitle>Ryzyka prawne</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <ul className="list-disc pl-5 space-y-1">
                  {result.legalRisk.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Źródła danych</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="space-y-1">
                {result.dataSourcesUsed.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {statusIcon(s.status)}
                    <div className="flex-1">
                      <span className="font-medium">{s.source}</span>
                      <span className="text-muted-foreground"> — {s.purpose}</span>
                      {s.dataLevel && s.dataLevel !== "—" && <span className="text-xs text-muted-foreground"> · {s.dataLevel}</span>}
                      {s.period && <span className="text-xs text-muted-foreground"> · {s.period}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tekst do oferty inwestycyjnej</CardTitle>
              <CardDescription>Gotowy materiał do publikacji w sekcji oferty.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3 whitespace-pre-line">
              <div><b>Nieruchomość:</b> {result.investmentOfferText.propertySummary}</div>
              <div><b>Wycena:</b> {result.investmentOfferText.valuationSummary}</div>
              <div><b>Lokalizacja:</b> {result.investmentOfferText.locationSummary}</div>
              <div><b>Stan prawny:</b> {result.investmentOfferText.legalRiskSummary}</div>
              <div><b>Ocena zabezpieczenia:</b> {result.investmentOfferText.collateralScoreSummary}</div>
              <Separator />
              <div className="text-muted-foreground">{result.investmentOfferText.investorShortSummary}</div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
