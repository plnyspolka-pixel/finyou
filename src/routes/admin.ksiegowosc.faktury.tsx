import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Receipt, Plus, Send, Download, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  listAccountingEntities,
  listSalesInvoices,
  createManualSalesInvoice,
  issueSalesInvoiceNow,
  setSalesInvoiceEntity,
  setSalesInvoicePaid,
  exportSalesInvoicesCsv,
} from "@/lib/accounting/functions";

export const Route = createFileRoute("/admin/ksiegowosc/faktury")({
  component: FakturyPage,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Robocza",
  issued: "Wystawiona",
  sent: "Wysłana",
  paid: "Opłacona",
  cancelled: "Anulowana",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  issued: "bg-blue-100 text-blue-800",
  sent: "bg-indigo-100 text-indigo-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};
const KSEF_LABELS: Record<string, string> = {
  not_sent: "Nie wysłano",
  disabled: "Wyłączony",
  pending: "Oczekuje",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
  error: "Błąd",
};
const KSEF_COLORS: Record<string, string> = {
  not_sent: "bg-slate-100 text-slate-600",
  disabled: "bg-slate-100 text-slate-500",
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  error: "bg-rose-100 text-rose-800",
};

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function FakturyPage() {
  const entitiesFn = useServerFn(listAccountingEntities);
  const listFn = useServerFn(listSalesInvoices);
  const createFn = useServerFn(createManualSalesInvoice);
  const issueFn = useServerFn(issueSalesInvoiceNow);
  const setEntityFn = useServerFn(setSalesInvoiceEntity);
  const paidFn = useServerFn(setSalesInvoicePaid);
  const exportFn = useServerFn(exportSalesInvoicesCsv);
  const qc = useQueryClient();

  const [status, setStatus] = useState<string>("all");
  const entitiesQ = useQuery({ queryKey: ["accounting-entities"], queryFn: () => entitiesFn() });
  const q = useQuery({
    queryKey: ["sales-invoices", status],
    queryFn: () => listFn({ data: status === "all" ? {} : { status } }),
  });

  const entities = (entitiesQ.data as any[]) ?? [];
  const invoices = (q.data as any[]) ?? [];

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    entityId: "",
    buyerName: "",
    buyerNip: "",
    buyerEmail: "",
    description: "",
    grossAmount: "",
    vatRate: "23",
    issueNow: true,
  });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!f.entityId) return toast.error("Wybierz podmiot wystawiający");
    if (!f.buyerName.trim() || !f.description.trim() || !f.grossAmount)
      return toast.error("Uzupełnij nabywcę, opis i kwotę");
    setBusy(true);
    try {
      await createFn({
        data: {
          entityId: f.entityId,
          buyerName: f.buyerName,
          buyerNip: f.buyerNip || undefined,
          buyerEmail: f.buyerEmail || undefined,
          description: f.description,
          grossAmount: Number(f.grossAmount),
          vatRate: f.vatRate,
          issueNow: f.issueNow,
        },
      });
      toast.success("Faktura utworzona");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["sales-invoices"] });
    } catch (e) {
      toast.error("Błąd", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function issue(id: string) {
    try {
      const r = await issueFn({ data: { id } });
      toast[r.ok ? "success" : "error"](
        r.ok ? "Faktura wystawiona" : (r.message ?? "Błąd wystawiania"),
      );
      void qc.invalidateQueries({ queryKey: ["sales-invoices"] });
    } catch (e) {
      toast.error("Błąd", { description: (e as Error).message });
    }
  }
  async function changeEntity(id: string, entityId: string) {
    try {
      await setEntityFn({ data: { id, entityId } });
      toast.success("Zmieniono podmiot");
      void qc.invalidateQueries({ queryKey: ["sales-invoices"] });
    } catch (e) {
      toast.error("Błąd", { description: (e as Error).message });
    }
  }
  async function markPaid(id: string) {
    try {
      await paidFn({ data: { id } });
      toast.success("Oznaczono jako opłaconą");
      void qc.invalidateQueries({ queryKey: ["sales-invoices"] });
    } catch (e) {
      toast.error("Błąd", { description: (e as Error).message });
    }
  }
  async function exportCsv() {
    try {
      const r = await exportFn();
      downloadCsv(r.filename, r.csv);
    } catch (e) {
      toast.error("Błąd eksportu", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Faktury sprzedaży
          </h1>
          <p className="text-sm text-muted-foreground">
            Faktury wystawiane automatycznie po wpłatach i ręcznie. Wybierz podmiot oraz status
            KSeF.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Eksport CSV
          </Button>
          <Button
            onClick={() => {
              setF({
                entityId: entities.find((e) => e.is_default)?.id ?? entities[0]?.id ?? "",
                buyerName: "",
                buyerNip: "",
                buyerEmail: "",
                description: "",
                grossAmount: "",
                vatRate: "23",
                issueNow: true,
              });
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Nowa faktura
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Label className="text-sm">Status:</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Faktury ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="p-4 text-muted-foreground">Ładowanie…</p>
          ) : invoices.length === 0 ? (
            <p className="p-4 text-muted-foreground">Brak faktur.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numer</TableHead>
                    <TableHead>Podmiot</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Nabywca</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>KSeF</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.invoice_number ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {i.status === "draft" ? (
                          <Select
                            value={i.entity_id ?? ""}
                            onValueChange={(v) => changeEntity(i.id, v)}
                          >
                            <SelectTrigger className="h-7 w-40 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {entities.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          (i.entity_name ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(i.issue_date)}</TableCell>
                      <TableCell className="text-sm">
                        {i.buyer_name ?? "—"}
                        {i.buyer_nip ? (
                          <div className="text-xs text-muted-foreground">NIP {i.buyer_nip}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatPLN(i.gross_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[i.status]}>
                          {STATUS_LABELS[i.status] ?? i.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={KSEF_COLORS[i.ksef_status]}>
                          {KSEF_LABELS[i.ksef_status] ?? i.ksef_status}
                        </Badge>
                        {i.ksef_reference_number && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {i.ksef_reference_number}
                          </div>
                        )}
                        {i.error_message && (
                          <div
                            className="text-[10px] text-rose-600 mt-0.5 max-w-[160px] truncate"
                            title={i.error_message}
                          >
                            {i.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {(i.status === "draft" ||
                            i.ksef_status === "error" ||
                            i.ksef_status === "not_sent") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Wystaw / wyślij"
                              onClick={() => issue(i.id)}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {i.ksef_status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Odśwież status KSeF"
                              onClick={() => issue(i.id)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {i.status !== "paid" && i.status !== "draft" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Oznacz opłaconą"
                              onClick={() => markPaid(i.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {i.pdf_url && (
                            <a
                              href={i.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-grid place-items-center h-8 w-8 hover:bg-accent rounded-md"
                              title="PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa faktura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Podmiot wystawiający</Label>
              <Select
                value={f.entityId}
                onValueChange={(v) => setF((s) => ({ ...s, entityId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz podmiot" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                      {e.is_default ? " (domyślny)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nabywca</Label>
                <Input
                  value={f.buyerName}
                  onChange={(e) => setF((s) => ({ ...s, buyerName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>NIP nabywcy</Label>
                <Input
                  value={f.buyerNip}
                  onChange={(e) => setF((s) => ({ ...s, buyerNip: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>E-mail nabywcy</Label>
              <Input
                type="email"
                value={f.buyerEmail}
                onChange={(e) => setF((s) => ({ ...s, buyerEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Opis pozycji</Label>
              <Input
                value={f.description}
                onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))}
                placeholder="np. Dostęp inwestora Finance You"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Kwota brutto</Label>
                <Input
                  type="number"
                  value={f.grossAmount}
                  onChange={(e) => setF((s) => ({ ...s, grossAmount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Stawka VAT</Label>
                <Select
                  value={f.vatRate}
                  onValueChange={(v) => setF((s) => ({ ...s, vatRate: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["23", "8", "5", "0", "zw"].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r === "zw" ? "zw." : `${r}%`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={busy}>
              {busy ? "Tworzenie…" : "Utwórz i wystaw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
