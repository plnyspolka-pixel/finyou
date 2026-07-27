import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Download,
  RefreshCw,
  ExternalLink,
  FileText,
  ShoppingCart,
  Building2,
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Archive,
} from "lucide-react";
import { formatPLN } from "@/lib/labels";
import {
  listAccountingDocuments,
  getAccountingSyncStatus,
  exportAccountingDocumentsCsv,
  getAccountingDocumentXml,
  exportAccountingXmlZip,
} from "@/lib/accounting/documents.functions";
import { listAccountingEntities } from "@/lib/accounting/functions";
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
  const xmlFn = useServerFn(getAccountingDocumentXml);
  const zipFn = useServerFn(exportAccountingXmlZip);
  const syncKsefFn = useServerFn(syncKsef);

  const [direction, setDirection] = useState<"all" | "sales" | "purchase">("all");
  const [source, setSource] = useState<"all" | "ksef" | "manual">("all");
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

  const downloadXml = async (id: string) => {
    try {
      const r = await xmlFn({ data: { id } });
      const blob = new Blob([r.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const downloadXmlZip = async () => {
    try {
      toast.info("Przygotowuję paczkę XML…");
      const r = await zipFn({
        data: {
          direction: direction === "all" ? undefined : direction,
          entityId: entityId === "all" ? undefined : entityId,
        },
      });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Pobrano ${r.count} XML (${Math.round(r.byteSize / 1024)} KB)${r.skipped ? `, pominięto ${r.skipped} (limit rozmiaru)` : ""}.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const entities = (entitiesQ.data as any[]) ?? [];
  const docs = (docsQ.data as any[]) ?? [];
  const statuses = (statusQ.data as any[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Dokumenty księgowe
          </h1>
          <p className="text-sm text-muted-foreground">
            Jeden rejestr — faktury sprzedaży i kosztowe, z KSeF, dla wszystkich podmiotów.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadCsv}>
            <Download className="h-4 w-4 mr-1" /> Eksport CSV
          </Button>
          <Button variant="outline" onClick={downloadXmlZip}>
            <Archive className="h-4 w-4 mr-1" /> Eksport XML (ZIP)
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
                  <div className="text-xs text-muted-foreground">
                    {s.entity_name} · {s.source} · {s.direction === "sales" ? "sprzedaż" : "koszty"}
                  </div>
                  {s.last_error ? (
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div className="text-sm mt-1">
                  <b>{s.documents_synced ?? 0}</b> dok. ·{" "}
                  {s.last_success_at ? new Date(s.last_success_at).toLocaleString("pl-PL") : "—"}
                </div>
                {s.last_error && (
                  <div className="text-xs text-rose-600 mt-1 line-clamp-2" title={s.last_error}>
                    {s.last_error}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Podsumowanie po filtrach */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Dokumentów</div>
            <div className="text-xl font-bold">{totals.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Sprzedaż netto</div>
            <div className="text-xl font-bold text-emerald-600">{formatPLN(totals.salesNet)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">VAT należny</div>
            <div className="text-xl font-bold">{formatPLN(totals.salesVat)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Koszty netto</div>
            <div className="text-xl font-bold text-rose-600">{formatPLN(totals.purchaseNet)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">VAT naliczony</div>
            <div className="text-xl font-bold">{formatPLN(totals.purchaseVat)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Przełącznik podmiotu (prosty segment) + filtry */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground w-20">Podmiot</span>
            <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
              <Button
                size="sm"
                variant={entityId === "all" ? "default" : "ghost"}
                className="rounded-md"
                onClick={() => setEntityId("all")}
              >
                Wszystkie
              </Button>
              {entities.map((e) => (
                <Button
                  key={e.id}
                  size="sm"
                  variant={entityId === e.id ? "default" : "ghost"}
                  className="rounded-md"
                  onClick={() => setEntityId(e.id)}
                >
                  {e.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground w-20">Rodzaj</span>
            <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
              {(
                [
                  ["all", "Wszystko"],
                  ["sales", "Sprzedaż"],
                  ["purchase", "Koszty"],
                ] as const
              ).map(([v, label]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={direction === v ? "default" : "ghost"}
                  className="rounded-md"
                  onClick={() => setDirection(v)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground w-20">Źródło</span>
            <Select value={source} onValueChange={(v) => setSource(v as any)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Źródło" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie źródła</SelectItem>
                <SelectItem value="ksef">KSeF</SelectItem>
                <SelectItem value="manual">Ręcznie</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Szukaj po numerze / kliencie / NIP"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dokumenty</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docsQ.isLoading ? (
            <p className="p-4 text-muted-foreground">Ładowanie…</p>
          ) : docs.length === 0 ? (
            <Alert className="m-4">
              <AlertDescription>
                Brak dokumentów. Kliknij <b>„Synchronizuj KSeF"</b>, aby pobrać faktury z KSeF.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Rodzaj</th>
                    <th className="text-left p-2">Numer</th>
                    <th className="text-left p-2">Data wystawienia</th>
                    <th className="text-left p-2">Podmiot</th>
                    <th className="text-left p-2">Klient</th>
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
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-700"
                          >
                            <Building2 className="h-3 w-3 mr-1" /> Sprzedaż
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-rose-500/30 text-rose-700">
                            <ShoppingCart className="h-3 w-3 mr-1" /> Koszt
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{d.invoice_number || "—"}</td>
                      <td className="p-2 whitespace-nowrap">{d.issue_date || "—"}</td>
                      <td className="p-2">{d.entity_name}</td>
                      <td className="p-2">
                        <div className="font-medium">{d.counterparty_name || "—"}</div>
                        {d.counterparty_nip && (
                          <div className="text-xs text-muted-foreground">
                            NIP {d.counterparty_nip}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {formatPLN(d.net_amount)}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {formatPLN(d.vat_amount)}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap font-medium">
                        {formatPLN(d.gross_amount)}
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary" className="capitalize">
                          {d.source}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {d.pdf_url && (
                            <a
                              href={d.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                            >
                              <ExternalLink className="h-3 w-3" /> PDF
                            </a>
                          )}
                          {d.has_xml && (
                            <button
                              type="button"
                              onClick={() => downloadXml(d.id)}
                              className="inline-flex items-center gap-1 text-emerald-700 hover:underline text-xs"
                            >
                              <FileCode2 className="h-3 w-3" /> XML
                            </button>
                          )}
                        </div>
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
