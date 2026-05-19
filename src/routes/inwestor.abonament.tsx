import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { subscriptionPlanLabels, subscriptionStatusLabels, formatDate } from "@/lib/labels";
import { toast } from "sonner";

export const Route = createFileRoute("/inwestor/abonament")({
  component: InwestorAbonament,
});

const PLANS = [
  { key: "podstawowy", label: "Podstawowy", price: "199 PLN / mies.", features: ["Dostęp do listy wniosków", "Składanie ofert", "Podstawowe filtry"] },
  { key: "rozszerzony", label: "Rozszerzony", price: "399 PLN / mies.", features: ["Wszystko z planu Podstawowego", "Pełne dane wniosków", "Powiadomienia e-mail"] },
  { key: "profesjonalny", label: "Profesjonalny", price: "899 PLN / mies.", features: ["Wszystko z planu Rozszerzonego", "Priorytetowy dostęp", "Wsparcie dedykowane"] },
];

function InwestorAbonament() {
  const { user } = useAuth();
  const [inv, setInv] = useState<any | null>(null);
  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("investors").select("*").eq("user_id", user.id).maybeSingle();
    setInv(data);
  };
  useEffect(() => { void load(); }, [user]);

  const activate = async (plan: string) => {
    if (!user) return;
    if (!inv) {
      const { error } = await supabase.from("investors").insert({
        user_id: user.id, first_name: user.user_metadata?.first_name ?? null, last_name: user.user_metadata?.last_name ?? null,
        email: user.email, investor_type: "indywidualny", subscription_plan: plan as any, subscription_status: "aktywny",
        subscription_source: "manual", subscription_active_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("investors").update({
        subscription_plan: plan as any, subscription_status: "aktywny",
        subscription_active_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq("id", inv.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Abonament aktywowany (mock — bez płatności)");
    void load();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div><h1 className="text-2xl font-bold">Abonament</h1><p className="text-sm text-muted-foreground">Płatność Stripe zostanie podpięta w kolejnym wydaniu — aktywacja działa w trybie testowym.</p></div>
      {inv && <Card><CardHeader><CardTitle>Twój status</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Plan:</span> <b>{inv.subscription_plan ? subscriptionPlanLabels[inv.subscription_plan] : "—"}</b></div>
          <div><span className="text-muted-foreground">Status:</span> <Badge>{inv.subscription_status ? subscriptionStatusLabels[inv.subscription_status] : "—"}</Badge></div>
          <div><span className="text-muted-foreground">Aktywny do:</span> {formatDate(inv.subscription_active_until)}</div>
        </CardContent>
      </Card>}
      <div className="grid gap-4 md:grid-cols-3">{PLANS.map((p) => (
        <Card key={p.key}>
          <CardHeader><CardTitle>{p.label}</CardTitle><div className="text-2xl font-bold">{p.price}</div></CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-sm space-y-1 text-muted-foreground">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>
            <Button className="w-full" onClick={() => void activate(p.key)}>Aktywuj</Button>
          </CardContent>
        </Card>
      ))}</div>
    </div>
  );
}
