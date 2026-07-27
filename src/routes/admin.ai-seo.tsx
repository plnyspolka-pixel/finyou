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
} from "lucide-react";
import {
  planSeoTopics,
  generateSeoArticle,
  setArticleStatus,
  deleteSeoArticle,
  deleteSeoTopic,
} from "@/lib/ai-seo.functions";

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
