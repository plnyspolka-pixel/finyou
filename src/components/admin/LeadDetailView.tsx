import { useServerFn } from "@tanstack/react-start";
import { formatDateTime } from "@/lib/labels";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getLead, updateLead, addManualNote } from "@/lib/leads-admin.functions";
import {
  rescoreLead,
  markBadLead,
  unmarkBadLead,
  markGoodLead,
  listCapiEvents,
} from "@/lib/lead-quality.functions";
import { refetchInboundEmailBody, getCommAttachmentUrl } from "@/lib/inbox.functions";
import { sendSmsToLead } from "@/lib/voicebot.functions";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileThumb } from "@/components/media/FileThumb";
import { ClientFilesManager } from "@/components/media/ClientFilesManager";
import { signStoragePath } from "@/lib/property-photos";
import { CLIENT_FILES_LABEL } from "@/lib/storage-buckets";
import {
  PhoneCall,
  MessageSquare,
  Mail,
  MessageCircle,
  StickyNote,
  FileText,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  TrendingUp,
  Paperclip,
  Download,
  Code2,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { KwPotentialBadge } from "@/components/location-scoring/kw-potential-badge";

const channelLabel: Record<string, string> = {
  voicebot_call: "Rozmowa voicebot",
  sms: "SMS",
  email: "E-mail",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  chat: "Czat WWW",
  manual_note: "Notatka",
};

const channelIcon: Record<string, any> = {
  voicebot_call: PhoneCall,
  sms: MessageSquare,
  email: Mail,
  messenger: MessageCircle,
  whatsapp: MessageCircle,
  chat: MessageCircle,
  manual_note: StickyNote,
};

export function LeadDetailView({
  id,
  compact = false,
  hideAdvancedTabs = false,
}: {
  id: string;
  compact?: boolean;
  hideAdvancedTabs?: boolean;
}) {
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
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["lead", id] });
    },
  });

  if (q.isLoading)
    return <div className="p-6 text-muted-foreground text-sm">Ładowanie szczegółów…</div>;
  if (q.error)
    return <div className="p-6 text-destructive text-sm">Błąd: {(q.error as Error).message}</div>;
  if (!q.data) return null;

  const { lead, communications, documents, emailSequence } = q.data as any;
  const filtered =
    filter === "all" ? communications : communications.filter((c: any) => c.channel === filter);

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold flex-1">
            {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead bez nazwy"}
          </h1>
          <Badge variant={lead.type === "inwestorski" ? "secondary" : "default"}>{lead.type}</Badge>
          <Badge variant="outline">{lead.status}</Badge>
          {lead.source && <Badge variant="outline">{lead.source}</Badge>}
          {lead.quality_tier && (
            <Badge
              className={
                lead.quality_tier === "A"
                  ? "bg-green-600 text-white"
                  : lead.quality_tier === "B"
                    ? "bg-blue-600 text-white"
                    : lead.quality_tier === "D"
                      ? "bg-red-600 text-white"
                      : "bg-gray-500 text-white"
              }
            >
              Tier {lead.quality_tier}
            </Badge>
          )}
        </div>
      )}

      <QualitySection lead={lead} />

      <Tabs defaultValue="komunikacja">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="komunikacja">Komunikacja ({communications.length})</TabsTrigger>
          <TabsTrigger value="dane">Dane</TabsTrigger>
          <TabsTrigger value="dokumenty">
            {CLIENT_FILES_LABEL} ({documents.length})
          </TabsTrigger>
          {!compact && !hideAdvancedTabs && (
            <TabsTrigger value="sekwencja">
              Sekwencja maili
              {emailSequence
                ? ` (${emailSequence.sends.length}/${emailSequence.totalVariants})`
                : ""}
            </TabsTrigger>
          )}
          {!compact && !hideAdvancedTabs && <TabsTrigger value="meta-capi">Meta CAPI</TabsTrigger>}
          {!compact && !hideAdvancedTabs && <TabsTrigger value="raw">Surowe dane</TabsTrigger>}
        </TabsList>

        <TabsContent value="komunikacja" className="space-y-3">
          <Card className="p-3 flex flex-wrap gap-2">
            {["all", "voicebot_call", "sms", "email", "messenger", "chat", "manual_note"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "Wszystko" : (channelLabel[f] ?? f)}
              </Button>
            ))}
          </Card>

          <SmsPanel leadId={id} lead={lead} communications={communications} />

          <Card className="p-4 space-y-2">
            <div className="text-sm font-medium">Dodaj notatkę</div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notatka operatora…"
              rows={2}
            />
            <Button
              size="sm"
              onClick={() => mNote.mutate()}
              disabled={!note.trim() || mNote.isPending}
            >
              Zapisz notatkę
            </Button>
          </Card>

          <div className="space-y-3">
            {filtered.length === 0 && (
              <Card className="p-6 text-center text-muted-foreground">
                Brak wpisów w tym kanale.
              </Card>
            )}
            {filtered.map((c: any) => {
              const Icon = channelIcon[c.channel] ?? MessageSquare;
              const fullTranscript = c.transcript || c.metadata?.transcript_full;
              const isCall = c.channel === "voicebot_call";
              const outcome = c.metadata?.call_outcome;
              const outcomeLabel = c.metadata?.call_outcome_label || c.status;
              const outcomeColor =
                outcome === "answered"
                  ? "bg-green-600 text-white"
                  : outcome === "no_answer"
                    ? "bg-amber-500 text-white"
                    : outcome === "busy"
                      ? "bg-amber-500 text-white"
                      : outcome === "voicemail"
                        ? "bg-blue-500 text-white"
                        : outcome === "failed"
                          ? "bg-red-600 text-white"
                          : "";
              const turns = Array.isArray(fullTranscript) ? fullTranscript : null;
              return (
                <Card key={c.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{channelLabel[c.channel] ?? c.channel}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {c.direction}
                    </Badge>
                    {isCall && outcomeLabel && (
                      <Badge className={`text-[10px] ${outcomeColor}`}>{outcomeLabel}</Badge>
                    )}
                    {!isCall && c.status && (
                      <Badge variant="outline" className="text-[10px]">
                        {c.status}
                      </Badge>
                    )}
                    {c.duration_seconds != null && (
                      <span className="text-xs text-muted-foreground">{c.duration_seconds}s</span>
                    )}
                    {c.metadata?.disconnection_reason && (
                      <span className="text-[10px] text-muted-foreground">
                        • {c.metadata.disconnection_reason}
                      </span>
                    )}
                    {c.created_by_name && (
                      <span className="text-xs text-muted-foreground">· {c.created_by_name}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(c.created_at)}
                    </span>
                  </div>
                  {c.subject && <div className="text-sm font-medium">{c.subject}</div>}
                  {c.content && (
                    <div className="text-sm whitespace-pre-wrap text-foreground/90">
                      {c.content}
                    </div>
                  )}
                  {c.recording_url && <audio controls src={c.recording_url} className="w-full" />}
                  {turns && turns.length > 0 && (
                    <details className="text-xs" open={isCall}>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Transkrypcja rozmowy ({turns.length} wypowiedzi)
                      </summary>
                      <div className="mt-2 space-y-1 bg-muted/40 p-3 rounded max-h-96 overflow-y-auto">
                        {turns.map((t: any, i: number) => {
                          const role = (t.role || t.speaker || "agent").toString().toLowerCase();
                          const isUser =
                            role.includes("user") ||
                            role.includes("client") ||
                            role.includes("caller");
                          const msg = t.message ?? t.text ?? t.content ?? "";
                          return (
                            <div
                              key={i}
                              className={`text-[12px] ${isUser ? "text-foreground" : "text-foreground/70"}`}
                            >
                              <span className={`font-semibold ${isUser ? "text-primary" : ""}`}>
                                {isUser ? "Klient" : "Voicebot"}:
                              </span>{" "}
                              <span className="whitespace-pre-wrap">{msg}</span>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                  {!turns && fullTranscript && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Pełna transkrypcja
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap bg-muted/50 p-2 rounded text-[11px] max-h-96 overflow-y-auto">
                        {typeof fullTranscript === "string"
                          ? fullTranscript
                          : JSON.stringify(fullTranscript, null, 2)}
                      </pre>
                    </details>
                  )}
                  {c.error_message && (
                    <div className="text-xs text-destructive">Błąd: {c.error_message}</div>
                  )}
                  {c.channel === "email" && <EmailExtras comm={c} qc={qc} leadId={id} />}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {!compact && !hideAdvancedTabs && (
          <TabsContent value="sekwencja">
            <EmailSequenceTab data={emailSequence} />
          </TabsContent>
        )}

        <TabsContent value="dane" className="space-y-3">
          <ExtractedFactsCard lead={lead} />
          <Card className="p-4 grid gap-3 md:grid-cols-2">
            <Field
              label="Imię"
              value={lead.first_name}
              onSave={(v) => mUpdate.mutate({ first_name: v })}
            />
            <Field
              label="Nazwisko"
              value={lead.last_name}
              onSave={(v) => mUpdate.mutate({ last_name: v })}
            />
            <Field label="E-mail" value={lead.email} onSave={(v) => mUpdate.mutate({ email: v })} />
            <Field
              label="Telefon"
              value={lead.phone_normalized}
              onSave={(v) => mUpdate.mutate({ phone_normalized: v })}
            />
            <Field
              label="Status"
              value={lead.status}
              onSave={(v) => mUpdate.mutate({ status: v })}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Field
                label="Numer KW"
                value={lead.kw_number}
                onSave={(v) => mUpdate.mutate({ kw_number: v })}
              />
              {lead.kw_number && (
                <KwPotentialBadge
                  applicationId={lead.loan_application_id ?? undefined}
                  kwNumber={lead.kw_number}
                />
              )}
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Notatki wewnętrzne</label>
              <Textarea
                defaultValue={lead.notes ?? ""}
                rows={3}
                onBlur={(e) => mUpdate.mutate({ notes: e.target.value })}
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dokumenty">
          <Card className="p-4">
            <ClientFilesManager
              loanApplicationId={lead.loan_application_id}
              onChanged={() => qc.invalidateQueries({ queryKey: ["lead", id] })}
            />
          </Card>
        </TabsContent>

        {!compact && !hideAdvancedTabs && (
          <TabsContent value="meta-capi">
            <CapiEventsList leadId={id} />
          </TabsContent>
        )}

        {!compact && !hideAdvancedTabs && (
          <TabsContent value="raw">
            <Card className="p-4">
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(lead, null, 2)}
              </pre>
            </Card>
          </TabsContent>
        )}
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
      toast.success(
        `Przeliczono: Tier ${r.tier} (${r.reason})${r.capi?.ok ? " • event wysłany do Mety" : r.capi?.error ? ` • CAPI: ${r.capi.error}` : ""}`,
      );
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const mGood = useMutation({
    mutationFn: () => goodFn({ data: { leadId: lead.id } }),
    onSuccess: () => {
      toast.success("Oznaczono jako TOP lead");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const mBad = useMutation({
    mutationFn: () => badFn({ data: { leadId: lead.id, reason } }),
    onSuccess: () => {
      toast.success("Oznaczono jako zły lead");
      setBadOpen(false);
      setReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const mUnbad = useMutation({
    mutationFn: () => unbadFn({ data: { leadId: lead.id } }),
    onSuccess: () => {
      toast.success("Cofnięto oznaczenie spam");
      invalidate();
    },
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
              <>
                {" "}
                • Ostatni event: <code>{lead.meta_capi_last_event}</code> (
                {lead.meta_capi_last_sent_at ? formatDateTime(lead.meta_capi_last_sent_at) : "—"})
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => mRescore.mutate()}
            disabled={mRescore.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Przelicz
          </Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => mGood.mutate()}
            disabled={mGood.isPending}
          >
            <ThumbsUp className="h-4 w-4 mr-1" /> Dobry lead
          </Button>
          {lead.marked_bad_lead ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => mUnbad.mutate()}
              disabled={mUnbad.isPending}
            >
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
            <label className="text-xs text-muted-foreground">Powód</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Powód odrzucenia…"
            />
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => mBad.mutate()}
            disabled={!reason.trim() || mBad.isPending}
          >
            Potwierdź
          </Button>
        </div>
      )}
      {lead.marked_bad_lead && (
        <div className="text-xs text-destructive">
          ⚠ Oznaczony jako zły lead: {lead.marked_bad_reason}
        </div>
      )}
    </Card>
  );
}

function CapiEventsList({ leadId }: { leadId: string }) {
  const fn = useServerFn(listCapiEvents);
  const q = useQuery({
    queryKey: ["capi-events", leadId],
    queryFn: () => fn({ data: { leadId } }),
  });
  if (q.isLoading) return <Card className="p-4 text-sm text-muted-foreground">Ładowanie…</Card>;
  const rows = (q.data ?? []) as any[];
  if (rows.length === 0)
    return (
      <Card className="p-4 text-sm text-muted-foreground">Brak eventów wysłanych do Mety.</Card>
    );
  return (
    <Card className="p-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="text-left p-1">Event</th>
            <th className="text-left p-1">Tier</th>
            <th className="text-right p-1">Value</th>
            <th className="text-left p-1">Status</th>
            <th className="text-left p-1">Kiedy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-1">
                <code className="text-xs">{r.event_name}</code>
              </td>
              <td className="p-1">
                <Badge variant="outline">{r.tier}</Badge>
              </td>
              <td className="p-1 text-right">{r.value ?? "—"}</td>
              <td className="p-1">
                <Badge
                  variant={r.status === "sent" ? "default" : "destructive"}
                  className="text-[10px]"
                >
                  {r.status}
                </Badge>
                {r.error && <div className="text-[10px] text-destructive mt-1">{r.error}</div>}
              </td>
              <td className="p-1 text-xs text-muted-foreground">{formatDateTime(r.sent_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Field({
  label,
  value,
  onSave,
}: {
  label: string;
  value: any;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (value ?? "") && onSave(v)}
      />
    </div>
  );
}

function EmailSequenceTab({ data }: { data: any }) {
  if (!data)
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Sekwencja maili startuje po wejściu leada — jeśli nic tu nie widać, upewnij się, że lead ma
        adres e-mail.
      </Card>
    );
  const { loan, sends, nextVariant, totalVariants, cycle } = data;
  const sent = sends.length;
  const opened = sends.filter((s: any) => s.opened_at).length;
  const clicked = sends.filter((s: any) => s.clicked_at).length;
  const pct = (n: number) => (sent ? Math.round((n / sent) * 100) : 0);
  const stopped = loan?.reminder_email_unsubscribed || (loan?.completeness_percent ?? 0) >= 100;
  return (
    <div className="space-y-3">
      <Card className="p-4 grid gap-2 md:grid-cols-4 text-sm">
        <Stat label="Wysłane" value={`${sent} / ${totalVariants}`} />
        <Stat label="Otwarte" value={`${opened} (${pct(opened)}%)`} />
        <Stat label="Kliknięte" value={`${clicked} (${pct(clicked)}%)`} />
        <Stat
          label="Status"
          value={
            loan?.reminder_email_unsubscribed
              ? "Wypisany"
              : (loan?.completeness_percent ?? 0) >= 100
                ? "Wniosek kompletny — stop"
                : (cycle ?? 1) > 1
                  ? `Aktywna (cykl ${cycle})`
                  : "Aktywna"
          }
        />
      </Card>
      {!stopped && nextVariant && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Następny mail w kolejce</div>
          <div className="text-xs text-muted-foreground">
            #{nextVariant.sequence_index} • dzień {nextVariant.day_index} •{" "}
            {nextVariant.slot === "morning" ? "8:00" : "20:00"} • faza {nextVariant.phase}
          </div>
          <div className="text-sm font-semibold">{nextVariant.subject}</div>
          {nextVariant.preview_text && (
            <div className="text-xs text-muted-foreground italic">{nextVariant.preview_text}</div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Podgląd HTML
            </summary>
            <div
              className="mt-2 border rounded p-2 bg-muted/30"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(nextVariant.body_html) }}
            />
          </details>
        </Card>
      )}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">Dzień / slot</th>
              <th className="text-left p-2">Temat</th>
              <th className="text-left p-2">Wysłany</th>
              <th className="text-center p-2">Status</th>
              <th className="text-center p-2">Otwarcia</th>
              <th className="text-center p-2">Kliknięcia</th>
            </tr>
          </thead>
          <tbody>
            {sends.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  Jeszcze nie wysłano żadnego maila z sekwencji.
                </td>
              </tr>
            )}
            {sends.map((s: any) => (
              <tr key={s.id} className="border-t align-top">
                <td className="p-2 text-xs">{s.variant?.sequence_index ?? "—"}</td>
                <td className="p-2 text-xs">
                  {s.variant
                    ? `D${s.variant.day_index} / ${s.variant.slot === "morning" ? "8:00" : "20:00"}`
                    : "—"}
                </td>
                <td className="p-2">{s.subject}</td>
                <td className="p-2 text-xs whitespace-nowrap">{formatDateTime(s.sent_at)}</td>
                <td className="p-2 text-center">
                  {s.error_message ? (
                    <Badge variant="destructive" className="text-[10px]">
                      błąd
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      OK
                    </Badge>
                  )}
                </td>
                <td className="p-2 text-center text-xs">
                  {s.open_count ?? 0}
                  {s.opened_at && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatDateTime(s.opened_at)}
                    </div>
                  )}
                </td>
                <td className="p-2 text-center text-xs">
                  {s.click_count ?? 0}
                  {s.clicked_at && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatDateTime(s.clicked_at)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function ExtractedFactsCard({ lead }: { lead: any }) {
  const ad = (lead.application_data ?? {}) as Record<string, any>;
  const kw: string[] = Array.isArray(ad.kw_numbers) ? ad.kw_numbers : [];
  const amount = typeof ad.loan_amount === "number" ? ad.loan_amount : null;
  const city = typeof ad.city === "string" ? ad.city : null;
  const promoted = !!lead.loan_application_id;
  const anything = kw.length > 0 || amount != null || city || promoted;
  if (!anything) return null;
  return (
    <Card className="p-4 space-y-2 border-primary/40 bg-primary/5">
      <div className="text-sm font-semibold">Dane wykryte z wiadomości</div>
      <div className="grid gap-2 md:grid-cols-2 text-sm">
        {kw.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Numery KW
            </div>
            <div className="font-mono flex items-center gap-2 flex-wrap">
              {kw.join(", ")}
              <KwPotentialBadge kwNumber={kw[0]} />
            </div>
          </div>
        )}
        {amount != null && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Kwota pożyczki
            </div>
            <div className="font-semibold">{amount.toLocaleString("pl-PL")} zł</div>
          </div>
        )}
        {city && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Miasto</div>
            <div>{city}</div>
          </div>
        )}
        {promoted && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Wniosek</div>
            <a
              className="text-primary underline text-xs font-mono"
              href={`/admin/wnioski/${lead.loan_application_id}`}
            >
              {lead.loan_application_id}
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

function EmailExtras({ comm, qc, leadId }: { comm: any; qc: any; leadId: string }) {
  const meta = (comm.metadata ?? {}) as Record<string, any>;
  const html: string | null = meta.html ?? null;
  const attachments: any[] = Array.isArray(comm.attachments) ? comm.attachments : [];
  const emailId: string | null = meta.email_id ?? null;
  const canRefetch =
    comm.direction === "inbound" &&
    !!emailId &&
    !html &&
    !(comm.content && comm.content.length > 20);
  const [showHtml, setShowHtml] = useState(false);

  const refetchFn = useServerFn(refetchInboundEmailBody);
  const urlFn = useServerFn(getCommAttachmentUrl);

  const mRefetch = useMutation({
    mutationFn: () => refetchFn({ data: { id: comm.id } }),
    onSuccess: (r: any) => {
      toast.success(`Pobrano treść (${r.contentLength} znaków${r.hasHtml ? ", z HTML" : ""})`);
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAttachment = async (path: string) => {
    try {
      const r = await urlFn({ data: { path } });
      if (!r.url) {
        toast.error("Plik niedostępny (nie znaleziono w storage)");
        return;
      }
      window.open(r.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e.message ?? "Błąd pobierania");
    }
  };

  return (
    <div className="space-y-2 pt-1">
      {html && (
        <div className="space-y-2">
          <Button size="sm" variant="outline" onClick={() => setShowHtml(!showHtml)}>
            <Code2 className="h-4 w-4 mr-1" />
            {showHtml ? "Ukryj" : "Pokaż"} treść HTML
          </Button>
          {showHtml && (
            <iframe
              sandbox=""
              srcDoc={html}
              className="w-full h-[480px] border rounded bg-white"
              title={`email-${comm.id}`}
            />
          )}
        </div>
      )}
      {canRefetch && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => mRefetch.mutate()}
          disabled={mRefetch.isPending}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Pobierz treść z Resend
        </Button>
      )}
      {attachments.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
            <Paperclip className="h-3 w-3" /> Załączniki ({attachments.length})
          </div>
          <ul className="space-y-1">
            {attachments.map((a: any, i: number) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium truncate">{a.name ?? a.path ?? `plik-${i + 1}`}</span>
                {a.mime && <span className="text-muted-foreground">{a.mime}</span>}
                {typeof a.size === "number" && (
                  <span className="text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
                )}
                {a.path && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2"
                    onClick={() => openAttachment(a.path)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Pobierz
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Wątek SMS (przychodzące + wychodzące) z możliwością ręcznej wysyłki. */
function SmsPanel({
  leadId,
  lead,
  communications,
}: {
  leadId: string;
  lead: any;
  communications: any[];
}) {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendSmsToLead);
  const [text, setText] = useState("");
  const sms = (communications ?? []).filter((c: any) => c.channel === "sms");
  const phone = lead?.phone_normalized || lead?.phone_raw;

  const mSend = useMutation({
    mutationFn: () => sendFn({ data: { leadId, body: text.trim() } }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        toast.success("SMS wysłany");
        setText("");
        qc.invalidateQueries({ queryKey: ["lead", leadId] });
      } else {
        toast.error(res?.error ?? "Nie udało się wysłać SMS");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Błąd wysyłki SMS"),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-medium">SMS ({sms.length})</div>
        <span className="ml-auto text-xs text-muted-foreground">{phone ?? "brak numeru"}</span>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {sms.length === 0 && (
          <div className="text-xs text-muted-foreground">Brak SMS-ów z tym numerem.</div>
        )}
        {sms
          .slice()
          .reverse()
          .map((m: any) => (
            <div
              key={m.id}
              className={
                m.direction === "inbound"
                  ? "max-w-[85%] rounded-lg bg-muted px-3 py-2"
                  : "max-w-[85%] ml-auto rounded-lg bg-primary/10 px-3 py-2"
              }
            >
              <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
              <div className="mt-1 text-[10px] text-muted-foreground flex gap-2">
                <span>{m.direction === "inbound" ? "przychodzący" : "wychodzący"}</span>
                {m.status && <span>· {m.status}</span>}
                <span className="ml-auto">{formatDateTime(m.created_at)}</span>
              </div>
            </div>
          ))}
      </div>

      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Treść SMS-a…"
          rows={2}
          disabled={!phone}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => mSend.mutate()}
            disabled={!phone || !text.trim() || mSend.isPending}
          >
            Wyślij SMS
          </Button>
          <span className="text-[10px] text-muted-foreground">{text.length}/600 znaków</span>
        </div>
      </div>
    </Card>
  );
}
