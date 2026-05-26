import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatPLN, offerStatusLabels } from "@/lib/labels";
import { Check, X, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/klient/oferta")({
  component: KlientOferta,
});

function KlientOferta() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const load = async () => {
    if (!user) return;
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!c) return;
    const { data: ls } = await supabase.from("loan_applications").select("id").eq("client_id", c.id);
    const ids = (ls ?? []).map((l) => l.id);
    if (ids.length === 0) return;
    const { data } = await supabase.from("investor_offers").select("*").in("loan_application_id", ids).in("offer_status", ["zlozona", "wyslana_do_klienta", "zaakceptowana_przez_klienta", "odrzucona_przez_klienta"]).order("created_at", { ascending: false });
    setOffers(data ?? []);
  };
  useEffect(() => { void load(); }, [user]);

  const decide = async (id: string, status: "zaakceptowana_przez_klienta" | "odrzucona_przez_klienta") => {
    const { error } = await supabase.from("investor_offers").update({ offer_status: status as any, client_decision_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano decyzję"); void load();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Oferty inwestorów</h1>
      {offers.length === 0 ? <p className="text-sm text-muted-foreground">Brak ofert do wyświetlenia.</p> :
        offers.map((o) => (
          <Card key={o.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Oferta {formatPLN(o.proposed_amount)}</CardTitle>
              <Badge>{offerStatusLabels[o.offer_status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid gap-1 md:grid-cols-2">
                <div><span className="text-muted-foreground">Okres:</span> <b>{o.period_months} mies.</b></div>
                <div><span className="text-muted-foreground">Zysk roczny:</span> <b>{o.expected_yearly_yield ?? "—"}%</b></div>
                <div><span className="text-muted-foreground">Rata miesięczna:</span> <b>{formatPLN(o.estimated_monthly_payment)}</b></div>
                <div><span className="text-muted-foreground">Całkowity koszt:</span> <b>{formatPLN(o.estimated_total_cost)}</b></div>
                <div><span className="text-muted-foreground">Spłata:</span> {o.repayment_type}</div>
                {o.has_balloon && <div><span className="text-muted-foreground">Balon:</span> {formatPLN(o.balloon_amount)}</div>}
              </div>
              {(o.offer_status === "wyslana_do_klienta" || o.offer_status === "zlozona") && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => void decide(o.id, "zaakceptowana_przez_klienta")} className="bg-emerald-600 hover:bg-emerald-600/90"><Check className="mr-2 h-4 w-4" />Akceptuję</Button>
                  <Button variant="outline" onClick={() => toast.info("Skontaktujemy się z Tobą wkrótce")}><MessageCircle className="mr-2 h-4 w-4" />Mam pytania</Button>
                  <Button variant="destructive" onClick={() => void decide(o.id, "odrzucona_przez_klienta")}><X className="mr-2 h-4 w-4" />Odrzucam</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
