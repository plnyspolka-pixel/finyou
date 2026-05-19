import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loanStatusLabels, formatPLN, formatDate, propertyTypeLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/admin/wnioski")({
  component: WnioskiPage,
});

type Row = {
  id: string;
  status: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  completeness_percent: number;
  source: string | null;
  created_at: string;
  client: { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
  properties: { property_type: string; city: string | null }[];
};

function WnioskiPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [propType, setPropType] = useState<string>("all");
  const [source, setSource] = useState<string>("all");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, preferred_period_months, completeness_percent, source, created_at, client:clients(first_name,last_name,phone,email), properties(property_type, city)")
        .order("created_at", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const sources = useMemo(() => Array.from(new Set(rows.map((r) => r.source).filter(Boolean) as string[])), [rows]);

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (propType !== "all" && !r.properties.some((p) => p.property_type === propType)) return false;
    if (source !== "all" && r.source !== source) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const fields = [r.client?.first_name, r.client?.last_name, r.client?.phone, r.client?.email, r.id];
    return fields.some((f) => (f ?? "").toLowerCase().includes(t));
  });

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
                    <TableHead>Kwota</TableHead>
                    <TableHead>Okres</TableHead>
                    <TableHead>Kompl.</TableHead>
                    <TableHead>Źródło</TableHead>
                    <TableHead>Utworzono</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.client ? `${r.client.first_name} ${r.client.last_name}` : "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.properties[0] ? `${propertyTypeLabels[r.properties[0].property_type] ?? r.properties[0].property_type}${r.properties[0].city ? ", " + r.properties[0].city : ""}` : "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{r.client?.phone ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.client?.email ?? "—"}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{loanStatusLabels[r.status] ?? r.status}</Badge></TableCell>
                      <TableCell>{formatPLN(r.loan_amount)}</TableCell>
                      <TableCell>{r.preferred_period_months ? `${r.preferred_period_months} mies.` : "—"}</TableCell>
                      <TableCell>{r.completeness_percent}%</TableCell>
                      <TableCell>{r.source ?? "—"}</TableCell>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        <Link to="/admin/wnioski/$id" params={{ id: r.id }} className="text-sm text-primary hover:underline">Otwórz</Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
