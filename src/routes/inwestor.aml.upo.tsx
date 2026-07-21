// UPO i odpowiedzi GIIF — statusy wysłanych zgłoszeń, pobieranie UPO,
// odpowiedzi (odrzucenia / korekty) i ręczne odświeżenie statusów.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listGiifReports,
  getGiifReportDownloads,
  refreshGiifStatuses,
} from "@/lib/aml/aml-reports.functions";
import { REPORT_TYPE_LABELS } from "@/lib/aml/aml-types";
import { ReportStatusBadge, AmlEmptyState } from "@/components/aml/aml-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, FileDown, Receipt } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/upo")({
  component: AmlUpoScreen,
});

const SUBMITTED_STATUSES = [
  "queued",
  "submitted",
  "status_pending",
  "accepted",
  "upo_received",
  "rejected",
  "correction_required",
];

function AmlUpoScreen() {
  const fetchReports = useServerFn(listGiifReports);
  const downloads = useServerFn(getGiifReportDownloads);
  const refresh = useServerFn(refreshGiifStatuses);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetchReports();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setReports((res.reports as any[]).filter((r) => SUBMITTED_STATUSES.includes(r.status)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania");
    } finally {
      setLoading(false);
    }
  }, [fetchReports]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const doRefresh = async () => {
    setBusy("refresh");
    try {
      const res = await refresh();
      toast.success(`Odświeżono: kolejka ${res.queueProcessed}, statusy ${res.statusesChecked}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd odświeżania statusów");
    } finally {
      setBusy(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const downloadUpo = async (r: any) => {
    setBusy(`upo-${r.id}`);
    try {
      const res = await downloads({ data: { reportId: r.id } });
      if (res.upoUrl) window.open(res.upoUrl, "_blank");
      else toast.error("UPO jeszcze niedostępne");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd pobierania UPO");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5" /> UPO i odpowiedzi GIIF
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={busy === "refresh"}
          onClick={() => void doRefresh()}
        >
          {busy === "refresh" ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Odśwież statusy
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <AmlEmptyState>
          Brak wysłanych zgłoszeń. Po wysyłce zobaczysz tu statusy, odpowiedzi GIIF i UPO.
        </AmlEmptyState>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {REPORT_TYPE_LABELS[r.report_type as keyof typeof REPORT_TYPE_LABELS] ??
                      r.report_type}
                  </span>
                  <ReportStatusBadge status={r.status} />
                  {r.giif_submission_id && (
                    <span className="text-xs text-muted-foreground font-mono">
                      ID GIIF: {r.giif_submission_id}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {r.submitted_at
                      ? `Wysłano: ${new Date(r.submitted_at).toLocaleString("pl-PL")}`
                      : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.giif_status && <span>Status GIIF: {r.giif_status}</span>}
                  {r.giif_status_checked_at && (
                    <span>
                      sprawdzono {new Date(r.giif_status_checked_at).toLocaleString("pl-PL")}
                    </span>
                  )}
                  {r.upo_received_at && (
                    <span>UPO: {new Date(r.upo_received_at).toLocaleString("pl-PL")}</span>
                  )}
                </div>
                {r.status === "upo_received" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `upo-${r.id}`}
                    onClick={() => void downloadUpo(r)}
                  >
                    {busy === `upo-${r.id}` ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <FileDown className="h-3 w-3 mr-1" />
                    )}
                    Pobierz UPO
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
