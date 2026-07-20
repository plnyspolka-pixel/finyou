/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Rejestr transakcji ponadprogowych (> 15 000 EUR) — kurs/tabela NBP,
// termin 7 dni, decyzja inwestora; dla przelewów opcja „raportuje bank".
// Transakcja ponadprogowa nie jest automatycznie podejrzana — można dla
// niej niezależnie utworzyć sprawę AML.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAmlThresholdEntries,
  decideAmlThresholdEntry,
} from "@/lib/aml/aml-transactions.functions";
import { upsertAmlCase } from "@/lib/aml/aml-cases.functions";
import { prepareGiifReport } from "@/lib/aml/aml-reports.functions";
import {
  THRESHOLD_DECISION_LABELS,
  TRANSACTION_TYPE_LABELS,
  TRANSFER_TRANSACTION_TYPES,
  type AmlTransactionType,
} from "@/lib/aml/aml-types";
import {
  ThresholdDecisionBadge,
  AmlEmptyState,
  amlCustomerLabel,
  formatEUR,
} from "@/components/aml/aml-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileWarning, FolderPlus, Send } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/ponadprogowe")({
  component: AmlThresholdScreen,
});

function daysLeft(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function AmlThresholdScreen() {
  const navigate = useNavigate();
  const fetchEntries = useServerFn(listAmlThresholdEntries);
  const decideEntry = useServerFn(decideAmlThresholdEntry);
  const createCase = useServerFn(upsertAmlCase);
  const prepareReport = useServerFn(prepareGiifReport);

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<any | null>(null);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [reportedByBank, setReportedByBank] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetchEntries();
      setEntries(res.entries as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania rejestru");
    } finally {
      setLoading(false);
    }
  }, [fetchEntries]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDecision = (entry: any) => {
    setDialog(entry);
    setDecision(entry.decision ?? "");
    setNote(entry.decision_note ?? "");
    setReportedByBank(Boolean(entry.reported_by_bank));
  };

  const saveDecision = async () => {
    if (!dialog || !decision) {
      toast.error("Wybierz decyzję");
      return;
    }
    setBusy("decision");
    try {
      await decideEntry({
        data: {
          entryId: dialog.id,
          decision: decision as any,
          note: note || undefined,
          reportedByBank,
        },
      });
      toast.success("Decyzja zapisana");
      setDialog(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu decyzji");
    } finally {
      setBusy(null);
    }
  };

  const makeCase = async (entry: any) => {
    setBusy(`case-${entry.id}`);
    try {
      const tx = entry.aml_transactions;
      const res: any = await createCase({
        data: {
          title: `Transakcja ponadprogowa ${tx?.transaction_date ?? ""} (${formatEUR(Number(entry.eur_equivalent))})`,
          origin: "threshold_register",
          thresholdEntryId: entry.id,
          customerId: tx?.customer_id ?? undefined,
          transactionIds: tx ? [tx.id] : undefined,
        },
      });
      toast.success(`Utworzono sprawę ${res.case.case_no}`);
      void navigate({ to: "/inwestor/aml/sprawy" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd tworzenia sprawy");
    } finally {
      setBusy(null);
    }
  };

  const makeReport = async (entry: any) => {
    setBusy(`report-${entry.id}`);
    try {
      await prepareReport({
        data: { reportType: "transakcja_ponadprogowa", thresholdEntryId: entry.id },
      });
      toast.success("Przygotowano zgłoszenie GIIF — przejdź do zakładki Zgłoszenia GIIF");
      void navigate({ to: "/inwestor/aml/zgloszenia" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd przygotowania zgłoszenia");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileWarning className="h-5 w-5" /> Rejestr transakcji ponadprogowych
      </h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <AmlEmptyState>
          Brak transakcji ponadprogowych. Wpisy powstają automatycznie, gdy wykonana transakcja
          przekroczy równowartość 15 000 EUR według średniego kursu NBP z dnia transakcji.
        </AmlEmptyState>
      ) : (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Transakcja</th>
                  <th className="py-1 pr-2">Klient</th>
                  <th className="py-1 pr-2 text-right">EUR</th>
                  <th className="py-1 pr-2">Kurs / tabela NBP</th>
                  <th className="py-1 pr-2">Termin 7 dni</th>
                  <th className="py-1 pr-2">Decyzja</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const tx = e.aml_transactions;
                  const left = daysLeft(e.deadline_at);
                  const decided = Boolean(e.decision);
                  return (
                    <tr key={e.id} className="border-t align-top">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {tx?.transaction_date}
                        <div className="text-xs text-muted-foreground">
                          {TRANSACTION_TYPE_LABELS[
                            tx?.transaction_type as keyof typeof TRANSACTION_TYPE_LABELS
                          ] ?? tx?.transaction_type}
                        </div>
                      </td>
                      <td className="py-2 pr-2">{amlCustomerLabel(tx?.aml_customers)}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {formatEUR(Number(e.eur_equivalent))}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap text-xs">
                        {Number(e.nbp_rate).toFixed(4)}
                        <br />
                        <span className="text-muted-foreground">
                          {e.nbp_table_no} ({e.nbp_table_date})
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        {decided ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : left >= 0 ? (
                          <Badge
                            className={
                              left <= 2
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {left} dni
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                            Po terminie ({-left} dni)
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <ThresholdDecisionBadge decision={e.decision} />
                        {e.reported_by_bank && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Raportuje bank / dostawca płatniczy
                          </div>
                        )}
                      </td>
                      <td className="py-2 space-x-1 whitespace-nowrap text-right">
                        <Button size="sm" variant="outline" onClick={() => openDecision(e)}>
                          Decyzja
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `report-${e.id}`}
                          onClick={() => void makeReport(e)}
                        >
                          {busy === `report-${e.id}` ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" />
                          )}
                          Przygotuj zgłoszenie
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === `case-${e.id}`}
                          onClick={() => void makeCase(e)}
                        >
                          <FolderPlus className="h-3 w-3 mr-1" /> Sprawa AML
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(dialog)} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decyzja dla transakcji ponadprogowej</DialogTitle>
            <DialogDescription>
              Gotówka powyżej progu jest domyślnie oznaczona do zgłoszenia. Dla przelewu możesz
              wskazać, że transakcję raportuje bank lub inny dostawca usług płatniczych.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Decyzja</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(THRESHOLD_DECISION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dialog &&
              TRANSFER_TRANSACTION_TYPES.includes(
                dialog.aml_transactions?.transaction_type as AmlTransactionType,
              ) && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={reportedByBank}
                    onCheckedChange={(v) => setReportedByBank(Boolean(v))}
                  />
                  Transfer raportuje bank lub inny dostawca usług płatniczych
                </label>
              )}
            <div>
              <Label>Notatka</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void saveDecision()} disabled={busy === "decision"}>
              {busy === "decision" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Zapisz
              decyzję
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
