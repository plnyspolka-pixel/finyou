import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listLeads, logBrokerCall } from "@/lib/leads-admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Mail, RefreshCw, ChevronRight, Search, UserCheck } from "lucide-react";
import { leadStatusLabels, formatRelative } from "@/lib/labels";
import { CallOutcomeDialog } from "@/components/broker/call-outcome-dialog";

export const Route = createFileRoute("/posrednik/moje-leady")({
  component: MyBrokerLeads,
});

function MyBrokerLeads() {
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
  const totalCalls = useMemo(
    () => rows.reduce((acc, r) => acc + (r.comms?.calls ?? 0), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-emerald-600" /> Moje leady
          </h1>
          <p className="text-sm text-muted-foreground">
            Leady, do których zadzwoniłeś (kliknąłeś ikonkę telefonu). Łącznie: {rows.length} leadów, {totalCalls} połączeń.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Szukaj: imię, nazwisko, e-mail, telefon…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
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
        </CardContent>
      </Card>

      {q.isLoading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
      {q.error && <p className="text-sm text-destructive">Błąd: {(q.error as Error).message}</p>}

      <div className="grid gap-2">
        {rows.map((r) => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Bez nazwy";
          const phone = r.phone_normalized;
          return (
            <Card key={r.id} className="hover:bg-accent/40 transition">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{name}</div>
                    <Badge variant="outline">{leadStatusLabels[r.status] ?? r.status}</Badge>
                    {r.source && <Badge variant="secondary">{r.source}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>📅 {formatRelative(r.created_at)}</span>
                    {r.comms?.lastCallAt && <span>· ostatnio dzwoniono {formatRelative(r.comms.lastCallAt)}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {r.comms?.calls ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {r.comms?.sms ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {r.comms?.emails ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      onClick={() => {
                        logCall.mutate({ leadId: r.id, phone });
                        setOutcome({ leadId: r.id, name });
                      }}
                      className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                      aria-label={`Zadzwoń ${phone}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                  <Link to="/posrednik/leady/$id" params={{ id: r.id }}>
                    <Button size="sm" variant="default">
                      Otwórz <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!q.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nie zadzwoniłeś jeszcze do żadnego leada. Kliknij ikonkę telefonu przy leadzie w zakładce „Leady (wszystkie)", żeby przypisać go do siebie.
          </p>
        )}
      </div>

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
