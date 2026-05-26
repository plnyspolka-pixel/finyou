import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/labels";
import { LogIn } from "lucide-react";
import { loginAsUser } from "@/lib/impersonate-client";

export const Route = createFileRoute("/admin/klienci")({
  component: KlienciPage,
});

function KlienciPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { void (async () => {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  })(); }, []);
  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || [r.first_name, r.last_name, r.phone, r.email].some((v) => (v ?? "").toLowerCase().includes(t));
  });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Klienci</h1><p className="text-sm text-muted-foreground">Baza klientów ({rows.length}).</p></div>
      <Card>
        <CardHeader><Input placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" /><CardTitle className="text-sm text-muted-foreground mt-2">Wyniki: {filtered.length}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Klient</TableHead><TableHead>Telefon</TableHead><TableHead>E-mail</TableHead><TableHead>Źródło</TableHead><TableHead>RODO</TableHead><TableHead>Dodano</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell><TableCell>{r.email ?? "—"}</TableCell>
                <TableCell>{r.source ?? "—"}</TableCell><TableCell>{r.consent_rodo ? "✓" : "✗"}</TableCell>
                <TableCell>{formatDate(r.created_at)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={!r.email} onClick={() => void loginAsUser(r.email)}>
                    <LogIn className="mr-1 h-3 w-3" /> Zaloguj jako
                  </Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></div>
        </CardContent>
      </Card>
    </div>
  );
}
