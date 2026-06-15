import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listLeads } from "@/lib/leads-admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Mail, StickyNote, Download, RefreshCw, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { formatPLN, propertyTypeLabels, loanStatusLabels } from "@/lib/labels";
import { LeadDetailView } from "@/components/admin/LeadDetailView";


export const Route = createFileRoute("/admin/klienci")({
  component: KlienciPage,
});

const LEAD_STATUS_LABELS: Record<string, string> = {
  nowy: "Nowy",
  w_kontakcie: "W kontakcie",
  rozmowa: "Po rozmowie",
  wniosek_wyslany: "Wniosek wysłany",
  wniosek_zlozony: "Wniosek złożony",
  zakwalifikowany: "Zakwalifikowany",
  odrzucony: "Odrzucony",
  zamkniety: "Zamknięty",
  bad_lead: "Zły lead",
};

function statusLabel(s: string | null | undefined) {
  if (!s) return "—";
  return LEAD_STATUS_LABELS[s] ?? loanStatusLabels[s] ?? s;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "przed chwilą";
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h temu`;
  const d = Math.floor(h / 24);
  if (d === 1) return "wczoraj";
  if (d < 7) return `${d} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}

type Row = {
  id: string;
  type: string;
  status: string;
  source: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_normalized: string | null;
  current_form_step: number | null;
  created_at: string;
  loan_application_id: string | null;
  loan: {
    id: string;
    status: string;
    loan_amount: number | null;
    preferred_period_months: number | null;
    completeness_percent: number | null;
    properties: { property_type: string; city: string | null; estimated_value: number | null }[];
  } | null;
  comms: { calls: number; sms: number; emails: number; notes: number; lastAt: string | null; lastChannel: string | null };
};

function KlienciPage() {
  const fn = useServerFn(listLeads);
  const [type, setType] = useState<"all" | "pozyczkowy" | "inwestorski">("all");
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["klienci", type, status, source, search],
    queryFn: () => fn({ data: { type, status: status === "all" ? "" : status, source: source === "all" ? "" : source, search } }),
  });

  const rows = (q.data ?? []) as Row[];

  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean) as string[])), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))), [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, nieobsluzone: 0, ma_wniosek: 0, bez_kontaktu: 0 };
    for (const r of rows) {
      if (r.status === "nowy") c.nieobsluzone++;
      if (r.loan_application_id) c.ma_wniosek++;
      if (!r.comms.lastAt) c.bez_kontaktu++;
    }
    return c;
  }, [rows]);

  const exportCsv = () => {
    const header = ["ID","Imię","Nazwisko","Telefon","E-mail","Typ","Status","Źródło","Kwota","Okres","Kompl.%","Tel.","SMS","E-mail#","Ostatni kontakt","Utworzono"];
    const lines = rows.map((r) => [
      r.id, r.first_name ?? "", r.last_name ?? "", r.phone_normalized ?? "", r.email ?? "",
      r.type, statusLabel(r.status), r.source ?? "",
      r.loan?.loan_amount ?? "", r.loan?.preferred_period_months ?? "", r.loan?.completeness_percent ?? "",
      r.comms.calls, r.comms.sms, r.comms.emails, r.comms.lastAt ?? "", r.created_at,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `klienci-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Klienci</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Leady, wnioski, follow-up — wszystko w jednym widoku.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">CSV</span></Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Wszystkie: {counts.all}</Badge>
        <Badge variant="outline">Nieobsłużone: {counts.nieobsluzone}</Badge>
        <Badge variant="outline">Z wnioskiem: {counts.ma_wniosek}</Badge>
        <Badge variant="outline">Bez kontaktu: {counts.bez_kontaktu}</Badge>
      </div>

      <Card className="p-3 space-y-2">
        <Input placeholder="Szukaj: imię, e-mail, telefon…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie typy</SelectItem>
              <SelectItem value="pozyczkowy">Pożyczkowy</SelectItem>
              <SelectItem value="inwestorski">Inwestorski</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {statuses.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-9 text-xs col-span-2 sm:col-auto"><SelectValue placeholder="Źródło" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie źródła</SelectItem>
              {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        {/* Mobile: karty */}
        <div className="lg:hidden divide-y">
          {q.isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Ładowanie…</div>}
          {!q.isLoading && rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Brak rekordów.</div>}
          {rows.map((r) => {
            const p = r.loan?.properties?.[0];
            const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
            return (
              <Link key={r.id} to="/admin/klienci/$id" params={{ id: r.id }} className="block p-3 hover:bg-muted/40 active:bg-muted/60">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.phone_normalized ?? "—"} · {r.email ?? "—"}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={r.type === "inwestorski" ? "secondary" : "default"} className="text-[10px]">{r.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{statusLabel(r.status)}</Badge>
                  </div>
                </div>
                {(r.loan || p) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {r.loan && (
                      <div className="min-w-0">
                        <div className="text-muted-foreground">Wniosek</div>
                        <div className="truncate font-medium">{formatPLN(r.loan.loan_amount)}{r.loan.preferred_period_months ? ` · ${r.loan.preferred_period_months} mc` : ""}</div>
                        <div className="text-muted-foreground">Kompletność: {r.loan.completeness_percent ?? 0}%</div>
                      </div>
                    )}
                    {p && (
                      <div className="min-w-0">
                        <div className="text-muted-foreground">Nieruchomość</div>
                        <div className="truncate font-medium">{propertyTypeLabels[p.property_type] ?? p.property_type}{p.city ? ` · ${p.city}` : ""}</div>
                        {p.estimated_value ? <div className="text-muted-foreground truncate">{formatPLN(p.estimated_value)}</div> : null}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"><Phone className="h-3 w-3" />{r.comms.calls}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"><MessageSquare className="h-3 w-3" />{r.comms.sms}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"><Mail className="h-3 w-3" />{r.comms.emails}</span>
                  {r.comms.notes > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5"><StickyNote className="h-3 w-3" />{r.comms.notes}</span>}
                  <span className="text-muted-foreground">· {formatRelative(r.comms.lastAt)}</span>
                  <span className="ml-auto text-muted-foreground">{r.source ?? "—"}</span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2">Klient</th>
                <th className="px-3 py-2">Kontakt</th>
                <th className="px-3 py-2">Typ / Status</th>
                <th className="px-3 py-2">Wniosek</th>
                <th className="px-3 py-2">Nieruchomość</th>
                <th className="px-3 py-2">Aktywność</th>
                <th className="px-3 py-2">Źródło</th>
                <th className="px-3 py-2">Utworzono</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Ładowanie…</td></tr>}
              {!q.isLoading && rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Brak rekordów.</td></tr>}
              {rows.map((r) => {
                const p = r.loan?.properties?.[0];
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link to="/admin/klienci/$id" params={{ id: r.id }} className="font-medium hover:underline">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">ID: {r.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{r.phone_normalized ?? "—"}</div>
                      <div className="text-muted-foreground">{r.email ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs space-y-1">
                      <Badge variant={r.type === "inwestorski" ? "secondary" : "default"} className="text-[10px]">{r.type}</Badge>
                      <div><Badge variant="outline" className="text-[10px]">{statusLabel(r.status)}</Badge></div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.loan ? (
                        <>
                          <div className="font-medium">{formatPLN(r.loan.loan_amount)}</div>
                          <div className="text-muted-foreground">{r.loan.preferred_period_months ? `${r.loan.preferred_period_months} mc` : "—"} · {r.loan.completeness_percent ?? 0}%</div>
                        </>
                      ) : r.current_form_step ? <span className="text-muted-foreground">krok {r.current_form_step}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p ? (
                        <>
                          <div className="font-medium">{propertyTypeLabels[p.property_type] ?? p.property_type}</div>
                          <div className="text-muted-foreground">{p.city ?? "—"}{p.estimated_value ? ` · ${formatPLN(p.estimated_value)}` : ""}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1" title="Telefony"><Phone className="h-3 w-3" />{r.comms.calls}</span>
                        <span className="inline-flex items-center gap-1" title="SMS"><MessageSquare className="h-3 w-3" />{r.comms.sms}</span>
                        <span className="inline-flex items-center gap-1" title="E-maile"><Mail className="h-3 w-3" />{r.comms.emails}</span>
                        {r.comms.notes > 0 && <span className="inline-flex items-center gap-1" title="Notatki"><StickyNote className="h-3 w-3" />{r.comms.notes}</span>}
                      </div>
                      <div className="text-muted-foreground">{formatRelative(r.comms.lastAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.source ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString("pl-PL")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
