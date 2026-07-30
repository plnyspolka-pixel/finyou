// Panel konfiguracji modułu „Potencjał lokalizacyjny" (spec §19).
//
// Każdy zapis tworzy NOWĄ wersję konfiguracji (location_scoring_settings) — nie
// nadpisuje historii. Historyczne wyniki nie zmieniają się bez jawnego
// ponownego przeliczenia. Tylko administrator może zapisać konfigurację.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, MapPinned, History, LineChart, Target } from "lucide-react";
import { toast } from "sonner";
import {
  getLocationScoringSettings,
  saveLocationScoringSettings,
  runLocationBacktest,
  recalibrateSerialRanges,
} from "@/lib/location-scoring.functions";
import type { LocationScoringConfig, BacktestReport } from "@/lib/location-scoring";

export const Route = createFileRoute("/admin/potencjal-lokalizacyjny")({
  component: LocationScoringConfigPage,
});

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function LocationScoringConfigPage() {
  const fetchSettings = useServerFn(getLocationScoringSettings);
  const saveSettings = useServerFn(saveLocationScoringSettings);
  const runBacktestFn = useServerFn(runLocationBacktest);
  const recalibrateFn = useServerFn(recalibrateSerialRanges);
  const [config, setConfig] = useState<LocationScoringConfig | null>(null);
  const [versions, setVersions] = useState<
    Array<{ config_version: string; is_active: boolean; created_at: string }>
  >([]);
  const [modelVersion, setModelVersion] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backtest, setBacktest] = useState<BacktestReport | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);

  const doBacktest = async () => {
    setBacktesting(true);
    try {
      const r = await runBacktestFn({ data: { targetPrecision: 0.9 } });
      setBacktest(r.report);
      toast.success("Backtest zakończony", { description: r.report.note });
    } catch (e) {
      toast.error("Błąd backtestu", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBacktesting(false);
    }
  };

  const applySuggestedThreshold = async () => {
    if (!config || !backtest) return;
    const t = backtest.suggestion.priorityThreshold;
    const version = `cfg-auto-${t}-${backtest.suggestion.sampleSize}`;
    setSaving(true);
    try {
      const next = {
        ...config,
        version,
        decisionThresholds: { ...config.decisionThresholds, autoHighScore: t },
      };
      await saveSettings({
        data: { configVersion: version, config: next as unknown as Record<string, unknown> },
      });
      toast.success(`Zastosowano sugerowany próg AUTO_HIGH = ${t} (wersja ${version})`);
      await load();
    } catch (e) {
      toast.error("Błąd zapisu progu", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const doRecalibrate = async () => {
    setRecalibrating(true);
    try {
      const r = await recalibrateFn({ data: {} });
      toast.success("Bramka sygnału KW przeliczona", {
        description: `Grupy: ${r.groups}, zwalidowane: ${r.validatedGroups}.`,
      });
    } catch (e) {
      toast.error("Błąd kalibracji", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRecalibrating(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchSettings({ data: {} });
      setConfig(r.active as LocationScoringConfig);
      setVersions((r.versions ?? []) as typeof versions);
      setModelVersion(r.modelVersion);
    } catch (e) {
      toast.error("Błąd wczytywania konfiguracji", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!config) return;
    const version = newVersion.trim();
    if (!version) {
      toast.error("Podaj nazwę nowej wersji konfiguracji.");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        data: { configVersion: version, config: config as unknown as Record<string, unknown> },
      });
      toast.success(`Zapisano nową wersję konfiguracji: ${version}`);
      setNewVersion("");
      await load();
    } catch (e) {
      toast.error("Błąd zapisu konfiguracji", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie konfiguracji…
      </div>
    );
  }

  const setW = (k: keyof LocationScoringConfig["weights"], v: number) =>
    setConfig({ ...config, weights: { ...config.weights, [k]: v } });
  const setC = (k: keyof LocationScoringConfig["clusterScores"], v: number) =>
    setConfig({ ...config, clusterScores: { ...config.clusterScores, [k]: v } });
  const setT = (k: keyof LocationScoringConfig["decisionThresholds"], v: number) =>
    setConfig({ ...config, decisionThresholds: { ...config.decisionThresholds, [k]: v } });
  const setB = (r: keyof LocationScoringConfig["populationBounds"], idx: 0 | 1, v: number) => {
    const pair = [...config.populationBounds[r]] as [number, number];
    pair[idx] = v;
    setConfig({ ...config, populationBounds: { ...config.populationBounds, [r]: pair } });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MapPinned className="h-5 w-5" /> Potencjał lokalizacyjny — konfiguracja
        </h1>
        <p className="text-sm text-muted-foreground">
          Wagi, granice normalizacji i progi decyzyjne. Zapis tworzy nową wersję (aktywna:{" "}
          <Badge variant="secondary">{config.version}</Badge>, model:{" "}
          <Badge variant="outline">{modelVersion}</Badge>).
        </p>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Zmiana konfiguracji nie modyfikuje historycznych wyników. Aby zastosować nowe parametry do
          istniejących wniosków, uruchom ponowne przeliczenie na karcie wniosku (zakładka
          „Lokalizacja").
        </AlertDescription>
      </Alert>

      {/* Wagi promieni + klaster */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wagi potencjału (suma ≈ 1.0)</CardTitle>
          <CardDescription>
            Udział ludności w promieniach 10/25/45 km oraz rola klastra.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Promień 10 km"
            value={config.weights.population10}
            onChange={(v) => setW("population10", v)}
            step="0.05"
          />
          <Field
            label="Promień 25 km"
            value={config.weights.population25}
            onChange={(v) => setW("population25", v)}
            step="0.05"
          />
          <Field
            label="Promień 45 km"
            value={config.weights.population45}
            onChange={(v) => setW("population45", v)}
            step="0.05"
          />
          <Field
            label="Klaster / rola"
            value={config.weights.cluster}
            onChange={(v) => setW("cluster", v)}
            step="0.05"
          />
        </CardContent>
      </Card>

      {/* Granice normalizacji ludności */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Granice normalizacji logarytmicznej ludności</CardTitle>
          <CardDescription>Dolna i górna granica dla każdego promienia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {(["within10Km", "within25Km", "within45Km"] as const).map((r) => (
            <div key={r} className="space-y-2">
              <div className="text-xs font-medium">
                {r.replace("within", "").replace("Km", " km")}
              </div>
              <Field
                label="dolna"
                value={config.populationBounds[r][0]}
                onChange={(v) => setB(r, 0, v)}
                step="1000"
              />
              <Field
                label="górna"
                value={config.populationBounds[r][1]}
                onChange={(v) => setB(r, 1, v)}
                step="10000"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Oceny klastra */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oceny roli obszaru (0–1)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Rdzeń FUA"
            value={config.clusterScores.fuaCore}
            onChange={(v) => setC("fuaCore", v)}
            step="0.05"
          />
          <Field
            label="Strefa dojazdowa FUA"
            value={config.clusterScores.fuaCommutingZone}
            onChange={(v) => setC("fuaCommutingZone", v)}
            step="0.05"
          />
          <Field
            label="Miasto > 30 tys."
            value={config.clusterScores.cityAbove30k}
            onChange={(v) => setC("cityAbove30k", v)}
            step="0.05"
          />
          <Field
            label="Sąsiedztwo miasta > 30 tys."
            value={config.clusterScores.adjacentToCity30k}
            onChange={(v) => setC("adjacentToCity30k", v)}
            step="0.05"
          />
          <Field
            label="Klaster miejski"
            value={config.clusterScores.urbanCluster}
            onChange={(v) => setC("urbanCluster", v)}
            step="0.05"
          />
          <Field
            label="Pozostałe"
            value={config.clusterScores.other}
            onChange={(v) => setC("other", v)}
            step="0.05"
          />
        </CardContent>
      </Card>

      {/* Progi decyzyjne + lambda + serial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progi decyzyjne i parametry uczenia</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Okolica skupiska: min. ludność w 10 km"
            value={config.nearSettlement.minPopulationWithin10Km}
            onChange={(v) =>
              setConfig({ ...config, nearSettlement: { minPopulationWithin10Km: v } })
            }
            step="1000"
          />
          <Field
            label="AUTO_HIGH: score"
            value={config.decisionThresholds.autoHighScore}
            onChange={(v) => setT("autoHighScore", v)}
            step="1"
          />
          <Field
            label="AUTO_HIGH: pewność"
            value={config.decisionThresholds.autoHighConfidence}
            onChange={(v) => setT("autoHighConfidence", v)}
            step="1"
          />
          <Field
            label="AUTO_STD: score"
            value={config.decisionThresholds.autoStandardScore}
            onChange={(v) => setT("autoStandardScore", v)}
            step="1"
          />
          <Field
            label="AUTO_STD: pewność"
            value={config.decisionThresholds.autoStandardConfidence}
            onChange={(v) => setT("autoStandardConfidence", v)}
            step="1"
          />
          <Field
            label="LIGHT_CHECK: score"
            value={config.decisionThresholds.lightCheckScore}
            onChange={(v) => setT("lightCheckScore", v)}
            step="1"
          />
          <Field
            label="Siła wygładzania (lambda)"
            value={config.bayesianLambda}
            onChange={(v) => setConfig({ ...config, bayesianLambda: v })}
            step="5"
          />
          <Field
            label="Min. próba numeru repertoryjnego"
            value={config.serialSignalMinSample}
            onChange={(v) => setConfig({ ...config, serialSignalMinSample: v })}
            step="5"
          />
        </CardContent>
      </Card>

      {/* Kalibracja / backtest */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LineChart className="h-4 w-4" /> Kalibracja i backtest
          </CardTitle>
          <CardDescription>
            Strojenie progu AUTO_ANALYZE_HIGH pod docelowy precision (≥ 90%) na rzeczywistych
            wynikach preselekcji oraz kalibracja bramki sygnału numeru repertoryjnego. Bramka
            aktywuje się także automatycznie po napłynięciu obserwacji.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={doBacktest} disabled={backtesting} variant="outline" size="sm">
              {backtesting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <LineChart className="h-4 w-4 mr-2" />
              )}
              Uruchom backtest
            </Button>
            <Button onClick={doRecalibrate} disabled={recalibrating} variant="outline" size="sm">
              {recalibrating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Target className="h-4 w-4 mr-2" />
              )}
              Przelicz bramkę sygnału KW
            </Button>
          </div>

          {backtest && (
            <div className="space-y-3">
              <Alert>
                <AlertDescription className="text-xs">{backtest.note}</AlertDescription>
              </Alert>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 text-sm">
                <Stat label="Próba (par)" value={String(backtest.sampleSize)} />
                <Stat label="ROC-AUC" value={backtest.rocAuc.toFixed(3)} />
                <Stat label="PR-AUC" value={backtest.prAuc.toFixed(3)} />
                <Stat label="Brier" value={backtest.brier.toFixed(3)} />
                <Stat label="Calibration error" value={backtest.calibrationError.toFixed(3)} />
                <Stat
                  label="Precision @AUTO"
                  value={`${(backtest.precisionAtAuto * 100).toFixed(1)}%`}
                />
                <Stat label="Recall @AUTO" value={`${(backtest.recallAtAuto * 100).toFixed(1)}%`} />
                <Stat
                  label="Pokrycie @AUTO"
                  value={`${(backtest.coverageAtAuto * 100).toFixed(1)}%`}
                />
              </div>
              <div className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    Sugerowany próg AUTO_HIGH: <b>{backtest.suggestion.priorityThreshold}</b>{" "}
                    (precision {(backtest.suggestion.precision * 100).toFixed(1)}%, pokrycie{" "}
                    {(backtest.suggestion.coverage * 100).toFixed(1)}%){" "}
                    {backtest.suggestion.reachedTarget ? (
                      <Badge className="ml-1">cel osiągnięty</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1">
                        cel nieosiągalny na próbie
                      </Badge>
                    )}
                  </span>
                  <Button
                    size="sm"
                    onClick={applySuggestedThreshold}
                    disabled={saving || !backtest.suggestion.reachedTarget}
                  >
                    Zastosuj jako nową wersję
                  </Button>
                </div>
                {Object.keys(backtest.perPropertyType).length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Precision @AUTO wg rodzaju:{" "}
                    {Object.entries(backtest.perPropertyType)
                      .map(
                        ([t, v]) =>
                          `${t}: ${(v.precisionAtAuto * 100).toFixed(0)}% (n=${v.sample})`,
                      )
                      .join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zapis nowej wersji */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label htmlFor="newVersion">Nazwa nowej wersji konfiguracji</Label>
            <Input
              id="newVersion"
              placeholder="np. cfg-2026-07"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Zapisz jako nową wersję
          </Button>
        </CardContent>
      </Card>

      {/* Historia wersji */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Wersje konfiguracji
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {versions.length === 0 ? (
            <p className="text-muted-foreground">Brak zapisanych wersji.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.config_version}
                className="flex items-center justify-between border-b py-1 last:border-0"
              >
                <span className="font-mono">{v.config_version}</span>
                <div className="flex items-center gap-2">
                  {v.is_active && <Badge>aktywna</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("pl-PL")}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Import danych GUS/TERYT oraz mapy prefiksów uruchamia się skryptem ETL (patrz
        <span className="font-mono"> docs/location-scoring.md</span>).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </div>
  );
}
