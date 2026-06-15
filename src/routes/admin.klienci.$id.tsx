import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getLead, updateLead, addManualNote } from "@/lib/leads-admin.functions";
import { rescoreLead, markBadLead, unmarkBadLead, markGoodLead, listCapiEvents } from "@/lib/lead-quality.functions";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PhoneCall, MessageSquare, Mail, MessageCircle, StickyNote, FileText, ArrowLeft, ThumbsUp, ThumbsDown, RefreshCw, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/admin/klienci/$id")({
  component: LeadDetailPage,
});

const channelLabel: Record<string, string> = {
  voicebot_call: "Rozmowa voicebot",
  sms: "SMS",
  email: "E-mail",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  manual_note: "Notatka",
};

const channelIcon: Record<string, any> = {
  voicebot_call: PhoneCall,
  sms: MessageSquare,
  email: Mail,
  messenger: MessageCircle,
  whatsapp: MessageCircle,
  manual_note: StickyNote,
};

function LeadDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getLead);
  const updateFn = useServerFn(updateLead);
  const noteFn = useServerFn(addManualNote);

  const q = useQuery({ queryKey: ["lead", id], queryFn: () => getFn({ data: { id } }) });
  const [filter, setFilter] = useState<string>("all");
  const [note, setNote] = useState("");

  const mUpdate = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead", id] }),
  });
  const mNote = useMutation({
    mutationFn: () => noteFn({ data: { leadId: id, content: note } }),
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["lead", id] }); },
  });

  if (q.isLoading) return <div className="p-6 text-muted-foreground">Ładowanie…</div>;
  if (q.error) return <div className="p-6 text-destructive">Błąd: {(q.error as Error).message}</div>;
  if (!q.data) return null;

  const { lead, communications, documents } = q.data;
  const filtered = filter === "all" ? communications : communications.filter((c: any) => c.channel === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/admin/leady-all"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Wróć</Button></Link>
        <h1 className="text-xl font-semibold flex-1">
          {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead bez nazwy"}
        </h1>
        <Badge variant={lead.type === "inwestorski" ? "secondary" : "default"}>{lead.type}</Badge>
        <Badge variant="outline">{lead.status}</Badge>
        {lead.source && <Badge variant="outline">{lead.source}</Badge>}
        {lead.quality_tier && (
          <Badge
            className={
              lead.quality_tier === "A" ? "bg-green-600 text-white" :
              lead.quality_tier === "B" ? "bg-blue-600 text-white" :
              lead.quality_tier === "D" ? "bg-red-600 text-white" :
              "bg-gray-500 text-white"
            }
          >
            Tier {lead.quality_tier}
          </Badge>
        )}
      </div>

      <QualitySection lead={lead} />

      <Tabs defaultValue="komunikacja">
        <TabsList>
          <TabsTrigger value="komunikacja">Komunikacja ({communications.length})</TabsTrigger>
          <TabsTrigger value="dane">Dane</TabsTrigger>
          <TabsTrigger value="dokumenty">Dokumenty ({documents.length})</TabsTrigger>
          <TabsTrigger value="meta-capi">Meta CAPI</TabsTrigger>
          <TabsTrigger value="raw">Surowe dane</TabsTrigger>
        </TabsList>

        {/* KOMUNIKACJA */}
        <TabsContent value="komunikacja" className="space-y-3">
          <Card className="p-3 flex flex-wrap gap-2">
            {["all", "voicebot_call", "sms", "email", "messenger", "manual_note"].map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "all" ? "Wszystko" : channelLabel[f] ?? f}
              </Button>
            ))}
          </Card>

          <Card className="p-4 space-y-2">
            <div className="text-sm font-medium">Dodaj notatkę</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notatka operatora…" rows={2} />
            <Button size="sm" onClick={() => mNote.mutate()} disabled={!note.trim() || mNote.isPending}>Zapisz notatkę</Button>
          </Card>

          <div className="space-y-3">
            {filtered.length === 0 && <Card className="p-6 text-center text-muted-foreground">Brak wpisów w tym kanale.</Card>}
            {filtered.map((c: any) => {
              const Icon = channelIcon[c.channel] ?? MessageSquare;
              const fullTranscript = c.transcript || c.metadata?.transcript_full;
              return (
                <Card key={c.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{channelLabel[c.channel] ?? c.channel}</span>
                    <Badge variant="outline" className="text-[10px]">{c.direction}</Badge>
                    {c.status && <Badge variant="outline" className="text-[10px]">{c.status}</Badge>}
                    {c.duration_seconds != null && <span className="text-xs text-muted-foreground">{c.duration_seconds}s</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pl-PL")}</span>
                  </div>
                  {c.subject && <div className="text-sm font-medium">{c.subject}</div>}
                  {c.content && <div className="text-sm whitespace-pre-wrap text-foreground/90">{c.content}</div>}
                  {c.recording_url && (
                    <audio controls src={c.recording_url} className="w-full" />
                  )}
                  {fullTranscript && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Pełna transkrypcja</summary>
                      <pre className="mt-2 whitespace-pre-wrap bg-muted/50 p-2 rounded text-[11px] max-h-96 overflow-y-auto">{typeof fullTranscript === "string" ? fullTranscript : JSON.stringify(fullTranscript, null, 2)}</pre>
                    </details>
                  )}
                  {c.error_message && <div className="text-xs text-destructive">Błąd: {c.error_message}</div>}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* DANE */}
        <TabsContent value="dane">
          <Card className="p-4 grid gap-3 md:grid-cols-2">
            <Field label="Imię" value={lead.first_name} onSave={(v) => mUpdate.mutate({ first_name: v })} />
            <Field label="Nazwisko" value={lead.last_name} onSave={(v) => mUpdate.mutate({ last_name: v })} />
            <Field label="E-mail" value={lead.email} onSave={(v) => mUpdate.mutate({ email: v })} />
            <Field label="Telefon" value={lead.phone_normalized} onSave={(v) => mUpdate.mutate({ phone_normalized: v })} />
            <Field label="Status" value={lead.status} onSave={(v) => mUpdate.mutate({ status: v })} />
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Notatki wewnętrzne</label>
              <Textarea defaultValue={lead.notes ?? ""} rows={3} onBlur={(e) => mUpdate.mutate({ notes: e.target.value })} />
            </div>
          </Card>
        </TabsContent>

        {/* DOKUMENTY */}
        <TabsContent value="dokumenty">
          <Card className="p-4">
            {documents.length === 0 ? (
              <div className="text-muted-foreground text-sm">Brak dokumentów.</div>
            ) : (
              <ul className="space-y-2">
                {documents.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm border-b pb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{d.file_name}</span>
                    <Badge variant="outline" className="text-[10px]">{d.document_type}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString("pl-PL")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="meta-capi">
          <CapiEventsList leadId={id} />
        </TabsContent>

        <TabsContent value="raw">
          <Card className="p-4">
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(lead, null, 2)}</pre>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QualitySection({ lead }: { lead: any }) {
  const qc = useQueryClient();
  const rescoreFn = useServerFn(rescoreLead);
  const goodFn = useServerFn(markGoodLead);
  const badFn = useServerFn(markBadLead);
  const unbadFn = useServerFn(unmarkBadLead);
  const [badOpen, setBadOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead", lead.id] });

  const mRescore = useMutation({
    mutationFn: () => rescoreFn({ data: { leadId: lead.id } }),
    onSuccess: (r: any) => {
      toast.success(`Przeliczono: Tier ${r.tier} (${r.reason})${r.capi?.ok ? " • event wysłany do Mety" : r.capi?.error ? ` • CAPI: ${r.capi.error}` : ""}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const mGood = useMutation({
    mutationFn: () => goodFn({ data: { leadId: lead.id } }),
    onSuccess: () => { toast.success("Oznaczono jako TOP lead — sygnał wysłany do Mety"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const mBad = useMutation({
    mutationFn: () => badFn({ data: { leadId: lead.id, reason } }),
    onSuccess: () => { toast.success("Oznaczono jako zły lead — Meta dostała sygnał negatywny"); setBadOpen(false); setReason(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const mUnbad = useMutation({
    mutationFn: () => unbadFn({ data: { leadId: lead.id } }),
    onSuccess: () => { toast.success("Cofnięto oznaczenie spam"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Jakość leadu dla algorytmu Mety
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {lead.quality_reason ?? "Jeszcze nie sklasyfikowano — kliknij Przelicz"}
            {lead.meta_capi_last_event && (
              <> • Ostatni event: <code>{lead.meta_capi_last_event}</code> ({lead.meta_capi_last_sent_at ? new Date(lead.meta_capi_last_sent_at).toLocaleString("pl-PL") : "—"})</>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => mRescore.mutate()} disabled={mRescore.isPending}>
            <RefreshCw className="h-4 w-4 mr-1" /> Przelicz + wyślij do Mety
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => mGood.mutate()} disabled={mGood.isPending}>
            <ThumbsUp className="h-4 w-4 mr-1" /> Dobry lead
          </Button>
          {lead.marked_bad_lead ? (
            <Button size="sm" variant="outline" onClick={() => mUnbad.mutate()} disabled={mUnbad.isPending}>
              Cofnij spam
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setBadOpen(!badOpen)}>
              <ThumbsDown className="h-4 w-4 mr-1" /> Odrzuć / spam
            </Button>
          )}
        </div>
      </div>
      {badOpen && (
        <div className="flex gap-2 items-end pt-2 border-t">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Powód (np. fałszywe dane, bot, niezainteresowany)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Powód odrzucenia…" />
          </div>
          <Button size="sm" variant="destructive" onClick={() => mBad.mutate()} disabled={!reason.trim() || mBad.isPending}>
            Potwierdź odrzucenie
          </Button>
        </div>
      )}
      {lead.marked_bad_lead && (
        <div className="text-xs text-destructive">⚠ Oznaczony jako zły lead: {lead.marked_bad_reason}</div>
      )}
    </Card>
  );
}

function CapiEventsList({ leadId }: { leadId: string }) {
  const fn = useServerFn(listCapiEvents);
  const q = useQuery({ queryKey: ["capi-events", leadId], queryFn: () => fn({ data: { leadId } }) });
  if (q.isLoading) return <Card className="p-4 text-sm text-muted-foreground">Ładowanie…</Card>;
  const rows = (q.data ?? []) as any[];
  if (rows.length === 0) return <Card className="p-4 text-sm text-muted-foreground">Brak eventów wysłanych do Mety.</Card>;
  return (
    <Card className="p-4">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr><th className="text-left p-1">Event</th><th className="text-left p-1">Tier</th><th className="text-right p-1">Value</th><th className="text-left p-1">Status</th><th className="text-left p-1">Kiedy</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-1"><code className="text-xs">{r.event_name}</code></td>
              <td className="p-1"><Badge variant="outline">{r.tier}</Badge></td>
              <td className="p-1 text-right">{r.value ?? "—"}</td>
              <td className="p-1">
                <Badge variant={r.status === "sent" ? "default" : "destructive"} className="text-[10px]">{r.status}</Badge>
                {r.error && <div className="text-[10px] text-destructive mt-1">{r.error}</div>}
              </td>
              <td className="p-1 text-xs text-muted-foreground">{new Date(r.sent_at).toLocaleString("pl-PL")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Field({ label, value, onSave }: { label: string; value: any; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} />
    </div>
  );
}
