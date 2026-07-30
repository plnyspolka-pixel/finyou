import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Sparkles,
  ExternalLink,
  Trash2,
  Copy,
  Loader2,
  Eye,
  EyeOff,
  FlaskConical,
  Activity,
  Wand2,
} from "lucide-react";
import {
  generateAiLanding,
  setLandingStatus,
  deleteLanding,
  updateGrowthSettings,
} from "@/lib/ai-growth.functions";
import { AbTestingDialog } from "@/components/ab-testing-dialog";
import { HeatmapDialog } from "@/components/heatmap-dialog";
import { MicroOptimizerDialog } from "@/components/micro-optimizer-dialog";

export const Route = createFileRoute("/admin/ai-growth-engine")({
  component: GrowthEnginePage,
});

const MODULES_COMING_SOON = [
  "AI Micro-Optimizer",
  "AI SEO Builder",
  "Link Building Assistant",
  "Link Exchange Autopilot",
  "Email Outreach Autopilot",
];

function GrowthEnginePage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Autonomiczny AI Growth Engine</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          MVP: Landing Generator + Embed Engine. Pozostałe moduły zostaną dobudowane w kolejnych
          iteracjach.
        </p>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="generator">Landing Generator</TabsTrigger>
          <TabsTrigger value="landings">Landingi</TabsTrigger>
          <TabsTrigger value="log">Log działań</TabsTrigger>
          <TabsTrigger value="settings">Ustawienia</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <Dashboard />
        </TabsContent>
        <TabsContent value="generator" className="mt-4">
          <Generator />
        </TabsContent>
        <TabsContent value="landings" className="mt-4">
          <LandingsList />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <ActionLog />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard() {
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0, views: 0, leads: 0 });
  useEffect(() => {
    (async () => {
      const [{ data: landings }, { data: events }] = await Promise.all([
        supabase.from("ai_landings").select("status"),
        supabase.from("ai_landing_events").select("event_type"),
      ]);
      setStats({
        total: landings?.length ?? 0,
        published: landings?.filter((l) => l.status === "published").length ?? 0,
        draft: landings?.filter((l) => l.status === "draft").length ?? 0,
        views: events?.filter((e) => e.event_type === "view").length ?? 0,
        leads: events?.filter((e) => e.event_type === "lead").length ?? 0,
      });
    })();
  }, []);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Landingi razem" value={stats.total} />
        <Stat label="Opublikowane" value={stats.published} />
        <Stat label="Wersje robocze" value={stats.draft} />
        <Stat label="Odsłony" value={stats.views} />
        <Stat label="Leady" value={stats.leads} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moduły w przygotowaniu</CardTitle>
          <CardDescription>
            Pełna autonomia (A/B, SEO, outreach, link building) — kolejne iteracje.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {MODULES_COMING_SOON.map((m) => (
            <Badge key={m} variant="secondary">
              {m}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

/* ---------- Generator ---------- */
function Generator() {
  const generate = useServerFn(generateAiLanding);
  const [goal, setGoal] = useState(
    "Pozyskanie wniosków o pożyczkę pod zastaw mieszkania w Warszawie",
  );
  const [audience, setAudience] = useState(
    "Przedsiębiorcy 30-55 lat z mieszkaniem własnościowym, potrzebujący 100-500 tys. zł szybko",
  );
  const [keywords, setKeywords] = useState(
    "pożyczka pod zastaw, hipoteka prywatna, pożyczka pozabankowa",
  );
  const [brief, setBrief] = useState("");
  const [autoPublish, setAutoPublish] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { landing } = await generate({
        data: { goal, audience, keywords, brief, autoPublish },
      });
      toast.success(`Landing utworzony: /l/${landing.slug}`);
      setBrief("");
    } catch (e: any) {
      toast.error(e.message ?? "Błąd generowania");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Landing Generator</CardTitle>
        <CardDescription>
          Opisz cel — AI wygeneruje nagłówek, sekcje, meta SEO i CTA prowadzące do wniosku.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Cel kampanii *</Label>
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Grupa docelowa</Label>
          <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Słowa kluczowe SEO (przecinki)</Label>
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Dodatkowy brief (opcjonalnie)</Label>
          <Textarea
            rows={4}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Ton, USP, czego unikać, social proof…"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoPublish}
            onChange={(e) => setAutoPublish(e.target.checked)}
          />
          Opublikuj od razu (bez moderacji)
        </label>
        <Button onClick={run} disabled={loading || !goal.trim()}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Wygeneruj landing
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- Landings list ---------- */
function LandingsList() {
  const setStatus = useServerFn(setLandingStatus);
  const del = useServerFn(deleteLanding);
  const [items, setItems] = useState<any[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [abLanding, setAbLanding] = useState<any | null>(null);
  const [heatmapLanding, setHeatmapLanding] = useState<any | null>(null);
  const [optLanding, setOptLanding] = useState<any | null>(null);

  useEffect(() => {
    supabase
      .from("ai_landings")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [reloadTick]);

  const origin = "https://app.financeyou.pl";
  const reload = () => setReloadTick((x) => x + 1);

  const copyEmbed = async (slug: string) => {
    const code = `<iframe src="${origin}/embed/l/${slug}" width="100%" height="1200" style="border:0;max-width:960px;width:100%" loading="lazy" title="Landing"></iframe>`;
    await navigator.clipboard.writeText(code);
    toast.success("Kod embed skopiowany");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tytuł</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Źródło</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.title}</TableCell>
                <TableCell className="font-mono text-xs">{l.slug}</TableCell>
                <TableCell>
                  <Badge variant={l.status === "published" ? "default" : "secondary"}>
                    {l.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.source}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/l/${l.slug}`} target="_blank" rel="noopener">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyEmbed(l.slug)}
                      title="Kopiuj embed"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAbLanding(l)}
                      title="Testy A/B"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHeatmapLanding(l)}
                      title="Heatmapy & engagement"
                    >
                      <Activity className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOptLanding(l)}
                      title="AI Micro-Optimizer"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                    </Button>
                    {l.status !== "published" ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={async () => {
                          await setStatus({ data: { id: l.id, status: "published" } });
                          toast.success("Opublikowano");
                          reload();
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Publikuj
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await setStatus({ data: { id: l.id, status: "draft" } });
                          toast.success("Ukryto");
                          reload();
                        }}
                      >
                        <EyeOff className="h-3.5 w-3.5 mr-1" />
                        Ukryj
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Usunąć landing?")) return;
                        await del({ data: { id: l.id } });
                        toast.success("Usunięto");
                        reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  Brak landingów. Użyj generatora.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {abLanding && (
        <AbTestingDialog
          landing={abLanding}
          open={!!abLanding}
          onClose={() => setAbLanding(null)}
        />
      )}
      {heatmapLanding && (
        <HeatmapDialog
          landing={heatmapLanding}
          open={!!heatmapLanding}
          onClose={() => setHeatmapLanding(null)}
        />
      )}
      {optLanding && (
        <MicroOptimizerDialog
          landing={optLanding}
          open={!!optLanding}
          onClose={() => {
            setOptLanding(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

/* ---------- Action log ---------- */
function ActionLog() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase
      .from("ai_growth_action_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Moduł</TableHead>
              <TableHead>Akcja</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                <TableCell>{r.module}</TableCell>
                <TableCell className="font-mono text-xs">{r.action}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "ok" ? "secondary" : "destructive"}>
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{r.summary}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  Brak działań
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Settings ---------- */
function SettingsPanel() {
  const update = useServerFn(updateGrowthSettings);
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    supabase
      .from("ai_growth_settings")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setS(data));
  }, []);
  if (!s) return <div className="text-sm text-muted-foreground">Ładowanie…</div>;

  const save = async () => {
    try {
      await update({
        data: {
          automation_mode: s.automation_mode,
          daily_ai_budget_pln: Number(s.daily_ai_budget_pln),
          brand_name: s.brand_name,
          brand_description: s.brand_description ?? "",
          target_audience: s.target_audience ?? "",
          primary_cta_url: s.primary_cta_url ?? "",
          default_model: s.default_model,
        },
      });
      toast.success("Zapisano ustawienia");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ustawienia silnika</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Tryb automatyzacji</Label>
          <Select
            value={s.automation_mode}
            onValueChange={(v) => setS({ ...s, automation_mode: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">off — nic automatycznie</SelectItem>
              <SelectItem value="manual_review">
                manual_review — generuj, czekaj na akceptację
              </SelectItem>
              <SelectItem value="semi_auto">semi_auto — auto z limitami</SelectItem>
              <SelectItem value="full_autopilot">full_autopilot — pełna autonomia</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Aktywnie respektowane przez Landing Generator; reszta modułów dojdzie później.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Dzienny limit AI (PLN)</Label>
            <Input
              type="number"
              value={s.daily_ai_budget_pln}
              onChange={(e) => setS({ ...s, daily_ai_budget_pln: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Domyślny model</Label>
            <Input
              value={s.default_model}
              onChange={(e) => setS({ ...s, default_model: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Nazwa marki</Label>
          <Input
            value={s.brand_name}
            onChange={(e) => setS({ ...s, brand_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Opis marki</Label>
          <Textarea
            rows={2}
            value={s.brand_description ?? ""}
            onChange={(e) => setS({ ...s, brand_description: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Grupa docelowa (domyślna)</Label>
          <Textarea
            rows={2}
            value={s.target_audience ?? ""}
            onChange={(e) => setS({ ...s, target_audience: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Główny URL CTA</Label>
          <Input
            value={s.primary_cta_url ?? ""}
            onChange={(e) => setS({ ...s, primary_cta_url: e.target.value })}
          />
        </div>
        <Button onClick={save}>Zapisz</Button>
      </CardContent>
    </Card>
  );
}
