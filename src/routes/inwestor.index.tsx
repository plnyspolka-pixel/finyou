import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Ruler, Calendar, Percent, Wallet, TrendingUp, X } from "lucide-react";
import { formatPLN, propertyTypeLabels, visibilityLabels } from "@/lib/labels";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import {
  IMAGE_EXT,
  isShowablePropertyPhoto,
  isPropertyPhotoDocument,
  signStoragePath,
} from "@/lib/property-photos";
import { useAccessState } from "@/hooks/use-access";
import { InvestorAgentPanel } from "@/components/inwestor/agent-panel";
import { InvestorTeaserList } from "@/components/access/InvestorTeaserList";
import { getModuleState } from "@/lib/projects/module-access.functions";
import { ModuleGate, type ModuleStateView } from "@/components/projects/module-gate";

export const Route = createFileRoute("/inwestor/")({
  component: InwestorListGate,
});

// Jedna zakładka „Dostępne wnioski": bez aktywnego dostępu inwestor widzi
// bramkę zamkniętego modułu (aplikacja → KYC → screening → dokumenty →
// decyzja Finance You). Anonimowe zajawki pojawiają się DOPIERO po pozytywnej
// weryfikacji tożsamości (KYC) — wcześniej żadne dane ofert nie są widoczne
// (funkcja serwerowa egzekwuje to niezależnie od UI). Po aktywacji dostępu —
// pełna wyszukiwarka wniosków.
function InwestorListGate() {
  const { loading, hasFullAccess } = useAccessState("investor");
  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Ładowanie…</div>;
  }
  if (!hasFullAccess) {
    return <GatedTeaserSection />;
  }
  return <InwestorList />;
}

// Bramka modułu + zajawki (wyłącznie po pozytywnym KYC) w zakładce
// „Dostępne wnioski".
function GatedTeaserSection() {
  const stateFn = useServerFn(getModuleState);
  const stateQ = useQuery({ queryKey: ["projects-module-state"], queryFn: () => stateFn() });
  const qc = useQueryClient();
  if (stateQ.isLoading || !stateQ.data) {
    return <div className="py-10 text-center text-muted-foreground">Ładowanie…</div>;
  }
  const state = stateQ.data as ModuleStateView;
  const verified = state.kycStatus === "approved";
  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Oferty"
        title="Dostępne wnioski"
        subtitle={
          verified
            ? "Anonimowe zajawki — pełne dane odblokujesz po aktywacji dostępu do zamkniętego modułu."
            : "Zajawki ofert zobaczysz po pozytywnej weryfikacji tożsamości (KYC)."
        }
      />
      <ModuleGate
        state={state}
        onChanged={() => void qc.invalidateQueries({ queryKey: ["projects-module-state"] })}
      />
      {verified && <InvestorTeaserList />}
    </div>
  );
}

const PROPERTY_TYPES = Object.keys(propertyTypeLabels);

// Miniatura karty z listą zapasowych URL-i: gdy obrazek się nie załaduje
// (np. wygasły signed URL, nieobsługiwany format), próbujemy kolejnego
// kandydata zamiast zostawiać pustą szarą kartę.
function CardPhoto({ urls, alt }: { urls: string[] | undefined; alt: string }) {
  const [idx, setIdx] = useState(0);
  if (!urls || idx >= urls.length) {
    return <div className="h-full w-full bg-gradient-to-br from-muted to-muted-foreground/20" />;
  }
  return (
    <img
      src={urls[idx]}
      alt={alt}
      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

function maskKw(kw: string): string {
  // Format: XX1X/00123456/7 → zachowujemy kod sądu, maskujemy numer i cyfrę kontrolną
  const parts = kw.trim().toUpperCase().split("/");
  if (parts.length !== 3) return kw.replace(/\d/g, "•");
  const [court, num, _check] = parts;
  const masked =
    num.length > 2
      ? num.slice(0, 2) + "•".repeat(Math.max(0, num.length - 2))
      : "•".repeat(num.length);
  return `${court}/${masked}/•`;
}

function InwestorList() {
  const { user } = useAuth();
  const [apps, setApps] = useState<any[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [ptype, setPtype] = useState<string>("all");
  const [voivodeship, setVoivodeship] = useState<string>("all");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [yieldMin, setYieldMin] = useState("");
  const [ltvMax, setLtvMax] = useState("");
  const [periodMax, setPeriodMax] = useState("");

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select(
          "id, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, max_monthly_payment, visibility_level, properties(property_type, city, voivodeship, estimated_value, area_sqm, photos, description, street, land_register_number)",
        )
        .eq("available_to_investors", true)
        .order("created_at", { ascending: false });
      // Defensywnie: pokazuj wyłącznie wnioski z podstawą dla inwestora —
      // nieruchomość z typem oraz sensowną kwotą. Zabezpiecza przed pustymi
      // kartami z legacy-danych mimo flagi available_to_investors.
      const list = (data ?? []).filter((a) => {
        const p = a.properties?.[0];
        return !!p?.property_type && a.loan_amount != null && Number(a.loan_amount) > 0;
      });
      setApps(list);
      setLoading(false);

      const appIds = list.map((a) => a.id).filter(Boolean);
      const docsByApp = new Map<string, any[]>();
      if (appIds.length > 0) {
        const { data: docRows } = await supabase
          .from("documents")
          .select("loan_application_id, file_path, file_name, document_type")
          .in("loan_application_id", appIds);
        // Widok szczegółu wniosku pokazuje WSZYSTKIE załączniki-obrazki
        // (klient wgrywa zdjęcia pod różnymi document_type, np. przez czat) —
        // lista nie może być bardziej restrykcyjna, bo karty zostają szare.
        // Bierzemy każdy obrazek; typy stricte zdjęciowe idą na początek.
        type DocRow = {
          loan_application_id: string | null;
          file_path: string | null;
          file_name: string | null;
          document_type: string | null;
        };
        ((docRows ?? []) as DocRow[])
          .filter((doc) => {
            const name = String(doc.file_name ?? doc.file_path ?? "");
            return (
              Boolean(doc.file_path) &&
              (IMAGE_EXT.test(name) || IMAGE_EXT.test(String(doc.file_path)))
            );
          })
          .forEach((doc) => {
            const appId = String(doc.loan_application_id);
            docsByApp.set(appId, [...(docsByApp.get(appId) ?? []), doc]);
          });
        for (const docs of docsByApp.values()) {
          docs.sort(
            (x, y) => Number(isPropertyPhotoDocument(y)) - Number(isPropertyPhotoDocument(x)),
          );
        }
      }

      // Miniatura per wniosek: lista KANDYDATÓW zamiast jednej ścieżki —
      // pierwsze zdjęcie potrafi być HEIC (przeglądarki go nie renderują),
      // nie dać się podpisać albo być PDF-em. Kolejność: pokazywalne zdjęcia
      // (HEIC na końcu), zdjęcia z tabeli documents, miniatury PDF-ów
      // (konwencja `<ścieżka>.thumb.png` jak na liście pośrednika). Karta
      // przechodzi do kolejnego kandydata, gdy obrazek się nie załaduje.
      const next: Record<string, string[]> = {};
      await Promise.all(
        list.map(async (a) => {
          const photos: string[] = a.properties?.[0]?.photos ?? [];
          const docPaths = (docsByApp.get(a.id) ?? [])
            .map((d) => String(d.file_path ?? ""))
            .filter(Boolean);
          const docNonHeic = docPaths.filter((p) => !/\.heic$/i.test(p));
          const docHeic = docPaths.filter((p) => /\.heic$/i.test(p));
          const showable = photos.filter(isShowablePropertyPhoto);
          const heic = showable.filter((p) => /\.heic$/i.test(p));
          const nonHeic = showable.filter((p) => !/\.heic$/i.test(p));
          const pdfThumbs = photos
            .filter((p) => /\.pdf$/i.test(p) && !/^https?:\/\//i.test(p))
            .map((p) => `${p}.thumb.png`);
          const candidates = [...nonHeic, ...docNonHeic, ...pdfThumbs, ...heic, ...docHeic];

          const urls: string[] = [];
          for (const c of candidates) {
            if (urls.length >= 3) break; // wystarczą 3 zapasowe URL-e na kartę
            if (/^https?:\/\//i.test(c)) {
              urls.push(c);
              continue;
            }
            const url = await signStoragePath(c, 3600);
            if (url) urls.push(url);
          }
          if (urls.length) next[a.id] = urls;
        }),
      );
      setPhotoUrls(next);
    })();
  }, [user]);

  const voivodeships = useMemo(() => {
    const set = new Set<string>();
    apps.forEach((a) => a.properties?.[0]?.voivodeship && set.add(a.properties[0].voivodeship));
    return Array.from(set).sort();
  }, [apps]);

  const filtered = useMemo(
    () =>
      apps.filter((a) => {
        const p = a.properties?.[0];
        const qLow = q.trim().toLowerCase();
        if (qLow) {
          const hay =
            `${p?.city ?? ""} ${p?.voivodeship ?? ""} ${p?.street ?? ""} ${p?.description ?? ""}`.toLowerCase();
          if (!hay.includes(qLow)) return false;
        }
        if (ptype !== "all" && p?.property_type !== ptype) return false;
        if (voivodeship !== "all" && p?.voivodeship !== voivodeship) return false;
        if (amountMin && Number(a.loan_amount) < Number(amountMin)) return false;
        if (amountMax && Number(a.loan_amount) > Number(amountMax)) return false;
        if (
          yieldMin &&
          (a.annual_investor_rate == null || Number(a.annual_investor_rate) < Number(yieldMin))
        )
          return false;
        if (ltvMax && (a.estimated_ltv == null || Number(a.estimated_ltv) > Number(ltvMax)))
          return false;
        if (
          periodMax &&
          (a.preferred_period_months == null ||
            Number(a.preferred_period_months) > Number(periodMax))
        )
          return false;
        return true;
      }),
    [apps, q, ptype, voivodeship, amountMin, amountMax, yieldMin, ltvMax, periodMax],
  );

  // Każde wyświetlenie wniosku w wyszukiwarce inwestora liczymy jako wyświetlenie (1x na sesję na wniosek).
  useEffect(() => {
    if (filtered.length === 0) return;
    const toCount = filtered.filter((a) => {
      const key = `viewed:search:${a.id}`;
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
      return true;
    });
    if (toCount.length === 0) return;
    void (async () => {
      for (const a of toCount) {
        try {
          await supabase.rpc("increment_loan_view", { _loan_id: a.id });
        } catch {
          /* ignore */
        }
      }
    })();
  }, [filtered]);

  const reset = () => {
    setQ("");
    setPtype("all");
    setVoivodeship("all");
    setAmountMin("");
    setAmountMax("");
    setYieldMin("");
    setLtvMax("");
    setPeriodMax("");
  };
  const hasFilters =
    q ||
    ptype !== "all" ||
    voivodeship !== "all" ||
    amountMin ||
    amountMax ||
    yieldMin ||
    ltvMax ||
    periodMax;

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title="Agent AI"
        subtitle="Główny ekran panelu — agent czatowy AI poprowadzi Cię po wnioskach, ofertach i kalkulatorze. Poniżej wyszukiwarka dostępnych wniosków."
      />

      {/* Agent czatowy AI — główny ekran panelu inwestora. */}
      <InvestorAgentPanel />

      <div className="pt-2">
        <h2 className="text-lg font-semibold">Dostępne wnioski ({apps.length})</h2>
        <p className="text-sm text-muted-foreground">
          Wnioski dopuszczone do inwestorów — wyszukaj nieruchomość pod inwestycję.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Miasto, ulica, województwo, słowo kluczowe…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Typ nieruchomości</Label>
              <Select value={ptype} onValueChange={setPtype}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {propertyTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Województwo</Label>
              <Select value={voivodeship} onValueChange={setVoivodeship}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {voivodeships.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kwota od (zł)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                placeholder="np. 100000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kwota do (zł)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                placeholder="np. 800000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min. zysk roczny (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={yieldMin}
                onChange={(e) => setYieldMin(e.target.value)}
                placeholder="np. 12"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max LTV (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={ltvMax}
                onChange={(e) => setLtvMax(e.target.value)}
                placeholder="np. 50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max okres (mies.)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={periodMax}
                onChange={(e) => setPeriodMax(e.target.value)}
                placeholder="np. 36"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Znaleziono: <strong className="text-foreground">{filtered.length}</strong> z{" "}
              {apps.length}
            </span>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Wyczyść filtry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Brak wniosków spełniających kryteria.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const p = a.properties?.[0];
            return (
              <Link key={a.id} to="/inwestor/wniosek/$id" params={{ id: a.id }} className="group">
                <Card className="hover:border-primary transition-all hover:shadow-lg cursor-pointer h-full overflow-hidden flex flex-col">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <CardPhoto urls={photoUrls[a.id]} alt={p?.city ?? ""} />
                    {p?.property_type && (
                      <Badge className="absolute top-3 left-3 bg-background/95 text-foreground hover:bg-background backdrop-blur-sm shadow">
                        {propertyTypeLabels[p.property_type]}
                      </Badge>
                    )}
                    {p?.photos?.length > 1 && (
                      <Badge
                        variant="secondary"
                        className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm"
                      >
                        +{p.photos.length - 1} zdjęć
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                    <div>
                      <div className="text-2xl font-bold tabular-nums">
                        {formatPLN(a.loan_amount)}
                      </div>
                      {p && (
                        <div className="flex items-center text-sm text-muted-foreground mt-0.5">
                          <MapPin className="h-3.5 w-3.5 mr-1 shrink-0" />
                          <span className="truncate">
                            {[p.city, p.voivodeship].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>

                    {p && (
                      <div className="grid grid-cols-2 gap-2 text-sm border-y py-2">
                        <div className="flex items-center gap-1.5">
                          <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                          {p.area_sqm ? `${p.area_sqm} m²` : "—"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatPLN(p.estimated_value)}
                        </div>
                        {p.land_register_number && (
                          <div
                            className="flex items-center gap-1.5 col-span-2 text-xs text-muted-foreground font-mono"
                            title="Pełny numer KW widoczny we wniosku"
                          >
                            KW: {maskKw(p.land_register_number)}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 text-xs">
                      <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                        Parametry wnioskowane przez klienta
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {a.preferred_period_months ?? "—"} mies.
                        </div>
                        {a.estimated_ltv != null && (
                          <div className="flex items-center gap-1.5">
                            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                            LTV {a.estimated_ltv}%
                          </div>
                        )}
                        {a.max_monthly_payment != null && (
                          <div className="flex items-center gap-1.5 col-span-2">
                            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                            Max rata: {formatPLN(a.max_monthly_payment)}
                          </div>
                        )}
                      </div>
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
