import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Mail,
  Users,
  Send,
  Sparkles,
  Plus,
  Trash2,
  Download,
  BarChart3,
  Loader2,
} from "lucide-react";
import {
  listSubscribers,
  addSubscriber,
  deleteSubscriber,
  importSubscribersFromLeads,
  listSegments,
  saveSegment,
  deleteSegment,
  listCampaigns,
  saveCampaign,
  deleteCampaign,
  sendCampaign,
  generateCampaignCopy,
} from "@/lib/email-marketing.functions";

export const Route = createFileRoute("/admin/marketing/email")({
  component: EmailMarketingPage,
  errorComponent: ({ error }) => <div className="p-4 text-destructive">Błąd: {error.message}</div>,
  notFoundComponent: () => <div className="p-4">Nie znaleziono.</div>,
});

function EmailMarketingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-7 w-7" /> Email Marketing
        </h1>
        <p className="text-muted-foreground">Kampanie newsletter — Resend + AI</p>
      </div>
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">
            <Send className="h-4 w-4 mr-2" />
            Kampanie
          </TabsTrigger>
          <TabsTrigger value="subscribers">
            <Users className="h-4 w-4 mr-2" />
            Subskrybenci
          </TabsTrigger>
          <TabsTrigger value="segments">
            <BarChart3 className="h-4 w-4 mr-2" />
            Segmenty
          </TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="subscribers" className="mt-4">
          <SubscribersTab />
        </TabsContent>
        <TabsContent value="segments" className="mt-4">
          <SegmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== Subscribers ==============

function SubscribersTab() {
  const router = useRouter();
  const list = useServerFn(listSubscribers);
  const add = useServerFn(addSubscriber);
  const del = useServerFn(deleteSubscriber);
  const importLeads = useServerFn(importSubscribersFromLeads);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["email-subs"],
    queryFn: () => list(),
  });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [tags, setTags] = useState("");

  const onAdd = async () => {
    try {
      await add({
        data: {
          email,
          first_name: firstName || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      toast.success("Dodano");
      setOpen(false);
      setEmail("");
      setFirstName("");
      setTags("");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onImport = async () => {
    try {
      const r = await importLeads();
      toast.success(`Zaimportowano ${r.imported} subskrybentów z leadów`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Subskrybenci ({data?.subscribers.length ?? 0})</CardTitle>
          <CardDescription>Lista odbiorców newslettera</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onImport}>
            <Download className="h-4 w-4 mr-2" />
            Importuj leady
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Dodaj
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nowy subskrybent</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Imię</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div>
                  <Label>Tagi (po przecinku)</Label>
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="vip, newsletter"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={onAdd}>Zapisz</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Imię</TableHead>
                <TableHead>Tagi</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.subscribers.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.email}</TableCell>
                  <TableCell>{[s.first_name, s.last_name].filter(Boolean).join(" ")}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(s.tags ?? []).map((t: string) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{s.source}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "destructive"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        await del({ data: { id: s.id } });
                        refetch();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============== Segments ==============

function SegmentsTab() {
  const list = useServerFn(listSegments);
  const save = useServerFn(saveSegment);
  const del = useServerFn(deleteSegment);
  const { data, refetch } = useQuery({ queryKey: ["email-segs"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [sources, setSources] = useState("");

  const onSave = async () => {
    try {
      const r = await save({
        data: {
          name,
          description: description || undefined,
          filters: {
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            sources: sources
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        },
      });
      toast.success(`Segment zapisany (${r.count} odbiorców)`);
      setOpen(false);
      setName("");
      setDescription("");
      setTags("");
      setSources("");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Segmenty</CardTitle>
          <CardDescription>Filtry odbiorców</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nowy segment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy segment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nazwa</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Opis</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <Label>Tagi (po przecinku)</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="vip, lead"
                />
              </div>
              <div>
                <Label>Źródła (po przecinku)</Label>
                <Input
                  value={sources}
                  onChange={(e) => setSources(e.target.value)}
                  placeholder="lead, manual"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onSave}>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nazwa</TableHead>
              <TableHead>Odbiorcy</TableHead>
              <TableHead>Filtry</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.segments.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge>{s.subscriber_count}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {JSON.stringify(s.filters)}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await del({ data: { id: s.id } });
                      refetch();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============== Campaigns ==============

function CampaignsTab() {
  const list = useServerFn(listCampaigns);
  const del = useServerFn(deleteCampaign);
  const send = useServerFn(sendCampaign);
  const { data, refetch } = useQuery({ queryKey: ["email-camps"], queryFn: () => list() });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const onSend = async (id: string, test?: string) => {
    try {
      const r = await send({ data: { campaign_id: id, test_email: test } });
      toast.success(test ? "Wysłano test" : `Wysłano ${r.sent}/${r.total} (${r.failed} błędów)`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kampanie</CardTitle>
            <CardDescription>Newsletter / promocje one-shot</CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nowa kampania
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Temat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Wysłane</TableHead>
                <TableHead>Otwarcia</TableHead>
                <TableHead>Kliknięcia</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.campaigns.map((c: any) => {
                const openRate = c.sent_count
                  ? ((c.opened_count / c.sent_count) * 100).toFixed(1)
                  : "0";
                const clickRate = c.sent_count
                  ? ((c.clicked_count / c.sent_count) * 100).toFixed(1)
                  : "0";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm">{c.subject}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "wyslane" ? "default" : "secondary"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.sent_count}/{c.recipients_total}
                    </TableCell>
                    <TableCell>
                      {c.opened_count} ({openRate}%)
                    </TableCell>
                    <TableCell>
                      {c.clicked_count} ({clickRate}%)
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(c);
                          setEditorOpen(true);
                        }}
                      >
                        Edytuj
                      </Button>
                      <TestSendButton onSend={(em) => onSend(c.id, em)} />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (confirm(`Wysłać do segmentu?`)) onSend(c.id);
                        }}
                        disabled={c.status === "wyslane"}
                      >
                        Wyślij
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          await del({ data: { id: c.id } });
                          refetch();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CampaignEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          refetch();
        }}
        initial={editing}
      />
    </>
  );
}

function TestSendButton({ onSend }: { onSend: (email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [em, setEm] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Test
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wyślij testowy email</DialogTitle>
        </DialogHeader>
        <Input
          type="email"
          placeholder="twoj@email.pl"
          value={em}
          onChange={(e) => setEm(e.target.value)}
        />
        <DialogFooter>
          <Button
            onClick={() => {
              onSend(em);
              setOpen(false);
              setEm("");
            }}
          >
            Wyślij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignEditor({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: any;
}) {
  const save = useServerFn(saveCampaign);
  const generate = useServerFn(generateCampaignCopy);
  const listSegs = useServerFn(listSegments);
  const { data: segData } = useQuery({
    queryKey: ["email-segs"],
    queryFn: () => listSegs(),
    enabled: open,
  });

  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [preview, setPreview] = useState(initial?.preview_text ?? "");
  const [fromName, setFromName] = useState(initial?.from_name ?? "FinanceYou");
  const [fromEmail, setFromEmail] = useState(initial?.from_email ?? "kontakt@financeyou.pl");
  const [replyTo, setReplyTo] = useState(initial?.reply_to ?? "");
  const [html, setHtml] = useState(initial?.html_body ?? "");
  const [segmentId, setSegmentId] = useState<string>(initial?.segment_id ?? "all");
  const [brief, setBrief] = useState(initial?.ai_brief ?? "");
  const [generating, setGenerating] = useState(false);

  const onGenerate = async () => {
    if (!brief.trim()) {
      toast.error("Wpisz brief");
      return;
    }
    setGenerating(true);
    try {
      const r = await generate({ data: { brief } });
      setSubject(r.subject);
      setPreview(r.preview_text);
      setHtml(r.html);
      toast.success("Wygenerowano treść");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const onSave = async () => {
    try {
      await save({
        data: {
          id: initial?.id,
          name,
          subject,
          preview_text: preview || undefined,
          from_name: fromName,
          from_email: fromEmail,
          reply_to: replyTo || undefined,
          html_body: html,
          segment_id: segmentId === "all" ? null : segmentId,
          ai_brief: brief || undefined,
        },
      });
      toast.success("Zapisano");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edytuj kampanię" : "Nowa kampania"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nazwa (wewnętrzna)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Segment odbiorców</Label>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszyscy aktywni</SelectItem>
                  {segData?.segments.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.subscriber_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Generator AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={3}
                placeholder="O czym ma być mail? np. Promocja na pożyczki pod nieruchomość — 5% RRSO przez pierwsze 3 miesiące"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
              <Button size="sm" onClick={onGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Wygeneruj
              </Button>
            </CardContent>
          </Card>

          <div>
            <Label>Temat</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Preview (tekst pod tematem)</Label>
            <Input value={preview} onChange={(e) => setPreview(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Nadawca (imię)</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </div>
            <div>
              <Label>Nadawca (email)</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Reply-to</Label>
              <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Treść HTML</Label>
            <Textarea
              rows={14}
              className="font-mono text-xs"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<p>Cześć,</p>..."
            />
          </div>
          {html && (
            <div>
              <Label>Podgląd</Label>
              <div
                className="border rounded p-4 bg-white text-black max-h-64 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button onClick={onSave}>Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
