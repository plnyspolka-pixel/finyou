import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, visibilityLabels } from "@/lib/labels";

export const Route = createFileRoute("/admin/dokumenty")({
  component: DokumentyPage,
});

function DokumentyPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void (async () => {
    const { data } = await supabase.from("documents").select("*, loan:loan_applications(id, client:clients(first_name,last_name))").order("created_at", { ascending: false });
    setRows(data ?? []);
  })(); }, []);

  const openFile = async (path: string | null, url: string | null) => {
    if (url) { window.open(url, "_blank"); return; }
    if (!path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dokumenty</h1>
      <Card><CardHeader><CardTitle>Lista ({rows.length})</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Plik</TableHead><TableHead>Typ</TableHead><TableHead>Klient</TableHead><TableHead>Widoczność</TableHead><TableHead>Status</TableHead><TableHead>Dodano</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.file_name}</TableCell>
              <TableCell>{d.document_type}</TableCell>
              <TableCell>{d.loan?.client ? `${d.loan.client.first_name} ${d.loan.client.last_name}` : "—"}</TableCell>
              <TableCell><Badge variant="outline">{visibilityLabels[d.visibility_level]}</Badge></TableCell>
              <TableCell>{d.status ?? "—"}</TableCell>
              <TableCell>{formatDate(d.created_at)}</TableCell>
              <TableCell><div className="flex gap-3">
                {(d.file_path || d.file_url) && <button onClick={() => openFile(d.file_path, d.file_url)} className="text-sm text-primary hover:underline">Otwórz</button>}
                {d.loan?.id && <Link to="/admin/wnioski/$id" params={{ id: d.loan.id }} className="text-sm text-primary hover:underline">Wniosek</Link>}
              </div></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div></CardContent>
      </Card>
    </div>
  );
}
