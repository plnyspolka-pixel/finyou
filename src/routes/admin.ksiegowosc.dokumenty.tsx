import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Download, RefreshCw, ExternalLink, FileText, ShoppingCart, Building2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { listAccountingDocuments, getAccountingSyncStatus, exportAccountingDocumentsCsv } from "@/lib/accounting/documents.functions";
import { listAccountingEntities } from "@/lib/accounting/functions";
import { syncFakturowo } from "@/lib/accounting/sync-fakturowo.functions";
import { syncKsef } from "@/lib/accounting/sync-ksef.functions";

export const Route = createFileRoute("/admin/ksiegowosc/dokumenty")({
  component: KsiegowoscDokumenty,
});

function KsiegowoscDokumenty() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAccountingDocuments);
  const entitiesFn = useServerFn(listAccountingEntities);
  const statusFn = useServerFn(getAccountingSyncStatus);
  const exportFn = useServerFn(exportAccountingDocumentsCsv);
  const syncFakFn = useServerFn(syncFakturowo);
  const syncKsefFn = useServerFn(syncKsef);

  const [direction, setDirection] = useState<"all" | "sales" | "purchase">("all");
  const [source, setSource] = useState<"all" | "fakturowo" | "ksef" | "manual">("all");
  const [entityId, setEntityId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const entitiesQ = useQuery({ queryKey: ["accounting-entities"], queryFn: () => entitiesFn() });
  const docsQ = useQuery({
    queryKey: ["accounting-documents", direction, source, entityId, search],
    queryFn: () =>
      listFn({
        data: {
          direction: direction === "all" ? undefined : direction,
          source: source === "all" ? undefined : source,
          entityId: entityId === "all" ? undefined : entityId,
          search: search || undefined,
        },
      }),
  });
  const statusQ = useQuery({ queryKey: ["accounting-sync-status"], queryFn: () => statusFn() });

  const syncMut = useMutation({
    mutationFn: async () => syncKsefFn({ data: {} }),
    onSuccess: (r: any) => {
      const total = (r?.results ?? []).reduce((s: number, x: any) => s + (x.count || 0), 0);
      toast.success(`KSeF: zsynchronizowano ${total} dokumentów`);
      qc.invalidateQueries({ queryKey: ["accounting-documents"] });
      qc.invalidateQueries({ queryKey: ["accounting-sync-status"] });
    },
    onError: (e: Error) => toast.error(`Sync KSeF nie powiódł się: ${e.message}`),
  });

  const importFakMut = useMutation({
    mutationFn: async () => {
      const list = (entitiesQ.data as any[] | undefined) ?? [];
      const fy =
        list.find((e) => String(e.nip || "").replace(/\D/g, "") === "7010611803") ||
        list.find((e) => String(e.name || "").toLowerCase().includes("finance you"));
      if (!fy) throw new Error('Nie znaleziono podmiotu Finance You (NIP 7010611803)');
      return syncFakFn({ data: { entityId: fy.id } });
    },
    onSuccess: (r: any) => {
      const total = (r?.results ?? []).reduce((s: number, x: any) => s + (x.count || 0), 0);
      toast.success(`Fakturowo (jednorazowo): zaimportowano ${total} dokumentów`);
      qc.invalidateQueries({ queryKey: ["accounting-documents"] });
      qc.invalidateQueries({ queryKey: ["accounting-sync-status"] });
    },
    onError: (e: Error) => toast.error(`Import Fakturowo nie powiódł się: ${e.message}`),
  });

  const totals = useMemo(() => {
    const docs = (docsQ.data as any[]) ?? [];
    const sum = (pred: (d: any) => boolean, field: string) =>
      Math.round(docs.filter(pred).reduce((s, d) => s + Number(d[field] || 0), 0) * 100) / 100;
    return {
      count: docs.length,
      salesNet: sum((d) => d.direction === "sales", "net_amount"),
      salesVat: sum((d) => d.direction === "sales", "vat_amount"),
      purchaseNet: sum((d) => d.direction === "purchase", "net_amount"),
      purchaseVat: sum((d) => d.direction === "purchase", "vat_amount"),
    };
  }, [docsQ.data]);

  const downloadCsv = async () => {
    const r = await exportFn({ data: { direction: direction === "all" ? undefined : direction } });
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entities = (entitiesQ.data as any[]) ?? [];
  const docs = (docsQ.data as any[]) ?? [];
  const statuses = (statusQ.data as any[]) ?? [];

  return (
    <div className="space-y-6">
      {/* Professional Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            Dokumenty księgowe
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Jeden rejestr — faktury sprzedaży i kosztowe, z Fakturowo i KSeF, dla wszystkich podmiotów. Wszystkie dokumenty są automatycznie synchronizowane.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 md:flex-col lg:flex-row">
          <Button
            variant="outline"
            onClick={downloadCsv}
            className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4 mr-2" />
            Eksport CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => importFakMut.mutate()}
            disabled={importFakMut.isPending}
            title="Jednorazowy import z Fakturowo dla Finance You. Bieżąca księgowość działa dalej przez KSeF."
            className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${importFakMut.isPending ? "animate-spin" : ""}`} />
            {importFakMut.isPending ? "Importuję…" : "Import Fakturowo"}
          </Button>
          <Button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 text-white font-semibold"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Synchronizuję…" : "Synchronizuj KSeF"}
          </Button>
        </div>
      </div>

      {/* Status synchronizacji per źródło/podmiot — Professional Status Cards */}
      {statuses.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {statuses.map((s) => (
            <Card
              key={`${s.entity_id}-${s.source}-${s.direction}`}
              className={`border-2 transition-all ${
                s.last_error
                  ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30'
                  : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-1">
                      {s.entity_name}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {s.source === 'ksef' ? '📋 KSeF' : s.source === 'fakturowo' ? '📊 Fakturowo' : '✏️ Ręczne'} · {s.direction === "sales" ? "🏢 Sprzedaż" : "📦 Koszty"}
                    </div>
                  </div>
                  {s.last_error ? (
                    <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    <span className="text-base">{s.documents_synced ?? 0}</span> dokument{s.documents_synced === 1 ? '' : 'ów'}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {s.last_success_at
                      ? `Ostatnia: ${new Date(s.last_success_at).toLocaleDateString('pl-PL')} ${new Date(s.last_success_at).toLocaleTimeString('pl-PL', {hour: '2-digit', minute:'2-digit'})}`
                      : 'Nigdy nie zsynchronizowano'}
                  </div>
                </div>

                {s.last_error && (
                  <div className="mt-3 p-2 bg-rose-100 dark:bg-rose-900/30 rounded border border-rose-200 dark:border-rose-800">
                    <div className="text-xs text-rose-700 dark:text-rose-300 font-mono line-clamp-3" title={s.last_error}>
                      {s.last_error}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Podsumowanie po filtrach — Professional Fintech KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {/* Liczba dokumentów */}
        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Dokumentów</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{totals.count}</div>
          </CardContent>
        </Card>

        {/* Sprzedaż netto — Emerald (Success) */}
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 dark:border-emerald-700">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Sprzedaż netto</div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{formatPLN(totals.salesNet)}</div>
          </CardContent>
        </Card>

        {/* VAT należny */}
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 dark:border-blue-700">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">VAT należny</div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{formatPLN(totals.salesVat)}</div>
          </CardContent>
        </Card>

        {/* Koszty netto — Rose (Costs) */}
        <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 dark:border-rose-700">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Koszty netto</div>
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">{formatPLN(totals.purchaseNet)}</div>
          </CardContent>
        </Card>

        {/* VAT naliczony */}
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 dark:border-amber-700">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">VAT naliczony</div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{formatPLN(totals.purchaseVat)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtry — Professional Filter Bar */}
      <Card className="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-5">
            {/* Kierunek */}
            <div>
              <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block mb-2">Kierunek</label>
              <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
                <SelectTrigger className="border-slate-300 dark:border-slate-600"><SelectValue placeholder="Wybierz kierunek" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="sales">🏢 Sprzedaż</SelectItem>
                  <SelectItem value="purchase">📦 Koszty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Źródło */}
            <div>
              <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block mb-2">Źródło</label>
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger className="border-slate-300 dark:border-slate-600"><SelectValue placeholder="Wybierz źródło" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie źródła</SelectItem>
                  <SelectItem value="fakturowo">📊 Fakturowo</SelectItem>
                  <SelectItem value="ksef">📋 KSeF</SelectItem>
                  <SelectItem value="manual">✏️ Ręcznie</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Podmiot */}
            <div>
              <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block mb-2">Podmiot</label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger className="border-slate-300 dark:border-slate-600"><SelectValue placeholder="Wybierz podmiot" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie podmioty</SelectItem>
                  {entities.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {/* Wyszukiwanie */}
            <Input
              placeholder="Numer, kontrahent, NIP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:col-span-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            />
          </div>

          {/* Info o aktywnych filtrach */}
          {(direction !== 'all' || source !== 'all' || entityId !== 'all' || search) && (
            <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <span>🔍 Aktywne filtry: {[direction !== 'all' && direction, source !== 'all' && source, entityId !== 'all' && 'podmiot', search && 'szukanie'].filter(Boolean).join(', ')}</span>
              <button
                onClick={() => {
                  setDirection('all');
                  setSource('all');
                  setEntityId('all');
                  setSearch('');
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium ml-auto"
              >
                Wyczyść
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela dokumentów */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3 border-b border-slate-200 dark:border-slate-700">
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Dokumenty ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docsQ.isLoading ? (
            <div className="p-8 text-center text-slate-600 dark:text-slate-400">
              <div className="inline-block mb-3">⏳</div>
              <p className="text-sm font-medium">Ładowanie dokumentów…</p>
            </div>
          ) : docs.length === 0 ? (
            <Alert className="m-4 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                <span className="font-semibold">Brak dokumentów w bazie.</span> Kliknij <b>„Synchronizuj KSeF"</b> lub <b>„Import Fakturowo"</b>, aby pobrać faktury z systemów zewnętrznych.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {/* Professional Table Header */}
                <thead className="bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-600 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="text-left p-3">Kierunek</th>
                    <th className="text-left p-3">Numer</th>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Podmiot</th>
                    <th className="text-left p-3">Kontrahent</th>
                    <th className="text-right p-3">Netto (PLN)</th>
                    <th className="text-right p-3">VAT (PLN)</th>
                    <th className="text-right p-3">Brutto (PLN)</th>
                    <th className="text-left p-3">Źródło</th>
                    <th className="text-center p-3">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {docs.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      {/* Kierunek */}
                      <td className="p-3">
                        {d.direction === "sales" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-700">
                            <Building2 className="h-3 w-3 mr-1" /> Sprzedaż
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100 border border-rose-300 dark:border-rose-700">
                            <ShoppingCart className="h-3 w-3 mr-1" /> Koszt
                          </Badge>
                        )}
                      </td>

                      {/* Numer faktury */}
                      <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300 font-semibold">{d.invoice_number || "—"}</td>

                      {/* Data */}
                      <td className="p-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{d.issue_date || "—"}</td>

                      {/* Podmiot */}
                      <td className="p-3 text-slate-900 dark:text-slate-100">{d.entity_name}</td>

                      {/* Kontrahent */}
                      <td className="p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{d.counterparty_name || "—"}</div>
                        {d.counterparty_nip && <div className="text-xs text-slate-500 dark:text-slate-400">NIP {d.counterparty_nip}</div>}
                      </td>

                      {/* Netto */}
                      <td className="p-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatPLN(d.net_amount)}</td>

                      {/* VAT */}
                      <td className="p-3 text-right font-mono font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">{formatPLN(d.vat_amount)}</td>

                      {/* Brutto */}
                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap bg-slate-100/50 dark:bg-slate-800/50">{formatPLN(d.gross_amount)}</td>

                      {/* Źródło */}
                      <td className="p-3">
                        <Badge
                          className={`capitalize font-mono text-xs ${
                            d.source === 'ksef' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700' :
                            d.source === 'fakturowo' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100 border border-purple-300 dark:border-purple-700' :
                            'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {d.source}
                        </Badge>
                      </td>

                      {/* Akcje */}
                      <td className="p-3 text-center">
                        {d.pdf_url && (
                          <a
                            href={d.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline decoration-1 decoration-blue-300 dark:decoration-blue-600 hover:underline text-xs font-medium transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
