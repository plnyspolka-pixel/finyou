import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/wnioski-niekompletne")({
  component: IncompleteApplicationsPage,
});

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
  properties: { land_register_number: string | null; photos: any }[] | null;
};

const STATUS_LABEL: Record<string, string> = {
  nowy_lead: "Nowy lead",
  w_trakcie_uzupelniania: "W trakcie uzupełniania",
  wniosek_kompletny: "Kompletny",
  do_analizy: "Do analizy",
  wyslany_do_inwestorow: "Wysłany do inwestorów",
};

function fmtPLN(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function IncompleteApplicationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loan_applications")
      .select("id,status,loan_amount,completeness_percent,current_form_step,created_at,updated_at,source,return_link,missing_fields,client:clients(id,first_name,last_name,email,phone),properties(land_register_number,photos)")
      .in("status", ["nowy_lead", "w_trakcie_uzupelniania"])
      .order("updated_at", { ascending: false })
      .limit(500);
    if (!error && data) setRows(data as any);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) => {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Niekompletne wnioski</h1>
          <p className="text-sm text-muted-foreground">Wnioski porzucone lub w trakcie wypełniania (status: nowy lead, w trakcie uzupełniania).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Odśwież
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">{filtered.length} wniosków</CardTitle>
          <Input
            placeholder="Szukaj: imię, nazwisko, e-mail, telefon, ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Klient</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead className="text-center">Kompletność</TableHead>
                <TableHead className="text-center">Krok</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead>Utworzono</TableHead>
                <TableHead>Aktualizacja</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Ładowanie…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Brak niekompletnych wniosków.</TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const name = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "—";
                const pct = r.completeness_percent ?? 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-xs">
                      <div>{r.client?.email ?? "—"}</div>
                      <div className="text-muted-foreground">{r.client?.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "nowy_lead" ? "secondary" : "outline"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtPLN(r.loan_amount as any)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="h-1.5 w-16 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs">{r.current_form_step ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
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
    </div>
  );
}
