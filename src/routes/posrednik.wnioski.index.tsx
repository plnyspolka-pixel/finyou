import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilePlus2, ImageOff, Search, MapPin, FileText, Calendar, Hash } from "lucide-react";
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

function SmartImg({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      className={className}
      onError={() => setBroken(true)}
    />
  );
}

function MojeWnioski() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

      const allPaths = Array.from(
        new Set(
          filtered.flatMap((r) => {
            const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
            const photos: string[] = Array.isArray(p?.photos) ? p!.photos!.filter(Boolean) : [];
            return photos.filter((u) => !/^https?:\/\//i.test(u));
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
      const hay = [
        r.client?.first_name,
        r.client?.last_name,
        r.client?.city,
        p?.city,
        p?.land_register_number,
        p?.property_type,
        loanStatusLabels[r.status as keyof typeof loanStatusLabels] ?? r.status,
        String(r.loan_amount ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Twoje wnioski"
        title="Moje wnioski"
        subtitle="Wnioski wprowadzone przez Ciebie lub przypisane do Twojej obsługi."
        actions={
          <Button asChild>
            <Link to="/posrednik/wniosek"><FilePlus2 className="mr-2 h-4 w-4" />Nowy wniosek</Link>
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Szukaj: klient, miasto, KW, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          {loading ? "Ładowanie…" : `${visible.length} z ${rows.length}`}
        </div>
      </div>

      {!loading && rows.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          Nie masz jeszcze wniosków z KW, zdjęciami i dokumentami. Kliknij „Nowy wniosek", aby dodać.
        </Card>
      ) : !loading && visible.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          Brak wyników dla „{search}".
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => {
            const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
            const city = p?.city ?? r.client?.city ?? "—";
            const photos: string[] = Array.isArray(p?.photos) ? p!.photos!.filter(Boolean) : [];
            const clientName = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "Klient";
            const hero = photos[0];
            const docCount = r.documents?.length ?? 0;

            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate({ to: "/posrednik/wnioski/$id", params: { id: r.id } })}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:border-primary hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  <SmartImg
                    src={hero}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                    <Badge className="bg-black/60 text-white border-0 backdrop-blur-sm">
                      {loanStatusLabels[r.status as keyof typeof loanStatusLabels] ?? r.status}
                    </Badge>
                    {photos.length > 1 && (
                      <Badge className="bg-black/60 text-white border-0 backdrop-blur-sm">
                        +{photos.length - 1} zdj.
                      </Badge>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3">
                    <div className="text-xs text-white/80 truncate">{clientName}</div>
                    <div className="text-xl font-bold text-white truncate">
                      {formatPLN(Number(r.loan_amount) || 0)}
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-2 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{city}</span>
                    <span>·</span>
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {r.preferred_period_months ?? "—"} mies.
                    </span>
                  </div>
                  {p?.land_register_number && (
                    <div className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] font-semibold text-primary max-w-full">
                      <Hash className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.land_register_number}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> {docCount} dok.
                    </span>
                    <span>{new Date(r.created_at).toLocaleDateString("pl-PL")}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
