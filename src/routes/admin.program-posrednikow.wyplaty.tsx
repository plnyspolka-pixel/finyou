import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BanknoteIcon, Plus, Eye, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import { payoutBatchStatusLabels } from "@/lib/affiliate/labels";
import {
  adminListPayoutBatches,
  adminGetPayoutItems,
  adminCreatePayoutBatch,
  adminMarkBatchPaid,
  exportAffiliateCsv,
} from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/wyplaty")({
  component: WyplatyPage,
});

function downloadCsv(res: { filename: string; csv: string }) {
  const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function WyplatyPage() {
  const listFn = useServerFn(adminListPayoutBatches);
  const createFn = useServerFn(adminCreatePayoutBatch);
  const exportFn = useServerFn(exportAffiliateCsv);
  const qc = useQueryClient();

  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({ queryKey: ["admin-affiliate-batches"], queryFn: () => listFn() });
  const rows = (q.data as any[]) ?? [];

  async function createBatch() {
    setCreating(true);
    try {
      const res = (await createFn({ data: {} })) as any;
      const skipped = (res?.skipped ?? []) as any[];
      toast.success(
        `Utworzono paczkę: ${res?.count ?? 0} wypłat na ${formatPLN(res?.total ?? 0)}`,
        {
          description: skipped.length
            ? `Pominięto ${skipped.length} partnerów (poniżej progu 500 zł lub brak rachunku).`
            : undefined,
        },
      );
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-batches"] });
    } catch (e) {
      toast.error("Nie udało się utworzyć paczki", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function exportTransfers(batchId: string) {
    try {
      const res = (await exportFn({ data: { kind: "bank_transfers", batchId } })) as any;
      downloadCsv(res);
      toast.success("Wyeksportowano przelewy");
    } catch (e) {
      toast.error("Nie udało się wyeksportować", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BanknoteIcon className="h-6 w-6" /> Wypłaty
          </h1>
          <p className="text-sm text-muted-foreground">
            Paczki wypłat prowizji. Próg wypłaty wynosi 500 zł na partnera.
          </p>
        </div>
        <Button onClick={createBatch} disabled={creating}>
          <Plus className="mr-2 h-4 w-4" /> {creating ? "Tworzenie…" : "Utwórz paczkę wypłat"}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead className="text-right">Wypłat</TableHead>
                <TableHead>Utworzono</TableHead>
                <TableHead>Wypłacono</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                    Brak paczek wypłat.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    {b.name ?? `Paczka ${String(b.id).slice(0, 8)}`}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        b.status === "paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }
                    >
                      {payoutBatchStatusLabels[b.status] ?? b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatPLN(b.total_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{b.payout_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(b.created_at)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {b.paid_at ? formatDate(b.paid_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setOpenBatch(b.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportTransfers(b.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {b.status !== "paid" && <MarkPaidButton batchId={b.id} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {openBatch && <ItemsDialog batchId={openBatch} onClose={() => setOpenBatch(null)} />}
    </div>
  );
}

function MarkPaidButton({ batchId }: { batchId: string }) {
  const markFn = useServerFn(adminMarkBatchPaid);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      await markFn({ data: { batchId } });
      toast.success("Paczka oznaczona jako wypłacona");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-batches"] });
    } catch (e) {
      toast.error("Nie udało się oznaczyć", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-emerald-700"
      onClick={mark}
      disabled={busy}
      title="Oznacz jako wypłacone"
    >
      <CheckCircle2 className="h-4 w-4" />
    </Button>
  );
}

function ItemsDialog({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const getFn = useServerFn(adminGetPayoutItems);
  const q = useQuery({
    queryKey: ["admin-affiliate-batch-items", batchId],
    queryFn: () => getFn({ data: { batchId } }),
  });
  const items = (q.data as any[]) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pozycje paczki wypłat</DialogTitle>
          <DialogDescription>Lista przelewów dla partnerów w tej paczce.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p className="text-muted-foreground py-6">Ładowanie…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground py-6">Brak pozycji.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Kwota</TableHead>
                  <TableHead>Tytuł przelewu</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.partner_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatPLN(it.amount)}
                    </TableCell>
                    <TableCell className="text-xs">{it.transfer_title ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          it.status === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }
                      >
                        {it.status === "paid" ? "Wypłacone" : "Oczekuje"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
