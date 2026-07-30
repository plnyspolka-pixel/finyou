import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listLeads, logBrokerCall } from "@/lib/leads-admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  UserCheck,
  MessageCircle,
} from "lucide-react";
import { leadStatusLabels, formatRelative } from "@/lib/labels";
import { CallOutcomeDialog } from "@/components/broker/call-outcome-dialog";
import { MetaRateButtons } from "@/components/broker/meta-rate-buttons";
import { FancyShell } from "@/components/landing/fancy-shell";
import { usePanelBase } from "@/lib/panel-base";
import { RevealContact, RevealsList } from "@/components/broker/reveal-contact";

export const Route = createFileRoute("/posrednik/moje-leady")({
  component: MyBrokerLeads,
});

export function MyBrokerLeads() {
  const base = usePanelBase();
  const fn = useServerFn(listLeads);
  const logCallFn = useServerFn(logBrokerCall);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<{ leadId: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["my-broker-leads", status, search],
    queryFn: () =>
      fn({
        data: {
          type: "all",
          assignedToMe: true,
          status: status === "all" ? "" : status,
          search,
        },
      }),
  });

  const logCall = useMutation({
    mutationFn: (vars: { leadId: string; phone: string | null }) => logCallFn({ data: vars }),
    onSuccess: () => q.refetch(),
  });

  const rows = (q.data ?? []) as any[];
  const totalCalls = useMemo(() => rows.reduce((acc, r) => acc + (r.comms?.calls ?? 0), 0), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <h1 className="text-base font-semibold truncate">Moje leady</h1>
          <Badge variant="secondary" className="h-5 text-[10px] shrink-0">
            {rows.length}
          </Badge>
          <Badge variant="outline" className="h-5 text-[10px] shrink-0 hidden sm:inline-flex">
            {totalCalls} połączeń
          </Badge>
        </div>
        <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => q.refetch()}>
          <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Odśwież</span>
        </Button>
      </div>

      <FancyShell motion={false} innerClassName="!p-3 md:!p-4">
        <div className="grid gap-3 md:grid-cols-3">
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
                className="group relative overflow-hidden rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-sm p-3 sm:p-4 flex items-center gap-3 transition hover:bg-white/[0.10] hover:border-white/30"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-emerald-400 via-sky-400 to-indigo-400 opacity-80"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold truncate text-white">{name}</div>
                    <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20">
                      {leadStatusLabels[r.status] ?? r.status}
                    </Badge>
                    {r.source && (
                      <Badge className="bg-sky-500/25 text-sky-100 border-sky-300/30">
                        {r.source}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-white/80 mt-1 flex flex-wrap gap-2">
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
                  <RevealsList reveals={r.comms?.reveals} />
                  <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1 text-white/70">
                    <span>📅 {formatRelative(r.created_at)}</span>
                    {r.comms?.lastCallAt && (
                      <span>· ostatnio dzwoniono {formatRelative(r.comms.lastCallAt)}</span>
                    )}
                  </div>
                  <div className="text-xs mt-1 flex gap-3 text-white/70">
                    <span className="inline-flex items-center gap-1" title="Telefony">
                      <Phone className="h-3 w-3" /> {r.comms?.calls ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1" title="SMS">
                      <MessageSquare className="h-3 w-3" /> {r.comms?.sms ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1" title="E-maile">
                      <Mail className="h-3 w-3" /> {r.comms?.emails ?? 0}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title="Messenger / IG / WhatsApp"
                    >
                      <MessageCircle className="h-3 w-3" /> {r.comms?.messenger ?? 0}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <MetaRateButtons
                    leadId={r.id}
                    markedBad={r.marked_bad_lead}
                    qualityTier={r.quality_tier}
                    onChanged={() => q.refetch()}
                  />
                  <Link to={`${base}/leady/${r.id}` as any}>
                    <Button
                      size="sm"
                      className="bg-white/15 text-white border border-white/20 hover:bg-white/25"
                    >
                      Otwórz <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
          {!q.isLoading && rows.length === 0 && (
            <p className="text-sm text-white/70 text-center py-8">
              Nie zadzwoniłeś jeszcze do żadnego leada. Kliknij ikonkę telefonu przy leadzie w
              zakładce „Leady (wszystkie)", żeby przypisać go do siebie.
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
