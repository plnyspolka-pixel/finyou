// Sprawy AML — tworzone z klienta, screeningu, rozbieżności CRBR, oceny
// ryzyka, transakcji, rejestru ponadprogowego albo ręcznie.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAmlCases,
  getAmlCase,
  upsertAmlCase,
  setAmlCaseStatus,
  addAmlAttachment,
} from "@/lib/aml/aml-cases.functions";
import { listAmlCustomers } from "@/lib/aml/aml-customers.functions";
import { prepareGiifReport } from "@/lib/aml/aml-reports.functions";
import { CASE_STATUS_LABELS, CASE_ORIGIN_LABELS } from "@/lib/aml/aml-types";
import {
  CaseStatusBadge,
  AmlEmptyState,
  amlCustomerLabel,
  fileToBase64,
} from "@/components/aml/aml-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus, FolderOpen, Paperclip, Send } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/sprawy")({
  component: AmlCasesScreen,
});

function AmlCasesScreen() {
  const navigate = useNavigate();
  const fetchCases = useServerFn(listAmlCases);
  const fetchCase = useServerFn(getAmlCase);
  const saveCase = useServerFn(upsertAmlCase);
  const setStatus = useServerFn(setAmlCaseStatus);
  const addAttachment = useServerFn(addAmlAttachment);
  const fetchCustomers = useServerFn(listAmlCustomers);
  const prepareReport = useServerFn(prepareGiifReport);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [cases, setCases] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    customerId: "",
    description: "",
    justification: "",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [detail, setDetail] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [c, k] = await Promise.all([fetchCases(), fetchCustomers()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setCases(c.cases as any[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setCustomers(k.customers as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania spraw");
    } finally {
      setLoading(false);
    }
  }, [fetchCases, fetchCustomers]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDetail = async (id: string) => {
    const res = await fetchCase({ data: { caseId: id } });
    setDetail(res);
  };

  const submit = async () => {
    if (form.title.trim().length < 3) {
      toast.error("Podaj tytuł sprawy");
      return;
    }
    setBusy("save");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      const res: any = await saveCase({
        data: {
          title: form.title,
          origin: "manual",
          customerId: form.customerId || undefined,
          description: form.description || undefined,
          justification: form.justification || undefined,
        },
      });
      toast.success(`Utworzono sprawę ${res.case.case_no}`);
      setOpen(false);
      setForm({ title: "", customerId: "", description: "", justification: "" });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd tworzenia sprawy");
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (caseId: string, status: string) => {
    setBusy(`status-${caseId}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      await setStatus({ data: { caseId, status: status as any } });
      toast.success("Zmieniono status sprawy");
      await reload();
      if (detail?.case?.id === caseId) await openDetail(caseId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zmiany statusu");
    } finally {
      setBusy(null);
    }
  };

  const uploadAttachment = async (caseId: string, file: File) => {
    setBusy(`att-${caseId}`);
    try {
      const base64 = await fileToBase64(file);
      await addAttachment({
        data: {
          caseId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
        },
      });
      toast.success("Dodano załącznik");
      await openDetail(caseId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wgrywania załącznika");
    } finally {
      setBusy(null);
    }
  };

  const makeReport = async (caseId: string, reportType: string) => {
    setBusy(`report-${caseId}`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      await prepareReport({ data: { reportType: reportType as any, caseId } });
      toast.success("Przygotowano zgłoszenie GIIF");
      void navigate({ to: "/inwestor/aml/zgloszenia" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd przygotowania zgłoszenia");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen className="h-5 w-5" /> Sprawy AML
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nowa sprawa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowa sprawa AML</DialogTitle>
              <DialogDescription>
                Sprawę można też utworzyć bezpośrednio z klienta, screeningu, transakcji albo
                rejestru ponadprogowego.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tytuł</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
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
                <Label>Opis zdarzeń</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Uzasadnienie</Label>
                <Textarea
                  rows={2}
                  value={form.justification}
                  onChange={(e) => setForm({ ...form, justification: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void submit()} disabled={busy === "save"}>
                {busy === "save" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Utwórz sprawę
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <AmlEmptyState>Brak spraw AML.</AmlEmptyState>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <Card key={c.id} className="cursor-pointer" onClick={() => void openDetail(c.id)}>
              <CardContent className="py-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{c.case_no}</span>
                <span className="font-medium">{c.title}</span>
                <CaseStatusBadge status={c.status} />
                <span className="text-muted-foreground">
                  {CASE_ORIGIN_LABELS[c.origin as keyof typeof CASE_ORIGIN_LABELS]}
                </span>
                {c.aml_customers && (
                  <span className="text-muted-foreground">
                    • {amlCustomerLabel(c.aml_customers)}
                  </span>
                )}
                <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                  <Select value={c.status} onValueChange={(v) => void changeStatus(c.id, v)}>
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CASE_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              {detail.case.case_no}: {detail.case.title}
              <CaseStatusBadge status={detail.case.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.case.description && (
              <p>
                <span className="text-muted-foreground">Opis:</span> {detail.case.description}
              </p>
            )}
            {detail.case.justification && (
              <p>
                <span className="text-muted-foreground">Uzasadnienie:</span>{" "}
                {detail.case.justification}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy === `report-${detail.case.id}`}
                onClick={() => void makeReport(detail.case.id, "okolicznosci_podejrzane")}
              >
                <Send className="h-3 w-3 mr-1" /> Zgłoszenie: okoliczności (art. 74)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === `report-${detail.case.id}`}
                onClick={() => void makeReport(detail.case.id, "planowana_transakcja_podejrzana")}
              >
                <Send className="h-3 w-3 mr-1" /> Zgłoszenie: planowana transakcja (art. 86)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === `report-${detail.case.id}`}
                onClick={() => void makeReport(detail.case.id, "transakcja_przeprowadzona")}
              >
                <Send className="h-3 w-3 mr-1" /> Zgłoszenie: transakcja przeprowadzona (art. 89/90)
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAttachment(detail.case.id, f);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                  disabled={busy === `att-${detail.case.id}`}
                >
                  <span>
                    <Paperclip className="h-3 w-3 mr-1" /> Dodaj załącznik
                  </span>
                </Button>
              </label>
            </div>

            {detail.transactions.length > 0 && (
              <div>
                <p className="font-medium">Transakcje w sprawie</p>
                <ul className="list-disc ml-5 text-muted-foreground">
                  {detail.transactions.map((t: any) => (
                    <li key={t.id}>
                      {t.transaction_date} — {t.transaction_type} — {Number(t.amount).toFixed(2)}{" "}
                      {t.currency}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.attachments.length > 0 && (
              <div>
                <p className="font-medium">Załączniki</p>
                <ul className="list-disc ml-5 text-muted-foreground">
                  {detail.attachments.map((a: any) => (
                    <li key={a.id}>{a.file_name}</li>
                  ))}
                </ul>
              </div>
            )}
            {detail.reports.length > 0 && (
              <div>
                <p className="font-medium">Zgłoszenia GIIF w sprawie</p>
                <ul className="list-disc ml-5 text-muted-foreground">
                  {detail.reports.map((r: any) => (
                    <li key={r.id}>
                      {r.report_type} — {r.status} (v{r.current_version})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.audit.length > 0 && (
              <div>
                <p className="font-medium">Historia (audyt — nieusuwalny)</p>
                <ul className="ml-1 text-xs text-muted-foreground space-y-0.5">
                  {detail.audit.slice(0, 20).map((a: any) => (
                    <li key={a.id}>
                      {new Date(a.created_at).toLocaleString("pl-PL")} — {a.action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
