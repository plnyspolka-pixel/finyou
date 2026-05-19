import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { contactChannelLabels, contactDirectionLabels, formatDateTime } from "@/lib/labels";

export const Route = createFileRoute("/admin/follow-up")({
  component: FollowUpPage,
});

function FollowUpPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void (async () => {
    const { data } = await supabase.from("contact_events").select("*, loan:loan_applications(id, client:clients(first_name,last_name))").order("created_at", { ascending: false }).limit(200);
    setRows(data ?? []);
  })(); }, []);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Follow-up / Historia kontaktu</h1><p className="text-sm text-muted-foreground">Ostatnie 200 zdarzeń kontaktowych.</p></div>
      <Card><CardContent className="pt-6"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Kanał</TableHead><TableHead>Kierunek</TableHead><TableHead>Klient</TableHead><TableHead>Temat / Treść</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((e) => (
          <TableRow key={e.id}>
            <TableCell>{formatDateTime(e.created_at)}</TableCell>
            <TableCell><Badge variant="outline">{contactChannelLabels[e.channel]}</Badge></TableCell>
            <TableCell><Badge variant="outline">{contactDirectionLabels[e.direction]}</Badge></TableCell>
            <TableCell>{e.loan?.client ? `${e.loan.client.first_name} ${e.loan.client.last_name}` : "—"}</TableCell>
            <TableCell className="max-w-md"><div className="font-medium">{e.subject ?? "—"}</div><div className="text-xs text-muted-foreground truncate">{e.content ?? ""}</div></TableCell>
            <TableCell>{e.loan?.id && <Link to="/admin/wnioski/$id" params={{ id: e.loan.id }} className="text-sm text-primary hover:underline">Wniosek</Link>}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></div></CardContent></Card>
    </div>
  );
}
