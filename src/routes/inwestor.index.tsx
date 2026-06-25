import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Ruler, Calendar, Percent, Wallet, TrendingUp, X } from "lucide-react";
import { formatPLN, propertyTypeLabels, visibilityLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/")({
  component: InwestorList,
});

const PROPERTY_TYPES = Object.keys(propertyTypeLabels);

function InwestorList() {
  const { user } = useAuth();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [ptype, setPtype] = useState<string>("all");
  const [voivodeship, setVoivodeship] = useState<string>("all");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [yieldMin, setYieldMin] = useState("");
  const [ltvMax, setLtvMax] = useState("");
  const [periodMax, setPeriodMax] = useState("");

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase
      .from("loan_applications")
      .select("id, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, max_monthly_payment, visibility_level, properties(property_type, city, voivodeship, estimated_value, area_sqm, photos, description, street)")
      .eq("available_to_investors", true)
      .order("created_at", { ascending: false });
    setApps(data ?? []); setLoading(false);
  })(); }, [user]);

  const voivodeships = useMemo(() => {
    const set = new Set<string>();
    apps.forEach(a => a.properties?.[0]?.voivodeship && set.add(a.properties[0].voivodeship));
    return Array.from(set).sort();
  }, [apps]);

  const filtered = useMemo(() => apps.filter(a => {
    const p = a.properties?.[0];
    const qLow = q.trim().toLowerCase();
    if (qLow) {
      const hay = `${p?.city ?? ""} ${p?.voivodeship ?? ""} ${p?.street ?? ""} ${p?.description ?? ""}`.toLowerCase();
      if (!hay.includes(qLow)) return false;
    }
    if (ptype !== "all" && p?.property_type !== ptype) return false;
    if (voivodeship !== "all" && p?.voivodeship !== voivodeship) return false;
    if (amountMin && Number(a.loan_amount) < Number(amountMin)) return false;
    if (amountMax && Number(a.loan_amount) > Number(amountMax)) return false;
    if (yieldMin && (a.annual_investor_rate == null || Number(a.annual_investor_rate) < Number(yieldMin))) return false;
    if (ltvMax && (a.estimated_ltv == null || Number(a.estimated_ltv) > Number(ltvMax))) return false;
    if (periodMax && (a.preferred_period_months == null || Number(a.preferred_period_months) > Number(periodMax))) return false;
    return true;
  }), [apps, q, ptype, voivodeship, amountMin, amountMax, yieldMin, ltvMax, periodMax]);

  const reset = () => { setQ(""); setPtype("all"); setVoivodeship("all"); setAmountMin(""); setAmountMax(""); setYieldMin(""); setLtvMax(""); setPeriodMax(""); };
  const hasFilters = q || ptype !== "all" || voivodeship !== "all" || amountMin || amountMax || yieldMin || ltvMax || periodMax;

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Marketplace inwestora"
        title={`Dostępne wnioski (${apps.length})`}
        subtitle="Wnioski dopuszczone do inwestorów — wyszukaj nieruchomość pod inwestycję."
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Miasto, ulica, województwo, słowo kluczowe…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-11" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Typ nieruchomości</Label>
              <Select value={ptype} onValueChange={setPtype}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{propertyTypeLabels[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Województwo</Label>
              <Select value={voivodeship} onValueChange={setVoivodeship}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {voivodeships.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kwota od (zł)</Label>
              <Input type="number" inputMode="numeric" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="np. 100000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kwota do (zł)</Label>
              <Input type="number" inputMode="numeric" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="np. 800000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min. zysk roczny (%)</Label>
              <Input type="number" inputMode="decimal" value={yieldMin} onChange={(e) => setYieldMin(e.target.value)} placeholder="np. 12" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max LTV (%)</Label>
              <Input type="number" inputMode="decimal" value={ltvMax} onChange={(e) => setLtvMax(e.target.value)} placeholder="np. 50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max okres (mies.)</Label>
              <Input type="number" inputMode="numeric" value={periodMax} onChange={(e) => setPeriodMax(e.target.value)} placeholder="np. 36" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Znaleziono: <strong className="text-foreground">{filtered.length}</strong> z {apps.length}</span>
            {hasFilters && <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4 mr-1" /> Wyczyść filtry</Button>}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Brak wniosków spełniających kryteria.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const p = a.properties?.[0];
            return (
              <Link key={a.id} to="/inwestor/wniosek/$id" params={{ id: a.id }} className="group">
                <Card className="hover:border-primary transition-all hover:shadow-lg cursor-pointer h-full overflow-hidden flex flex-col">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {p?.photos?.[0] ? (
                      <img src={p.photos[0]} alt={p.city ?? ""} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : <div className="h-full w-full bg-gradient-to-br from-muted to-muted-foreground/20" />}
                    {p?.property_type && (
                      <Badge className="absolute top-3 left-3 bg-background/95 text-foreground hover:bg-background backdrop-blur-sm shadow">
                        {propertyTypeLabels[p.property_type]}
                      </Badge>
                    )}
                    {a.annual_investor_rate != null && (
                      <div className="absolute top-3 right-3 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 shadow-lg">
                        <div className="text-[10px] uppercase tracking-wide opacity-90 leading-none">Zysk roczny</div>
                        <div className="text-xl font-bold leading-tight tabular-nums">{Number(a.annual_investor_rate)}%</div>
                      </div>
                    )}
                    {p?.photos?.length > 1 && (
                      <Badge variant="secondary" className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm">
                        +{p.photos.length - 1} zdjęć
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                    <div>
                      <div className="text-2xl font-bold tabular-nums">{formatPLN(a.loan_amount)}</div>
                      {p && (
                        <div className="flex items-center text-sm text-muted-foreground mt-0.5">
                          <MapPin className="h-3.5 w-3.5 mr-1 shrink-0" />
                          <span className="truncate">{[p.street, p.city, p.voivodeship].filter(Boolean).join(", ")}</span>
                        </div>
                      )}
                    </div>

                    {p && (
                      <div className="grid grid-cols-2 gap-2 text-sm border-y py-2">
                        <div className="flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-muted-foreground" />{p.area_sqm ? `${p.area_sqm} m²` : "—"}</div>
                        <div className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-muted-foreground" />{formatPLN(p.estimated_value)}</div>
                      </div>
                    )}

                    <div className="space-y-1.5 text-xs">
                      <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Parametry wnioskowane przez klienta</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{a.preferred_period_months ?? "—"} mies.</div>
                        <div className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5 text-muted-foreground" />LTV {a.estimated_ltv ?? "—"}%</div>
                        {a.max_monthly_payment != null && (
                          <div className="flex items-center gap-1.5 col-span-2"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />Max rata: {formatPLN(a.max_monthly_payment)}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-1">
                      <Badge variant="outline" className="text-xs">{visibilityLabels[a.visibility_level]}</Badge>
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
