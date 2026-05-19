import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPLN, propertyTypeLabels, visibilityLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/")({
  component: InwestorList,
});

function InwestorList() {
  const { user } = useAuth();
  const [apps, setApps] = useState<any[]>([]);
  const [paywall, setPaywall] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!user) return; void (async () => {
    const { data: inv } = await supabase.from("investors").select("subscription_status").eq("user_id", user.id).maybeSingle();
    if (!inv || inv.subscription_status !== "aktywny") { setPaywall(true); setLoading(false); return; }
    const { data } = await supabase.from("loan_applications").select("id, loan_amount, preferred_period_months, estimated_ltv, visibility_level, properties(property_type, city, voivodeship, estimated_value, area_sqm)").eq("available_to_investors", true).order("created_at", { ascending: false });
    setApps(data ?? []); setLoading(false);
  })(); }, [user]);

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;

  if (paywall) return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dostępne wnioski</h1>
      <Card><CardHeader><CardTitle>Aktywuj abonament</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-3">
          <p className="text-muted-foreground">Aby zobaczyć dostępne wnioski, aktywuj jeden z planów abonamentowych.</p>
          <Link to="/inwestor/abonament" className="inline-flex text-primary hover:underline">Przejdź do abonamentu →</Link>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Dostępne wnioski ({apps.length})</h1><p className="text-sm text-muted-foreground">Wnioski dopuszczone do inwestorów.</p></div>
      {apps.length === 0 ? <p className="text-sm text-muted-foreground">Brak dostępnych wniosków.</p> :
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{apps.map((a) => {
          const p = a.properties?.[0];
          return (
            <Link key={a.id} to="/inwestor/wniosek/$id" params={{ id: a.id }}>
              <Card className="hover:border-primary transition cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between"><CardTitle className="text-lg">{formatPLN(a.loan_amount)}</CardTitle><Badge variant="outline">{visibilityLabels[a.visibility_level]}</Badge></div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Okres:</span> {a.preferred_period_months ?? "—"} mies.</div>
                  {p && <>
                    <div><span className="text-muted-foreground">Nieruchomość:</span> {propertyTypeLabels[p.property_type]} · {p.city ?? "—"}</div>
                    <div><span className="text-muted-foreground">Wartość:</span> {formatPLN(p.estimated_value)}</div>
                    <div><span className="text-muted-foreground">Powierzchnia:</span> {p.area_sqm ? `${p.area_sqm} m²` : "—"}</div>
                  </>}
                  {a.estimated_ltv && <div><span className="text-muted-foreground">LTV:</span> {a.estimated_ltv}%</div>}
                </CardContent>
              </Card>
            </Link>
          );
        })}</div>}
    </div>
  );
}
