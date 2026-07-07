import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, FilePlus2, FileText, ImageIcon } from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/posrednik/wnioski")({
  component: MojeWnioski,
});

type Row = {
  id: string;
  status: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  created_at: string;
  client: { first_name?: string; last_name?: string; city?: string } | null;
  properties: Array<{ city?: string; property_type?: string; photos?: string[] | null; land_register_number?: string | null }>;
};

function MojeWnioski() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, preferred_period_months, created_at, client:clients(first_name, last_name, city), properties(city, property_type, photos, land_register_number)")
        .eq("assigned_operator", user.id)
        .order("created_at", { ascending: false });
      const list = (data as any as Row[]) ?? [];
      setRows(list);

      if (list.length > 0) {
        const ids = list.map((r) => r.id);
        const { data: docs } = await supabase
          .from("documents")
          .select("loan_application_id")
          .in("loan_application_id", ids);
        const counts: Record<string, number> = {};
        (docs ?? []).forEach((d: any) => {
          counts[d.loan_application_id] = (counts[d.loan_application_id] ?? 0) + 1;
        });
        setDocCounts(counts);
      }
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
            <Link to="/posrednik/wniosek"><FilePlus2 className="mr-2 h-4 w-4" />Wprowadź nowy wniosek</Link>
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
            const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
            const city = p?.city ?? r.client?.city ?? "—";
            const photos: string[] = Array.isArray(p?.photos) ? p!.photos!.filter(Boolean) : [];
            const clientName = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "Klient";
            const docCount = docCounts[r.id] ?? 0;

            return (
              <Link
                key={r.id}
                to="/posrednik/wnioski/$id"
                params={{ id: r.id }}
                className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Card className="overflow-hidden transition group-hover:border-primary group-hover:shadow-md group-active:scale-[0.99]">
                  <CardContent className="space-y-3 p-4">
                    {/* Nagłówek */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="truncate font-semibold">{clientName}</div>
                        <div className="text-lg font-bold text-primary">{formatPLN(Number(r.loan_amount) || 0)}</div>
                        <div className="text-xs text-muted-foreground">
                          {city} · {r.preferred_period_months ?? "—"} mies. · {new Date(r.created_at).toLocaleDateString("pl-PL")}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary">{loanStatusLabels[r.status as keyof typeof loanStatusLabels] ?? r.status}</Badge>
                        <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </div>

                    {/* Miniatury zdjęć */}
                    {photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {photos.slice(0, 6).map((url, i) => (
                          <div key={i} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border bg-muted">
                            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                            {i === 5 && photos.length > 6 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white">
                                +{photos.length - 6}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Meta chipy */}
                    <div className="flex flex-wrap gap-2 pt-1 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        <ImageIcon className="h-3 w-3" />
                        {photos.length} zdj.
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {docCount} dok.
                      </span>
                      {p?.land_register_number && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
                          KW: {p.land_register_number}
                        </span>
                      )}
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
