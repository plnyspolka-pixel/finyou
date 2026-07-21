// Rejestr transakcji — automatyczne, ręczne i (w przyszłości) bankowe.
// Wykonanie transakcji potwierdza inwestor, jeżeli Finance You nie widzi
// faktycznego przelewu; po potwierdzeniu system liczy równowartość EUR
// (kurs średni NBP z dnia transakcji) i oznacza transakcje ponadprogowe.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAmlTransactions,
  upsertAmlTransaction,
  confirmAmlTransactionExecution,
} from "@/lib/aml/aml-transactions.functions";
import { listAmlCustomers } from "@/lib/aml/aml-customers.functions";
import { TRANSACTION_TYPE_LABELS } from "@/lib/aml/aml-types";
import { AmlEmptyState, amlCustomerLabel, formatEUR } from "@/components/aml/aml-ui";
import { formatPLN } from "@/lib/labels";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/transakcje")({
  component: AmlTransactionsScreen,
});

const EMPTY = {
  customerId: "",
  contractRef: "",
  transactionType: "wyplata_finansowania",
  transactionDate: new Date().toISOString().slice(0, 10),
  amount: "",
  currency: "PLN" as "PLN" | "EUR",
  counterpartyName: "",
  senderAccount: "",
  receiverAccount: "",
  description: "",
  executed: true,
};

function AmlTransactionsScreen() {
  const fetchTx = useServerFn(listAmlTransactions);
  const saveTx = useServerFn(upsertAmlTransaction);
  const confirmTx = useServerFn(confirmAmlTransactionExecution);
  const fetchCustomers = useServerFn(listAmlCustomers);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [rows, setRows] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([fetchTx(), fetchCustomers()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setRows(t.transactions as any[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setCustomers(c.customers as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania rejestru");
    } finally {
      setLoading(false);
    }
  }, [fetchTx, fetchCustomers]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = async () => {
    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Podaj poprawną kwotę");
      return;
    }
    setBusy("save");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      const res: any = await saveTx({
        data: {
          customerId: form.customerId || undefined,
          contractRef: form.contractRef || undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
          transactionType: form.transactionType as any,
          source: "manual",
          transactionDate: form.transactionDate,
          amount,
          currency: form.currency,
          counterpartyName: form.counterpartyName || undefined,
          senderAccount: form.senderAccount || undefined,
          receiverAccount: form.receiverAccount || undefined,
          description: form.description || undefined,
          executed: form.executed,
        },
      });
      toast.success(
        res.transaction.above_threshold
          ? "Transakcja zapisana — PONADPROGOWA, dodana do rejestru ponadprogowego"
          : "Transakcja zapisana",
      );
      setOpen(false);
      setForm(EMPTY);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu transakcji");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (id: string) => {
    setBusy(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      const res: any = await confirmTx({ data: { transactionId: id } });
      toast.success(
        res.transaction.above_threshold
          ? "Wykonanie potwierdzone — transakcja PONADPROGOWA"
          : "Wykonanie potwierdzone",
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd potwierdzenia");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rejestr transakcji</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Dodaj transakcję
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nowa transakcja</DialogTitle>
              <DialogDescription>
                Po potwierdzeniu wykonania system wyliczy równowartość EUR według średniego kursu
                NBP z dnia transakcji i w razie przekroczenia 15 000 EUR doda wpis do rejestru
                ponadprogowego.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Klient</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => setForm({ ...form, customerId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(opcjonalnie)" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {amlCustomerLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rodzaj</Label>
                <Select
                  value={form.transactionType}
                  onValueChange={(v) => setForm({ ...form, transactionType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data transakcji</Label>
                <Input
                  type="date"
                  value={form.transactionDate}
                  onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Kwota</Label>
                <Input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="np. 65000"
                />
              </div>
              <div>
                <Label>Waluta</Label>
                <Select
                  value={form.currency}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
                  onValueChange={(v) => setForm({ ...form, currency: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Umowa (oznaczenie)</Label>
                <Input
                  value={form.contractRef}
                  onChange={(e) => setForm({ ...form, contractRef: e.target.value })}
                />
              </div>
              <div>
                <Label>Kontrahent</Label>
                <Input
                  value={form.counterpartyName}
                  onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
                />
              </div>
              <div>
                <Label>Rachunek nadawcy</Label>
                <Input
                  value={form.senderAccount}
                  onChange={(e) => setForm({ ...form, senderAccount: e.target.value })}
                />
              </div>
              <div>
                <Label>Rachunek odbiorcy</Label>
                <Input
                  value={form.receiverAccount}
                  onChange={(e) => setForm({ ...form, receiverAccount: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Opis</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.executed}
                  onCheckedChange={(v) => setForm({ ...form, executed: Boolean(v) })}
                />
                Potwierdzam, że transakcja została faktycznie wykonana
              </label>
            </div>
            <DialogFooter>
              <Button onClick={() => void submit()} disabled={busy === "save"}>
                {busy === "save" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Zapisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <AmlEmptyState>Rejestr transakcji jest pusty.</AmlEmptyState>
      ) : (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Data</th>
                  <th className="py-1 pr-2">Rodzaj</th>
                  <th className="py-1 pr-2">Klient</th>
                  <th className="py-1 pr-2 text-right">Kwota</th>
                  <th className="py-1 pr-2 text-right">Równowartość EUR</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 pr-2 whitespace-nowrap">{t.transaction_date}</td>
                    <td className="py-2 pr-2">
                      {TRANSACTION_TYPE_LABELS[
                        t.transaction_type as keyof typeof TRANSACTION_TYPE_LABELS
                      ] ?? t.transaction_type}
                    </td>
                    <td className="py-2 pr-2">{amlCustomerLabel(t.aml_customers)}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">
                      {t.currency === "PLN"
                        ? formatPLN(Number(t.amount))
                        : `${Number(t.amount).toFixed(2)} EUR`}
                    </td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">
                      {formatEUR(t.eur_equivalent != null ? Number(t.eur_equivalent) : null)}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-1 flex-wrap">
                        {t.above_threshold && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            Ponadprogowa
                          </Badge>
                        )}
                        {t.executed ? (
                          <Badge variant="outline">Wykonana</Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground">Niepotwierdzona</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {!t.executed && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === t.id}
                          onClick={() => void confirm(t.id)}
                        >
                          {busy === t.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Potwierdź wykonanie
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              Transakcje ponadprogowe wymagają decyzji w{" "}
              <Link to="/inwestor/aml/ponadprogowe" className="underline">
                rejestrze ponadprogowym
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
