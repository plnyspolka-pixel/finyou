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
