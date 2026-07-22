import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Eye, ExternalLink, FileText, Image as ImageIcon, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { MediaPreviewDialog } from "@/components/admin/MediaPreviewDialog";
import { SourceIcon } from "@/components/admin/SourceIcon";
import { normalizeLoanStatus, LOAN_STATUS_SHORT_LABELS } from "@/lib/loan-status";
import { leadSourceLabel } from "@/lib/lead-source";
import { resolveShowablePhotoUrls } from "@/lib/property-photos";
import { evaluateApplicationCore, missingLabels, type CompletenessResult } from "@/lib/application-completeness";
import {
  inferAmountSource,
  inferKwSource,
  inferMediaSource,
  type EnrichmentContext,
  type FieldSource,
} from "@/lib/enrichment-source";

export const Route = createFileRoute("/admin/wnioski-niekompletne")({
  component: ApplicationsPage,
});

type Property = { id: string; land_register_number: string | null; photos: string[] | null };
type Row = {
  id: string;
  status: string;
  loan_amount: number | null;
  completeness_percent: number | null;
  current_form_step: number | null;
  created_at: string;
  updated_at: string;
  source: string | null;
  return_link: string | null;
  missing_fields: any;
  client: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; source?: string | null } | null;
  properties: Property[] | null;
  docCount?: number;
};

const INCOMPLETE_STATUSES = ["nowy_lead", "brak_kontaktu", "brak_kw", "brak_zdjec_dokumentow", "kontakt", "kompletowanie_danych"];
const COMPLETE_STATUSES = [
  "szukamy_inwestora",
  "warunki_zaakceptowane",
  "dokumenty_przygotowanie_umowy",
  "notariusz",
  "zamkniete",
];

// Ocena kompletności podstawowych danych wniosku — jedyne źródło prawdy w
// src/lib/application-completeness.ts (używane też przez panel klienta,
// marketplace inwestora i migrację czyszczącą dane).
function coreOf(r: Row): CompletenessResult {
  return evaluateApplicationCore({
    loan_amount: r.loan_amount,
    client: r.client,
    properties: r.properties ?? [],
    docCount: r.docCount ?? 0,
  });
}

function fmtPLN(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

type SortKey = "updated_at" | "created_at" | "loan_amount" | "name" | "status" | "media" | "kw";
type SortDir = "asc" | "desc";
type TabKey = "all" | "incomplete" | "complete" | "attention";

function MediaThumbs({ photoPaths, docCount, onOpen }: { photoPaths: string[]; docCount: number; onOpen: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (photoPaths.length === 0) { setUrls([]); return; }
      // Podpisuj z fallbackiem bucketów (pliki-klienta → documents → property-photos)
      // i tylko faktyczne zdjęcia — inaczej pliki ze starych bucketów oraz skany
      // dokumentów renderują się jako puste kwadraty.
      const resolved = await resolveShowablePhotoUrls(photoPaths, 60 * 60);
      if (!cancelled) setUrls(resolved.slice(0, 3));
    })();
    return () => { cancelled = true; };
  }, [photoPaths.join("|")]);
  const total = photoPaths.length + docCount;
  if (total === 0) return (
    <button type="button" onClick={onOpen} className="text-xs text-muted-foreground hover:text-foreground">
      <Badge variant="outline">brak</Badge>
    </button>
  );
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-1.5 group" title="Otwórz podgląd załączników">
      <div className="flex items-center gap-1">
        {urls.map((u, i) => (
          <img key={i} src={u} alt="" className="h-12 w-12 rounded object-cover border group-hover:ring-2 group-hover:ring-primary transition" loading="lazy" />
        ))}
        {docCount > 0 && (
          <div className="h-12 w-12 rounded border bg-muted flex flex-col items-center justify-center group-hover:ring-2 group-hover:ring-primary transition">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-medium">{docCount}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col text-[10px] text-muted-foreground leading-tight">
        <span><ImageIcon className="h-3 w-3 inline" /> {photoPaths.length}</span>
        <span><FileText className="h-3 w-3 inline" /> {docCount}</span>
      </div>
    </button>
  );
}

function SortHeader({ label, k, sort, setSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: SortDir }; setSort: (s: { key: SortKey; dir: SortDir }) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort({ key: k, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
      >
        {label} <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

function ApplicationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "updated_at", dir: "desc" });
  const [preview, setPreview] = useState<{ id: string; paths: string[]; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loan_applications")
      .select("id,status,loan_amount,completeness_percent,current_form_step,created_at,updated_at,source,return_link,missing_fields,merged_into_id,archived_at,client:clients(id,first_name,last_name,email,phone,source),properties(id,land_register_number,photos)")
      .is("merged_into_id", null)
      .is("archived_at", null)
      .neq("status", "archiwalny")
      .neq("status", "zamkniete")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (!error && data) {
      const list = data as any as Row[];

      // Bulk fetch document counts per loan_application (potrzebne też do auto-promocji)
      const ids = list.map((r) => r.id);
      if (ids.length > 0) {
        const { data: docs } = await supabase
          .from("documents")
          .select("loan_application_id")
          .in("loan_application_id", ids);
        const counts: Record<string, number> = {};
        for (const d of (docs ?? []) as { loan_application_id: string }[]) {
          counts[d.loan_application_id] = (counts[d.loan_application_id] ?? 0) + 1;
        }
        for (const r of list) r.docCount = counts[r.id] ?? 0;
      }

      // Auto-promocja: pełen komplet podstawowych danych (imię i nazwisko,
      // kontakt, kwota, POPRAWNY numer KW, zdjęcia lub dokumenty) => szukamy_inwestora.
      // Definicja kompletności = evaluateApplicationCore (wspólny moduł). Bez
      // kompletu wniosek zostaje w kompletowaniu danych — inwestor nie dostanie
      // anonimowej sprawy, do której nie da się zadzwonić.
      const toPromote = list.filter((r) => {
        if (!INCOMPLETE_STATUSES.includes(normalizeLoanStatus(r.status))) return false;
        return coreOf(r).complete;
      });
      if (toPromote.length > 0) {
        await supabase
          .from("loan_applications")
          .update({ status: "szukamy_inwestora", available_to_investors: true, completeness_percent: 100, updated_at: new Date().toISOString() })
          .in("id", toPromote.map((r) => r.id));
        // Update local list
        for (const p of toPromote) {
          const r = list.find((x) => x.id === p.id);
          if (r) { r.status = "szukamy_inwestora"; r.completeness_percent = 100; }
        }
      }
      setRows(list);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  // Wniosek = coś więcej niż same dane leada (imię/nazwisko/email/telefon).
  // Wystarczy kwota pożyczki, jakakolwiek nieruchomość (KW lub zdjęcia) albo dokument.
  const isApplication = (r: Row) => {
    if (r.loan_amount != null) return true;
    if ((r.docCount ?? 0) > 0) return true;
    for (const p of r.properties ?? []) {
      if (p.land_register_number && p.land_register_number.trim().length > 0) return true;
      if (Array.isArray(p.photos) && p.photos.length > 0) return true;
    }
    return false;
  };

  const applications = useMemo(() => rows.filter(isApplication), [rows]);

  // Klasyfikacja wg DANYCH, nie tylko statusu:
  //  - "complete"   — status kompletny I komplet podstawowych danych,
  //  - "attention"  — status kompletny, ale BRAKUJE danych (do korekty),
  //  - "incomplete" — wniosek jeszcze w kompletowaniu.
  const classify = (r: Row): "complete" | "attention" | "incomplete" => {
    if (COMPLETE_STATUSES.includes(normalizeLoanStatus(r.status))) {
      return coreOf(r).complete ? "complete" : "attention";
    }
    return "incomplete";
  };

  const counts = useMemo(() => {
    const c = { all: applications.length, incomplete: 0, complete: 0, attention: 0 };
    for (const r of applications) c[classify(r)]++;
    return c;
  }, [applications]);

  // Cofnij wniosek do kompletowania danych (zdejmij flagę dopuszczenia do inwestorów).
  const demote = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("loan_applications")
      .update({ status: "kompletowanie_danych", available_to_investors: false, completeness_percent: 0, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) { toast.error("Nie udało się cofnąć wniosku", { description: error.message }); return; }
    setRows((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, status: "kompletowanie_danych", completeness_percent: 0 } : r));
    toast.success(ids.length === 1 ? "Wniosek cofnięty do kompletowania" : `Cofnięto ${ids.length} wniosków do kompletowania`);
  };

  const filtered = useMemo(() => {
    const byTab = applications.filter((r) => {
      if (tab === "all") return true;
      return classify(r) === tab;
    });

    const out = byTab.filter((r) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      const c = r.client;
      return (
        (c?.first_name ?? "").toLowerCase().includes(s) ||
        (c?.last_name ?? "").toLowerCase().includes(s) ||
        (c?.email ?? "").toLowerCase().includes(s) ||
        (c?.phone ?? "").toLowerCase().includes(s) ||
        r.id.toLowerCase().includes(s)
      );
    });
    const getVal = (r: Row): string | number => {
      switch (sort.key) {
        case "name": return [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ").toLowerCase();
        case "status": return normalizeLoanStatus(r.status);
        case "loan_amount": return r.loan_amount ?? -1;
        case "media": return (r.properties ?? []).reduce((s, p) => s + (Array.isArray(p.photos) ? p.photos.length : 0), 0) + (r.docCount ?? 0);
        case "kw": return (r.properties ?? []).filter((p) => !!p.land_register_number).length;
        case "created_at": return new Date(r.created_at).getTime();
        case "updated_at":
        default: return new Date(r.updated_at).getTime();
      }
    };
    out.sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [applications, q, sort, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Wnioski</h1>
          <p className="text-sm text-muted-foreground">
            Wniosek jest „kompletny" dopiero z kompletem podstawowych danych: imię i nazwisko, kontakt, kwota, poprawny numer KW oraz zdjęcia lub dokumenty. Braki widać w kolumnie „Braki”; sprawy oznaczone jako kompletne mimo braków trafiają do zakładki „Do korekty”.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Odśwież
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 space-y-0">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">{filtered.length} wniosków</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList>
                <TabsTrigger value="all">Wszystkie ({counts.all})</TabsTrigger>
                <TabsTrigger value="incomplete">Niekompletne ({counts.incomplete})</TabsTrigger>
                <TabsTrigger value="complete">Kompletne ({counts.complete})</TabsTrigger>
                <TabsTrigger value="attention" className={counts.attention > 0 ? "text-amber-600 data-[state=active]:text-amber-700" : undefined}>
                  Do korekty ({counts.attention})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "attention" && filtered.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={() => void demote(filtered.map((r) => r.id))}
              >
                <Undo2 className="h-4 w-4 mr-2" /> Cofnij wszystkie ({filtered.length}) do kompletowania
              </Button>
            )}
          </div>
          <Input
            placeholder="Szukaj: imię, nazwisko, e-mail, telefon, ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          <Table className="w-full table-fixed text-sm [&_th]:text-xs">
            <TableHeader>
              <TableRow>
                <SortHeader label="Klient" k="name" sort={sort} setSort={setSort} className="w-[17%]" />
                <TableHead className="w-[15%]">Kontakt</TableHead>
                <SortHeader label="Status" k="status" sort={sort} setSort={setSort} className="w-[10%]" />
                <TableHead className="w-[13%]">Braki</TableHead>
                <SortHeader label="Kwota" k="loan_amount" sort={sort} setSort={setSort} className="text-right w-[9%]" />
                <SortHeader label="KW" k="kw" sort={sort} setSort={setSort} className="w-[13%]" />
                <SortHeader label="Pliki" k="media" sort={sort} setSort={setSort} className="w-[9%]" />
                <SortHeader label="Aktualizacja" k="updated_at" sort={sort} setSort={setSort} className="w-[8%]" />
                <TableHead className="text-right w-[6%]">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Ładowanie…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Brak wniosków.</TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const name = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "—";
                const kwNums = (r.properties ?? []).map((p) => p.land_register_number).filter((x): x is string => !!x && x.trim().length > 0);
                const allPhotos = (r.properties ?? []).flatMap((p) => Array.isArray(p.photos) ? p.photos : []);
                const canonStatus = normalizeLoanStatus(r.status);
                const isComplete = COMPLETE_STATUSES.includes(canonStatus);
                const core = coreOf(r);
                const needsFix = isComplete && !core.complete;
                // Źródło pozyskania leada (kanał wejścia) vs. źródło pól
                // pogłębionych. Meta Lead Ads to CZYSTY kanał pozyskania —
                // KW, kwota, zdjęcia nie mogą wejść tym kanałem, więc dla
                // takich pól pokazujemy neutralną ikonkę „?" zamiast Facebooka.
                const appSource = r.source;
                const clientSource = r.client?.source ?? appSource;
                const enrichedSource = enrichedFieldSource(appSource);
                return (
                  <TableRow key={r.id} className={needsFix ? "bg-amber-50/60" : undefined}>
                    <TableCell className="font-medium align-top">
                      <div className="flex items-center gap-1 truncate" title={name}>
                        <SourceIcon source={clientSource} title={`Imię i nazwisko — źródło: ${leadSourceLabel(clientSource)}`} />
                        <span className="truncate">{name}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate" title={leadSourceLabel(appSource)}>
                        {leadSourceLabel(appSource)}{r.current_form_step != null ? ` · krok ${r.current_form_step}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      <div className="flex items-center gap-1 truncate" title={r.client?.email ?? ""}>
                        {r.client?.email && <SourceIcon source={clientSource} title={`E-mail — źródło: ${leadSourceLabel(clientSource)}`} />}
                        <span className="truncate">{r.client?.email ?? "—"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground truncate" title={r.client?.phone ?? ""}>
                        {r.client?.phone && <SourceIcon source={clientSource} title={`Telefon — źródło: ${leadSourceLabel(clientSource)}`} />}
                        <span className="truncate">{r.client?.phone ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={needsFix ? "outline" : isComplete ? "default" : canonStatus === "nowy_lead" ? "secondary" : "outline"} className={`whitespace-normal text-[11px] leading-tight ${needsFix ? "border-amber-400 text-amber-700" : ""}`}>
                        {needsFix && <AlertTriangle className="h-3 w-3 mr-1 inline shrink-0" />}
                        {LOAN_STATUS_SHORT_LABELS[canonStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      {core.complete ? (
                        <span className="text-[11px] text-emerald-600">komplet</span>
                      ) : (
                        <div className="flex flex-wrap gap-0.5">
                          {missingLabels(core.missing).map((label) => (
                            <Badge key={label} variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30 px-1 py-0 font-normal">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top">
                      <div className="inline-flex items-center gap-1">
                        {r.loan_amount != null && <SourceIcon source={enrichedSource} title={`Kwota — źródło: ${leadSourceLabel(enrichedSource)}`} />}
                        <span>{fmtPLN(r.loan_amount as any)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      {kwNums.length === 0 ? (
                        <Badge variant="outline" className="text-muted-foreground">brak</Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {kwNums.map((k, i) => (
                            <span key={i} className="flex items-center gap-1 font-mono truncate" title={k}>
                              <SourceIcon source={enrichedSource} title={`Numer KW — źródło: ${leadSourceLabel(enrichedSource)}`} />
                              <span className="truncate">{k}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1">
                        {(allPhotos.length > 0 || (r.docCount ?? 0) > 0) && (
                          <SourceIcon source={enrichedSource} title={`Zdjęcia/dokumenty — źródło: ${leadSourceLabel(enrichedSource)}`} />
                        )}
                        <MediaThumbs photoPaths={allPhotos} docCount={r.docCount ?? 0} onOpen={() => setPreview({ id: r.id, paths: allPhotos, name })} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs align-top" title={`Utworzono: ${fmtDate(r.created_at)}`}>
                      {fmtDate(r.updated_at)}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setPreview({ id: r.id, paths: allPhotos, name })} title="Podgląd">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                          <Link to="/admin/wnioski/$id" params={{ id: r.id }}>Otwórz</Link>
                        </Button>
                        {needsFix && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-700 hover:text-amber-800 hover:bg-amber-100" onClick={() => void demote([r.id])} title="Cofnij do kompletowania danych">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {r.return_link && (
                          <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <a href={r.return_link} target="_blank" rel="noreferrer" title="Link zwrotny">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {preview && (
        <MediaPreviewDialog
          open={!!preview}
          onOpenChange={(v) => !v && setPreview(null)}
          loanApplicationId={preview.id}
          photoPaths={preview.paths}
          title={`Podgląd — ${preview.name}`}
        />
      )}
    </div>
  );
}
