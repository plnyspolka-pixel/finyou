import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, FilePlus2, ImageOff } from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";

export const Route = createFileRoute("/posrednik/wnioski/")({
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
  documents: Array<{ id: string }>;
};

function MojeWnioski() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loan_applications")
        .select("id, status, loan_amount, preferred_period_months, created_at, assigned_operator, client:clients(first_name, last_name, city), properties(city, property_type, photos, land_register_number), documents(id)")
        .or(`assigned_operator.eq.${user.id},assigned_operator.is.null`)
        .order("created_at", { ascending: false });
      const all = ((data as any) as Row[]) ?? [];
      const filtered = all.filter((r) => {
        const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
        const hasKw = !!p?.land_register_number;
        const hasPhotos = Array.isArray(p?.photos) && p!.photos!.filter(Boolean).length > 0;
        const hasDocs = Array.isArray(r.documents) && r.documents.length > 0;
        return hasKw && hasPhotos && hasDocs;
      });

      // Podpisz storage-paths dla zdjęć (bucket: property-photos)
      const allPaths = Array.from(
        new Set(
          filtered.flatMap((r) => {
            const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
            const photos: string[] = Array.isArray(p?.photos) ? p!.photos!.filter(Boolean) : [];
            return photos.slice(0, 5).filter((u) => !/^https?:\/\//i.test(u));
          }),
        ),
      );
      if (allPaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("property-photos")
          .createSignedUrls(allPaths, 60 * 60);
        const map = new Map<string, string>();
        (signed ?? []).forEach((s: any) => {
          if (s?.path && s?.signedUrl) map.set(s.path, s.signedUrl);
        });
        for (const r of filtered) {
          const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
          if (p && Array.isArray(p.photos)) {
            p.photos = p.photos.map((u: string) =>
              /^https?:\/\//i.test(u) ? u : (map.get(u) ?? u),
            );
          }
        }
      }

      setRows(filtered);
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
        <Card className="py-10 text-center text-sm text-muted-foreground">
          Nie masz jeszcze żadnych wniosków. Kliknij „Wprowadź nowy wniosek", aby dodać pierwszy.
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
            const city = p?.city ?? r.client?.city ?? "—";
            const photos: string[] = Array.isArray(p?.photos) ? p!.photos!.filter(Boolean) : [];
            const clientName = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "Klient";
            const hero = photos[0];
            const thumbs = photos.slice(1, 5);

            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate({ to: "/posrednik/wnioski/$id", params: { id: r.id } })}
                className="group block w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]"
              >
                {/* Hero photo */}
                <div className="relative h-44 w-full overflow-hidden bg-muted sm:h-52">
                  {hero ? (
                    <img src={hero} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                    <div className="min-w-0 text-white">
                      <div className="truncate text-sm font-medium opacity-90">{clientName}</div>
                      <div className="truncate text-lg font-bold">{formatPLN(Number(r.loan_amount) || 0)}</div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 bg-white/95 text-foreground">
                      {loanStatusLabels[r.status as keyof typeof loanStatusLabels] ?? r.status}
                    </Badge>
                  </div>
                </div>

                {/* Thumbs strip */}
                {thumbs.length > 0 && (
                  <div className="flex gap-1 border-t bg-muted/30 p-1">
                    {thumbs.map((url, i) => (
                      <div key={i} className="relative h-16 flex-1 overflow-hidden rounded-md bg-muted">
                        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {i === thumbs.length - 1 && photos.length > 5 && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white">
                            +{photos.length - 5}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs text-muted-foreground">
                      {city} · {r.preferred_period_months ?? "—"} mies. · {new Date(r.created_at).toLocaleDateString("pl-PL")}
                    </div>
                    {p?.land_register_number && (
                      <div className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                        KW: {p.land_register_number}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
