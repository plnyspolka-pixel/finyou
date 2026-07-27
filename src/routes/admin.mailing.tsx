import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listCampaigns,
  saveCampaign,
  deleteCampaign,
  sendTestEmail,
  scheduleCampaign,
  cancelCampaign,
  previewAudience,
  listTemplates,
  saveTemplate,
  deleteTemplate,
} from "@/lib/mailing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Mail, Send, Trash2, Pencil, Eye, Plus, FileText, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/mailing")({
  component: MailingPage,
});

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  szkic: "secondary",
  zaplanowana: "default",
  wysylana: "default",
  wyslana: "default",
  anulowana: "secondary",
  blad: "destructive",
};

function MailingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" /> Mailing
        </h1>
        <p className="text-sm text-muted-foreground">
          Kampanie mailingowe z harmonogramem. Wysyłka przez Gmail (konektor).
        </p>
      </div>
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Kampanie</TabsTrigger>
          <TabsTrigger value="templates">Szablony</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CampaignsTab() {
  const fetchAll = useServerFn(listCampaigns);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["mailing-campaigns"],
    queryFn: () => fetchAll(),
  });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const del = useServerFn(deleteCampaign);
  const sched = useServerFn(scheduleCampaign);
  const cancel = useServerFn(cancelCampaign);

  const onDelete = async (id: string) => {
    if (!confirm("Usunąć kampanię?")) return;
    await del({ data: { id } });
    toast.success("Usunięto");
    qc.invalidateQueries({ queryKey: ["mailing-campaigns"] });
  };
  const onSendNow = async (id: string) => {
    if (!confirm("Wysłać kampanię TERAZ do wszystkich odbiorców?")) return;
    try {
      const r = await sched({ data: { id, sendNow: true } });
      toast.success(`Zakolejkowano ${r.count} odbiorców`);
      qc.invalidateQueries({ queryKey: ["mailing-campaigns"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const onSchedule = async (id: string) => {
    try {
      const r = await sched({ data: { id } });
      toast.success(`Zaplanowano ${r.count} odbiorców`);
      qc.invalidateQueries({ queryKey: ["mailing-campaigns"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const onCancel = async (id: string) => {
    await cancel({ data: { id } });
    toast.success("Anulowano");
    qc.invalidateQueries({ queryKey: ["mailing-campaigns"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lista kampanii</CardTitle>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nowa kampania
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Ładowanie…</div>
        ) : !data?.campaigns.length ? (
          <div className="text-sm text-muted-foreground">Brak kampanii.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Harmonogram</TableHead>
                <TableHead>Wysłane / Błędy / Razem</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}
                    <div className="text-xs text-muted-foreground">{c.subject}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.audience_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[c.status] ?? "secondary"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.scheduled_at ? formatDateTime(c.scheduled_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.sent_count} / {c.failed_count} / {c.recipients_total}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {c.status === "szkic" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onSchedule(c.id)}>
                          <Clock className="h-3 w-3 mr-1" />
                          Zaplanuj
                        </Button>
                        <Button size="sm" onClick={() => onSendNow(c.id)}>
                          <Send className="h-3 w-3 mr-1" />
                          Wyślij teraz
                        </Button>
                      </>
                    )}
                    {c.status === "zaplanowana" && (
                      <Button size="sm" variant="outline" onClick={() => onCancel(c.id)}>
                        Anuluj
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CampaignDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["mailing-campaigns"] })}
      />
    </Card>
  );
}

function CampaignDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: any | null;
  onSaved: () => void;
}) {
  const empty = {
    name: "",
    subject: "",
    html_body: "<p>Cześć {{imie}},</p><p>Treść maila…</p>",
    from_email: "kontakt@financeyou.pl",
    from_name: "FinanceYou",
    audience_type: "leady",
    audience_filter: {},
    scheduled_at: null as string | null,
  };
  const [form, setForm] = useState<any>(initial ?? empty);
  const [testEmail, setTestEmail] = useState("");

  // reset on open change
  if (open && initial && form.id !== initial.id) setForm(initial);
  if (open && !initial && form.id) setForm(empty);

  const save = useServerFn(saveCampaign);
  const preview = useServerFn(previewAudience);
  const sendTest = useServerFn(sendTestEmail);

  const [audCount, setAudCount] = useState<number | null>(null);
  const previewAud = async () => {
    try {
      const r = await preview({
        data: { audience_type: form.audience_type, audience_filter: form.audience_filter },
      });
      setAudCount(r.count);
      toast.info(`Znaleziono ${r.count} odbiorców`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const onSave = async () => {
    try {
      const r = await save({ data: { ...form, scheduled_at: form.scheduled_at || null } });
      toast.success("Zapisano");
      onSaved();
      onOpenChange(false);
      if (!initial) setForm(empty);
      void r;
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const onTest = async () => {
    if (!form.id) {
      toast.error("Najpierw zapisz kampanię");
      return;
    }
    if (!testEmail) return;
    try {
      await sendTest({ data: { id: form.id, toEmail: testEmail } });
      toast.success("Wysłano test");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edytuj kampanię" : "Nowa kampania"}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label>Nazwa wewnętrzna</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Temat maila</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Nadawca (e-mail)</Label>
                <Input
                  value={form.from_email}
                  onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                />
              </div>
              <div>
                <Label>Nadawca (nazwa)</Label>
                <Input
                  value={form.from_name ?? ""}
                  onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Segment odbiorców</Label>
              <Select
                value={form.audience_type}
                onValueChange={(v) => setForm({ ...form, audience_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leady">Leady (z wnioskami)</SelectItem>
                  <SelectItem value="klienci">Klienci</SelectItem>
                  <SelectItem value="inwestorzy">Inwestorzy</SelectItem>
                  <SelectItem value="wszyscy">Wszyscy (klienci + inwestorzy)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={previewAud}
              >
                <Eye className="h-3 w-3 mr-1" />
                Sprawdź liczbę
              </Button>
              {audCount !== null && (
                <span className="ml-2 text-xs text-muted-foreground">{audCount} odbiorców</span>
              )}
            </div>
            <div>
              <Label>Harmonogram (zostaw puste = wyślij od razu po zaplanowaniu)</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_at?.slice(0, 16) ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
            </div>
            <div>
              <Label>
                Treść HTML{" "}
                <span className="text-xs text-muted-foreground">(zmienne: {`{{imie}}`})</span>
              </Label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                value={form.html_body}
                onChange={(e) => setForm({ ...form, html_body: e.target.value })}
              />
            </div>
            {form.id && (
              <div className="flex gap-2 items-end pt-2 border-t">
                <div className="flex-1">
                  <Label>Wyślij test na adres</Label>
                  <Input
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="ja@example.com"
                  />
                </div>
                <Button type="button" variant="outline" onClick={onTest}>
                  <Send className="h-3 w-3 mr-1" />
                  Test
                </Button>
              </div>
            )}
          </div>
          <div>
            <Label>Podgląd</Label>
            <div className="border rounded-md bg-background h-[600px] overflow-auto">
              <iframe
                srcDoc={form.html_body}
                className="w-full h-full"
                sandbox=""
                title="preview"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={onSave}>Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab() {
  const fetchAll = useServerFn(listTemplates);
  const save = useServerFn(saveTemplate);
  const del = useServerFn(deleteTemplate);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["mailing-templates"], queryFn: () => fetchAll() });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const onSave = async (form: any) => {
    try {
      await save({ data: form });
      toast.success("Zapisano");
      qc.invalidateQueries({ queryKey: ["mailing-templates"] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Szablony
        </CardTitle>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nowy szablon
        </Button>
      </CardHeader>
      <CardContent>
        {!data?.templates.length ? (
          <div className="text-sm text-muted-foreground">Brak szablonów.</div>
        ) : (
          <div className="space-y-2">
            {data.templates.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.subject}</div>
                </div>
                <div className="space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (confirm("Usunąć?")) {
                        await del({ data: { id: t.id } });
                        qc.invalidateQueries({ queryKey: ["mailing-templates"] });
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <TemplateDialog open={open} onOpenChange={setOpen} initial={editing} onSave={onSave} />
    </Card>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: any | null;
  onSave: (f: any) => void;
}) {
  const empty = { name: "", subject: "", html_body: "" };
  const [form, setForm] = useState<any>(initial ?? empty);
  if (open && initial && form.id !== initial.id) setForm(initial);
  if (open && !initial && form.id) setForm(empty);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edytuj szablon" : "Nowy szablon"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nazwa</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Temat</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div>
            <Label>HTML</Label>
            <Textarea
              rows={14}
              className="font-mono text-xs"
              value={form.html_body}
              onChange={(e) => setForm({ ...form, html_body: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={() => onSave(form)}>Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
