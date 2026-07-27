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
import { Eye, Loader2, Trash2, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import {
  addCompetitor,
  updateCompetitor,
  deleteCompetitor,
  scanCompetitor,
} from "@/lib/ai-competitor.functions";

export const Route = createFileRoute("/admin/ai-competitors")({
  component: CompetitorWatchPage,
});

function CompetitorWatchPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">AI Competitor Watch</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Monitoruj strony konkurencji i otrzymuj AI-analizy istotnych zmian.
        </p>
      </header>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Konkurenci</TabsTrigger>
          <TabsTrigger value="changes">Wykryte zmiany</TabsTrigger>
          <TabsTrigger value="add">Dodaj konkurenta</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <CompetitorList />
        </TabsContent>
        <TabsContent value="changes" className="mt-4">
          <ChangesFeed />
        </TabsContent>
        <TabsContent value="add" className="mt-4">
          <AddCompetitorForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompetitorList() {
  const scan = useServerFn(scanCompetitor);
  const del = useServerFn(deleteCompetitor);
  const upd = useServerFn(updateCompetitor);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    supabase
      .from("ai_competitors")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [tick]);

  const reload = () => setTick((x) => x + 1);

  const handleScan = async (id: string) => {
    setBusy(id);
    try {
      const r = await scan({ data: { competitor_id: id } });
      toast.success(`Sprawdzono ${r.scanned} URL-i, zmian: ${r.changed}`);
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Błąd skanowania");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>Domena</TableHead>
              <TableHead>URL-e</TableHead>
              <TableHead>Ostatnie skanowanie</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  <div className="flex gap-1 mt-1">
                    {(c.tags ?? []).map((t: string) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{c.domain}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{c.urls?.length ?? 0}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.last_checked_at ? formatDateTime(c.last_checked_at) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleScan(c.id)}
                      disabled={busy === c.id}
                    >
                      {busy === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await upd({ data: { id: c.id, is_active: !c.is_active } });
                        reload();
                      }}
                    >
                      {c.is_active ? "Pauza" : "Aktywuj"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Usunąć konkurenta i wszystkie snapshoty?")) return;
                        await del({ data: { id: c.id } });
                        toast.success("Usunięto");
                        reload();
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  Brak konkurentów. Dodaj pierwszego.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ChangesFeed() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("ai_competitor_snapshots")
      .select("*, ai_competitors(name, domain)")
      .eq("changed", true)
      .order("checked_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setItems(data ?? []));
  }, []);

  return (
    <div className="space-y-3">
      {items.map((s) => {
        const a = s.ai_analysis ?? {};
        const importance = a.importance ?? "low";
        return (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  {s.ai_competitors?.name ?? "—"}
                </CardTitle>
                <div className="flex gap-2 items-center">
                  {a.category && <Badge variant="outline">{a.category}</Badge>}
                  <Badge
                    variant={
                      importance === "high"
                        ? "destructive"
                        : importance === "medium"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {importance}
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-xs flex items-center gap-1">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline inline-flex items-center gap-1"
                >
                  {s.url} <ExternalLink className="h-3 w-3" />
                </a>
                · {formatDateTime(s.checked_at)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{s.change_summary}</p>
              {Array.isArray(a.key_changes) && a.key_changes.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-1">
                  {a.key_changes.map((k: string, i: number) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              )}
              {a.competitive_threat && (
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Zagrożenie konkurencyjne:</strong> {a.competitive_threat}
                </div>
              )}
              <HistoryDialog snapshotId={s.id} url={s.url} />
            </CardContent>
          </Card>
        );
      })}
      {!items.length && (
        <p className="text-center text-muted-foreground py-8">
          Brak wykrytych zmian. Uruchom skanowanie konkurenta.
        </p>
      )}
    </div>
  );
}

function HistoryDialog({ snapshotId, url }: { snapshotId: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!open) return;
    supabase
      .from("ai_competitor_snapshots")
      .select("id, checked_at, changed, change_summary")
      .eq("url", url)
      .order("checked_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setRows(data ?? []));
  }, [open, url]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Historia URL
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{url}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="border rounded p-2 text-xs">
              <div className="flex justify-between">
                <span>{formatDateTime(r.checked_at)}</span>
                {r.changed && (
                  <Badge variant="default" className="text-[10px]">
                    zmiana
                  </Badge>
                )}
              </div>
              {r.change_summary && (
                <div className="mt-1 text-muted-foreground">{r.change_summary}</div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCompetitorForm() {
  const add = useServerFn(addCompetitor);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", urls: "", notes: "", tags: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const urls = form.urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      if (!urls.length) throw new Error("Dodaj co najmniej jeden URL.");
      await add({
        data: {
          name: form.name,
          domain: form.domain,
          urls,
          notes: form.notes || null,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      toast.success("Dodano konkurenta");
      setForm({ name: "", domain: "", urls: "", notes: "", tags: "" });
    } catch (e: any) {
      toast.error(e.message ?? "Błąd");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nowy konkurent</CardTitle>
        <CardDescription>Lista URL-i do monitorowania (po jednym w wierszu).</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nazwa *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Domena *</Label>
              <Input
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="konkurent.pl"
                required
              />
            </div>
          </div>
          <div>
            <Label>URL-e do monitoringu *</Label>
            <Textarea
              rows={5}
              value={form.urls}
              onChange={(e) => setForm({ ...form, urls: e.target.value })}
              placeholder={"https://konkurent.pl/oferta\nhttps://konkurent.pl/cennik"}
              required
            />
          </div>
          <div>
            <Label>Tagi</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="bezpośredni, premium"
            />
          </div>
          <div>
            <Label>Notatki</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Dodaj konkurenta
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
