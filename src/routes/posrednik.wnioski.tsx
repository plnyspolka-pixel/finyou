import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, FilePlus2 } from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/posrednik/wnioski")({
  component: MojeWnioski,
});

function MojeWnioski() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, preferred_period_months, created_at, client:clients(full_name, city), properties(city, property_type)")
        .eq("assigned_operator", user.id)
        .order("created_at", { ascending: false });
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Twoje wnioski"
        title="Moje wnioski"
        subtitle="Wnioski wprowadzone przez Ciebie lub przypisane do Twojej obsługi."
        actions={
          <Button asChild>
            <Link to="/wniosek-formularz"><FilePlus2 className="mr-2 h-4 w-4" />Wprowadź nowy wniosek</Link>
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Ładowanie…</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nie masz jeszcze żadnych wniosków. Kliknij „Wprowadź nowy wniosek", aby dodać pierwszy.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const p = Array.isArray(r.properties) ? r.properties[0] : r.properties;
            const city = p?.city ?? r.client?.city ?? "—";
            return (
              <Link key={r.id} to="/admin/wnioski/$id" params={{ id: r.id }} className="block">
                <Card className="transition hover:border-primary">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="space-y-1">
                      <div className="font-medium">{r.client?.full_name ?? "Klient"} · {formatPLN(Number(r.loan_amount) || 0)}</div>
                      <div className="text-xs text-muted-foreground">
                        {city} · {r.preferred_period_months ?? "—"} mies. · {new Date(r.created_at).toLocaleDateString("pl-PL")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{loanStatusLabels[r.status as keyof typeof loanStatusLabels] ?? r.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
