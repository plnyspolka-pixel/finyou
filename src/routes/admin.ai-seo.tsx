import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Loader2,
  ExternalLink,
  Trash2,
  Eye,
  EyeOff,
  FileText,
  Lightbulb,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  planSeoTopics,
  generateSeoArticle,
  setArticleStatus,
  deleteSeoArticle,
  deleteSeoTopic,
} from "@/lib/ai-seo.functions";
import { getSearchOverview } from "@/lib/google-search.functions";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from "recharts";

export const Route = createFileRoute("/admin/ai-seo")({
  component: SeoEnginePage,
});

function SeoEnginePage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">AI SEO Content Engine</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Planuj tematy, generuj artykuły, publikuj na /blog.
        </p>
      </header>
      <div className="grid lg:grid-cols-2 gap-6">
        <TopicPlanner />
        <ArticlesSummary />
      </div>
      <SearchPerformanceCard />
      <TopicsList />
      <ArticlesList />
    </div>
  );
}

function TopicPlanner() {
  const plan = useServerFn(planSeoTopics);
  const [seed, setSeed] = useState("pożyczka pod zastaw mieszkania");
  const [count, setCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const { topics } = await plan({ data: { seed, count } });
      toast.success(`Zaplanowano ${topics.length} tematów`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Planuj tematy
        </CardTitle>
        <CardDescription>AI zaproponuje listę tematów blogowych pod SEO.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="Hasło / obszar (np. 'pożyczka pod zastaw nieruchomości')"
        />
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            min={3}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 8)}
            className="w-24"
          />
          <Button onClick={run} disabled={loading || !seed.trim()}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Zaplanuj
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ArticlesSummary() {
  const [s, setS] = useState({ topics: 0, drafts: 0, published: 0 });
  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: a }] = await Promise.all([
        supabase.from("ai_seo_topics").select("status"),
        supabase.from("ai_seo_articles").select("status"),
      ]);
      setS({
        topics: t?.filter((x) => x.status === "planned").length ?? 0,
        drafts: a?.filter((x) => x.status === "draft").length ?? 0,
        published: a?.filter((x) => x.status === "published").length ?? 0,
      });
    })();
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold">{s.topics}</div>
            <div className="text-xs text-muted-foreground">Tematy w planie</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{s.drafts}</div>
            <div className="text-xs text-muted-foreground">Szkice</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{s.published}</div>
            <div className="text-xs text-muted-foreground">Opublikowane</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Blog publiczny:{" "}
          <a className="underline" href="/blog" target="_blank">
            /blog
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

/** Skrót z Google Search Console: wejścia z wyszukiwarki i pozycje najlepszych fraz.
 *  Pełny raport z wykresami zmian w czasie: /admin/google-search. */
function SearchPerformanceCard() {
  const load = useServerFn(getSearchOverview);
  const [data, setData] = useState<any | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    load({ data: { days: 28, chart_queries: 0, table_limit: 5, with_ga4: false } })
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (state === "loading") return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Ruch z Google (28 dni)
            </CardTitle>
            <CardDescription>
              Wejścia na stronę i pozycje najpopularniejszych fraz z Search Console.
            </CardDescription>
          </div>
          <Link to="/admin/google-search">
            <Button variant="outline" size="sm">
              Pełny raport i wykresy
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {state === "error" || !data ? (
          <p className="text-sm text-muted-foreground">
            Brak danych z Search Console — sprawdź połączenie z Google w zakładce{" "}
            <Link to="/admin/google-search" className="underline">
              Google Search
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold tabular-nums">
                  {new Intl.NumberFormat("pl-PL").format(data.totals.clicks)}
                </span>
                <span className="text-xs text-muted-foreground">wejść z wyszukiwarki</span>
                <SeoDelta value={data.change.clicks_pct} suffix="%" />
              </div>
              <div className="h-28 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="seo-clicks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2a78d6" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                      minTickGap={28}
                    />
                    <RTooltip
                      formatter={(v: any) => [v, "Wejścia"]}
                      labelFormatter={(d: any) =>
                        `${String(d).slice(8, 10)}.${String(d).slice(5, 7)}.${String(d).slice(0, 4)}`
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      stroke="#2a78d6"
                      strokeWidth={2}
                      fill="url(#seo-clicks)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Najpopularniejsze frazy — pozycja i zmiana względem poprzednich 28 dni
              </div>
              {data.queries.slice(0, 5).map((q: any) => (
                <div key={q.query} className="flex items-center gap-3 text-sm">
                  <span className="truncate flex-1" title={q.query}>
                    {q.query}
                  </span>
                  <Badge variant="outline" className="tabular-nums shrink-0">
                    poz. {q.position.toFixed(1)}
                  </Badge>
                  <span className="w-24 shrink-0 text-right">
                    <SeoDelta value={q.position_change} suffix=" poz." />
                  </span>
                </div>
              ))}
              {data.queries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak fraz w tym okresie.</p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Dodatnia wartość = lepiej (dla pozycji: awans w wynikach). */
function SeoDelta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const cls = flat
    ? "text-muted-foreground"
    : up
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {flat ? "bez zmian" : `${up ? "+" : ""}${value.toFixed(1)}${suffix}`}
    </span>
  );
}

function TopicsList() {
  const gen = useServerFn(generateSeoArticle);
  const del = useServerFn(deleteSeoTopic);
  const [rows, setRows] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("ai_seo_topics")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [tick]);
  const reload = () => setTick((x) => x + 1);

  const generate = async (topicId: string, autoPublish: boolean) => {
    setWorking(topicId);
    try {
      await gen({ data: { topicId, autoPublish } });
      toast.success(autoPublish ? "Wygenerowano i opublikowano" : "Wygenerowano szkic");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setWorking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tematy ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Temat</TableHead>
              <TableHead>Keyword</TableHead>
              <TableHead>Intencja</TableHead>
              <TableHead>Prio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium max-w-md">{t.title}</TableCell>
                <TableCell className="text-xs">{t.primary_keyword}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {t.search_intent}
                  </Badge>
                </TableCell>
                <TableCell>{t.priority}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {(t.status === "planned" || t.status === "rejected") && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={working === t.id}
                          onClick={() => generate(t.id, false)}
                        >
                          {working === t.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Szkic"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          disabled={working === t.id}
                          onClick={() => generate(t.id, true)}
                        >
                          Publikuj
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Usunąć?")) return;
                        await del({ data: { id: t.id } });
                        reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Brak tematów — użyj plannera.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ArticlesList() {
  const setSt = useServerFn(setArticleStatus);
  const del = useServerFn(deleteSeoArticle);
  const [rows, setRows] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    supabase
      .from("ai_seo_articles")
      .select("id,slug,title,status,word_count,reading_minutes,created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [tick]);
  const reload = () => setTick((x) => x + 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Artykuły ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tytuł</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Słów</TableHead>
              <TableHead>Min</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium max-w-md">{a.title}</TableCell>
                <TableCell className="font-mono text-xs">{a.slug}</TableCell>
                <TableCell>{a.word_count}</TableCell>
                <TableCell>{a.reading_minutes}</TableCell>
                <TableCell>
                  <Badge variant={a.status === "published" ? "default" : "secondary"}>
                    {a.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/blog/${a.slug}`} target="_blank" rel="noopener">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    {a.status !== "published" ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await setSt({ data: { id: a.id, status: "published" } });
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
                          await setSt({ data: { id: a.id, status: "draft" } });
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
                        if (!confirm("Usunąć?")) return;
                        await del({ data: { id: a.id } });
                        reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Brak artykułów — wygeneruj z tematu.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
