import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, ExternalLink, RefreshCw } from "lucide-react";
import { MediaPreviewDialog } from "@/components/admin/MediaPreviewDialog";

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
  client: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  properties: Property[] | null;
  docCount?: number;
};

const INCOMPLETE_STATUSES = ["nowy_lead", "w_trakcie_uzupelniania"];
const COMPLETE_STATUSES = ["wniosek_kompletny", "do_analizy", "wyslany_do_inwestorow", "zaakceptowany", "odrzucony", "wyplacony", "zakonczony"];

const STATUS_LABEL: Record<string, string> = {
  nowy_lead: "Nowy lead",
  w_trakcie_uzupelniania: "W trakcie uzupełniania",
  wniosek_kompletny: "Kompletny",
  do_analizy: "Do analizy",
  wyslany_do_inwestorow: "Wysłany do inwestorów",
  zaakceptowany: "Zaakceptowany",
  odrzucony: "Odrzucony",
  wyplacony: "Wypłacony",
  zakonczony: "Zakończony",
};

function fmtPLN(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

type SortKey = "updated_at" | "created_at" | "loan_amount" | "completeness_percent" | "name" | "status" | "photos" | "kw";
type SortDir = "asc" | "desc";
type TabKey = "all" | "incomplete" | "complete";

function PhotoThumbs({ paths, onOpen }: { paths: string[]; onOpen: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (paths.length === 0) { setUrls([]); return; }
      const { data } = await supabase.storage.from("property-photos").createSignedUrls(paths.slice(0, 4), 60 * 60);
      if (!cancelled && data) setUrls(data.map((d) => d.signedUrl).filter(Boolean) as string[]);
    })();
    return () => { cancelled = true; };
  }, [paths.join("|")]);
  if (paths.length === 0) return <Badge variant="outline" className="text-muted-foreground">0</Badge>;
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-1 group" title="Otwórz podgląd">
      {urls.map((u, i) => (
        <img key={i} src={u} alt="" className="h-14 w-14 rounded object-cover border group-hover:ring-2 group-hover:ring-primary transition" loading="lazy" />
      ))}
      {paths.length > urls.length && (
        <span className="text-xs text-muted-foreground ml-1">+{paths.length - urls.length}</span>
      )}
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
      .select("id,status,loan_amount,completeness_percent,current_form_step,created_at,updated_at,source,return_link,missing_fields,client:clients(id,first_name,last_name,email,phone),properties(id,land_register_number,photos)")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (!error && data) {
      const list = data as any as Row[];
      // Auto-promote: KW + photos => wniosek_kompletny
      const toPromote = list.filter((r) => {
        if (!INCOMPLETE_STATUSES.includes(r.status)) return false;
        const hasKw = (r.properties ?? []).some((p) => !!p.land_register_number && p.land_register_number.trim().length > 0);
        const hasPhotos = (r.properties ?? []).some((p) => Array.isArray(p.photos) && p.photos.length > 0);
        return hasKw && hasPhotos;
      });
      if (toPromote.length > 0) {
        await supabase
          .from("loan_applications")
          .update({ status: "wniosek_kompletny", completeness_percent: 100, updated_at: new Date().toISOString() })
          .in("id", toPromote.map((r) => r.id));
        // Update local list
        for (const p of toPromote) {
          const r = list.find((x) => x.id === p.id);
          if (r) { r.status = "wniosek_kompletny"; r.completeness_percent = 100; }
        }
      }
      setRows(list);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    incomplete: rows.filter((r) => INCOMPLETE_STATUSES.includes(r.status)).length,
    complete: rows.filter((r) => COMPLETE_STATUSES.includes(r.status)).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const byTab = rows.filter((r) => {
      if (tab === "incomplete") return INCOMPLETE_STATUSES.includes(r.status);
      if (tab === "complete") return COMPLETE_STATUSES.includes(r.status);
      return true;
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
        case "status": return r.status;
        case "loan_amount": return r.loan_amount ?? -1;
        case "completeness_percent": return r.completeness_percent ?? -1;
        case "photos": return (r.properties ?? []).reduce((s, p) => s + (Array.isArray(p.photos) ? p.photos.length : 0), 0);
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
  }, [rows, q, sort, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Wnioski</h1>
          <p className="text-sm text-muted-foreground">
            Wszystkie wnioski — kompletne i niekompletne. Po dodaniu numeru KW oraz zdjęć wniosek zostaje automatycznie oznaczony jako kompletny.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Odśwież
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 space-y-0">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">{filtered.length} wniosków</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList>
                <TabsTrigger value="all">Wszystkie ({counts.all})</TabsTrigger>
                <TabsTrigger value="incomplete">Niekompletne ({counts.incomplete})</TabsTrigger>
                <TabsTrigger value="complete">Kompletne ({counts.complete})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Input
            placeholder="Szukaj: imię, nazwisko, e-mail, telefon, ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1400px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_th]:text-xs">
            <TableHeader>
              <TableRow>
                <SortHeader label="Klient" k="name" sort={sort} setSort={setSort} />
                <TableHead>Kontakt</TableHead>
                <SortHeader label="Status" k="status" sort={sort} setSort={setSort} />
                <SortHeader label="Kwota" k="loan_amount" sort={sort} setSort={setSort} className="text-right" />
                <SortHeader label="Kompletność" k="completeness_percent" sort={sort} setSort={setSort} className="text-center" />
                <TableHead className="text-center">Krok</TableHead>
                <SortHeader label="KW" k="kw" sort={sort} setSort={setSort} />
                <SortHeader label="Zdjęcia" k="photos" sort={sort} setSort={setSort} />
                <TableHead>Źródło</TableHead>
                <SortHeader label="Utworzono" k="created_at" sort={sort} setSort={setSort} />
                <SortHeader label="Aktualizacja" k="updated_at" sort={sort} setSort={setSort} />
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Ładowanie…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Brak wniosków.</TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const name = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "—";
                const pct = r.completeness_percent ?? 0;
                const kwNums = (r.properties ?? []).map((p) => p.land_register_number).filter((x): x is string => !!x && x.trim().length > 0);
                const allPhotos = (r.properties ?? []).flatMap((p) => Array.isArray(p.photos) ? p.photos : []);
                const isComplete = COMPLETE_STATUSES.includes(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-xs">
                      <div>{r.client?.email ?? "—"}</div>
                      <div className="text-muted-foreground">{r.client?.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isComplete ? "default" : r.status === "nowy_lead" ? "secondary" : "outline"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPLN(r.loan_amount as any)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="h-1.5 w-16 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs">{r.current_form_step ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {kwNums.length === 0 ? (
                        <Badge variant="outline" className="text-muted-foreground">brak</Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {kwNums.map((k, i) => <span key={i} className="font-mono">{k}</span>)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <PhotoThumbs paths={allPhotos} onOpen={() => setPreview({ id: r.id, paths: allPhotos, name })} />
                    </TableCell>
                    <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setPreview({ id: r.id, paths: allPhotos, name })} title="Podgląd dokumentów i zdjęć">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/admin/wnioski/$id" params={{ id: r.id }}>Otwórz</Link>
                        </Button>
                        {r.return_link && (
                          <Button asChild size="sm" variant="ghost">
                            <a href={r.return_link} target="_blank" rel="noreferrer">
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
