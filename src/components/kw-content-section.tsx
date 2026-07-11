import { useEffect, useState, useCallback } from "react";
import { formatDateTime } from "@/lib/labels";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpenCheck, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getKwForApplication, fetchKwForApplication, type KwDocumentView } from "@/lib/kw-content.functions";

const SECTIONS: Array<{ key: keyof KwDocumentView; label: string }> = [
  { key: "okladka", label: "Okładka" },
  { key: "dzial_1o", label: "Dział I-O — Oznaczenie nieruchomości" },
  { key: "dzial_1s", label: "Dział I-Sp — Spis praw związanych" },
  { key: "dzial_2", label: "Dział II — Własność" },
  { key: "dzial_3", label: "Dział III — Prawa, roszczenia i ograniczenia" },
  { key: "dzial_4", label: "Dział IV — Hipoteki" },
];

function KwDocumentCard({
  doc,
  canFetch,
  showKwNumber,
  busy,
  onFetch,
}: {
  doc: KwDocumentView;
  canFetch: boolean;
  showKwNumber: boolean;
  busy: boolean;
  onFetch: (force: boolean) => void;
}) {
  const ready = doc.status === "ready";
  const processing = doc.status === "processing";
  const error = doc.status === "error" || doc.status === "not_found";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 shrink-0" />
              <span className="truncate">Treść księgi wieczystej</span>
            </CardTitle>
            <CardDescription>
              Dane z Centralnej Bazy Ksiąg Wieczystych (CMD KW Engine).
              {showKwNumber && <> · KW: <code className="text-foreground">{doc.kwNumber}</code></>}
              {doc.fetched_at && <> · Pobrano: {formatDateTime(doc.fetched_at)}</>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {ready && <Badge variant="secondary">Gotowe</Badge>}
            {processing && <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Pobieranie</Badge>}
            {error && <Badge variant="destructive">{doc.status === "not_found" ? "Nie znaleziono" : "Błąd"}</Badge>}
            {canFetch && (
              <Button size="sm" variant={ready ? "outline" : "default"} disabled={busy} onClick={() => onFetch(ready)}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {ready ? "Odśwież" : processing ? "Sprawdź status" : "Pobierz treść KW"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {processing && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Pobieranie KW w toku</AlertTitle>
            <AlertDescription>
              CMD pobiera dokument z EKW — to może potrwać do kilkudziesięciu sekund. Odśwież po chwili.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{doc.status === "not_found" ? "Nie znaleziono księgi" : "Błąd pobierania"}</AlertTitle>
            {doc.last_error && <AlertDescription>{doc.last_error}</AlertDescription>}
          </Alert>
        )}
        {ready && (
          <Accordion type="multiple" defaultValue={["dzial_1o", "dzial_2"]}>
            {SECTIONS.map(({ key, label }) => {
              const html = doc[key] as string | null;
              if (!html) return null;
              return (
                <AccordionItem key={key as string} value={key as string}>
                  <AccordionTrigger className="text-left">{label}</AccordionTrigger>
                  <AccordionContent>
                    <div
                      className="kw-html prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
        {!doc.status && canFetch && (
          <p className="text-sm text-muted-foreground">
            Treść KW jeszcze nie została pobrana. Kliknij „Pobierz treść KW” (automat pobierze ją
            także sam po skompletowaniu wniosku).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function KwContentSection({
  applicationId,
  canFetch,
  showKwNumber = false,
}: {
  applicationId: string;
  /** Whether the user can trigger a fetch / refresh (admin only). */
  canFetch: boolean;
  /** Whether to display the KW number itself (admin only). */
  showKwNumber?: boolean;
}) {
  const getKw = useServerFn(getKwForApplication);
  const doFetch = useServerFn(fetchKwForApplication);
  const [docs, setDocs] = useState<KwDocumentView[]>([]);
  const [hasKw, setHasKw] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await getKw({ data: { loanApplicationId: applicationId } });
      setHasKw(r.hasKw);
      setDocs(r.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, [applicationId, getKw]);

  useEffect(() => { void reload(); }, [reload]);

  const onFetch = async (force = false) => {
    setBusy(true);
    try {
      const r = await doFetch({ data: { loanApplicationId: applicationId, force } });
      const readyCount = (r.results ?? []).filter((x) => x.status === "ready").length;
      const processingCount = (r.results ?? []).filter((x) => x.status === "processing").length;
      if (r.ok) toast.success(readyCount > 1 ? `Pobrano treść ${readyCount} ksiąg` : "Treść KW pobrana");
      else if (processingCount > 0) toast.info("KW w trakcie pobierania — odśwież za chwilę");
      else if (r.error) toast.error(r.error);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się pobrać KW");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  if (hasKw === false) {
    if (!canFetch) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" />Treść KW</CardTitle>
          <CardDescription>Brak numeru księgi wieczystej na nieruchomości — uzupełnij w danych nieruchomości.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Investor view + nothing fetched yet → render nothing (avoid empty cards)
  const anyContent = docs.some((d) => d.status);
  if (!anyContent && !canFetch) return null;

  return (
    <div className="space-y-4">
      {docs.map((doc) => (
        <KwDocumentCard
          key={doc.kwNumber}
          doc={doc}
          canFetch={canFetch}
          showKwNumber={showKwNumber}
          busy={busy}
          onFetch={(force) => void onFetch(force)}
        />
      ))}
    </div>
  );
}
