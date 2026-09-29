// Zgłoszenia GIIF — przygotowanie (XML + PDF, wersja i hash), wysyłka
// i potwierdzenia w jednym miejscu. Wysyłka odbywa się poza platformą:
//  - elektronicznie w SI*GIIF (ścieżka ustawowa, kwalifikowany podpis),
//  - papierowo (awaryjnie, bez podpisu kwalifikowanego) — generujemy
//    zawiadomienie do wydruku, podpisu własnoręcznego i wysyłki poleconym.
// Po wysyłce inwestor rejestruje ją tutaj i dołącza UPO albo dowód nadania.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listGiifReports,
  prepareGiifReport,
  generateGiifDocuments,
  getGiifReportDownloads,
  buildGiifPaperNotice,
  recordGiifSubmission,
  uploadGiifConfirmation,
} from "@/lib/aml/aml-reports.functions";
import { GIIF_POSTAL_ADDRESS, paperAllowedFor } from "@/lib/aml/giif-paper";
import { REPORT_TYPE_LABELS, type AmlReportType } from "@/lib/aml/aml-types";
import { ReportStatusBadge, AmlEmptyState, fileToBase64 } from "@/components/aml/aml-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Loader2,
  Plus,
  FileDown,
  FileCheck2,
  Send,
  Printer,
  Upload,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/zgloszenia")({
  component: AmlReportsScreen,
});

const SI_GIIF_URL = "https://giif.mofnet.gov.pl";
const SENDABLE = ["complete", "content_approved", "correction_required", "error"];
const SENT = ["submitted", "upo_received"];
const CHANNEL_LABELS: Record<string, string> = {
  si_giif: "SI*GIIF (elektronicznie)",
  paper: "Papierowo (list polecony)",
};

const today = () => new Date().toISOString().slice(0, 10);

function AmlReportsScreen() {
  const fetchReports = useServerFn(listGiifReports);
  const prepare = useServerFn(prepareGiifReport);
  const generate = useServerFn(generateGiifDocuments);
  const downloads = useServerFn(getGiifReportDownloads);
  const paperNotice = useServerFn(buildGiifPaperNotice);
  const record = useServerFn(recordGiifSubmission);
  const uploadConfirmation = useServerFn(uploadGiifConfirmation);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [prepForm, setPrepForm] = useState({
    reportType: "okolicznosci_podejrzane" as AmlReportType,
    justification: "",
  });

  // Dialog wysyłki.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [sendReport, setSendReport] = useState<any | null>(null);
  const [channel, setChannel] = useState<"si_giif" | "paper">("si_giif");
  const [sendForm, setSendForm] = useState({ date: today(), reference: "", reason: "" });
  const [confirmationFile, setConfirmationFile] = useState<File | null>(null);
  const [paperReady, setPaperReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetchReports();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setReports(res.reports as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania zgłoszeń");
    } finally {
      setLoading(false);
    }
  }, [fetchReports]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (key: string, fn: () => Promise<void>, errMsg: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errMsg);
    } finally {
      setBusy(null);
    }
  };

  const doPrepare = () =>
    run(
      "prepare",
      async () => {
        await prepare({
          data: {
            reportType: prepForm.reportType,
            justification: prepForm.justification || undefined,
          },
        });
        toast.success("Przygotowano zgłoszenie (dane pobrane automatycznie z profilu)");
        setPrepareOpen(false);
        await reload();
      },
      "Błąd przygotowania",
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const doGenerate = (r: any) =>
    run(
      `gen-${r.id}`,
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
        const res: any = await generate({ data: { reportId: r.id } });
        if (!res.ok) {
          const missing = res.completeness?.missing ?? res.xsdErrors ?? [];
          toast.error(`${res.message} ${missing.slice(0, 3).join("; ")}`);
        } else {
          toast.success(`Wygenerowano XML i PDF (wersja ${res.version})`);
        }
        await reload();
      },
      "Błąd generowania",
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const doDownload = (r: any, which: "docs" | "confirmation") =>
    run(
      `dl-${which}-${r.id}`,
      async () => {
        const res = await downloads({ data: { reportId: r.id } });
        const links = (which === "docs" ? [res.xmlUrl, res.pdfUrl] : [res.upoUrl]).filter(
          Boolean,
        ) as string[];
        if (links.length === 0) toast.error("Brak plików do pobrania");
        for (const url of links) window.open(url, "_blank");
      },
      "Błąd pobierania",
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const openSend = (r: any) => {
    setSendReport(r);
    setChannel("si_giif");
    setSendForm({ date: today(), reference: "", reason: "" });
    setConfirmationFile(null);
    setPaperReady(Boolean(r.giif_response?.paperNotice));
  };

  const doPrintPaper = () =>
    run(
      "paper",
      async () => {
        if (!sendReport) return;
        const res = await paperNotice({
          data: { reportId: sendReport.id, reason: sendForm.reason },
        });
        const url = URL.createObjectURL(new Blob([res.html], { type: "text/html;charset=utf-8" }));
        const w = window.open(url, "_blank");
        if (!w) toast.error("Przeglądarka zablokowała nowe okno — zezwól na wyskakujące okna");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setPaperReady(true);
        toast.success("Zawiadomienie gotowe do wydruku (kopia zapisana w archiwum zgłoszenia)");
      },
      "Błąd generowania zawiadomienia",
    );

  const doRecord = () =>
    run(
      "record",
      async () => {
        if (!sendReport) return;
        await record({
          data: {
            reportId: sendReport.id,
            channel,
            submittedAt: sendForm.date,
            reference: sendForm.reference || undefined,
            confirmation: confirmationFile
              ? { base64: await fileToBase64(confirmationFile), fileName: confirmationFile.name }
              : undefined,
          },
        });
        toast.success("Wysyłka zarejestrowana");
        setSendReport(null);
        await reload();
      },
      "Błąd rejestracji wysyłki",
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const doUploadConfirmation = (r: any, file: File) =>
    run(
      `conf-${r.id}`,
      async () => {
        await uploadConfirmation({
          data: {
            reportId: r.id,
            confirmation: { base64: await fileToBase64(file), fileName: file.name },
          },
        });
        toast.success("Potwierdzenie dołączone");
        await reload();
      },
      "Błąd wgrywania potwierdzenia",
    );

  const sendType = sendReport?.report_type as AmlReportType | undefined;
  const paperAllowed = sendType ? paperAllowedFor(sendType) : true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Zgłoszenia GIIF</h2>
        <Dialog open={prepareOpen} onOpenChange={setPrepareOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Przygotuj zgłoszenie
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Przygotowanie zgłoszenia do GIIF</DialogTitle>
              <DialogDescription>
                Dane instytucji, osoby odpowiedzialnej, klienta, stron, rachunków i kwot pobierzemy
                automatycznie. Zgłoszenie dla konkretnej sprawy albo transakcji ponadprogowej
                przygotujesz z ekranów „Sprawy AML" i „Transakcje".
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Rodzaj zgłoszenia</Label>
                <Select
                  value={prepForm.reportType}
                  onValueChange={(v) =>
                    setPrepForm({ ...prepForm, reportType: v as AmlReportType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Uzasadnienie</Label>
                <Textarea
                  rows={3}
                  value={prepForm.justification}
                  onChange={(e) => setPrepForm({ ...prepForm, justification: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void doPrepare()} disabled={busy === "prepare"}>
                {busy === "prepare" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Przygotuj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="py-3 text-sm text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">1.</span> Przygotuj zgłoszenie i wygeneruj
            XML + PDF. <span className="font-medium text-foreground">2.</span> Wyślij je w{" "}
            <a href={SI_GIIF_URL} target="_blank" rel="noreferrer" className="underline">
              SI*GIIF
            </a>{" "}
            z kwalifikowanym podpisem — albo, gdy nie masz podpisu, wydrukuj zawiadomienie papierowe
            i wyślij je listem poleconym. <span className="font-medium text-foreground">3.</span>{" "}
            Zarejestruj wysyłkę tutaj i dołącz UPO lub dowód nadania.
          </p>
          <p className="text-xs">
            Terminy: zawiadomienie z art. 74 — niezwłocznie, nie później niż 2 dni robocze od
            potwierdzenia podejrzenia; transakcja ponadprogowa (art. 72) — 7 dni.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <AmlEmptyState>Brak zgłoszeń.</AmlEmptyState>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {REPORT_TYPE_LABELS[r.report_type as AmlReportType] ?? r.report_type}
                  </span>
                  <ReportStatusBadge status={r.status} />
                  {r.aml_cases && (
                    <span className="text-muted-foreground">• {r.aml_cases.case_no}</span>
                  )}
                  {r.current_version > 0 && (
                    <span className="text-muted-foreground">v{r.current_version}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pl-PL")}
                  </span>
                </div>
                {SENT.includes(r.status) && (
                  <p className="text-xs text-muted-foreground">
                    {CHANNEL_LABELS[r.giif_status] ?? r.giif_status}
                    {r.submitted_at &&
                      ` • wysłano ${new Date(r.submitted_at).toLocaleDateString("pl-PL")}`}
                    {r.giif_submission_id && ` • nr: ${r.giif_submission_id}`}
                  </p>
                )}
                {r.completeness && !r.completeness.complete && (
                  <p className="text-xs text-amber-600">
                    Braki: {(r.completeness.missing as string[]).slice(0, 4).join("; ")}
                    {(r.completeness.missing as string[]).length > 4 ? "…" : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {["draft", "complete", "correction_required"].includes(r.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `gen-${r.id}`}
                      onClick={() => void doGenerate(r)}
                    >
                      {busy === `gen-${r.id}` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <FileCheck2 className="h-3 w-3 mr-1" />
                      )}
                      Generuj XML + PDF
                    </Button>
                  )}
                  {r.current_version > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `dl-docs-${r.id}`}
                      onClick={() => void doDownload(r, "docs")}
                    >
                      <FileDown className="h-3 w-3 mr-1" /> Pobierz XML + PDF
                    </Button>
                  )}
                  {SENDABLE.includes(r.status) && r.current_version > 0 && (
                    <Button size="sm" onClick={() => openSend(r)}>
                      <Send className="h-3 w-3 mr-1" /> Wyślij
                    </Button>
                  )}
                  {r.status === "upo_received" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `dl-confirmation-${r.id}`}
                      onClick={() => void doDownload(r, "confirmation")}
                    >
                      <FileDown className="h-3 w-3 mr-1" /> Potwierdzenie
                    </Button>
                  )}
                  {r.status === "submitted" && (
                    <label>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void doUploadConfirmation(r, f);
                          e.target.value = "";
                        }}
                      />
                      <Button size="sm" variant="outline" asChild>
                        <span>
                          {busy === `conf-${r.id}` ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3 mr-1" />
                          )}
                          Dołącz UPO / ZPO
                        </span>
                      </Button>
                    </label>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(sendReport)} onOpenChange={(o) => !o && setSendReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Wyślij zgłoszenie do GIIF</DialogTitle>
            <DialogDescription>
              {sendType ? REPORT_TYPE_LABELS[sendType] : ""} — wybierz sposób wysyłki.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={channel} onValueChange={(v) => setChannel(v as "si_giif" | "paper")}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="si_giif">Elektronicznie (SI*GIIF)</TabsTrigger>
              <TabsTrigger value="paper">Papierowo (bez podpisu kwalif.)</TabsTrigger>
            </TabsList>

            <TabsContent value="si_giif" className="space-y-2 text-sm">
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>Pobierz XML i PDF zgłoszenia (przycisk na liście).</li>
                <li>
                  Zaloguj się do{" "}
                  <a href={SI_GIIF_URL} target="_blank" rel="noreferrer" className="underline">
                    SI*GIIF
                  </a>
                  , wprowadź zgłoszenie i podpisz je kwalifikowanym podpisem elektronicznym (albo
                  kwalifikowaną pieczęcią). Profil zaufany nie wystarcza.
                </li>
                <li>Wpisz poniżej identyfikator zgłoszenia i dołącz UPO.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Nie masz podpisu? Zgłoszenie może wysłać pełnomocnik (np. kancelaria) z własnym
                podpisem kwalifikowanym.
              </p>
            </TabsContent>

            <TabsContent value="paper" className="space-y-3 text-sm">
              {!paperAllowed ? (
                <div className="flex gap-2 rounded-md border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Informacje o transakcjach ponadprogowych (art. 72) przekazuje się wyłącznie
                    elektronicznie przez SI*GIIF — wysyłka papierowa nie wykonuje tego obowiązku.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 rounded-md border border-amber-300 p-3 dark:border-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Ścieżka awaryjna.</span> Ustawa
                      AML przewiduje przekazywanie zawiadomień do GIIF elektronicznie (SI*GIIF).
                      Papier stosuj tylko, gdy wysyłka elektroniczna nie jest możliwa — podaj
                      przyczynę, a po uzyskaniu podpisu kwalifikowanego (lub przez pełnomocnika)
                      prześlij zgłoszenie także przez SI*GIIF.
                    </p>
                  </div>
                  <div>
                    <Label>Przyczyna wysyłki papierowej</Label>
                    <Input
                      value={sendForm.reason}
                      placeholder="np. brak kwalifikowanego podpisu elektronicznego"
                      onChange={(e) => setSendForm({ ...sendForm, reason: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === "paper" || sendForm.reason.trim().length < 5}
                    onClick={() => void doPrintPaper()}
                  >
                    {busy === "paper" ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Printer className="h-3 w-3 mr-1" />
                    )}
                    Generuj zawiadomienie do druku
                  </Button>
                  <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                    <li>Wydrukuj zawiadomienie i podpisz je własnoręcznie.</li>
                    <li>
                      Wyślij listem poleconym za potwierdzeniem odbioru, w zaklejonej kopercie z
                      dopiskiem „Poufne" na adres: {GIIF_POSTAL_ADDRESS.join(", ")}.
                    </li>
                    <li>
                      Zachowaj kopię. Nie informuj klienta o zawiadomieniu (art. 54 ustawy AML).
                    </li>
                    <li>Wpisz poniżej datę i numer nadania, dołącz skan dowodu nadania.</li>
                  </ol>
                </>
              )}
            </TabsContent>
          </Tabs>

          {(channel === "si_giif" || paperAllowed) && (
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <Label>Data wysyłki</Label>
                <Input
                  type="date"
                  value={sendForm.date}
                  onChange={(e) => setSendForm({ ...sendForm, date: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  {channel === "si_giif" ? "Identyfikator zgłoszenia w SI*GIIF" : "Numer nadania"}
                </Label>
                <Input
                  value={sendForm.reference}
                  onChange={(e) => setSendForm({ ...sendForm, reference: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>
                  {channel === "si_giif"
                    ? "UPO (opcjonalnie — możesz dołączyć później)"
                    : "Dowód nadania / ZPO (opcjonalnie — możesz dołączyć później)"}
                </Label>
                <input
                  type="file"
                  className="block mt-1 text-sm"
                  onChange={(e) => setConfirmationFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => void doRecord()}
              disabled={
                busy === "record" || (channel === "paper" && (!paperAllowed || !paperReady))
              }
            >
              {busy === "record" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {channel === "paper"
                ? "Potwierdzam wysyłkę papierową"
                : "Potwierdzam wysyłkę w SI*GIIF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
