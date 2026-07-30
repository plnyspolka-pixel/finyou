// Sekcja „Potencjał lokalizacyjny" na karcie wniosku (panel administratora).
//
// Wzorowana na RiskAssessmentSection: automatyczne wczytanie ostatniego wyniku
// przy montowaniu + przycisk ponownego przeliczenia. Prawdopodobieństwa
// przechowywane są jako 0–1, tu pokazywane jako procenty (spec §14, §18).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2,
  RefreshCw,
  MapPinned,
  ChevronDown,
  Gauge,
  ShieldQuestion,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { runLocationScoring, getLocationScoring } from "@/lib/location-scoring.functions";
import { parseKwNumber, toScoringPropertyType } from "@/lib/location-scoring";

type ResultRow = {
  masked_kw_number: string | null;
  kw_prefix: string;
  property_type: string;
  probability_urban_core: number;
  probability_urban_or_suburban: number;
  probability_fua: number;
  probability_good_location: number;
  probability_remote_area: number;
  expected_location_attractiveness: number;
  analysis_priority_score: number;
  confidence_score: number;
  attractiveness_p10: number;
  attractiveness_median: number;
  attractiveness_p90: number;
  decision: string;
  explanation: {
    title?: string;
    summary?: string;
    reasons?: string[];
    limitations?: string[];
  } | null;
  court_name: string | null;
  court_prefix: string | null;
  jurisdiction_version: string | null;
  model_version: string;
  data_version: string;
  config_version: string;
  calculated_at: string;
};

const DECISION_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  AUTO_ANALYZE_HIGH: { label: "Wysoki priorytet", variant: "default" },
  AUTO_ANALYZE_STANDARD: { label: "Standardowa analiza", variant: "secondary" },
  LIGHT_LOCATION_CHECK: { label: "Lekka weryfikacja", variant: "outline" },
  LOW_PRIORITY: { label: "Niski priorytet", variant: "outline" },
  INVALID_KW: { label: "Nieprawidłowy numer KW", variant: "destructive" },
  INSUFFICIENT_DATA: { label: "Brak danych", variant: "destructive" },
};

function pct(v: number): string {
  return `${Math.round((v ?? 0) * 100)}%`;
}

function scoreColor(v: number): string {
  if (v >= 75) return "text-emerald-600";
  if (v >= 60) return "text-lime-600";
  if (v >= 40) return "text-amber-500";
  return "text-muted-foreground";
}

export function LocationScoringSection({
  applicationId,
  kwNumber,
  propertyType,
}: {
  applicationId: string;
  kwNumber: string | null | undefined;
  propertyType: string | null | undefined;
}) {
  const fetchRes = useServerFn(getLocationScoring);
  const runRes = useServerFn(runLocationScoring);
  const [row, setRow] = useState<ResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Bieżące wejście (prefiks KW + typ scoringowy) — do wykrycia zmiany numeru/rodzaju.
  // Rodzaj nieruchomości jest POMOCNICZY: bez niego scoring działa na rozkładzie
  // zagregowanym ("any") — wystarczy poprawny numer KW.
  const parsed = kwNumber ? parseKwNumber(kwNumber) : null;
  const currentPrefix = parsed?.formatValid ? parsed.prefix : null;
  const currentScoringType = toScoringPropertyType(propertyType) ?? "any";
  const inputsScorable = Boolean(currentPrefix);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchRes({ data: { applicationId } });
      const existing = (r?.result as ResultRow) ?? null;
      setRow(existing);
      // Auto-scoring (spec §17): brak wyniku ALBO zmiana numeru KW / rodzaju →
      // przelicz automatycznie. Nieblokująco, tylko dla obsługiwanych wejść.
      const stale =
        !existing ||
        (currentPrefix && existing.kw_prefix !== currentPrefix) ||
        (currentScoringType && existing.property_type !== currentScoringType);
      if (inputsScorable && stale && !running) {
        void run(true);
      }
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, currentPrefix, currentScoringType]);

  const run = async (auto = false) => {
    if (!kwNumber) {
      if (!auto)
        toast.error("Brak numeru KW", {
          description: "Uzupełnij numer księgi wieczystej nieruchomości.",
        });
      return;
    }
    setRunning(true);
    try {
      const res = await runRes({
        data: { applicationId, kwNumber, propertyType: propertyType ?? "" },
      });
      if (!res.ok) {
        if (!auto) toast.error("Scoring nie został wyznaczony", { description: res.message });
      } else if (!auto) {
        toast.success(
          row ? "Potencjał przeliczony ponownie" : "Potencjał lokalizacyjny wyznaczony",
        );
      }
      // Odśwież bez ponownego auto-uruchomienia (bezpośredni fetch).
      const r = await fetchRes({ data: { applicationId } });
      setRow((r?.result as ResultRow) ?? null);
    } catch (e: unknown) {
      if (!auto)
        toast.error("Błąd modułu lokalizacyjnego", {
          description: e instanceof Error ? e.message : String(e),
        });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie potencjału lokalizacyjnego…
      </div>
    );
  }

  const dec = row
    ? (DECISION_LABEL[row.decision] ?? { label: row.decision, variant: "outline" as const })
    : null;
  const lowConfidence = row ? row.confidence_score < 50 : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MapPinned className="h-5 w-5" /> Potencjał lokalizacyjny (preselekcja)
          </h3>
          <p className="text-xs text-muted-foreground">
            Szacunek na podstawie prefiksu wydziału KW, rodzaju nieruchomości i danych GUS/TERYT.
            Narzędzie wewnętrzne — nie służy do definitywnego odrzucenia wniosku.
          </p>
        </div>
        <Button onClick={() => run()} disabled={running} size="sm">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {row ? "Przelicz ponownie" : "Wyznacz potencjał"}
        </Button>
      </div>

      {!row ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Brak wyniku. Uruchom scoring po wpisaniu numeru KW (rodzaj nieruchomości jest opcjonalny
            — doprecyzowuje wynik).
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Kafelki kluczowe */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={<Gauge className="h-4 w-4" />}
              label="Potencjał lokalizacyjny"
              value={`${row.expected_location_attractiveness}/100`}
              valueClass={scoreColor(row.expected_location_attractiveness)}
            />
            <Metric
              icon={<Building2 className="h-4 w-4" />}
              label="Szansa okolicy skupiska ≥20–30 tys."
              value={pct(row.probability_good_location)}
            />
            <Metric
              icon={<ShieldQuestion className="h-4 w-4" />}
              label="Pewność oszacowania"
              value={`${row.confidence_score}%`}
              valueClass={lowConfidence ? "text-amber-500" : undefined}
            />
            <Metric
              icon={<MapPinned className="h-4 w-4" />}
              label="Priorytet analizy"
              value={dec?.label ?? "—"}
              badge={
                dec ? <Badge variant={dec.variant}>{row.analysis_priority_score}/100</Badge> : null
              }
            />
          </div>

          {lowConfidence && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Niska pewność — rozkład możliwych lokalizacji jest szeroki (P10–P90:{" "}
                {row.attractiveness_p10}–{row.attractiveness_p90}). Traktuj wynik wyłącznie jako
                wskazówkę kolejności.
              </AlertDescription>
            </Alert>
          )}

          {/* Opis */}
          {row.explanation?.summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{row.explanation.title ?? "Uzasadnienie"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>{row.explanation.summary}</p>
                {row.explanation.reasons && row.explanation.reasons.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1">
                    {row.explanation.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* Sekcja rozwijana — szczegóły */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <ChevronDown className="h-4 w-4" /> Szczegóły oszacowania
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Card>
                <CardContent className="pt-4 text-sm space-y-3">
                  <Row
                    label="Sąd i wydział KW"
                    value={`${row.court_name ?? "—"} (${row.court_prefix ?? row.kw_prefix})`}
                  />
                  <Row label="Wersja właściwości" value={row.jurisdiction_version ?? "—"} />
                  <Row label="Numer KW (zamaskowany)" value={row.masked_kw_number ?? "—"} />
                  <Separator />
                  <ProbRow label="Rdzeń miejski" v={row.probability_urban_core} />
                  <ProbRow
                    label="Miasto lub strefa podmiejska"
                    v={row.probability_urban_or_suburban}
                  />
                  <ProbRow label="Funkcjonalny obszar miejski (FUA)" v={row.probability_fua} />
                  <ProbRow
                    label="Okolica skupiska ludzkiego (≥ ~20–30 tys.)"
                    v={row.probability_good_location}
                  />
                  <ProbRow label="Obszar peryferyjny" v={row.probability_remote_area} />
                  <Separator />
                  <Row
                    label="Atrakcyjność P10 / mediana / P90"
                    value={`${row.attractiveness_p10} / ${row.attractiveness_median} / ${row.attractiveness_p90}`}
                  />
                  <Row label="Priorytet (score)" value={`${row.analysis_priority_score}/100`} />
                  <Separator />
                  {row.explanation?.limitations && row.explanation.limitations.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Ograniczenia wyniku
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                        {row.explanation.limitations.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Separator />
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>Model: {row.model_version}</span>
                    <span>Dane: {row.data_version}</span>
                    <span>Konfiguracja: {row.config_version}</span>
                    <span>Obliczono: {new Date(row.calculated_at).toLocaleString("pl-PL")}</span>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  valueClass,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
          {icon} {label}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className={`text-xl font-semibold ${valueClass ?? ""}`}>{value}</div>
          {badge}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function ProbRow({ label, v }: { label: string; v: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct(v)}</span>
      </div>
      <Progress value={Math.round((v ?? 0) * 100)} className="h-1.5" />
    </div>
  );
}
