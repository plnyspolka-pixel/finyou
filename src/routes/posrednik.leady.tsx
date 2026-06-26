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
import { Phone, MessageSquare, Mail, RefreshCw, ChevronRight, Search } from "lucide-react";
import { leadStatusLabels, formatRelative } from "@/lib/labels";
import { PropertyKeyFacts } from "@/components/wniosek/property-key-facts";

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Leady (wszystkie)</h1>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Odśwież
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Szukaj: imię, nazwisko, e-mail, telefon…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {Object.entries(leadStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue placeholder="Źródło" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie źródła</SelectItem>
              {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                    {phone && <span>📞 {phone}</span>}
                    {r.email && <span>✉️ {r.email}</span>}
                    <span>📅 {formatRelative(r.created_at)}</span>
                    {r.comms.lastAt && <span>· ostatni kontakt {formatRelative(r.comms.lastAt)}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {r.comms.calls}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {r.comms.sms}</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {r.comms.emails}</span>
                  </div>
                  {r.comms.lastCallAt && (
                    <div className="text-xs mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 px-2 py-1 border border-emerald-200">
                      <Phone className="h-3 w-3" /> Ostatni telefon: <strong>{r.comms.lastCallByName ?? "Pośrednik"}</strong> · {formatRelative(r.comms.lastCallAt)}
                    </div>
                  )}
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
