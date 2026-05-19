import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPLN, offerStatusLabels, formatDate } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/oferty")({
  component: InwestorOferty,
});

function InwestorOferty() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  useEffect(() => { if (!user) return; void (async () => {
    const { data: inv } = await supabase.from("investors").select("id").eq("user_id", user.id).maybeSingle();
    if (!inv) return;
    const { data } = await supabase.from("investor_offers").select("*").eq("investor_id", inv.id).order("created_at", { ascending: false });
    setOffers(data ?? []);
  })(); }, [user]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Moje oferty ({offers.length})</h1>
      <Card><CardContent className="pt-6"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Kwota</TableHead><TableHead>Okres</TableHead><TableHead>Zysk</TableHead><TableHead>Rata</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{offers.map((o) => (
          <TableRow key={o.id}>
            <TableCell>{formatDate(o.created_at)}</TableCell>
            <TableCell>{formatPLN(o.proposed_amount)}</TableCell>
            <TableCell>{o.period_months} mies.</TableCell>
            <TableCell>{o.expected_yearly_yield ?? "—"}%</TableCell>
            <TableCell>{formatPLN(o.estimated_monthly_payment)}</TableCell>
            <TableCell><Badge variant="secondary">{offerStatusLabels[o.offer_status]}</Badge></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></div></CardContent></Card>
    </div>
  );
}
