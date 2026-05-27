import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSignature } from "lucide-react";
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
  const accepted = offers.filter((o) => o.offer_status === "zaakceptowana_przez_klienta");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Moje oferty ({offers.length})</h1>
      {accepted.length > 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">
              {accepted.length === 1 ? "Klient zaakceptował Twoją ofertę." : `Klienci zaakceptowali ${accepted.length} Twoich ofert.`}
            </p>
            <p className="text-muted-foreground mt-1">
              Operator Finance You przygotuje umowę pożyczki w kreatorze umów na podstawie warunków oferty oraz danych z wniosku i Twojego profilu. Skontaktujemy się aby uzgodnić termin podpisania.
            </p>
          </CardContent>
        </Card>
      )}
      <Card><CardContent className="pt-6"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Kwota</TableHead><TableHead>Okres</TableHead><TableHead>Zysk</TableHead><TableHead>Rata</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{offers.map((o) => (
          <TableRow key={o.id}>
            <TableCell>{formatDate(o.created_at)}</TableCell>
            <TableCell>{formatPLN(o.proposed_amount)}</TableCell>
            <TableCell>{o.period_months} mies.</TableCell>
            <TableCell>{o.expected_yearly_yield ?? "—"}%</TableCell>
            <TableCell>{formatPLN(o.estimated_monthly_payment)}</TableCell>
            <TableCell><Badge variant={o.offer_status === "zaakceptowana_przez_klienta" ? "default" : "secondary"}>{offerStatusLabels[o.offer_status]}</Badge></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></div></CardContent></Card>
    </div>
  );
}
