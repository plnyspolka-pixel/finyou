import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { fetchPublicInvoices } from "@/lib/public-invoices.functions";
import { fetchPublicLeads } from "@/lib/public-leads.functions";
import { LeadsTable } from "@/routes/embed.leady";

export const Route = createFileRoute("/admin/embed")({
  component: EmbedPage,
});

function EmbedPage() {
  const PROD_ORIGIN = "https://app.financeyou.pl";
  const [currentOrigin, setCurrentOrigin] = useState(PROD_ORIGIN);
  useEffect(() => {
    if (typeof window !== "undefined") setCurrentOrigin(window.location.origin);
  }, []);
  // Zawsze używamy produkcyjnej domeny w generowanym kodzie embed,
  // żeby iframe nie wymagał logowania do Lovable (preview jest chronione).
  const origin = PROD_ORIGIN;
  const [source, setSource] = useState("strona-www");
  const [height, setHeight] = useState("100%");
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [showInvoicesPreview, setShowInvoicesPreview] = useState(false);
  const [showLeadsPreview, setShowLeadsPreview] = useState(false);
  const [showBlogPreview, setShowBlogPreview] = useState(false);

  const url = useMemo(() => {
    const u = new URL("/embed/wniosek", origin);
    if (source.trim()) u.searchParams.set("source", source.trim());
    return u.toString();
  }, [origin, source]);

  const invoicesUrl = `${origin}/embed/faktury`;
  const invoicesIframe = `<iframe src="${invoicesUrl}" width="100%" height="720" style="border:0;width:100%;min-height:600px;border-radius:16px;" loading="lazy" title="Faktury sprzedaży Finance You"></iframe>`;
  const leadsUrl = `${origin}/embed/leady`;
  const leadsIframe = `<iframe src="${leadsUrl}" width="100%" height="720" style="border:0;width:100%;min-height:600px;border-radius:16px;" loading="lazy" title="Ostatnie wnioski Finance You"></iframe>`;
  const blogUrl = `${origin}/embed/blog`;
  const blogIframe = `<iframe src="${blogUrl}" width="100%" height="900" style="border:0;width:100%;min-height:700px;border-radius:16px;" loading="lazy" title="Blog Finance You"></iframe>`;

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
          Wklej poniższy kod HTML na swoją stronę — formularz wniosku o pożyczkę pojawi się jako
          iframe.
        </p>
        {currentOrigin !== PROD_ORIGIN && (
          <p className="mt-2 text-xs text-amber-600">
            Generowany kod używa produkcyjnego adresu <code>{PROD_ORIGIN}</code>, niezależnie od
            tego gdzie otwierasz panel (preview wymaga logowania do Lovable).
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
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="np. strona-www"
            />
          </div>
          <div className="space-y-2">
            <Label>Wysokość iframe</Label>
            <Input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="np. 100% lub 900"
            />
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Podgląd</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowFormPreview((v) => !v)}>
            {showFormPreview ? "Ukryj podgląd" : "Pokaż podgląd"}
          </Button>
        </CardHeader>
        <CardContent>
          {showFormPreview ? (
            <>
              <iframe
                src={(() => {
                  const u = new URL("/embed/wniosek", currentOrigin);
                  if (source.trim()) u.searchParams.set("source", source.trim());
                  return u.toString();
                })()}
                width="100%"
                height={/^\d+$/.test(height) ? Number(height) : 900}
                style={{ border: 0 }}
                title="Podgląd wniosku"
              />
              {currentOrigin !== PROD_ORIGIN && (
                <p className="mt-2 text-xs text-amber-600">
                  Podgląd używa bieżącego środowiska ({currentOrigin}). Snippet powyżej wskazuje na
                  produkcję — zadziała po opublikowaniu.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Podgląd jest wyłączony, żeby uniknąć przeładowań przy edycji ustawień.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="pt-6">
        <h2 className="text-xl font-bold text-foreground">Faktury sprzedaży (anonimowo)</h2>
        <p className="text-sm text-muted-foreground">
          Zanonimizowana lista ostatnich faktur sprzedaży Finance You — do wklejenia na stronę jako
          dowód aktywnej sprzedaży.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kod HTML (iframe)</CardTitle>
            <CardDescription>Wklej w dowolne miejsce strony.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copy(invoicesIframe, "Kod iframe faktur")}
          >
            <Copy className="mr-2 h-4 w-4" /> Kopiuj
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea readOnly value={invoicesIframe} rows={3} className="font-mono text-xs" />
          <p className="mt-2 text-xs text-muted-foreground break-all">URL: {invoicesUrl}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Podgląd faktur</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowInvoicesPreview((v) => !v)}>
            {showInvoicesPreview ? "Ukryj podgląd" : "Pokaż podgląd"}
          </Button>
        </CardHeader>
        <CardContent>
          {showInvoicesPreview ? (
            <InvoicesInlinePreview />
          ) : (
            <p className="text-xs text-muted-foreground">Podgląd jest wyłączony domyślnie.</p>
          )}
          {showInvoicesPreview && currentOrigin !== PROD_ORIGIN && (
            <p className="mt-2 text-xs text-amber-600">
              Podgląd używa bieżącego środowiska ({currentOrigin}). Snippet powyżej wskazuje na
              produkcję — zadziała po opublikowaniu.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="pt-6">
        <h2 className="text-xl font-bold text-foreground">Ostatnie wnioski (anonimowo)</h2>
        <p className="text-sm text-muted-foreground">
          Zanonimizowana lista ostatnich zgłoszeń pożyczkowych — dowód aktywnego ruchu na
          formularzu.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kod HTML (iframe)</CardTitle>
            <CardDescription>Wklej w dowolne miejsce strony.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copy(leadsIframe, "Kod iframe wniosków")}
          >
            <Copy className="mr-2 h-4 w-4" /> Kopiuj
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea readOnly value={leadsIframe} rows={3} className="font-mono text-xs" />
          <p className="mt-2 text-xs text-muted-foreground break-all">URL: {leadsUrl}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Podgląd wniosków</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowLeadsPreview((v) => !v)}>
            {showLeadsPreview ? "Ukryj podgląd" : "Pokaż podgląd"}
          </Button>
        </CardHeader>
        <CardContent>
          {showLeadsPreview ? (
            <LeadsInlinePreview />
          ) : (
            <p className="text-xs text-muted-foreground">Podgląd jest wyłączony domyślnie.</p>
          )}
          {showLeadsPreview && currentOrigin !== PROD_ORIGIN && (
            <p className="mt-2 text-xs text-amber-600">
              Podgląd używa bieżącego środowiska ({currentOrigin}). Snippet powyżej wskazuje na
              produkcję — zadziała po opublikowaniu.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="pt-6">
        <h2 className="text-xl font-bold text-foreground">Blog Finance You</h2>
        <p className="text-sm text-muted-foreground">
          Najnowsze artykuły z bloga — kafelki w firmowej szacie graficznej, do wklejenia na stronę.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Kod HTML (iframe)</CardTitle>
            <CardDescription>Wklej w dowolne miejsce strony.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => copy(blogIframe, "Kod iframe bloga")}>
            <Copy className="mr-2 h-4 w-4" /> Kopiuj
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea readOnly value={blogIframe} rows={3} className="font-mono text-xs" />
          <p className="mt-2 text-xs text-muted-foreground break-all">URL: {blogUrl}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Podgląd bloga</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowBlogPreview((v) => !v)}>
            {showBlogPreview ? "Ukryj podgląd" : "Pokaż podgląd"}
          </Button>
        </CardHeader>
        <CardContent>
          {showBlogPreview ? (
            <iframe
              src={`${currentOrigin}/embed/blog`}
              width="100%"
              height={900}
              style={{ border: 0, borderRadius: 16 }}
              title="Podgląd bloga"
            />
          ) : (
            <p className="text-xs text-muted-foreground">Podgląd jest wyłączony domyślnie.</p>
          )}
          {showBlogPreview && currentOrigin !== PROD_ORIGIN && (
            <p className="mt-2 text-xs text-amber-600">
              Podgląd używa bieżącego środowiska ({currentOrigin}). Snippet powyżej wskazuje na
              produkcję — zadziała po opublikowaniu.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LeadsInlinePreview() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "embed", "public-leads-preview"],
    queryFn: () => fetchPublicLeads(),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading)
    return (
      <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
        Ładowanie wniosków…
      </div>
    );
  if (error)
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Nie udało się wczytać podglądu wniosków.
      </div>
    );

  return (
    <div className="rounded-2xl bg-[#0a1030] p-4 sm:p-6">
      {data.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
          Brak zgłoszeń do wyświetlenia.
        </div>
      ) : (
        <LeadsTable leads={data} />
      )}
    </div>
  );
}

function InvoicesInlinePreview() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "embed", "public-invoices-preview"],
    queryFn: () => fetchPublicInvoices(),
    staleTime: 5 * 60 * 1000,
  });
  const total = data.reduce((acc, r) => acc + r.gross_amount, 0);

  if (isLoading)
    return (
      <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
        Ładowanie faktur…
      </div>
    );
  if (error)
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Nie udało się wczytać podglądu faktur.
      </div>
    );

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-sky-300/80">Finance You</p>
          <h3 className="text-xl font-semibold">Faktury sprzedaży</h3>
          <p className="mt-1 text-xs text-slate-400">
            Dane zanonimizowane — najnowsze {data.length} pozycji.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">Suma brutto</p>
          <p className="text-lg font-semibold tabular-nums text-emerald-300">{formatPLN(total)}</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
          Brak wystawionych faktur do wyświetlenia.
        </div>
      ) : (
        <ul className="max-h-[560px] space-y-2 overflow-auto pr-1">
          {data.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-200">{inv.item_label}</div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  Nabywca: <span className="text-slate-300">{inv.buyer_label}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-emerald-300 sm:text-base">
                  {formatPLN(inv.gross_amount)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">brutto</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
