import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, CheckCircle2, ClipboardPaste } from "lucide-react";
import { KW_STATUS_LABEL, KW_SECTIONS, isValidKwFormat, type KwStatus } from "@/lib/kw";
import { ensureKwJob, retryKwJob, submitManualKwSections, getKwBundle } from "@/lib/kw.functions";
import { formatDateTime } from "@/lib/labels";

type Bundle = Awaited<ReturnType<typeof getKwBundle>>;

const STATUS_TONE: Record<KwStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary", PROCESSING: "secondary",
  SUCCESS: "default", PARTIAL_SUCCESS: "outline",
  RETRY_SCHEDULED: "secondary", FAILED_INVALID_NUMBER: "destructive",
  FAILED_NOT_FOUND: "destructive", FAILED_MAX_ATTEMPTS: "destructive",
  REQUIRES_MANUAL_REVIEW: "outline", BLOCKED_BY_SECURITY: "destructive",
  RATE_LIMITED: "secondary",
};

export function KwSection({
  applicationId, kwNumber,
}: { applicationId: string; kwNumber: string | null | undefined }) {
  const ensure = useServerFn(ensureKwJob);
  const retry = useServerFn(retryKwJob);
  const submit = useServerFn(submitManualKwSections);
  const fetchBundle = useServerFn(getKwBundle);

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({
    summary_html: "", section_i_o: "", section_i_sp: "",
    section_ii: "", section_iii: "", section_iv: "",
  });

  const reload = async () => setBundle(await fetchBundle({ data: { application_id: applicationId } }));

  useEffect(() => {
    (async () => {
      if (kwNumber && kwNumber.trim()) {
        try { await ensure({ data: { application_id: applicationId, kw_number: kwNumber } }); } catch { /* ignore */ }
      }
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, kwNumber]);

  if (!kwNumber) {
    return (
      <Card><CardHeader><CardTitle>Księga wieczysta</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Brak numeru KW we wniosku.</CardContent></Card>
    );
  }

  const job = bundle?.job;
  const analysis = bundle?.analysis;
  const status: KwStatus | null = (job?.status as KwStatus) ?? null;
  const invalidFormat = !isValidKwFormat(kwNumber);

  const onRetry = async () => {
    if (!job?.id) return;
    setBusy(true);
    try { await retry({ data: { job_id: job.id } }); toast.success("Zaplanowano kolejną próbę"); await reload(); }
    catch (e: any) { toast.error("Błąd", { description: e?.message }); }
    finally { setBusy(false); }
  };

  const onSubmitManual = async () => {
    if (!job?.id) return;
    setBusy(true);
    try {
      const r = await submit({ data: { job_id: job.id, ...manual } });
      toast.success(`Zapisano (scoring: ${r.score}/100)`);
      setShowManual(false);
      await reload();
    } catch (e: any) { toast.error("Błąd", { description: e?.message }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Księga wieczysta</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{kwNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          {status && <Badge variant={STATUS_TONE[status]}>{KW_STATUS_LABEL[status]}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {invalidFormat && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Numer KW ma nieprawidłowy format. Oczekiwany format: <code>LU1I/00123456/7</code>. Poproś klienta o korektę.</AlertDescription>
          </Alert>
        )}

        {job && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div><span className="text-muted-foreground">Liczba prób:</span> {job.attempts} / {job.max_attempts}</div>
            <div><span className="text-muted-foreground">Ostatnia próba:</span> {job.last_attempt_at ? formatDateTime(job.last_attempt_at) : "—"}</div>
            <div><span className="text-muted-foreground">Kolejna próba:</span> {job.next_attempt_at ? formatDateTime(job.next_attempt_at) : "—"}</div>
            <div><span className="text-muted-foreground">Pobrano:</span> {job.fetched_at ? formatDateTime(job.fetched_at) : "—"}</div>
            {job.failure_reason && <div className="sm:col-span-2 text-destructive"><span className="text-muted-foreground">Powód błędu:</span> {job.failure_reason}</div>}
          </div>
        )}

        {status === "RETRY_SCHEDULED" && job?.next_attempt_at && (
          <Alert><AlertDescription>Automatyczne pobranie nie powiodło się. Kolejna próba: <b>{formatDateTime(job.next_attempt_at)}</b>.</AlertDescription></Alert>
        )}
        {status === "FAILED_MAX_ATTEMPTS" || status === "REQUIRES_MANUAL_REVIEW" ? (
          <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Nie udało się automatycznie pobrać księgi. Wymagana ręczna weryfikacja — możesz wkleić HTML działów poniżej.</AlertDescription></Alert>
        ) : null}
        {status === "FAILED_NOT_FOUND" && (
          <Alert variant="destructive"><AlertDescription>Nie znaleziono księgi o tym numerze. Zweryfikuj numer z klientem.</AlertDescription></Alert>
        )}
        {status === "BLOCKED_BY_SECURITY" && (
          <Alert><AlertDescription>Portal EKW zablokował automatyczne pobranie (captcha/zabezpieczenie). Użyj trybu ręcznego.</AlertDescription></Alert>
        )}

        {analysis && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="text-xs text-muted-foreground">Scoring prawny</div>
                <div className="text-2xl font-bold">{analysis.legal_risk_score}/100</div>
              </div>
              {Array.isArray((bundle?.job?.missing_sections as any)) && (bundle?.job?.missing_sections as string[]).length > 0 && (
                <Badge variant="outline" className="ml-auto">Brakuje: {(bundle?.job?.missing_sections as string[]).join(", ")}</Badge>
              )}
            </div>
            {analysis.analysis_warning && (
              <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{analysis.analysis_warning}</AlertDescription></Alert>
            )}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Podsumowanie dla inwestora</div>
              <pre className="text-xs whitespace-pre-wrap rounded border bg-muted/30 p-3">{analysis.investor_summary}</pre>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Flagi ryzyka (JSON)</summary>
              <pre className="mt-2 rounded border bg-muted/30 p-2 overflow-auto">{JSON.stringify(analysis.risk_flags, null, 2)}</pre>
            </details>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {job && !invalidFormat && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />Ponów próbę pobrania KW
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowManual((s) => !s)}>
            <ClipboardPaste className="mr-2 h-4 w-4" />{showManual ? "Anuluj wklejanie" : "Wklej ręcznie HTML działów"}
          </Button>
        </div>

        {showManual && (
          <div className="space-y-3 border rounded p-3 bg-muted/20">
            <p className="text-xs text-muted-foreground">Wklej zawartość HTML lub czysty tekst każdego działu z portalu EKW. Po zapisie system od razu sparsuje dane i wyliczy scoring.</p>
            <div>
              <Label className="text-xs">Ekran wyniku wyszukiwania (opcjonalnie)</Label>
              <Textarea rows={3} value={manual.summary_html} onChange={(e) => setManual({ ...manual, summary_html: e.target.value })} />
            </div>
            {KW_SECTIONS.map((s) => {
              const key = (
                { "I-O": "section_i_o", "I-Sp": "section_i_sp", "II": "section_ii",
                  "III": "section_iii", "IV": "section_iv" } as const
              )[s.key];
              return (
                <div key={s.key}>
                  <Label className="text-xs">{s.label}</Label>
                  <Textarea rows={4} value={(manual as any)[key]} onChange={(e) => setManual({ ...manual, [key]: e.target.value })} />
                </div>
              );
            })}
            <Button size="sm" disabled={busy} onClick={onSubmitManual}>Zapisz i przelicz scoring</Button>
          </div>
        )}

        {bundle && bundle.attempts.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Historia prób ({bundle.attempts.length})</summary>
            <div className="mt-2 space-y-1">
              {bundle.attempts.map((a: any) => (
                <div key={a.id} className="flex justify-between border-b py-1">
                  <span>#{a.attempt_number} · {a.status}</span>
                  <span className="text-muted-foreground">{formatDateTime(a.started_at)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
