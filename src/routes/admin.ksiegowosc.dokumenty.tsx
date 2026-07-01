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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Dokumenty księgowe</h1>
          <p className="text-sm text-muted-foreground">Jeden rejestr — faktury sprzedaży i kosztowe, z Fakturowo i KSeF, dla wszystkich podmiotów.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadCsv}><Download className="h-4 w-4 mr-1" /> Eksport CSV</Button>
          <Button
            variant="outline"
            onClick={() => importFakMut.mutate()}
            disabled={importFakMut.isPending}
            title="Jednorazowy import z Fakturowo dla Finance You. Bieżąca księgowość działa dalej przez KSeF."
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${importFakMut.isPending ? "animate-spin" : ""}`} />
            {importFakMut.isPending ? "Importuję…" : "Import Fakturowo (jednorazowo)"}
          </Button>
          <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Synchronizuję…" : "Synchronizuj KSeF"}
          </Button>
        </div>
      </div>

      {/* Status synchronizacji per źródło/podmiot */}
      {statuses.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {statuses.map((s) => (
            <Card key={`${s.entity_id}-${s.source}-${s.direction}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{s.entity_name} · {s.source} · {s.direction === "sales" ? "sprzedaż" : "koszty"}</div>
                  {s.last_error ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </div>
                <div className="text-sm mt-1"><b>{s.documents_synced ?? 0}</b> dok. · {s.last_success_at ? new Date(s.last_success_at).toLocaleString("pl-PL") : "—"}</div>
                {s.last_error && <div className="text-xs text-rose-600 mt-1 line-clamp-2" title={s.last_error}>{s.last_error}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Podsumowanie po filtrach */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Dokumentów</div><div className="text-xl font-bold">{totals.count}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Sprzedaż netto</div><div className="text-xl font-bold text-emerald-600">{formatPLN(totals.salesNet)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">VAT należny</div><div className="text-xl font-bold">{formatPLN(totals.salesVat)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Koszty netto</div><div className="text-xl font-bold text-rose-600">{formatPLN(totals.purchaseNet)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">VAT naliczony</div><div className="text-xl font-bold">{formatPLN(totals.purchaseVat)}</div></CardContent></Card>
      </div>

      {/* Filtry */}
      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-5">
          <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
            <SelectTrigger><SelectValue placeholder="Kierunek" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="sales">Sprzedaż</SelectItem>
              <SelectItem value="purchase">Koszty</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={(v) => setSource(v as any)}>
            <SelectTrigger><SelectValue placeholder="Źródło" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie źródła</SelectItem>
              <SelectItem value="fakturowo">Fakturowo</SelectItem>
              <SelectItem value="ksef">KSeF</SelectItem>
              <SelectItem value="manual">Ręcznie</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger><SelectValue placeholder="Podmiot" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie podmioty</SelectItem>
              {entities.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Input placeholder="Szukaj po numerze / kontrahencie / NIP" value={search} onChange={(e) => setSearch(e.target.value)} className="md:col-span-2" />
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Dokumenty</CardTitle></CardHeader>
        <CardContent className="p-0">
          {docsQ.isLoading ? (
            <p className="p-4 text-muted-foreground">Ładowanie…</p>
          ) : docs.length === 0 ? (
            <Alert className="m-4">
              <AlertDescription>Brak dokumentów. Kliknij <b>„Synchronizuj teraz"</b>, aby pobrać faktury z Fakturowo i KSeF.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Kierunek</th>
                    <th className="text-left p-2">Numer</th>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Podmiot</th>
                    <th className="text-left p-2">Kontrahent</th>
                    <th className="text-right p-2">Netto</th>
                    <th className="text-right p-2">VAT</th>
                    <th className="text-right p-2">Brutto</th>
                    <th className="text-left p-2">Źródło</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        {d.direction === "sales" ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700"><Building2 className="h-3 w-3 mr-1" /> Sprzedaż</Badge>
                        ) : (
                          <Badge variant="outline" className="border-rose-500/30 text-rose-700"><ShoppingCart className="h-3 w-3 mr-1" /> Koszt</Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{d.invoice_number || "—"}</td>
                      <td className="p-2 whitespace-nowrap">{d.issue_date || "—"}</td>
                      <td className="p-2">{d.entity_name}</td>
                      <td className="p-2">
                        <div className="font-medium">{d.counterparty_name || "—"}</div>
                        {d.counterparty_nip && <div className="text-xs text-muted-foreground">NIP {d.counterparty_nip}</div>}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">{formatPLN(d.net_amount)}</td>
                      <td className="p-2 text-right whitespace-nowrap">{formatPLN(d.vat_amount)}</td>
                      <td className="p-2 text-right whitespace-nowrap font-medium">{formatPLN(d.gross_amount)}</td>
                      <td className="p-2"><Badge variant="secondary" className="capitalize">{d.source}</Badge></td>
                      <td className="p-2">{d.pdf_url && (<a href={d.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"><ExternalLink className="h-3 w-3" /> PDF</a>)}</td>
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
