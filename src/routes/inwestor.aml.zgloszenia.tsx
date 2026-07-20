/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Zgłoszenia GIIF — przygotowanie (bez podpisu): kompletność, XML + PDF,
// wersje i hashe, zatwierdzenie treści, pobranie pakietu. Dopiero przycisk
// „Podpisz i zgłoś do GIIF" wymaga kwalifikowanego podpisu elektronicznego:
//  - wariant A (aktywne połączenie SI*GIIF): podpis lokalny → wgranie
//    podpisanego pliku → weryfikacja → szyfrowanie → wysyłka mTLS,
//  - wariant B (brak połączenia): kontekstowy kreator rejestracji SI*GIIF
//    bez opuszczania zgłoszenia — po rejestracji wracamy do podpisu.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listGiifReports,
  prepareGiifReport,
  generateGiifDocuments,
  approveGiifReportContent,
  getGiifReportDownloads,
  startGiifSubmission,
  uploadSignedGiifReport,
  giifRegistrationPrepare,
  giifRegistrationSubmit,
  giifRegistrationFinish,
} from "@/lib/aml/aml-reports.functions";
import { REPORT_TYPE_LABELS } from "@/lib/aml/aml-types";
import { ReportStatusBadge, AmlEmptyState, fileToBase64 } from "@/components/aml/aml-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, Plus, FileDown, FileCheck2, PenLine, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/zgloszenia")({
  component: AmlReportsScreen,
});

type WizardState =
  | { step: "intro" }
  | { step: "prepared"; certificateId: string; registrationDocument: string; csrPem: string }
  | { step: "submitted"; certificateId: string }
  | { step: "done"; mtlsOk: boolean };

function AmlReportsScreen() {
  const fetchReports = useServerFn(listGiifReports);
  const prepare = useServerFn(prepareGiifReport);
  const generate = useServerFn(generateGiifDocuments);
  const approve = useServerFn(approveGiifReportContent);
  const downloads = useServerFn(getGiifReportDownloads);
  const startSubmission = useServerFn(startGiifSubmission);
  const uploadSigned = useServerFn(uploadSignedGiifReport);
  const regPrepare = useServerFn(giifRegistrationPrepare);
  const regSubmit = useServerFn(giifRegistrationSubmit);
  const regFinish = useServerFn(giifRegistrationFinish);

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [prepForm, setPrepForm] = useState({
    reportType: "okolicznosci_podejrzane",
    justification: "",
  });

  // Dialog podpisu i wysyłki ("Podpisz i zgłoś do GIIF").
  const [signDialog, setSignDialog] = useState<{
    report: any;
    variant: "A" | "B";
    documentUrl?: string | null;
    message?: string;
  } | null>(null);
  const [wizard, setWizard] = useState<WizardState>({ step: "intro" });

  const reload = useCallback(async () => {
    try {
      const res = await fetchReports();
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

  const doPrepare = async () => {
    setBusy("prepare");
    try {
      await prepare({
        data: {
          reportType: prepForm.reportType as any,
          justification: prepForm.justification || undefined,
        },
      });
      toast.success("Przygotowano zgłoszenie (dane pobrane automatycznie z profilu)");
      setPrepareOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd przygotowania");
    } finally {
      setBusy(null);
    }
  };

  const doGenerate = async (r: any) => {
    setBusy(`gen-${r.id}`);
    try {
      const res: any = await generate({ data: { reportId: r.id } });
      if (!res.ok) {
        const missing = res.completeness?.missing ?? res.xsdErrors ?? [];
        toast.error(`${res.message} ${missing.slice(0, 3).join("; ")}`);
      } else {
        toast.success(`Wygenerowano XML i PDF (wersja ${res.version})`);
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd generowania");
    } finally {
      setBusy(null);
    }
  };

  const doApprove = async (r: any) => {
    setBusy(`app-${r.id}`);
    try {
      await approve({ data: { reportId: r.id } });
      toast.success("Treść zgłoszenia zatwierdzona");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zatwierdzania");
    } finally {
      setBusy(null);
    }
  };

  const doDownload = async (r: any) => {
    setBusy(`dl-${r.id}`);
    try {
      const res = await downloads({ data: { reportId: r.id } });
      const links = [res.xmlUrl, res.pdfUrl].filter(Boolean) as string[];
      if (links.length === 0) {
        toast.error("Brak wygenerowanych dokumentów");
      } else {
        for (const url of links) window.open(url, "_blank");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd pobierania");
    } finally {
      setBusy(null);
    }
  };

  const doStartSubmission = async (r: any) => {
    setBusy(`sub-${r.id}`);
    try {
      const res: any = await startSubmission({ data: { reportId: r.id } });
      setWizard({ step: "intro" });
      setSignDialog({
        report: r,
        variant: res.variant,
        documentUrl: res.documentUrl,
        message: res.message,
      });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd rozpoczęcia wysyłki");
    } finally {
      setBusy(null);
    }
  };

  const doUploadSigned = async (file: File) => {
    if (!signDialog) return;
    setBusy("upload-signed");
    try {
      const base64 = await fileToBase64(file);
      const res: any = await uploadSigned({
        data: { reportId: signDialog.report.id, signedBase64: base64 },
      });
      if (!res.ok) {
        toast.error(`Podpis odrzucony: ${res.errors.join("; ")}`);
      } else {
        toast.success(
          `Podpis zweryfikowany (${res.signer ?? "podpisujący"}) — zgłoszenie w kolejce wysyłki`,
        );
        setSignDialog(null);
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wgrywania podpisanego pliku");
    } finally {
      setBusy(null);
    }
  };

  // ── Kreator rejestracji SI*GIIF (wariant B) ─────────────────────────
  const wizardPrepare = async () => {
    setBusy("wiz-prepare");
    try {
      const res: any = await regPrepare();
      if (!res.ok) {
        toast.error(`Uzupełnij w ustawieniach: ${res.missing.join(", ")}`);
        return;
      }
      setWizard({
        step: "prepared",
        certificateId: res.certificateId,
        registrationDocument: res.registrationDocument,
        csrPem: res.csrPem,
      });
      toast.success("Przygotowano dokument rejestracyjny i bezpiecznie wygenerowano klucz + CSR");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd kreatora");
    } finally {
      setBusy(null);
    }
  };

  const wizardSubmit = async (file: File) => {
    if (wizard.step !== "prepared") return;
    setBusy("wiz-submit");
    try {
      const base64 = await fileToBase64(file);
      const res: any = await regSubmit({
        data: { certificateId: wizard.certificateId, signedRegistrationBase64: base64 },
      });
      if (!res.ok) {
        toast.error(`Rejestracja odrzucona: ${res.errors.join("; ")}`);
        return;
      }
      setWizard({ step: "submitted", certificateId: wizard.certificateId });
      toast.success("Dokumenty rejestracyjne przesłane do SI*GIIF");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wysyłki rejestracji");
    } finally {
      setBusy(null);
    }
  };

  const wizardFinish = async (certificatePem?: string) => {
    if (wizard.step !== "submitted") return;
    setBusy("wiz-finish");
    try {
      const res: any = await regFinish({
        data: { certificateId: wizard.certificateId, certificatePem: certificatePem || undefined },
      });
      if (!res.ok) {
        toast.error(`Krok ${res.step}: ${res.error}`);
        return;
      }
      setWizard({ step: "done", mtlsOk: res.mtlsOk });
      toast.success(
        res.mtlsOk
          ? "Certyfikat aktywny, mTLS przetestowane — możesz podpisać i wysłać zgłoszenie"
          : "Certyfikat zapisany — test mTLS do powtórzenia",
      );
      // Wracamy automatycznie do przygotowanego zgłoszenia (wariant A).
      if (res.mtlsOk && signDialog) {
        const again: any = await startSubmission({ data: { reportId: signDialog.report.id } });
        setSignDialog({ ...signDialog, variant: again.variant, documentUrl: again.documentUrl });
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd finalizacji rejestracji");
    } finally {
      setBusy(null);
    }
  };

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
                System automatycznie pobierze dane inwestora, osobę odpowiedzialną z profilu,
                klienta, strony, rachunki, kwoty i dane umowy. Ta część działa bez podpisu
                kwalifikowanego. Zgłoszenia dla konkretnej sprawy albo transakcji ponadprogowej
                przygotujesz z ekranów „Sprawy AML" i „Transakcje ponadprogowe".
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Rodzaj zgłoszenia</Label>
                <Select
                  value={prepForm.reportType}
                  onValueChange={(v) => setPrepForm({ ...prepForm, reportType: v })}
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

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <AmlEmptyState>
          Brak zgłoszeń. Przygotuj zgłoszenie — podpis będzie potrzebny dopiero przy wysyłce.
        </AmlEmptyState>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {REPORT_TYPE_LABELS[r.report_type as keyof typeof REPORT_TYPE_LABELS] ??
                      r.report_type}
                  </span>
                  <ReportStatusBadge status={r.status} />
                  {r.aml_cases && (
                    <span className="text-muted-foreground">• {r.aml_cases.case_no}</span>
                  )}
                  {r.current_version > 0 && (
                    <span className="text-muted-foreground">v{r.current_version}</span>
                  )}
                  {r.xml_sha256 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      SHA-256: {r.xml_sha256.slice(0, 16)}…
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pl-PL")}
                  </span>
                </div>
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
                  {r.status === "complete" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `app-${r.id}`}
                      onClick={() => void doApprove(r)}
                    >
                      Zatwierdź treść
                    </Button>
                  )}
                  {r.current_version > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `dl-${r.id}`}
                      onClick={() => void doDownload(r)}
                    >
                      <FileDown className="h-3 w-3 mr-1" /> Pobierz pakiet
                    </Button>
                  )}
                  {[
                    "content_approved",
                    "awaiting_signature",
                    "correction_required",
                    "error",
                  ].includes(r.status) && (
                    <Button
                      size="sm"
                      disabled={busy === `sub-${r.id}`}
                      onClick={() => void doStartSubmission(r)}
                    >
                      {busy === `sub-${r.id}` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <PenLine className="h-3 w-3 mr-1" />
                      )}
                      Podpisz i zgłoś do GIIF
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog podpisu / kreatora rejestracji */}
      <Dialog open={Boolean(signDialog)} onOpenChange={(o) => !o && setSignDialog(null)}>
        <DialogContent className="max-w-2xl">
          {signDialog?.variant === "A" ? (
            <>
              <DialogHeader>
                <DialogTitle>Podpisz i zgłoś do GIIF</DialogTitle>
                <DialogDescription>
                  Potwierdź dane finalnego dokumentu, podpisz go kwalifikowanym podpisem
                  elektronicznym lokalnie (CAdES/PKCS#7) i wgraj podpisany plik. Finance You nie
                  pobiera ani nie zapisuje PIN-u, nie przechowuje podpisu ani klucza prywatnego.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  „Profil Zaufany ani podpis zaufany nie zastępują kwalifikowanego podpisu
                  elektronicznego wymaganego przez SI*GIIF."
                </p>
                {signDialog.documentUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(signDialog.documentUrl!, "_blank")}
                  >
                    <FileDown className="h-3 w-3 mr-1" /> Pobierz finalny dokument (XML)
                  </Button>
                )}
                <div>
                  <Label>Wgraj podpisany plik (.p7s / .xades / .sig)</Label>
                  <input
                    type="file"
                    className="block mt-1 text-sm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void doUploadSigned(f);
                      e.target.value = "";
                    }}
                  />
                  {busy === "upload-signed" && (
                    <p className="flex items-center gap-2 text-muted-foreground mt-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Weryfikacja podpisu, szyfrowanie
                      certyfikatem GIIF i kolejka wysyłki mTLS…
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" /> Jednorazowa rejestracja w SI*GIIF
                </DialogTitle>
                <DialogDescription>{signDialog?.message}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Twoje przygotowane zgłoszenie nie zniknie — po zakończeniu rejestracji wrócisz do
                  niego automatycznie, bez ponownego wpisywania danych.
                </p>

                {wizard.step === "intro" && (
                  <Button onClick={() => void wizardPrepare()} disabled={busy === "wiz-prepare"}>
                    {busy === "wiz-prepare" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    1. Przygotuj dokument rejestracji + klucz i CSR
                  </Button>
                )}

                {wizard.step === "prepared" && (
                  <div className="space-y-3">
                    <p className="font-medium">
                      2. Podpisz dokument rejestracyjny kwalifikowanym podpisem (lokalnie) i wgraj
                      podpisany plik:
                    </p>
                    <Textarea
                      readOnly
                      rows={6}
                      value={wizard.registrationDocument}
                      className="font-mono text-xs"
                    />
                    <details className="text-xs text-muted-foreground">
                      <summary>CSR (wniosek o certyfikat komunikacyjny)</summary>
                      <pre className="whitespace-pre-wrap break-all">{wizard.csrPem}</pre>
                    </details>
                    <input
                      type="file"
                      className="block text-sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void wizardSubmit(f);
                        e.target.value = "";
                      }}
                    />
                    {busy === "wiz-submit" && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Weryfikacja podpisu i wysyłka
                        rejestracji do SI*GIIF…
                      </p>
                    )}
                  </div>
                )}

                {wizard.step === "submitted" && (
                  <div className="space-y-3">
                    <p className="font-medium">
                      3. Pobierz certyfikat komunikacyjny i przetestuj połączenie mTLS:
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button onClick={() => void wizardFinish()} disabled={busy === "wiz-finish"}>
                        {busy === "wiz-finish" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Pobierz certyfikat z SI*GIIF
                      </Button>
                      <label>
                        <input
                          type="file"
                          accept=".pem,.crt,.cer"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) void wizardFinish(await f.text());
                            e.target.value = "";
                          }}
                        />
                        <Button variant="outline" asChild>
                          <span>Wgraj wydany certyfikat (PEM)</span>
                        </Button>
                      </label>
                    </div>
                  </div>
                )}

                {wizard.step === "done" && (
                  <p className={wizard.mtlsOk ? "text-emerald-600" : "text-amber-600"}>
                    {wizard.mtlsOk
                      ? "Połączenie z SI*GIIF aktywne. Wracamy do Twojego zgłoszenia — podpisz finalny dokument."
                      : "Certyfikat zapisany, ale test mTLS nie przeszedł — sprawdź konfigurację i spróbuj ponownie."}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
