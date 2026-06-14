import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loanStatusLabels, formatPLN, formatDate, propertyTypeLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Download, FileText, Phone, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type CommSummary = { calls: number; sms: number; emails: number; lastAt: string | null };
const EMPTY_COMM: CommSummary = { calls: 0, sms: 0, emails: 0, lastAt: null };

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) {
    const h = Math.floor(diff / 3600000);
    if (h <= 0) return "przed chwilą";
    return `${h}h temu`;
  }
  if (d === 1) return "wczoraj";
  if (d < 7) return `${d} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}

export const Route = createFileRoute("/admin/wnioski/")({
  component: WnioskiPage,
});

type DocRow = { id: string; document_type: string | null; file_name: string | null; file_path: string | null };
type PropRow = { property_type: string; city: string | null; land_register_number: string | null; estimated_value: number | null; photos: string[] | null };

type Row = {
  id: string;
  status: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  completeness_percent: number;
  source: string | null;
  created_at: string;
  client: { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
  properties: PropRow[];
  documents: DocRow[];
};

function WnioskiPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [propType, setPropType] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [completeness, setCompleteness] = useState<"all" | "complete" | "incomplete">("all");

  const [comms, setComms] = useState<Record<string, CommSummary>>({});

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, preferred_period_months, completeness_percent, source, created_at, client:clients(first_name,last_name,phone,email), properties(property_type, city, land_register_number, estimated_value, photos), documents(id, document_type, file_name, file_path)")
        .order("created_at", { ascending: false });
      const list = (data as unknown as Row[]) ?? [];
      setRows(list);
      setLoading(false);

      // liczniki komunikacji per klient (po telefonie / e-mailu)
      const phones = Array.from(new Set(list.map((r) => r.client?.phone).filter(Boolean) as string[]));
      const emails = Array.from(new Set(list.map((r) => r.client?.email).filter(Boolean) as string[]));
      const all: any[] = [];
      if (phones.length) {
        const { data: c1 } = await supabase
          .from("lead_communications")
          .select("phone_normalized, email, channel, created_at")
          .in("phone_normalized", phones);
        if (c1) all.push(...c1);
      }
      if (emails.length) {
        const { data: c2 } = await supabase
          .from("lead_communications")
          .select("phone_normalized, email, channel, created_at")
          .in("email", emails);
        if (c2) all.push(...c2);
      }
      const map: Record<string, CommSummary> = {};
      for (const r of list) {
        const key = r.id;
        const s: CommSummary = { calls: 0, sms: 0, emails: 0, lastAt: null };
        for (const c of all) {
          const match = (r.client?.phone && c.phone_normalized === r.client.phone)
            || (r.client?.email && c.email === r.client.email);
          if (!match) continue;
          if (c.channel === "voicebot_call" || c.channel === "call") s.calls += 1;
          else if (c.channel === "sms") s.sms += 1;
          else if (c.channel === "email") s.emails += 1;
          if (!s.lastAt || new Date(c.created_at) > new Date(s.lastAt)) s.lastAt = c.created_at;
        }
        map[key] = s;
      }
      setComms(map);
    })();
  }, []);

  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean) as string[])), [rows]);

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (propType !== "all" && !r.properties.some((p) => p.property_type === propType)) return false;
    if (source !== "all" && r.source !== source) return false;
    if (completeness === "complete" && (r.completeness_percent ?? 0) < 100) return false;
    if (completeness === "incomplete" && (r.completeness_percent ?? 0) >= 100) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const fields = [r.client?.first_name, r.client?.last_name, r.client?.phone, r.client?.email, r.id];
    return fields.some((f) => (f ?? "").toLowerCase().includes(t));
  });

  const counts = useMemo(() => {
    const all = rows.length;
    const complete = rows.filter((r) => (r.completeness_percent ?? 0) >= 100).length;
    return { all, complete, incomplete: all - complete };
  }, [rows]);

  const exportCsv = () => {
    const header = ["ID", "Imię", "Nazwisko", "Telefon", "E-mail", "Status", "Kwota", "Okres", "Źródło", "Utworzono"];
    const lines = filtered.map((r) => [
      r.id, r.client?.first_name ?? "", r.client?.last_name ?? "", r.client?.phone ?? "", r.client?.email ?? "",
      loanStatusLabels[r.status] ?? r.status, r.loan_amount ?? "", r.preferred_period_months ?? "", r.source ?? "", r.created_at,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `wnioski-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wnioski</h1>
          <p className="text-sm text-muted-foreground">Wszystkie wnioski pożyczkowe z filtrami i wyszukiwaniem.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> Eksportuj CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { v: "all", label: `Wszystkie (${counts.all})` },
          { v: "complete", label: `Kompletne (${counts.complete})` },
          { v: "incomplete", label: `Niekompletne (${counts.incomplete})` },
        ] as const).map((t) => (
          <Button
            key={t.v}
            variant={completeness === t.v ? "default" : "outline"}
            size="sm"
            onClick={() => setCompleteness(t.v)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Szukaj (imię, nazwisko, telefon, e-mail, ID)" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie statusy</SelectItem>
                {Object.entries(loanStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={propType} onValueChange={setPropType}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Typ nieruchomości" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie typy</SelectItem>
                {Object.entries(propertyTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Źródło" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie źródła</SelectItem>
                {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <CardTitle className="text-sm font-medium text-muted-foreground">Znaleziono: {filtered.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Ładowanie…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klient</TableHead>
                    <TableHead>Kontakt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nieruchomość</TableHead>
                    <TableHead>Kwota / Okres</TableHead>
                    <TableHead>Zdjęcia</TableHead>
                    <TableHead>Dokumenty</TableHead>
                    <TableHead>Kompl.</TableHead>
                    <TableHead>Źródło</TableHead>
                    <TableHead>Utworzono</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const p = r.properties[0];
                    return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.client ? `${r.client.first_name} ${r.client.last_name}` : "—"}</div>
                        <div className="text-xs text-muted-foreground">ID: {r.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{r.client?.phone ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.client?.email ?? "—"}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{loanStatusLabels[r.status] ?? r.status}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {p ? (
                          <>
                            <div className="font-medium">{propertyTypeLabels[p.property_type] ?? p.property_type}</div>
                            <div className="text-xs text-muted-foreground">{p.city ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">KW: {p.land_register_number ?? "—"}</div>
                            {p.estimated_value ? <div className="text-xs text-muted-foreground">Wartość: {formatPLN(p.estimated_value)}</div> : null}
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{formatPLN(r.loan_amount)}</div>
                        <div className="text-xs text-muted-foreground">{r.preferred_period_months ? `${r.preferred_period_months} mies.` : "—"}</div>
                      </TableCell>
                      <TableCell>
                        <PhotosCell paths={p?.photos ?? []} />
                      </TableCell>
                      <TableCell>
                        <DocumentsCell docs={r.documents ?? []} />
                      </TableCell>
                      <TableCell>{r.completeness_percent}%</TableCell>
                      <TableCell>{r.source ?? "—"}</TableCell>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        <Link to="/admin/wnioski/$id" params={{ id: r.id }} className="text-sm text-primary hover:underline">Otwórz</Link>
                      </TableCell>
                    </TableRow>
                  );})}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|avif)$/i;

async function signUrls(bucket: string, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}

function PhotosCell({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || Object.keys(urls).length) return;
    void signUrls("property-photos", paths).then(setUrls);
  }, [open, paths, urls]);
  if (!paths.length) return <span className="text-xs text-muted-foreground">brak</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1">
          <FileText className="h-3.5 w-3.5" /> {paths.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2">
        <div className="grid grid-cols-3 gap-2 max-h-96 overflow-auto">
          {paths.map((p) => (
            <a key={p} href={urls[p] ?? "#"} target="_blank" rel="noreferrer" className="block aspect-square rounded overflow-hidden bg-muted">
              {urls[p] ? (
                <img src={urls[p]} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full animate-pulse" />
              )}
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DocumentsCell({ docs }: { docs: DocRow[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || Object.keys(urls).length) return;
    const paths = docs.map((d) => d.file_path).filter((x): x is string => !!x);
    void signUrls("documents", paths).then(setUrls);
  }, [open, docs, urls]);

  const openDoc = (path: string | null) => {
    const url = path ? urls[path] : undefined;
    if (!url) { toast.error("Nie udało się pobrać dokumentu"); return; }
    window.open(url, "_blank");
  };

  if (!docs.length) return <span className="text-xs text-muted-foreground">brak</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1">
          <FileText className="h-3.5 w-3.5" /> {docs.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2">
        <div className="grid grid-cols-3 gap-2 max-h-96 overflow-auto">
          {docs.map((d) => {
            const isImg = d.file_name && IMAGE_RE.test(d.file_name);
            const url = d.file_path ? urls[d.file_path] : undefined;
            return (
              <button
                key={d.id}
                onClick={() => openDoc(d.file_path)}
                className="block aspect-square rounded overflow-hidden bg-muted relative group"
                title={d.file_name ?? d.document_type ?? "Dokument"}
              >
                {isImg && url ? (
                  <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                    <FileText className="h-6 w-6 text-muted-foreground mb-1" />
                    <div className="text-[10px] text-muted-foreground truncate w-full">{d.document_type ?? d.file_name ?? "Plik"}</div>
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition">
                  {d.file_name ?? d.document_type ?? "Dokument"}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
