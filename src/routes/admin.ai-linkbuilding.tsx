import { createFileRoute } from "@tanstack/react-router";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link2, Loader2, Sparkles, Trash2, ExternalLink, Send } from "lucide-react";
import {
  addBacklink,
  updateBacklink,
  deleteBacklink,
  generateLinkBuildingSuggestions,
  updateLbSuggestion,
  promoteSuggestionToOutreach,
} from "@/lib/ai-linkbuilding.functions";

export const Route = createFileRoute("/admin/ai-linkbuilding")({
  component: LinkBuildingPage,
});

function LinkBuildingPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">AI Link Building Assistant</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Rejestr zdobytych linków + AI proponuje nowe cele i strategie.
        </p>
      </header>

      <Tabs defaultValue="backlinks">
        <TabsList>
          <TabsTrigger value="backlinks">Backlinki</TabsTrigger>
          <TabsTrigger value="suggestions">Propozycje AI</TabsTrigger>
          <TabsTrigger value="add">Dodaj backlink</TabsTrigger>
        </TabsList>

        <TabsContent value="backlinks" className="mt-4">
          <BacklinksList />
        </TabsContent>
        <TabsContent value="suggestions" className="mt-4">
          <SuggestionsPanel />
        </TabsContent>
        <TabsContent value="add" className="mt-4">
          <AddBacklinkForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------- Backlinks list -------- */
function BacklinksList() {
  const del = useServerFn(deleteBacklink);
  const upd = useServerFn(updateBacklink);
  const [items, setItems] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState({ live: 0, lost: 0, pending: 0, dofollow: 0 });

  useEffect(() => {
    supabase
      .from("ai_backlinks")
      .select("*")
      .order("first_seen_at", { ascending: false })
      .then(({ data }) => {
        const rows = data ?? [];
        setItems(rows);
        setStats({
          live: rows.filter((r) => r.status === "live").length,
          lost: rows.filter((r) => r.status === "lost").length,
          pending: rows.filter((r) => r.status === "pending").length,
          dofollow: rows.filter((r) => r.status === "live" && r.dofollow).length,
        });
      });
  }, [tick]);

  const reload = () => setTick((x) => x + 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Live" value={stats.live} />
        <StatCard label="Dofollow live" value={stats.dofollow} />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Utracone" value={stats.lost} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domena</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Anchor</TableHead>
                <TableHead>DA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <a
                      href={b.source_url}
                      target="_blank"
                      rel="noopener nofollow"
                      className="font-medium hover:underline flex items-center gap-1"
                    >
                      {b.source_domain} <ExternalLink className="h-3 w-3" />
                    </a>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">
                      → {b.target_url}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{b.link_type}</Badge>
                    {!b.dofollow && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        nofollow
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate">
                    {b.anchor_text ?? "—"}
                  </TableCell>
                  <TableCell>{b.domain_authority ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={b.status}
                      onValueChange={async (v) => {
                        await upd({ data: { id: b.id, status: v as any } });
                        reload();
                      }}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live">live</SelectItem>
                        <SelectItem value="lost">lost</SelectItem>
                        <SelectItem value="pending">pending</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Usunąć?")) return;
                        await del({ data: { id: b.id } });
                        toast.success("Usunięto");
                        reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Brak backlinków — dodaj pierwszy.
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

/* -------- Suggestions -------- */
function SuggestionsPanel() {
  const gen = useServerFn(generateLinkBuildingSuggestions);
  const upd = useServerFn(updateLbSuggestion);
  const promote = useServerFn(promoteSuggestionToOutreach);
  const [items, setItems] = useState<any[]>([]);
  const [niche, setNiche] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    supabase
      .from("ai_linkbuilding_suggestions")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setItems(data ?? []));
  }, [tick]);

  const reload = () => setTick((x) => x + 1);

  const run = async () => {
    if (!niche.trim()) return;
    setLoading(true);
    try {
      const r = await gen({ data: { niche, notes } });
      toast.success(`Wygenerowano ${r.suggestions?.length ?? 0} propozycji`);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Generator propozycji</CardTitle>
          <CardDescription>
            AI sugeruje wartościowe domeny + strategię zdobycia linku.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Nisza / temat</Label>
            <Input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="np. pożyczki pod hipotekę, inwestycje alternatywne"
            />
          </div>
          <div className="space-y-2">
            <Label>Dodatkowe wskazówki (opcjonalnie)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={run} disabled={loading || !niche.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generuj
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domena</TableHead>
                <TableHead>Strategia</TableHead>
                <TableHead>Prio</TableHead>
                <TableHead>DA est.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <a
                      href={`https://${s.target_domain}`}
                      target="_blank"
                      rel="noopener nofollow"
                      className="font-medium hover:underline"
                    >
                      {s.target_domain}
                    </a>
                    {s.contact_hint && (
                      <div className="text-xs text-muted-foreground">{s.contact_hint}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-md">
                    <div>{s.strategy}</div>
                    <div className="text-muted-foreground mt-1">{s.rationale}</div>
                  </TableCell>
                  <TableCell>{"★".repeat(s.priority)}</TableCell>
                  <TableCell>{s.expected_da ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={s.status}
                      onValueChange={async (v) => {
                        await upd({ data: { id: s.id, status: v as any } });
                        reload();
                      }}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">new</SelectItem>
                        <SelectItem value="in_progress">in_progress</SelectItem>
                        <SelectItem value="won">won</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                        <SelectItem value="archived">archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await promote({ data: { id: s.id } });
                          toast.success("Dodano do AI Outreach");
                          reload();
                        } catch (e: any) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Do outreachu
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Brak propozycji. Wygeneruj powyżej.
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

/* -------- Add form -------- */
function AddBacklinkForm() {
  const add = useServerFn(addBacklink);
  const [form, setForm] = useState({
    source_url: "",
    target_url: "",
    anchor_text: "",
    link_type: "editorial" as const,
    dofollow: true,
    domain_authority: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.source_url || !form.target_url) {
      toast.error("URL źródła i celu wymagane");
      return;
    }
    setBusy(true);
    try {
      await add({
        data: {
          source_url: form.source_url,
          target_url: form.target_url,
          anchor_text: form.anchor_text || null,
          link_type: form.link_type,
          dofollow: form.dofollow,
          domain_authority: form.domain_authority ? Number(form.domain_authority) : null,
          notes: form.notes || null,
        },
      });
      toast.success("Dodano");
      setForm({
        source_url: "",
        target_url: "",
        anchor_text: "",
        link_type: "editorial",
        dofollow: true,
        domain_authority: "",
        notes: "",
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3 max-w-2xl">
        <div className="space-y-2">
          <Label>URL źródłowy (gdzie jest link)</Label>
          <Input
            value={form.source_url}
            onChange={(e) => setForm({ ...form, source_url: e.target.value })}
            placeholder="https://example.pl/artykul"
          />
        </div>
        <div className="space-y-2">
          <Label>URL docelowy (do czego linkuje)</Label>
          <Input
            value={form.target_url}
            onChange={(e) => setForm({ ...form, target_url: e.target.value })}
            placeholder="https://app.financeyou.pl/..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Anchor text</Label>
            <Input
              value={form.anchor_text}
              onChange={(e) => setForm({ ...form, anchor_text: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select
              value={form.link_type}
              onValueChange={(v) => setForm({ ...form, link_type: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "editorial",
                  "guest_post",
                  "directory",
                  "forum",
                  "comment",
                  "partnership",
                  "other",
                ].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Domain Authority</Label>
            <Input
              type="number"
              value={form.domain_authority}
              onChange={(e) => setForm({ ...form, domain_authority: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 pt-7">
            <Switch
              checked={form.dofollow}
              onCheckedChange={(c) => setForm({ ...form, dofollow: c })}
            />
            <Label>Dofollow</Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notatki</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Dodaj backlink
        </Button>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
