import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Coins, Download, CheckCircle2, Ban } from "lucide-react";
import { toast } from "sonner";
import { formatPLN } from "@/lib/labels";
import {
  commissionStatusLabels,
  commissionStatusColors,
  settlementTypeLabels,
  basisTypeLabels,
} from "@/lib/affiliate/labels";
import {
  adminListCommissions,
  adminApproveCommission,
  adminBlockCommission,
  exportAffiliateCsv,
} from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/prowizje")({
  component: ProwizjePage,
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

const COMMISSION_STATUSES = [
  "calculated",
  "pending_admin_approval",
  "approved",
  "blocked",
  "requires_invoice",
  "requires_unregistered_activity_statement",
  "requires_business_registration",
  "payable",
  "paid",
  "cancelled",
  "clawback",
];

function ProwizjePage() {
  const listFn = useServerFn(adminListCommissions);
  const approveFn = useServerFn(adminApproveCommission);
  const exportFn = useServerFn(exportAffiliateCsv);
  const qc = useQueryClient();

  const [status, setStatus] = useState("all");
  const [settlementType, setSettlementType] = useState("all");

  const q = useQuery({
    queryKey: ["admin-affiliate-commissions", status, settlementType],
    queryFn: () =>
      listFn({
        data: {
          status: status === "all" ? undefined : status,
          settlementType: settlementType === "all" ? undefined : settlementType,
        },
      }),
  });
  const rows = (q.data as any[]) ?? [];

  async function doApprove(id: string) {
    try {
      await approveFn({ data: { id } });
      toast.success("Prowizja zatwierdzona");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-commissions"] });
    } catch (e) {
      toast.error("Nie udało się zatwierdzić", { description: (e as Error).message });
    }
  }

  async function doExport(kind: "b2b_commissions" | "full_report") {
    try {
      const res = (await exportFn({ data: { kind } })) as any;
      downloadCsv(res);
      toast.success("Wyeksportowano CSV");
    } catch (e) {
      toast.error("Nie udało się wyeksportować", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="h-6 w-6" /> Prowizje
          </h1>
          <p className="text-sm text-muted-foreground">
            Zatwierdzanie i blokowanie prowizji naliczonych od zdarzeń gospodarczych.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport("b2b_commissions")}>
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Prowizje B2B</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExport("full_report")}>
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Pełny raport</span>
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {COMMISSION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {commissionStatusLabels[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={settlementType} onValueChange={setSettlementType}>
            <SelectTrigger>
              <SelectValue placeholder="Forma rozliczenia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie formy</SelectItem>
              <SelectItem value="b2b">{settlementTypeLabels.b2b}</SelectItem>
              <SelectItem value="unregistered_activity">
                {settlementTypeLabels.unregistered_activity}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Poziom</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Podstawa</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead>Okres</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="p-6 text-center text-muted-foreground">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-6 text-center text-muted-foreground">
                    Brak prowizji.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => {
                const canApprove = ![
                  "approved",
                  "payable",
                  "paid",
                  "blocked",
                  "cancelled",
                ].includes(c.status);
                const canBlock = !["paid", "blocked", "cancelled"].includes(c.status);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.partner_name ?? "—"}</div>
                      {c.requires_invoice ? (
                        <div className="text-[11px] text-amber-700">wymaga faktury</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">P{c.network_level}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {settlementTypeLabels[c.settlement_type] ?? c.settlement_type}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {basisTypeLabels[c.basis_type] ?? c.basis_type}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatPLN(c.gross_amount)}
                    </TableCell>
                    <TableCell className="text-xs">
                      Q{c.tax_quarter} {c.tax_year}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={commissionStatusColors[c.status] ?? "bg-slate-100"}
                        variant="secondary"
                      >
                        {commissionStatusLabels[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canApprove && (
                          <Button variant="outline" size="sm" onClick={() => doApprove(c.id)}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canBlock && <BlockDialog id={c.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function BlockDialog({ id }: { id: string }) {
  const blockFn = useServerFn(adminBlockCommission);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) return toast.error("Podaj powód blokady");
    setBusy(true);
    try {
      await blockFn({ data: { id, reason } });
      toast.success("Prowizja zablokowana");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-commissions"] });
      setOpen(false);
      setReason("");
    } catch (e) {
      toast.error("Nie udało się zablokować", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-rose-700">
          <Ban className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zablokuj prowizję</DialogTitle>
          <DialogDescription>
            Blokada wstrzymuje wypłatę. Powód jest wymagany i zapisywany w audycie.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Powód blokady</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="np. zwrot środków, brak wymaganej faktury, podejrzenie nadużycia"
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Blokowanie…" : "Zablokuj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
