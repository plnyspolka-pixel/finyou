import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listLeads, logBrokerCall, addManualNote } from "@/lib/leads-admin.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Mail, RefreshCw, ChevronRight, Search, StickyNote, Plus, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { leadStatusLabels, formatRelative } from "@/lib/labels";
import { PropertyKeyFacts } from "@/components/wniosek/property-key-facts";
import { FancyShell } from "@/components/landing/fancy-shell";

export const Route = createFileRoute("/posrednik/leady")({
  component: OperatorLeadsList,
});

function OperatorLeadsList() {
  const fn = useServerFn(listLeads);
  const logCallFn = useServerFn(logBrokerCall);
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["operator-leads", status, source, search],
    queryFn: () => fn({ data: { type: "all", status: status === "all" ? "" : status, source: source === "all" ? "" : source, search } }),
  });

  const logCall = useMutation({
    mutationFn: (vars: { leadId: string; phone: string | null }) => logCallFn({ data: vars }),
    onSuccess: () => q.refetch(),
  });

  const rows = (q.data ?? []) as any[];
  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean))) as string[], [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base font-semibold truncate">Leady</h1>
          <Badge variant="secondary" className="h-5 text-[10px] shrink-0">{rows.length}</Badge>
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
            <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {Object.entries(leadStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="Źródło" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie źródła</SelectItem>
              {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </FancyShell>


      {q.isLoading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
      {q.error && <p className="text-sm text-destructive">Błąd: {(q.error as Error).message}</p>}

      <div className="grid gap-2">
        {rows.map((r) => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Bez nazwy";
          const phone = r.phone_normalized;
          return (
            <Card key={r.id} className="group relative overflow-hidden border-primary/10 bg-gradient-to-br from-background via-background to-primary/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/30">
              <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-indigo-500 via-sky-500 to-emerald-500 opacity-70 group-hover:opacity-100" />
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{name}</div>
                    <Badge variant="outline">{leadStatusLabels[r.status] ?? r.status}</Badge>
                    {r.source && <Badge variant="secondary">{r.source}</Badge>}
                    {r.quality_tier && <Badge className="bg-blue-600 text-white">Tier {r.quality_tier}</Badge>}
                  </div>
                  {r.loan && (
                    <PropertyKeyFacts
                      variant="inline"
                      className="mt-1"
                      amount={r.loan.loan_amount}
                      propertyType={r.loan.properties?.[0]?.property_type}
                      kwNumber={r.loan.properties?.[0]?.land_register_number}
                      photoCount={r.loan.properties?.[0]?.photos?.length ?? 0}
                      docCount={r.docCount ?? 0}
                      periodMonths={r.loan.preferred_period_months}
                    />
                  )}
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>📅 {formatRelative(r.created_at)}</span>
                    {r.comms.lastAt && <span>· ostatni kontakt {formatRelative(r.comms.lastAt)}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {r.comms.calls}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {r.comms.sms}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {r.comms.emails}</span>
                  </div>
                  <div className="text-[11px] mt-1 flex gap-3 text-emerald-700">
                    <span className="inline-flex items-center gap-1" title="Połączenia przychodzące z numeru leada">
                      <Phone className="h-3 w-3" /> ← {r.comms.inboundCalls ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Wiadomości przychodzące (Messenger/IG/WA)">
                      <MessageSquare className="h-3 w-3" /> ← {r.comms.inboundMessenger ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Maile przychodzące od leada">
                      <Mail className="h-3 w-3" /> ← {r.comms.inboundEmails ?? 0}
                    </span>
                  </div>
                  {r.comms.lastCallAt && (
                    <div className="text-xs mt-1 inline-flex flex-wrap items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 px-2 py-1 border border-emerald-200">
                      <Phone className="h-3 w-3" /> Ostatni telefon: <strong>{r.comms.lastCallByName ?? "Nieznany pośrednik"}</strong> · {formatRelative(r.comms.lastCallAt)}
                    </div>
                  )}
                  {r.comms.inboundEmails > 0 && (
                    <div className="text-xs mt-1 inline-flex flex-wrap items-center gap-1 rounded-md bg-sky-50 text-sky-800 px-2 py-1 border border-sky-200">
                      <Mail className="h-3 w-3" /> Mail od leada na kontakt@: <strong>{r.comms.inboundEmails}</strong>
                      {r.comms.lastInboundEmailAt && <> · {formatRelative(r.comms.lastInboundEmailAt)}</>}
                      {r.comms.lastInboundEmailSubject && <span className="opacity-70">· „{r.comms.lastInboundEmailSubject}"</span>}
                    </div>
                  )}
                  {Array.isArray(r.comms.inboundAttachments) && r.comms.inboundAttachments.length > 0 && (
                    <div className="text-xs mt-1 rounded-md bg-violet-50 text-violet-900 px-2 py-1 border border-violet-200">
                      <div className="inline-flex items-center gap-1 font-medium">
                        <Paperclip className="h-3 w-3" /> Załączniki z maili: <strong>{r.comms.inboundAttachments.length}</strong>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.comms.inboundAttachments.slice(0, 6).map((a: any, i: number) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-white/70 border border-violet-200 px-1.5 py-0.5 text-[11px]">
                            <Paperclip className="h-2.5 w-2.5" />
                            <span className="truncate max-w-[160px]">{a.name}</span>
                            {typeof a.size === "number" && <span className="opacity-60">· {Math.max(1, Math.round(a.size / 1024))} KB</span>}
                          </span>
                        ))}
                        {r.comms.inboundAttachments.length > 6 && (
                          <span className="text-[11px] opacity-70">+{r.comms.inboundAttachments.length - 6} więcej</span>
                        )}
                      </div>
                    </div>
                  )}
                  {Array.isArray(r.comms.brokerCalls) && r.comms.brokerCalls.length > 0 && (
                    <div className="text-[11px] mt-1 flex flex-wrap gap-1">
                      {r.comms.brokerCalls.map((b: any) => (
                        <span key={b.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 border border-slate-200">
                          <Phone className="h-3 w-3" /> {b.name ?? "Pośrednik"} · {b.count}× · {formatRelative(b.lastAt)}
                        </span>
                      ))}
                    </div>
                  )}
                  <NoteBlock lead={r} onSaved={() => q.refetch()} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      onClick={() => logCall.mutate({ leadId: r.id, phone })}
                      className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                      aria-label={`Zadzwoń ${phone}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                  <Link to="/posrednik/leady/$id" params={{ id: r.id }}>
                    <Button size="sm" variant="default">Otwórz <ChevronRight className="ml-1 h-4 w-4" /></Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!q.isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Brak leadów spełniających filtry.</p>}
      </div>
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
        <div className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1">
          <div className="flex items-center gap-1 font-medium">
            <StickyNote className="h-3 w-3" /> {lastBy ?? "Pośrednik"} · {formatRelative(lastAt!)}
            {count > 1 && <span className="text-amber-700/70">· +{count - 1} wcześniej</span>}
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
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => m.mutate()} disabled={!value.trim() || m.isPending}>
            {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (<><Plus className="h-3 w-3 mr-1" />Zapisz notatkę</>)}
          </Button>
        </div>
      </div>
    </div>
  );
}
