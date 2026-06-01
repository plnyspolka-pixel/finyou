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
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase.from("loan_applications").select("id, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, visibility_level, properties(property_type, city, voivodeship, estimated_value, area_sqm, photos)").eq("available_to_investors", true).order("created_at", { ascending: false });
    setApps(data ?? []); setLoading(false);
  })(); }, [user]);

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Dostępne wnioski ({apps.length})</h1><p className="text-sm text-muted-foreground">Wnioski dopuszczone do inwestorów.</p></div>
      {apps.length === 0 ? <p className="text-sm text-muted-foreground">Brak dostępnych wniosków.</p> :
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{apps.map((a) => {
          const p = a.properties?.[0];
          return (
            <Link key={a.id} to="/inwestor/wniosek/$id" params={{ id: a.id }}>
              <Card className="hover:border-primary transition cursor-pointer h-full overflow-hidden">
                <div className="relative">
                  {p?.photos?.[0] ? (
                    <img src={p.photos[0]} alt="" className="h-40 w-full object-cover" loading="lazy" />
                  ) : <div className="h-40 w-full bg-gradient-to-br from-muted to-muted-foreground/20" />}
                  {a.annual_investor_rate != null && (
                    <div className="absolute top-2 right-2 rounded-lg bg-primary/95 text-primary-foreground px-3 py-1.5 shadow-lg backdrop-blur-sm">
                      <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none">Zysk roczny</div>
                      <div className="text-xl font-bold leading-tight tabular-nums">{Number(a.annual_investor_rate)}%</div>
                    </div>
                  )}
                </div>
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
