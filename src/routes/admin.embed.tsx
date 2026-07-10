import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Hash, Calendar, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPLN } from "@/lib/loan-math";
import { PropertyTypeIcon, getPropertyVisual, anonymizeKw } from "@/lib/property-visuals";

export const Route = createFileRoute("/admin/embed")({
  component: EmbedPage,
});

function EmbedPage() {
  const PROD_ORIGIN = "https://app.financeyou.pl";
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : PROD_ORIGIN;
  // Zawsze używamy produkcyjnej domeny w generowanym kodzie embed,
  // żeby iframe nie wymagał logowania do Lovable (preview jest chronione).
  const origin = PROD_ORIGIN;
  const [source, setSource] = useState("strona-www");
  const [height, setHeight] = useState("100%");

  const url = useMemo(() => {
    const u = new URL("/embed/wniosek", origin);
    if (source.trim()) u.searchParams.set("source", source.trim());
    return u.toString();
  }, [origin, source]);

  const iframeSnippet = `<iframe src="${url}" width="100%" height="${height}" style="border:0;width:100%;height:100%;min-height:600px;" loading="lazy" title="Wniosek o pożyczkę"></iframe>`;
  const linkSnippet = `<a href="${url}" target="_blank" rel="noopener">Złóż wniosek o pożyczkę</a>`;

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} skopiowano`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Wniosek do osadzenia</h1>
        <p className="text-sm text-muted-foreground">
          Wklej poniższy kod HTML na swoją stronę — formularz wniosku o pożyczkę pojawi się jako iframe.
        </p>
        {currentOrigin !== PROD_ORIGIN && (
          <p className="mt-2 text-xs text-amber-600">
            Generowany kod używa produkcyjnego adresu <code>{PROD_ORIGIN}</code>, niezależnie od tego gdzie otwierasz panel (preview wymaga logowania do Lovable).
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ustawienia</CardTitle>
          <CardDescription>Dostosuj parametry osadzenia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Źródło (tag analityczny)</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="np. strona-www" />
          </div>
          <div className="space-y-2">
            <Label>Wysokość iframe</Label>
            <Input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="np. 100% lub 900" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kod HTML (iframe)</CardTitle>
            <CardDescription>Najprostszy sposób — wklej w dowolne miejsce strony.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => copy(iframeSnippet, "Kod iframe")}>
            <Copy className="mr-2 h-4 w-4" /> Kopiuj
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea readOnly value={iframeSnippet} rows={4} className="font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Bezpośredni link</CardTitle>
            <CardDescription>Alternatywa: użyj jako przycisku/linku.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => copy(linkSnippet, "Link")}>
            <Copy className="mr-2 h-4 w-4" /> Kopiuj
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea readOnly value={linkSnippet} rows={2} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground break-all">URL: {url}</p>
        </CardContent>
      </Card>

      <RecentApplicationsMockup />

      <Card>
        <CardHeader>
          <CardTitle>Podgląd</CardTitle>
        </CardHeader>
        <CardContent>
          <iframe
            src={url}
            width="100%"
            height={/^\d+$/.test(height) ? Number(height) : 900}
            style={{ border: 0 }}
            title="Podgląd wniosku"
          />
        </CardContent>
      </Card>
    </div>
  );
}

type MockupRow = {
  id: string;
  created_at: string;
  loan_amount: number | null;
  property_type: string | null;
  land_register_number: string | null;
};

function RecentApplicationsMockup() {
  const [rows, setRows] = useState<MockupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select("id,created_at,loan_amount,properties(property_type,land_register_number)")
        .order("created_at", { ascending: false })
        .limit(60);
      if (cancelled) return;
      const list: MockupRow[] = ((data ?? []) as any[])
        .map((r) => {
          const props = Array.isArray(r.properties) ? r.properties : [];
          const withType = props.find((p: any) => p?.property_type) ?? props[0] ?? {};
          return {
            id: r.id,
            created_at: r.created_at,
            loan_amount: r.loan_amount,
            property_type: withType?.property_type ?? null,
            land_register_number: withType?.land_register_number ?? null,
          };
        })
        .filter((r) => r.property_type || r.land_register_number || r.loan_amount)
        .slice(0, 12);
      setRows(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Podgląd ostatnich wniosków (mockup)</CardTitle>
        <CardDescription>
          Zanonimizowane dane — typ nieruchomości, ukryty numer KW, kwota i data. Możesz użyć jako inspiracji do własnej sekcji na stronie.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Ładowanie…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Brak wniosków do wyświetlenia.</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const v = getPropertyVisual(r.property_type);
              return (
                <li
                  key={r.id}
                  className="relative overflow-hidden rounded-2xl border border-white/10 p-4 text-white shadow-lg"
                  style={{
                    background:
                      "radial-gradient(120% 140% at 0% 0%, oklch(0.32 0.16 265) 0%, oklch(0.18 0.06 265) 55%, oklch(0.13 0.04 265) 100%)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <PropertyTypeIcon
                      type={r.property_type}
                      className="h-16 w-16 shrink-0 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]"
                    />
                    <div className="min-w-0 flex-1">
                      <Badge className="bg-white/90 text-foreground border-0">{v.label}</Badge>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-mono text-[11px] font-semibold text-white/90">
                        <Hash className="h-3 w-3" />
                        {anonymizeKw(r.land_register_number)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/60">Kwota</div>
                      <div className="text-xl font-bold tabular-nums text-white inline-flex items-center gap-1">
                        <Wallet className="h-4 w-4 text-white/70" />
                        {r.loan_amount ? formatPLN(Number(r.loan_amount)) : "—"}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-white/70 inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(r.created_at).toLocaleDateString("pl-PL")}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

