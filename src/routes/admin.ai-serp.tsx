import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Trash2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
} from "lucide-react";
import {
  addKeyword,
  deleteKeyword,
  updateKeyword,
  checkKeywordRanking,
  checkAllRankings,
} from "@/lib/ai-serp.functions";

export const Route = createFileRoute("/admin/ai-serp")({
  component: SerpTrackerPage,
});

function SerpTrackerPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">SERP Tracker</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Monitoruj pozycje swoich słów kluczowych w Google (PL).
        </p>
      </header>

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">Słowa kluczowe</TabsTrigger>
          <TabsTrigger value="add">Dodaj frazę</TabsTrigger>
        </TabsList>
        <TabsContent value="keywords" className="mt-4">
          <KeywordList />
        </TabsContent>
        <TabsContent value="add" className="mt-4">
          <AddKeywordForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function PositionDelta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null) return <span className="text-muted-foreground">—</span>;
  if (previous == null) return <Badge variant="secondary">{current}</Badge>;
  const diff = previous - current; // positive = improvement
  if (diff === 0)
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant="secondary">{current}</Badge>
        <Minus className="h-3 w-3 text-muted-foreground" />
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="secondary">{current}</Badge>
      {diff > 0 ? (
        <span className="inline-flex items-center text-emerald-600 text-xs">
          <TrendingUp className="h-3 w-3" />+{diff}
        </span>
      ) : (
        <span className="inline-flex items-center text-red-600 text-xs">
          <TrendingDown className="h-3 w-3" />
          {diff}
        </span>
      )}
    </span>
  );
}

function KeywordList() {
  const check = useServerFn(checkKeywordRanking);
  const checkAll = useServerFn(checkAllRankings);
  const del = useServerFn(deleteKeyword);
  const upd = useServerFn(updateKeyword);
  const [items, setItems] = useState<any[]>([]);
  const [latest, setLatest] = useState<Record<string, any>>({});
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: kws } = await supabase
        .from("ai_serp_keywords")
        .select("*")
        .order("created_at", { ascending: false });
      setItems(kws ?? []);
      if (kws?.length) {
        const { data: rks } = await supabase
          .from("ai_serp_rankings")
          .select("*")
          .in(
            "keyword_id",
            kws.map((k) => k.id),
          )
          .order("checked_at", { ascending: false });
        const map: Record<string, any> = {};
        for (const r of rks ?? []) if (!map[r.keyword_id]) map[r.keyword_id] = r;
        setLatest(map);
      }
    })();
  }, [tick]);

  const reload = () => setTick((x) => x + 1);

  const handleCheck = async (id: string) => {
    setBusy(id);
    try {
      await check({ data: { keyword_id: id } });
      toast.success("Sprawdzono pozycję");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Błąd sprawdzania");
    } finally {
      setBusy(null);
    }
  };

  const handleCheckAll = async () => {
    setBulkBusy(true);
    try {
      const r = await checkAll({});
      toast.success(`Sprawdzono ${r.checked} fraz (błędy: ${r.errors})`);
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Błąd");
    } finally {
      setBulkBusy(false);
    }
  };

  const ranked = Object.values(latest).filter((r: any) => r.position != null);
  const top10 = ranked.filter((r: any) => r.position <= 10).length;
  const top3 = ranked.filter((r: any) => r.position <= 3).length;
  const avg = ranked.length
    ? Math.round(ranked.reduce((s: number, r: any) => s + r.position, 0) / ranked.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Frazy" value={items.length} />
        <StatCard label="W TOP 3" value={top3} />
        <StatCard label="W TOP 10" value={top10} />
        <StatCard label="Średnia pozycja" value={avg || "—"} />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleCheckAll} disabled={bulkBusy || !items.length}>
          {bulkBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sprawdź wszystkie
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fraza</TableHead>
                <TableHead>URL docelowy</TableHead>
                <TableHead>Pozycja</TableHead>
                <TableHead>Sprawdzono</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((k) => {
                const last = latest[k.id];
                return (
                  <TableRow key={k.id}>
                    <TableCell>
                      <div className="font-medium">{k.keyword}</div>
                      <div className="text-xs text-muted-foreground">
                        {k.location} · {k.language}
                        {k.intent ? ` · ${k.intent}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                      {k.target_url ?? "—"}
                    </TableCell>
                    <TableCell>
                      <PositionDelta
                        current={last?.position ?? null}
                        previous={last?.previous_position ?? null}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {last?.checked_at ? formatDateTime(last.checked_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCheck(k.id)}
                          disabled={busy === k.id}
                        >
                          {busy === k.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <HistoryDialog keywordId={k.id} keyword={k.keyword} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await upd({ data: { id: k.id, is_active: !k.is_active } });
                            reload();
                          }}
                        >
                          {k.is_active ? "Pauza" : "Aktywuj"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm("Usunąć frazę?")) return;
                            await del({ data: { id: k.id } });
                            toast.success("Usunięto");
                            reload();
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Brak fraz. Dodaj pierwszą.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryDialog({ keywordId, keyword }: { keywordId: string; keyword: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("ai_serp_rankings")
      .select("*")
      .eq("keyword_id", keywordId)
      .order("checked_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setRows(data ?? []));
  }, [open, keywordId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historia: {keyword}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pozycja</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{formatDateTime(r.checked_at)}</TableCell>
                  <TableCell>
                    <PositionDelta current={r.position} previous={r.previous_position} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                    {r.url ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    Brak pomiarów.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddKeywordForm() {
  const add = useServerFn(addKeyword);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    keyword: "",
    target_url: "",
    location: "Poland",
    language: "pl",
    tags: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await add({
        data: {
          keyword: form.keyword,
          target_url: form.target_url || null,
          location: form.location,
          language: form.language,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      toast.success("Dodano frazę");
      setForm({ keyword: "", target_url: "", location: "Poland", language: "pl", tags: "" });
    } catch (e: any) {
      toast.error(e.message ?? "Błąd");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nowa fraza</CardTitle>
        <CardDescription>Dodaj słowo kluczowe do monitorowania pozycji w Google.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Słowo kluczowe *</Label>
            <Input
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              required
              placeholder="np. pożyczka pod zastaw nieruchomości"
            />
          </div>
          <div>
            <Label>URL docelowy</Label>
            <Input
              value={form.target_url}
              onChange={(e) => setForm({ ...form, target_url: e.target.value })}
              placeholder="https://twojadomena.pl/strona"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Pozostaw puste, aby tylko śledzić TOP 10 bez konkretnego URL.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lokalizacja</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Język</Label>
              <Input
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Tagi (po przecinku)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="brand, pożyczki, hipoteczne"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Dodaj frazę
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
