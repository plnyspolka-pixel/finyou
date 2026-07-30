import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime, formatDate } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, TrendingDown, Sparkles, Filter } from "lucide-react";
import { getFunnelStats, generateFunnelInsights } from "@/lib/ai-funnel.functions";

export const Route = createFileRoute("/admin/ai-funnel")({
  component: FunnelAnalyzerPage,
});

function FunnelAnalyzerPage() {
  const fetchStats = useServerFn(getFunnelStats);
  const generate = useServerFn(generateFunnelInsights);
  const [days, setDays] = useState(30);
  const [landingId, setLandingId] = useState<string>("all");
  const [landings, setLandings] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("ai_landings")
      .select("id, slug, title")
      .order("created_at", { ascending: false })
      .then(({ data }) => setLandings(data ?? []));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const lid = landingId === "all" ? null : landingId;
      const r = await fetchStats({ data: { landing_id: lid, days } });
      setStats(r);
      const { data: ins } = await supabase
        .from("ai_funnel_insights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      setInsights(ins ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Błąd ładowania statystyk");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [days, landingId]);

  const runAI = async () => {
    setGenLoading(true);
    try {
      const lid = landingId === "all" ? null : landingId;
      await generate({ data: { landing_id: lid, days } });
      toast.success("Wygenerowano AI-insighty");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Błąd AI");
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Conversion Funnel Analyzer</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Lejek konwersji, atrybucja źródeł, AI-rekomendacje optymalizacji.
        </p>
      </header>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Okres</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Ostatnie 7 dni</SelectItem>
                <SelectItem value="30">Ostatnie 30 dni</SelectItem>
                <SelectItem value="90">Ostatnie 90 dni</SelectItem>
                <SelectItem value="180">Ostatnie 180 dni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Landing</Label>
            <Select value={landingId} onValueChange={setLandingId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                {landings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title || l.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Filter className="mr-2 h-4 w-4" />
            )}{" "}
            Odśwież
          </Button>
          <Button onClick={runAI} disabled={genLoading || !stats}>
            {genLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}{" "}
            Analiza AI
          </Button>
        </CardContent>
      </Card>

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Sesje" value={stats.totals.sessions} />
            <StatCard label="Konwersje" value={stats.totals.conversions} />
            <StatCard label="CR" value={`${stats.totals.conversion_rate}%`} />
            <StatCard
              label="Przychód"
              value={`${stats.totals.revenue.toLocaleString("pl-PL")} zł`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Etapy lejka</CardTitle>
              <CardDescription>
                Unique sessions na każdym kroku z drop-off vs poprzedni etap.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Etap</TableHead>
                    <TableHead>Sesje</TableHead>
                    <TableHead>Konwersja</TableHead>
                    <TableHead>Drop-off</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.steps.map((s: any) => (
                    <TableRow key={`${s.order}-${s.step}`}>
                      <TableCell className="text-muted-foreground">{s.order}</TableCell>
                      <TableCell className="font-medium">{s.step}</TableCell>
                      <TableCell>{s.unique_sessions}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{s.conversion_rate}%</Badge>
                      </TableCell>
                      <TableCell>
                        {s.drop_off_rate > 0 ? (
                          <span className="text-red-600">-{s.drop_off_rate}%</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!stats.steps.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Brak zdarzeń w tym okresie.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Atrybucja źródeł</CardTitle>
                <CardDescription>First-touch per sesja.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Źródło / Medium</TableHead>
                      <TableHead>Sesje</TableHead>
                      <TableHead>Konw.</TableHead>
                      <TableHead>CR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.sources.slice(0, 10).map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          {s.source} / {s.medium}
                        </TableCell>
                        <TableCell>{s.sessions}</TableCell>
                        <TableCell>{s.conversions}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{s.conversion_rate}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!stats.sources.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          Brak danych.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Urządzenia</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Urządzenie</TableHead>
                      <TableHead>Sesje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.devices.map((d: any) => (
                      <TableRow key={d.device}>
                        <TableCell className="capitalize">{d.device}</TableCell>
                        <TableCell>{d.sessions}</TableCell>
                      </TableRow>
                    ))}
                    {!stats.devices.length && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                          Brak danych.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Insighty</CardTitle>
            <CardDescription>Ostatnie analizy lejka.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.map((ins) => (
              <div key={ins.id} className="border rounded-lg p-4 space-y-3">
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(ins.created_at)} · {formatDate(ins.period_from)} →{" "}
                  {formatDate(ins.period_to)}
                </div>
                <p className="text-sm">{ins.summary}</p>
                {Array.isArray(ins.bottlenecks) && ins.bottlenecks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1">Wąskie gardła:</div>
                    <ul className="text-sm space-y-1">
                      {ins.bottlenecks.map((b: any, i: number) => (
                        <li key={i} className="flex gap-2">
                          <Badge variant="destructive" className="shrink-0">
                            {b.drop_off_pct ?? "—"}%
                          </Badge>
                          <span>
                            <strong>{b.step}:</strong> {b.diagnosis}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(ins.recommendations) && ins.recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1">Rekomendacje:</div>
                    <ul className="text-sm space-y-1">
                      {ins.recommendations.map((r: any, i: number) => (
                        <li key={i}>
                          <Badge variant="secondary" className="mr-2">
                            {r.expected_impact ?? "?"}
                          </Badge>
                          <strong>{r.title}</strong> — {r.action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
