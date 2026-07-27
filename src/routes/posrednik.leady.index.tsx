import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listLeads, logBrokerCall, addManualNote } from "@/lib/leads-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePanelBase } from "@/lib/panel-base";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  MessageSquare,
  Mail,
  RefreshCw,
  ChevronRight,
  Search,
  StickyNote,
  Plus,
  Loader2,
  Paperclip,
  FileText,
  File as FileIcon,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { leadStatusLabels, formatRelative } from "@/lib/labels";
import { PropertyKeyFacts } from "@/components/wniosek/property-key-facts";
import { FancyShell } from "@/components/landing/fancy-shell";
import { CallOutcomeDialog } from "@/components/broker/call-outcome-dialog";
import { MetaRateButtons } from "@/components/broker/meta-rate-buttons";
import { FileThumb } from "@/components/media/FileThumb";
import { RevealContact, RevealsList } from "@/components/broker/reveal-contact";
import { SourceIcon } from "@/components/admin/SourceIcon";
import { leadSourceLabel, enrichedFieldSource } from "@/lib/lead-source";

export const Route = createFileRoute("/posrednik/leady/")({
  component: OperatorLeadsList,
});

export function OperatorLeadsList() {
  const base = usePanelBase();
  const fn = useServerFn(listLeads);
  const logCallFn = useServerFn(logBrokerCall);
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<{ leadId: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["operator-leads", status, source, search],
    queryFn: () =>
      fn({
        data: {
          type: "all",
          status: status === "all" ? "" : status,
          source: source === "all" ? "" : source,
          search,
        },
      }),
  });

  const logCall = useMutation({
    mutationFn: (vars: { leadId: string; phone: string | null }) => logCallFn({ data: vars }),
    onSuccess: () => q.refetch(),
  });

  const rows = (q.data ?? []) as any[];
  const sources = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source).filter(Boolean))) as string[],
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base font-semibold truncate">Leady</h1>
          <Badge variant="secondary" className="h-5 text-[10px] shrink-0">
            {rows.length}
          </Badge>
        </div>
        <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => q.refetch()}>
          <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Odśwież</span>
        </Button>
      </div>

      <FancyShell motion={false} innerClassName="!p-3 md:!p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
            <Input
              className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/40"
              placeholder="Szukaj: imię, nazwisko, e-mail, telefon…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {Object.entries(leadStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white">
              <SelectValue placeholder="Źródło" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie źródła</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FancyShell>

      {q.isLoading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
      {q.error && <p className="text-sm text-destructive">Błąd: {(q.error as Error).message}</p>}

      <FancyShell motion={false} innerClassName="!p-3 md:!p-4">
        <div className="grid gap-2 [&_.text-muted-foreground]:text-white/70">
          {rows.map((r) => {
            const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Bez nazwy";
            const phone = r.phone_normalized;
            return (
              <div
                key={r.id}
                className="group relative overflow-hidden rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-sm p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start gap-3 transition hover:bg-white/[0.10] hover:border-white/30"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-indigo-400 via-sky-400 to-emerald-400 opacity-80"
                />
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SourceIcon
                      source={r.source}
                      className="text-white/80"
                      title={`Kanał pozyskania leada: ${leadSourceLabel(r.source)}`}
                    />
                    <div className="font-semibold truncate text-white">{name}</div>
                    <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20">
                      {leadStatusLabels[r.status] ?? r.status}
                    </Badge>
                    {r.source && (
                      <Badge className="bg-sky-500/25 text-sky-100 border-sky-300/30 gap-1">
                        <SourceIcon source={r.source} className="!text-sky-100" />
                        {leadSourceLabel(r.source)}
                      </Badge>
                    )}
                    {r.quality_tier && (
                      <Badge className="bg-blue-500 text-white">Tier {r.quality_tier}</Badge>
                    )}
                  </div>
                  {r.loan && (
                    <div className="mt-1 flex items-start gap-1.5">
                      <SourceIcon
                        source={enrichedFieldSource(r.loan.source ?? r.source)}
                        className="text-white/80 mt-1"
                        title={`Dane pogłębione (kwota / KW / zdjęcia) — źródło: ${leadSourceLabel(enrichedFieldSource(r.loan.source ?? r.source))}`}
                      />
                      <PropertyKeyFacts
                        variant="inline"
                        amount={r.loan.loan_amount}
                        propertyType={r.loan.properties?.[0]?.property_type}
                        kwNumber={r.loan.properties?.[0]?.land_register_number}
                        photoCount={r.loan.properties?.[0]?.photos?.length ?? 0}
                        docCount={r.docCount ?? 0}
                        periodMonths={r.loan.preferred_period_months}
                      />
                    </div>
                  )}
                  <div className="text-xs text-white/80 mt-1 flex flex-wrap gap-2 min-w-0">
                    <RevealContact
                      leadId={r.id}
                      field="email"
                      value={r.email}
                      onRevealed={() => q.refetch()}
                    />

                    <RevealContact
                      leadId={r.id}
                      field="phone"
                      value={phone}
                      onRevealed={() => q.refetch()}
                      onUse={() => {
                        logCall.mutate({ leadId: r.id, phone });
                        setOutcome({ leadId: r.id, name });
                      }}
                    />
                  </div>
                  <RevealsList reveals={r.comms.reveals} />
                  <div className="text-xs text-white/70 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>📅 {formatRelative(r.created_at)}</span>
                    {r.comms.lastAt && (
                      <span>· ostatni kontakt {formatRelative(r.comms.lastAt)}</span>
                    )}
                  </div>
                  <div className="text-xs text-white/70 mt-1 flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1" title="Telefony (razem)">
                      <Phone className="h-3 w-3" /> {r.comms.calls}
                    </span>
                    <span className="inline-flex items-center gap-1" title="SMS (razem)">
                      <MessageSquare className="h-3 w-3" /> {r.comms.sms}
                    </span>
                    <span className="inline-flex items-center gap-1" title="E-maile (razem)">
                      <Mail className="h-3 w-3" /> {r.comms.emails}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title="Messenger / IG / WhatsApp"
                    >
                      <MessageCircle className="h-3 w-3" /> {r.comms.messenger ?? 0}
                    </span>
                  </div>
                  <Link
                    to={`${base}/leady/${r.id}` as any}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-500/25 text-indigo-50 px-2.5 py-1 text-xs font-medium border border-indigo-300/30 hover:bg-indigo-500/40 transition"
                  >
                    <FileText className="h-3.5 w-3.5" /> Podgląd treści: rozmowy voicebota, maile i
                    SMS
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  <div className="text-[11px] mt-1 flex flex-wrap gap-3 text-emerald-300">
                    <span
                      className="inline-flex items-center gap-1"
                      title="Połączenia przychodzące z numeru leada"
                    >
                      <Phone className="h-3 w-3" /> ← {r.comms.inboundCalls ?? 0}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title="Wiadomości przychodzące (Messenger/IG/WA)"
                    >
                      <MessageSquare className="h-3 w-3" /> ← {r.comms.inboundMessenger ?? 0}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title="Maile przychodzące od leada"
                    >
                      <Mail className="h-3 w-3" /> ← {r.comms.inboundEmails ?? 0}
                    </span>
                  </div>
                  {r.comms.lastCallAt && (
                    <div className="text-xs mt-1 inline-flex flex-wrap items-center gap-1 rounded-md bg-emerald-500/20 text-emerald-100 px-2 py-1 border border-emerald-300/30">
                      <Phone className="h-3 w-3" /> Ostatni telefon:{" "}
                      <strong>{r.comms.lastCallByName ?? "Nieznany pośrednik"}</strong> ·{" "}
                      {formatRelative(r.comms.lastCallAt)}
                    </div>
                  )}
                  {r.comms.inboundEmails > 0 && (
                    <div className="text-xs mt-1 inline-flex flex-wrap items-center gap-1 rounded-md bg-sky-500/20 text-sky-100 px-2 py-1 border border-sky-300/30">
                      <Mail className="h-3 w-3" /> Mail od leada na kontakt@:{" "}
                      <strong>{r.comms.inboundEmails}</strong>
                      {r.comms.lastInboundEmailAt && (
                        <> · {formatRelative(r.comms.lastInboundEmailAt)}</>
                      )}
                      {r.comms.lastInboundEmailSubject && (
                        <span className="opacity-70">· „{r.comms.lastInboundEmailSubject}"</span>
                      )}
                    </div>
                  )}
                  {Array.isArray(r.comms.inboundAttachments) &&
                    r.comms.inboundAttachments.length > 0 && (
                      <AttachmentsThumbs
                        label="Załączniki z maili"
                        attachments={r.comms.inboundAttachments}
                        tone="violet"
                      />
                    )}
                  {Array.isArray(r.comms.messengerAttachments) &&
                    r.comms.messengerAttachments.length > 0 && (
                      <AttachmentsThumbs
                        label="Załączniki z Messenger / IG"
                        attachments={r.comms.messengerAttachments}
                        tone="sky"
                      />
                    )}
                  {Array.isArray(r.comms.loanAttachments) && r.comms.loanAttachments.length > 0 && (
                    <AttachmentsThumbs
                      label="Zdjęcia i dokumenty z wniosku"
                      attachments={r.comms.loanAttachments}
                      tone="emerald"
                    />
                  )}
                  {Array.isArray(r.comms.brokerCalls) && r.comms.brokerCalls.length > 0 && (
                    <div className="text-[11px] mt-1 flex flex-wrap gap-1">
                      {r.comms.brokerCalls.map((b: any) => (
                        <span
                          key={b.id}
                          className="inline-flex items-center gap-1 rounded-md bg-white/10 text-white/80 px-2 py-0.5 border border-white/15"
                        >
                          <Phone className="h-3 w-3" /> {b.name ?? "Pośrednik"} · {b.count}× ·{" "}
                          {formatRelative(b.lastAt)}
                        </span>
                      ))}
                    </div>
                  )}
                  <NoteBlock lead={r} onSaved={() => q.refetch()} />
                </div>
                <div className="flex flex-row sm:flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                  <MetaRateButtons
                    leadId={r.id}
                    markedBad={r.marked_bad_lead}
                    qualityTier={r.quality_tier}
                    onChanged={() => q.refetch()}
                  />
                </div>
              </div>
            );
          })}
          {!q.isLoading && rows.length === 0 && (
            <p className="text-sm text-white/70 text-center py-8">
              Brak leadów spełniających filtry.
            </p>
          )}
        </div>
      </FancyShell>

      <CallOutcomeDialog
        open={!!outcome}
        onOpenChange={(v) => !v && setOutcome(null)}
        leadId={outcome?.leadId ?? ""}
        leadName={outcome?.name}
        onSaved={() => q.refetch()}
      />
    </div>
  );
}

function NoteBlock({ lead, onSaved }: { lead: any; onSaved: () => void }) {
  const addFn = useServerFn(addManualNote);
  const [value, setValue] = useState("");
  const m = useMutation({
    mutationFn: () => addFn({ data: { leadId: lead.id, content: value.trim() } }),
    onSuccess: () => {
      toast.success("Notatka dodana");
      setValue("");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się zapisać notatki"),
  });

  const last = lead.comms?.lastNoteContent as string | null;
  const lastBy = lead.comms?.lastNoteByName as string | null;
  const lastAt = lead.comms?.lastNoteAt as string | null;
  const count = lead.comms?.notes ?? 0;

  return (
    <div className="mt-2 space-y-1">
      {last && (
        <div className="text-xs rounded-md bg-amber-500/20 border border-amber-300/40 text-amber-100 px-2 py-1">
          <div className="flex items-center gap-1 font-medium">
            <StickyNote className="h-3 w-3" /> {lastBy ?? "Pośrednik"} · {formatRelative(lastAt!)}
            {count > 1 && <span className="text-amber-200/70">· +{count - 1} wcześniej</span>}
          </div>
          <div className="whitespace-pre-wrap line-clamp-2">{last}</div>
        </div>
      )}
      <div className="space-y-1">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Dodaj notatkę widoczną dla wszystkich pośredników…"
          rows={2}
          className="text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/40"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-white text-slate-900 hover:bg-white/90"
            onClick={() => m.mutate()}
            disabled={!value.trim() || m.isPending}
          >
            {m.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Plus className="h-3 w-3 mr-1" />
                Zapisz notatkę
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

type InboundAtt = { name: string; mime?: string; size?: number; path?: string; at: string };

const TONES: Record<string, { wrap: string; label: string }> = {
  violet: { wrap: "bg-violet-500/15 border-violet-300/30", label: "text-violet-100" },
  sky: { wrap: "bg-sky-500/15 border-sky-300/30", label: "text-sky-100" },
  emerald: { wrap: "bg-emerald-500/15 border-emerald-300/30", label: "text-emerald-100" },
};

function AttachmentsThumbs({
  attachments,
  label,
  tone = "violet",
}: {
  attachments: InboundAtt[];
  label: string;
  tone?: "violet" | "sky" | "emerald";
}) {
  const t = TONES[tone] ?? TONES.violet;
  const visible = attachments.slice(0, 8);
  return (
    <div className={`mt-2 rounded-md border p-2 ${t.wrap}`}>
      <div className={`inline-flex items-center gap-1 text-xs font-medium mb-2 ${t.label}`}>
        <Paperclip className="h-3 w-3" /> {label}: <strong>{attachments.length}</strong>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {visible.map((a, i) =>
          a.path ? (
            <div key={i}>
              <FileThumb
                path={a.path}
                name={a.name}
                mimeType={a.mime}
                size={a.size}
                aspect="square"
                onClick={() => window.open(a.path, "_blank")}
              />
              <div className="mt-1 text-[10px] text-white/70 truncate">{a.name}</div>
            </div>
          ) : (
            <div
              key={i}
              className="aspect-square rounded-md border border-white/20 bg-white/10 flex items-center justify-center text-white/70 text-[10px]"
            >
              {a.name}
            </div>
          ),
        )}
      </div>
      {attachments.length > visible.length && (
        <div className="text-[11px] text-white/70 mt-1">
          +{attachments.length - visible.length} więcej
        </div>
      )}
    </div>
  );
}
