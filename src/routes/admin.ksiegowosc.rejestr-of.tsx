import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { Users, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  listIndividualSales,
  updateIndividualSaleBuyer,
  issueInvoiceForIndividualSale,
} from "@/lib/accounting/individual-sales.functions";

export const Route = createFileRoute("/admin/ksiegowosc/rejestr-of")({
  component: RejestrOFPage,
});

function RejestrOFPage() {
  const listFn = useServerFn(listIndividualSales);
  const updateFn = useServerFn(updateIndividualSaleBuyer);
  const issueFn = useServerFn(issueInvoiceForIndividualSale);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["individual-sales"], queryFn: () => listFn() });
  const rows = (q.data as any[]) ?? [];

  const [edit, setEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await updateFn({
        data: {
          id: edit.id,
          buyer_name: edit.buyer_name ?? null,
          buyer_email: edit.buyer_email ?? null,
          buyer_address: edit.buyer_address ?? null,
          buyer_city: edit.buyer_city ?? null,
          buyer_postal_code: edit.buyer_postal_code ?? null,
          notes: edit.notes ?? null,
        },
      });
      toast.success("Dane zapisane");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["individual-sales"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function issue(row: any) {
    setBusy(true);
    try {
      await issueFn({ data: { id: row.id } });
      toast.success("Faktura wystawiona");
      void qc.invalidateQueries({ queryKey: ["individual-sales"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> Rejestr sprzedaży — osoby fizyczne
        </h1>
        <p className="text-sm text-muted-foreground">
          Transakcje od osób fizycznych. Faktura wystawiana tylko na żądanie — po uzupełnieniu
          adresu nabywcy.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transakcje ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="p-4 text-muted-foreground">Ładowanie…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-muted-foreground">Brak transakcji od osób fizycznych.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Transakcja</TableHead>
                    <TableHead>Nabywca</TableHead>
                    <TableHead>Opis</TableHead>
                    <TableHead className="text-right">Kwota</TableHead>
                    <TableHead>Faktura</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{formatDate(r.paid_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.transaction_id}</TableCell>
                      <TableCell className="text-sm">
                        {r.buyer_name ?? "—"}
                        {r.buyer_email && (
                          <div className="text-xs text-muted-foreground">{r.buyer_email}</div>
                        )}
                        {r.buyer_address && (
                          <div className="text-xs text-muted-foreground">
                            {r.buyer_address}, {r.buyer_postal_code} {r.buyer_city}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.description}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatPLN(r.gross_amount)}
                      </TableCell>
                      <TableCell>
                        {r.invoice_id ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                            Wystawiona
                          </Badge>
                        ) : r.invoice_requested_at ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                            Żądanie
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                            Brak
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEdit({ ...r })}>
                            Dane / FV
                          </Button>
                          {!r.invoice_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => issue(r)}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" /> Wystaw
                            </Button>
                          )}
                          {r.invoice_id && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 self-center" />
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

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dane nabywcy do faktury</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Imię i nazwisko</Label>
                  <Input
                    value={edit.buyer_name ?? ""}
                    onChange={(e) => setEdit({ ...edit, buyer_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={edit.buyer_email ?? ""}
                    onChange={(e) => setEdit({ ...edit, buyer_email: e.target.value })}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Ulica i numer</Label>
                  <Input
                    value={edit.buyer_address ?? ""}
                    onChange={(e) => setEdit({ ...edit, buyer_address: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kod pocztowy</Label>
                  <Input
                    value={edit.buyer_postal_code ?? ""}
                    onChange={(e) => setEdit({ ...edit, buyer_postal_code: e.target.value })}
                    placeholder="00-000"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Miasto</Label>
                  <Input
                    value={edit.buyer_city ?? ""}
                    onChange={(e) => setEdit({ ...edit, buyer_city: e.target.value })}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Notatki</Label>
                  <Input
                    value={edit.notes ?? ""}
                    onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                    placeholder="np. mail klienta z prośbą o FV"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={save} disabled={busy}>
              Zapisz dane
            </Button>
            <Button
              onClick={async () => {
                await save();
                if (edit) await issue(edit);
              }}
              disabled={busy}
            >
              <FileText className="h-4 w-4 mr-1" /> Zapisz i wystaw FV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
