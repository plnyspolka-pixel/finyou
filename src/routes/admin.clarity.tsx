import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fetchClarityMetrics, analyzeClarityMetrics } from "@/lib/clarity.functions";

export const Route = createFileRoute("/admin/clarity")({
  component: ClarityPage,
});

type Metrics = Awaited<ReturnType<typeof fetchClarityMetrics>>;

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  // Clarity zwraca tablicę obiektów z polem "information" zawierającym wiersze.
  if (!Array.isArray(payload)) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const block of payload as any[]) {
    const info = block?.information;
    if (Array.isArray(info)) rows.push(...info);
  }
  return rows;
}

function MetricBlock({ title, payload }: { title: string; payload: any }) {
  const rows = extractRows(payload);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak danych.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  {cols.map((c) => (
                    <th key={c} className="py-2 pr-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {cols.map((c) => (
                      <td key={c} className="py-2 pr-3 align-top">
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 25 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Pokazano 25 z {rows.length} wierszy.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClarityPage() {
  const fetchFn = useServerFn(fetchClarityMetrics);
  const analyzeFn = useServerFn(analyzeClarityMetrics);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [numOfDays, setNumOfDays] = useState<1 | 2 | 3>(3);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchFn({ data: { numOfDays } });
      setMetrics(res);
      toast.success("Pobrano metryki Clarity");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania");
    } finally {
      setLoading(false);
    }
  };

  const analyze = async () => {
    if (!metrics) return;
    setAnalyzing(true);
    setAnalysis("");
    try {
      const res = await analyzeFn({ data: { metrics, question } });
      setAnalysis(res.text);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd analizy AI");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Microsoft Clarity</h1>
          <p className="text-sm text-muted-foreground">
            Metryki z Clarity + analiza AI. Nagrania sesji i heatmapy (obrazy) Microsoft udostępnia
            tylko w panelu Clarity — link niżej.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={numOfDays}
            onChange={(e) => setNumOfDays(Number(e.target.value) as 1 | 2 | 3)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value={1}>Ostatni 1 dzień</option>
            <option value={2}>Ostatnie 2 dni</option>
            <option value={3}>Ostatnie 3 dni</option>
          </select>
          <Button onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Pobierz dane
          </Button>
          <a
            href="https://clarity.microsoft.com/projects/view/x4ab9cyghc/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" /> Nagrania i heatmapy
            </Button>
          </a>
        </div>
      </div>

      {!metrics && !loading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Kliknij „Pobierz dane", aby pobrać metryki z Clarity (limit: 10 zapytań/dzień).
          </CardContent>
        </Card>
      )}

      {metrics && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <MetricBlock title="Strony × Urządzenie × Źródło" payload={metrics.byUrl} />
            <MetricBlock title="Urządzenie × Źródło × Medium" payload={metrics.byDeviceSource} />
            <MetricBlock title="Kraj × Przeglądarka × OS" payload={metrics.byCountryBrowser} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Analiza AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder='Opcjonalne pytanie do AI (np. „Gdzie tracimy konwersję na /rejestracja?"). Puste = TOP 5 problemów UX.'
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
              />
              <Button onClick={analyze} disabled={analyzing}>
                {analyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Analizuj
              </Button>
              {analysis && (
                <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                  {analysis}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Pobrano: {formatDateTime(metrics.fetchedAt)} · Zakres: {metrics.numOfDays} dni
          </p>
        </>
      )}
    </div>
  );
}
