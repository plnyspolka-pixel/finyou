import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/admin/nieruchomosci")({
  component: NieruchomosciPage,
});

function NieruchomosciPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void (async () => {
    const { data } = await supabase.from("properties").select("*, loan:loan_applications(id, client:clients(first_name,last_name))").order("created_at", { ascending: false });
    setRows(data ?? []);
  })(); }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nieruchomości</h1>
      <Card><CardHeader><CardTitle>Lista ({rows.length})</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Zdjęcie</TableHead><TableHead>Typ</TableHead><TableHead>Lokalizacja</TableHead><TableHead>Powierzchnia</TableHead><TableHead>Wartość</TableHead><TableHead>KW</TableHead><TableHead>Klient</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.photos?.[0] ? <img src={r.photos[0]} alt="" className="h-14 w-20 object-cover rounded" loading="lazy" /> : <div className="h-14 w-20 bg-muted rounded" />}</TableCell>
              <TableCell>{propertyTypeLabels[r.property_type] ?? r.property_type}</TableCell>
              <TableCell>{[r.city, r.voivodeship].filter(Boolean).join(", ") || "—"}</TableCell>
              <TableCell>{r.area_sqm ? `${r.area_sqm} m²` : "—"}</TableCell>
              <TableCell>{formatPLN(r.estimated_value)}</TableCell>
              <TableCell className="font-mono text-xs">{r.land_register_number ?? "—"}</TableCell>
              <TableCell>{r.loan?.client ? `${r.loan.client.first_name} ${r.loan.client.last_name}` : "—"}</TableCell>
              <TableCell>{r.loan?.id && <Link to="/admin/wnioski/$id" params={{ id: r.loan.id }} className="text-primary hover:underline text-sm">Wniosek</Link>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div></CardContent>
      </Card>
    </div>
  );
}
