import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useEffect, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, Trash2, Plus, Copy, Reply, Check } from "lucide-react";
import {
  addOutreachTarget,
  updateOutreachTarget,
  deleteOutreachTarget,
  discoverOutreachTargets,
  generateOutreachMessage,
  updateOutreachMessage,
  deleteOutreachMessage,
} from "@/lib/ai-outreach.functions";

export const Route = createFileRoute("/admin/ai-outreach")({ component: OutreachPage });

const STATUSES = [
  "new",
  "queued",
  "contacted",
  "responded",
  "won",
  "rejected",
  "blacklist",
] as const;

function OutreachPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Send className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">AI Outreach Autopilot</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Wyszukuj portale, generuj spersonalizowane maile i prowadź follow-upy. Wysyłka manualna z
          Twojej skrzynki — system trzyma treści, status i historię.
        </p>
      </header>

      <Tabs defaultValue="targets">
        <TabsList>
          <TabsTrigger value="targets">Cele</TabsTrigger>
          <TabsTrigger value="discover">AI Discovery</TabsTrigger>
          <TabsTrigger value="add">Dodaj ręcznie</TabsTrigger>
        </TabsList>
        <TabsContent value="targets" className="mt-4">
          <TargetsList />
        </TabsContent>
        <TabsContent value="discover" className="mt-4">
          <Discover />
        </TabsContent>
        <TabsContent value="add" className="mt-4">
          <AddTarget />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Discovery ---------- */
function Discover() {
  const run = useServerFn(discoverOutreachTargets);
  const [niche, setNiche] = useState("pożyczki pozabankowe, finanse osobiste, hipoteka prywatna");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);

  const go = async () => {
    setLoading(true);
    try {
      const r = await run({ data: { niche, count } });
      toast.success(
        `AI zaproponowało ${r.proposed} portali. Dodano: ${r.inserted}, pominięto duplikatów: ${r.skipped.length}`,
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Discovery</CardTitle>
        <CardDescription>
          Wpisz niszę — AI zaproponuje polskie portale do outreachu i doda je do listy celów.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-w-2xl">
        <div className="space-y-2">
          <Label>Nisza / temat</Label>
          <Textarea rows={3} value={niche} onChange={(e) => setNiche(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Liczba propozycji</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <Button onClick={go} disabled={loading || !niche.trim()}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Znajdź portale
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- Manual add ---------- */
function AddTarget() {
  const add = useServerFn(addOutreachTarget);
  const [f, setF] = useState({
    domain: "",
    contact_email: "",
    contact_name: "",
    niche: "",
    priority: 50,
    notes: "",
  });
  const submit = async () => {
    try {
      await add({
        data: {
          domain: f.domain.trim().toLowerCase(),
          contact_email: f.contact_email || null,
          contact_name: f.contact_name || null,
          niche: f.niche || null,
          priority: Number(f.priority),
          notes: f.notes || null,
        },
      });
      toast.success("Dodano");
      setF({ domain: "", contact_email: "", contact_name: "", niche: "", priority: 50, notes: "" });
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  return (
    <Card>
      <CardContent className="pt-6 space-y-3 max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Domena *</Label>
            <Input
              value={f.domain}
              placeholder="example.pl"
              onChange={(e) => setF({ ...f, domain: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Priorytet 0-100</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Email kontaktowy</Label>
            <Input
              value={f.contact_email}
              onChange={(e) => setF({ ...f, contact_email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Imię osoby</Label>
            <Input
              value={f.contact_name}
              onChange={(e) => setF({ ...f, contact_name: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Nisza</Label>
          <Input value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Notatki</Label>
          <Textarea
            rows={3}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>
        <Button onClick={submit} disabled={!f.domain.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj cel
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- Targets list ---------- */
function TargetsList() {
  const upd = useServerFn(updateOutreachTarget);
  const del = useServerFn(deleteOutreachTarget);
  const [items, setItems] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [openTarget, setOpenTarget] = useState<any | null>(null);

  useEffect(() => {
    supabase
      .from("ai_outreach_targets")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, [tick]);

  const reload = () => setTick((x) => x + 1);
  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  const setStatus = async (id: string, status: any) => {
    await upd({ data: { id, status } });
    reload();
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{items.length} celów</div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domena</TableHead>
              <TableHead>Nisza</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>Pri</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.domain}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.niche ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {t.contact_email ?? <span className="text-muted-foreground">brak</span>}
                </TableCell>
                <TableCell>{t.priority}</TableCell>
                <TableCell>
                  <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setOpenTarget(t)}>
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Wiadomości
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Usunąć cel i wszystkie wiadomości?")) return;
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
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Brak celów
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {openTarget && (
        <MessagesDialog
          target={openTarget}
          open={!!openTarget}
          onClose={() => {
            setOpenTarget(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

/* ---------- Messages dialog ---------- */
function MessagesDialog({
  target,
  open,
  onClose,
}: {
  target: any;
  open: boolean;
  onClose: () => void;
}) {
  const gen = useServerFn(generateOutreachMessage);
  const upd = useServerFn(updateOutreachMessage);
  const del = useServerFn(deleteOutreachMessage);
  const [messages, setMessages] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const [goal, setGoal] = useState(
    "Propozycja gościnnego wpisu o pożyczkach pod zastaw nieruchomości z linkiem do naszego kalkulatora",
  );
  const [angle, setAngle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("ai_outreach_messages")
      .select("*")
      .eq("target_id", target.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setMessages(data ?? []));
  }, [target.id, open, tick]);

  const reload = () => setTick((x) => x + 1);

  const generate = async (parent_id: string | null = null, step = 1) => {
    setLoading(true);
    try {
      await gen({ data: { target_id: target.id, goal, angle, parent_id, step } });
      toast.success("Wiadomość wygenerowana");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (m: any) => {
    await navigator.clipboard.writeText(`Subject: ${m.subject}\n\n${m.body}`);
    toast.success("Skopiowano subject + body");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Outreach — {target.domain}</DialogTitle>
          <DialogDescription>
            {target.contact_email
              ? `Do: ${target.contact_email}`
              : "Brak adresu — uzupełnij w karcie celu."}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 border-b pb-4">
          <h3 className="text-sm font-semibold">Wygeneruj pierwszą wiadomość</h3>
          <div className="space-y-1">
            <Label className="text-xs">Cel maila</Label>
            <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kąt komunikacji (opcjonalnie)</Label>
            <Input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="np. pokaż dane rynkowe i zaproś do partnerstwa"
            />
          </div>
          <Button onClick={() => generate(null, 1)} disabled={loading || !goal.trim()}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generuj pierwszy mail
          </Button>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Historia ({messages.length})</h3>
          {messages.map((m) => (
            <Card key={m.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">step {m.step}</Badge>
                    <Badge
                      variant={
                        m.status === "sent"
                          ? "default"
                          : m.status === "replied"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {m.status}
                    </Badge>
                    {m.sent_at && (
                      <span className="text-xs text-muted-foreground">
                        wysłany {formatDateTime(m.sent_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => copy(m)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {m.status !== "sent" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={async () => {
                          await upd({ data: { id: m.id, mark_sent: true } });
                          toast.success("Oznaczono jako wysłany");
                          reload();
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Wysłany
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generate(m.id, m.step + 1)}
                      disabled={loading}
                    >
                      <Reply className="h-3.5 w-3.5 mr-1" />
                      Follow-up
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Usunąć?")) return;
                        await del({ data: { id: m.id } });
                        reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Input
                    value={m.subject}
                    onChange={async (e) => {
                      await upd({ data: { id: m.id, subject: e.target.value } });
                    }}
                    className="font-medium"
                  />
                  <Textarea
                    rows={Math.min(14, Math.max(6, m.body.split("\n").length + 1))}
                    defaultValue={m.body}
                    onBlur={async (e) => {
                      await upd({ data: { id: m.id, body: e.target.value } });
                    }}
                  />
                </div>
                {m.status === "sent" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Odpowiedź odbiorcy (jeśli dotyczy)</Label>
                    <Textarea
                      rows={3}
                      defaultValue={m.reply_excerpt ?? ""}
                      onBlur={async (e) => {
                        const v = e.target.value;
                        await upd({
                          data: { id: m.id, reply_excerpt: v, status: v ? "replied" : "sent" },
                        });
                        reload();
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Brak wiadomości — wygeneruj pierwszą.
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
