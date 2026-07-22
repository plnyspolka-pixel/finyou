import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { listLeads } from "@/lib/leads-admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Phone, MessageSquare, MessagesSquare, Mail, StickyNote, Download, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Paperclip } from "lucide-react";
import { formatPLN, formatRelative, propertyTypeLabels, loanStatusLabels, leadStatusLabels, formatDateTime } from "@/lib/labels";
import { LeadDetailView } from "@/components/admin/LeadDetailView";
import { leadSourceLabel } from "@/lib/lead-source";
import { RemindersPanel } from "@/components/admin/RemindersPanel";
import { evaluateApplicationCore } from "@/lib/application-completeness";


export const Route = createFileRoute("/admin/klienci")({
  component: KlienciPage,
});

function statusLabel(s: string | null | undefined) {
  if (!s) return "—";
  return leadStatusLabels[s] ?? loanStatusLabels[s] ?? s;
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
    properties: { property_type: string; city: string | null; estimated_value: number | null; land_register_number: string | null; photos: string[] | null }[];
  } | null;
  docCount?: number;
  comms: { calls: number; sms: number; emails: number; messenger?: number; notes: number; lastAt: string | null; lastChannel: string | null; inboundAttachments?: { name: string }[] };
};

// Wniosek = coś więcej niż same dane leada (imię/nazwisko/email/telefon).
// Sam `loan_application_id` NIE wystarcza — stub jest tworzony automatycznie
// przy otwarciu leada (ensureLoanApplicationForLead), więc niemal każdy lead go ma.
function isApplication(r: Row): boolean {
  if (r.loan?.loan_amount != null) return true;
  if ((r.docCount ?? 0) > 0) return true;
  for (const p of r.loan?.properties ?? []) {
    if (p.land_register_number && p.land_register_number.trim().length > 0) return true;
    if (Array.isArray(p.photos) && p.photos.length > 0) return true;
    if (p.estimated_value != null) return true;
  }
  return false;
}

// Kompletność podstawowych danych — ta sama definicja co w panelu wniosków
// (application-completeness.ts). Dane klienta bierzemy z leada (imię, nazwisko,
// telefon, e-mail), nieruchomość i kwotę z wniosku.
function isCoreComplete(r: Row): boolean {
  return evaluateApplicationCore({
    loan_amount: r.loan?.loan_amount ?? null,
    client: { first_name: r.first_name, last_name: r.last_name, email: r.email, phone: r.phone_normalized },
    properties: r.loan?.properties ?? [],
    docCount: r.docCount ?? 0,
  }).complete;
}

function filesCount(r: Row): number {
  const photos = (r.loan?.properties ?? []).reduce((s, p) => s + (Array.isArray(p.photos) ? p.photos.length : 0), 0);
  const docs = r.docCount ?? 0;
  const inboundAtt = r.comms.inboundAttachments?.length ?? 0;
  return photos + docs + inboundAtt;
}

function KlienciPage() {
  const fn = useServerFn(listLeads);
  const [type, setType] = useState<"all" | "pozyczkowy" | "inwestorski">("all");
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<"all" | "nieobsluzone" | "ma_wniosek" | "kompletne" | "bez_kontaktu">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));


  const q = useQuery({
    queryKey: ["klienci", type, status, source, search],
    queryFn: () => fn({ data: { type, status: status === "all" ? "" : status, source: source === "all" ? "" : source, search } }),
  });

  // Wnioski (rekordy z KW, kwotą, dokumentami lub zdjęciami) mają swój dom w
  // /admin/wnioski-niekompletne — tutaj zostają wyłącznie leady bez wniosku.
  const rows = ((q.data ?? []) as Row[]).filter((r) => !isApplication(r));

  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean) as string[])), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))), [rows]);

  const counts = useMemo(() => {
    const c = { all: rows.length, nieobsluzone: 0, bez_kontaktu: 0 };
    for (const r of rows) {
      if (r.status === "nowy") c.nieobsluzone++;
      if (!r.comms.lastAt) c.bez_kontaktu++;
    }
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    switch (quick) {
      case "nieobsluzone": return rows.filter((r) => r.status === "nowy");
      case "bez_kontaktu": return rows.filter((r) => !r.comms.lastAt);
      default: return rows;
    }
  }, [rows, quick]);

  const exportCsv = () => {
    const header = ["ID","Imię","Nazwisko","Telefon","E-mail","Typ","Status","Źródło","Kwota","Okres","Kompl.%","Tel.","SMS","E-mail#","Ostatni kontakt","Utworzono"];
    const lines = rows.map((r) => [
      r.id, r.first_name ?? "", r.last_name ?? "", r.phone_normalized ?? "", r.email ?? "",
      r.type, statusLabel(r.status), leadSourceLabel(r.source),
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
          <p className="text-xs sm:text-sm text-muted-foreground">Leady, wnioski, follow-up i przypomnienia voicebota — wszystko w jednym miejscu.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">CSV</span></Button>
        </div>
      </header>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="lista">Lista klientów</TabsTrigger>
          <TabsTrigger value="reminders">Przypomnienia voicebota</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4 mt-0">
          <div className="flex flex-wrap gap-2 text-xs">
            {([
              { key: "all", label: "Wszystkie", n: counts.all },
              { key: "nieobsluzone", label: "Nieobsłużone", n: counts.nieobsluzone },
              { key: "bez_kontaktu", label: "Bez kontaktu", n: counts.bez_kontaktu },
            ] as const).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setQuick(f.key)}
                className={`rounded-full border px-2.5 py-1 transition-colors ${
                  quick === f.key ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted"
                }`}
              >
                {f.label}: <span className="font-semibold tabular-nums">{f.n}</span>
              </button>
            ))}
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
              {sources.map((s) => <SelectItem key={s} value={s}>{leadSourceLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        {/* Mobile: karty */}
        <div className="lg:hidden divide-y">
          {q.isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Ładowanie…</div>}
          {!q.isLoading && visibleRows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Brak rekordów.</div>}
          {visibleRows.map((r) => {
            const p = r.loan?.properties?.[0];
            const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
            const isOpen = expandedId === r.id;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  className="w-full text-left p-3 hover:bg-muted/40 active:bg-muted/60"
                >
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.phone_normalized ?? "—"} · {r.email ?? "—"}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Link
                        to="/admin/klienci/$id"
                        params={{ id: r.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Otwórz <ExternalLink className="h-3 w-3" />
                      </Link>
                      <Badge variant={r.type === "inwestorski" ? "secondary" : "default"} className="text-[10px]">{r.type}</Badge>
                      {isApplication(r)
                        ? <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 text-white">Wniosek</Badge>
                        : <Badge variant="outline" className="text-[10px]">{statusLabel(r.status)}</Badge>}
                    </div>

                  </div>

                  {(isApplication(r) || p) && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs pl-6">
                      {isApplication(r) && r.loan && (
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] pl-6">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5" title="Telefony"><Phone className="h-3 w-3" />{r.comms.calls}</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5" title="SMS"><MessageSquare className="h-3 w-3" />{r.comms.sms}</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5" title="E-maile"><Mail className="h-3 w-3" />{r.comms.emails}</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5" title="Messenger/IG"><MessagesSquare className="h-3 w-3" />{r.comms.messenger ?? 0}</span>
                    {r.comms.notes > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5" title="Notatki"><StickyNote className="h-3 w-3" />{r.comms.notes}</span>}
                    {filesCount(r) > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5" title="Pliki klienta"><Paperclip className="h-3 w-3" />{filesCount(r)}</span>}
                    <span className="text-muted-foreground">· {formatRelative(r.comms.lastAt)}</span>
                    <span className="ml-auto text-muted-foreground" title={r.source ?? undefined}>{leadSourceLabel(r.source)}</span>
                  </div>

                </button>
                {isOpen && (
                  <div className="p-3 bg-muted/30 border-t">
                    <div className="mb-2 flex justify-end">
                      <Link to="/admin/klienci/$id" params={{ id: r.id }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                        Otwórz pełny widok <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    <LeadDetailView id={r.id} compact />
                  </div>
                )}
              </div>
            );
          })}
        </div>


        {/* Desktop: tabela */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-2 py-2 w-[110px]"></th>
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
              {q.isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Ładowanie…</td></tr>}
              {!q.isLoading && visibleRows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Brak rekordów.</td></tr>}
              {visibleRows.map((r) => {
                const p = r.loan?.properties?.[0];
                const isOpen = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => toggle(r.id)}
                      className={`border-b cursor-pointer ${isOpen ? "bg-muted/50" : "hover:bg-muted/40"}`}
                    >

                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to="/admin/klienci/$id"
                            params={{ id: r.id }}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Otwórz <ExternalLink className="h-3 w-3" />
                          </Link>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">ID: {r.id.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{r.phone_normalized ?? "—"}</div>
                        <div className="text-muted-foreground">{r.email ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-xs space-y-1">
                        <Badge variant={r.type === "inwestorski" ? "secondary" : "default"} className="text-[10px]">{r.type}</Badge>
                        <div>
                          {isApplication(r)
                            ? <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 text-white">Wniosek</Badge>
                            : <Badge variant="outline" className="text-[10px]">{statusLabel(r.status)}</Badge>}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-xs">
                        {isApplication(r) && r.loan ? (
                          <>
                            <div className="font-medium">{formatPLN(r.loan.loan_amount)}</div>
                            <div className="text-muted-foreground">{r.loan.preferred_period_months ? `${r.loan.preferred_period_months} mc` : "—"} · {r.loan.completeness_percent ?? 0}%</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">lead{r.current_form_step ? ` · krok ${r.current_form_step}` : ""}</span>
                        )}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1" title="Telefony"><Phone className="h-3 w-3" />{r.comms.calls}</span>
                          <span className="inline-flex items-center gap-1" title="SMS"><MessageSquare className="h-3 w-3" />{r.comms.sms}</span>
                          <span className="inline-flex items-center gap-1" title="E-maile"><Mail className="h-3 w-3" />{r.comms.emails}</span>
                          <span className="inline-flex items-center gap-1" title="Messenger/IG"><MessagesSquare className="h-3 w-3" />{r.comms.messenger ?? 0}</span>
                          {r.comms.notes > 0 && <span className="inline-flex items-center gap-1" title="Notatki"><StickyNote className="h-3 w-3" />{r.comms.notes}</span>}
                          {filesCount(r) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5" title="Pliki klienta">
                              <Paperclip className="h-3 w-3" />{filesCount(r)}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground">{formatRelative(r.comms.lastAt)}</div>
                      </td>

                      <td className="px-3 py-2 text-xs" title={r.source ?? undefined}>{leadSourceLabel(r.source)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}-expanded`} className="border-b bg-muted/20">
                        <td></td>
                        <td colSpan={8} className="px-3 py-4">
                          <div className="mb-2 flex justify-end">
                            <Link to="/admin/klienci/$id" params={{ id: r.id }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                              Otwórz pełny widok <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                          <LeadDetailView id={r.id} compact />
                        </td>
                      </tr>
                    )}
                  </Fragment>

                );
              })}
            </tbody>
          </table>

        </div>
      </Card>
        </TabsContent>

        <TabsContent value="reminders" className="mt-0">
          <RemindersPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
