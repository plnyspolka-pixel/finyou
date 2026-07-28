import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePanelBase } from "@/lib/panel-base";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FilePlus2,
  ImageOff,
  Search,
  MapPin,
  FileText,
  Calendar,
  Hash,
  Trash2,
  Loader2,
} from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { KwPotentialBadge } from "@/components/location-scoring/kw-potential-badge";
import { collectClientFileRefs, resolveClientFilesHero, plikiLabel } from "@/lib/property-photos";
import { toDisplayableImageUrl } from "@/lib/heic-preview";
import {
  getMyBrokerOfferUsage,
  softDeleteMyApplication,
  type BrokerOfferUsage,
} from "@/lib/access/state.functions";

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
  properties: Array<{
    city?: string;
    property_type?: string;
    photos?: string[] | null;
    land_register_number?: string | null;
  }>;
  documents: Array<{
    id: string;
    file_path?: string | null;
    file_url?: string | null;
    document_type?: string | null;
    file_name?: string | null;
  }>;
};

function SmartImg({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
      >
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

export function MojeWnioski() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const base = usePanelBase();
  const usageFn = useServerFn(getMyBrokerOfferUsage);
  const deleteFn = useServerFn(softDeleteMyApplication);
  const [rows, setRows] = useState<Row[]>([]);
  const [heroByApp, setHeroByApp] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [usage, setUsage] = useState<BrokerOfferUsage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Zewnętrzny pośrednik widzi wyłącznie własne oferty (wszystkie statusy);
  // personel wewnętrzny — pulę „szukamy inwestora" jak dotąd.
  const isExternalBroker =
    roles.includes("posrednik") && !roles.includes("operator") && !roles.includes("administrator");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("loan_applications")
      .select(
        "id, status, loan_amount, preferred_period_months, created_at, client:clients(first_name, last_name, city), properties(city, property_type, photos, land_register_number), documents(id, file_path, file_url, document_type, file_name)",
      )
      .order("created_at", { ascending: false });
    query = isExternalBroker
      ? (query as any).eq("created_by_partner_user_id", user.id)
      : query.eq("status", "szukamy_inwestora");
    const { data } = await query;
    const all = (data as any as Row[]) ?? [];
    setRows(all);
    setLoading(false);
    try {
      setUsage(await usageFn());
    } catch {
      setUsage(null);
    }
    return all;
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Usunąć tę ofertę? Zwolni to miejsce w limicie darmowego konta. Oferta nie będzie już widoczna.",
      )
    )
      return;
    setDeletingId(id);
    try {
      await deleteFn({ data: { applicationId: id } });
      toast.success("Oferta została usunięta");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się usunąć oferty");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const all = (await load()) ?? [];

      // Miniaturka (hero) per wniosek: wszystkie pliki klienta to jeden worek
      // (properties.photos + tabela documents) — bierzemy pierwszy obrazek,
      // a gdy go brak, miniaturę pierwszego PDF-a. HEIC konwertujemy w locie.
      const heroes: Record<string, string> = {};
      await Promise.all(
        all.map(async (r) => {
          const p = Array.isArray(r.properties) ? r.properties[0] : (r.properties as any);
          const files = collectClientFileRefs(p?.photos, r.documents);
          if (!files.length) return;
          const hero = await resolveClientFilesHero(files, 60 * 60);
          if (hero) heroes[r.id] = await toDisplayableImageUrl(hero.url, hero.name);
        }),
      );
      setHeroByApp(heroes);
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
        eyebrow={isExternalBroker ? "Moje oferty" : "Szukamy inwestora"}
        title={isExternalBroker ? "Moje oferty" : "Wnioski szukające inwestora"}
        subtitle={
          isExternalBroker
            ? "Twoje oferty wprowadzone do Finance You. Usunięcie oferty zwalnia miejsce w limicie darmowego konta."
            : "Wszystkie kompletne wnioski ze statusem „szukamy inwestora” — gotowe do przedstawienia inwestorom."
        }
        actions={
          <div className="flex items-center gap-3">
            {usage && !usage.hasPaidAccess && !usage.isBypass && (
              <Badge variant={usage.activeCount >= usage.freeLimit ? "destructive" : "secondary"}>
                Limit ofert: {usage.activeCount}/{usage.freeLimit}
              </Badge>
            )}
            <Button asChild>
              <Link to={`${base}/wniosek` as any}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                Nowy wniosek
              </Link>
            </Button>
          </div>
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
          Brak wniosków ze statusem „szukamy inwestora". Gdy wniosek skompletuje KW i pliki klienta,
          pojawi się tutaj automatycznie.
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
            const fileCount = collectClientFileRefs(p?.photos, r.documents).length;
            const clientName =
              [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "Klient";
            const hero = heroByApp[r.id];

            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: `${base}/wnioski/${r.id}` as any })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate({ to: `${base}/wnioski/${r.id}` as any });
                }}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:border-primary hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  <SmartImg
                    src={hero ?? ""}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                    <Badge className="bg-black/60 text-white border-0 backdrop-blur-sm">
                      {loanStatusLabels[r.status as keyof typeof loanStatusLabels] ?? r.status}
                    </Badge>
                    <div className="flex items-center gap-1">
                      {fileCount > 1 && (
                        <Badge className="bg-black/60 text-white border-0 backdrop-blur-sm">
                          +{fileCount - 1}
                        </Badge>
                      )}
                      {isExternalBroker && (
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-7 w-7"
                          title="Usuń ofertę"
                          disabled={deletingId === r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(r.id);
                          }}
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
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
                    <span className="truncate">{r.preferred_period_months ?? "—"} mies.</span>
                  </div>
                  {p?.land_register_number && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] font-semibold text-primary max-w-full">
                        <Hash className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.land_register_number}</span>
                      </div>
                      <KwPotentialBadge
                        applicationId={r.id}
                        kwNumber={p.land_register_number}
                        propertyType={p.property_type}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> {fileCount} {plikiLabel(fileCount)}
                    </span>
                    <span>{new Date(r.created_at).toLocaleDateString("pl-PL")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
