import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/labels";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpenCheck, RefreshCw, AlertCircle, Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";
import { formatKwNumber } from "@/lib/kw";
import { getKwForApplication, fetchKwForApplication } from "@/lib/kw-content.functions";
import { ensureKwReady } from "@/lib/kw-ensure";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { KwPasteSlotsDialog } from "@/components/kw-paste-slots";
import { KwPotentialBadge } from "@/components/location-scoring/kw-potential-badge";

const MAX_UPLOAD_FILES = 12;
const MAX_UPLOAD_BYTES = 6_500_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Nie udało się wczytać pliku ${file.name}`));
    r.readAsDataURL(file);
  });
}

type KwDoc = {
  status: string;
  okladka: string | null;
  dzial_1o: string | null;
  dzial_1s: string | null;
  dzial_2: string | null;
  dzial_3: string | null;
  dzial_4: string | null;
  fetched_at: string | null;
  last_error: string | null;
  ordered_at: string | null;
} | null;

const SECTIONS: Array<{ key: keyof NonNullable<KwDoc>; label: string }> = [
  { key: "okladka", label: "Okładka" },
  { key: "dzial_1o", label: "Dział I-O — Oznaczenie nieruchomości" },
  { key: "dzial_1s", label: "Dział I-Sp — Spis praw związanych" },
  { key: "dzial_2", label: "Dział II — Własność" },
  { key: "dzial_3", label: "Dział III — Prawa, roszczenia i ograniczenia" },
  { key: "dzial_4", label: "Dział IV — Hipoteki" },
];

export function KwContentSection({
  applicationId,
  canFetch,
  showKwNumber = false,
  canImportOcr = false,
}: {
  applicationId: string;
  /** Whether the user can trigger a fetch / refresh (admin only). */
  canFetch: boolean;
  /** Whether to display the KW number itself (admin only). */
  showKwNumber?: boolean;
  /** Whether the user can import KW content from screenshots via OCR (admin only). */
  canImportOcr?: boolean;
}) {
  const getKw = useServerFn(getKwForApplication);
  const doFetch = useServerFn(fetchKwForApplication);
  const [doc, setDoc] = useState<KwDoc>(null);
  const [hasKw, setHasKw] = useState<boolean | null>(null);
  const [kwNumber, setKwNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pasteOpenKey = `kw-paste-open:${applicationId}`;
  const [pasteOpen, _setPasteOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(pasteOpenKey) === "1";
    } catch {
      return false;
    }
  });
  const setPasteOpen = (v: boolean) => {
    _setPasteOpen(v);
    try {
      v ? sessionStorage.setItem(pasteOpenKey, "1") : sessionStorage.removeItem(pasteOpenKey);
    } catch {}
  };

  const reload = async () => {
    try {
      const r = await getKw({ data: { loanApplicationId: applicationId } });
      setHasKw(r.hasKw);
      setKwNumber(r.kwNumber ?? null);
      if (r.hasKw) setDoc(r.document as KwDoc);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [applicationId]);

  const onFetch = async (force = false) => {
    setBusy(true);
    try {
      if (force) {
        // Wymuszone odświeżenie: pojedyncze uderzenie (invalid cache po stronie serwera i tak nie ma dedykowanego trybu).
        const r = await doFetch({ data: { loanApplicationId: applicationId, force: true } });
        setKwNumber(r.kwNumber ?? null);
      }
      // Automatyczne dowożenie do końca — bez ingerencji użytkownika.
      const res = await ensureKwReady(applicationId, {
        onStatus: (s) => {
          if (s === "processing") setDoc((d) => (d ? { ...d, status: "processing" } : d));
        },
      });
      if (res.ok) {
        toast.success("Treść KW pobrana");
      } else if (res.status === "not_found") {
        toast.error("Księga wieczysta nie została odnaleziona w EKW");
      } else if (res.status === "timeout") {
        toast.info("Pobieranie trwa dłużej niż zwykle — spróbuj ponownie za chwilę");
      } else if (res.status !== "no_kw") {
        toast.error(res.message || "Nie udało się pobrać KW");
      }
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się pobrać KW");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const ocrUploadControls = canImportOcr ? (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => setPasteOpen(true)}>
      <ScanText className="mr-2 h-4 w-4" />
      Wklej treść KW
    </Button>
  ) : null;

  const pasteDialog = canImportOcr ? (
    <KwPasteSlotsDialog
      open={pasteOpen}
      onOpenChange={setPasteOpen}
      loanApplicationId={applicationId}
      onImported={() => {
        setHasKw(true);
        void reload();
      }}
    />
  ) : null;

  if (loading) return null;

  if (hasKw === false) {
    if (!canFetch) return null;
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpenCheck className="h-5 w-5" />
                  Treść KW
                </CardTitle>
                <CardDescription>
                  Brak numeru księgi wieczystej na nieruchomości — uzupełnij w danych nieruchomości
                  {canImportOcr
                    ? " albo wgraj screeny treści KW (OCR odczyta numer i zapisze go na wniosku)"
                    : ""}
                  .
                </CardDescription>
              </div>
              {ocrUploadControls}
            </div>
          </CardHeader>
        </Card>
        {pasteDialog}
      </>
    );
  }

  const ready = doc?.status === "ready";
  const processing = doc?.status === "processing";
  const error = doc?.status === "error" || doc?.status === "not_found";

  // Investor view + nothing fetched yet → render nothing (avoid empty cards)
  if (!doc && !canFetch) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="h-5 w-5" />
                Treść księgi wieczystej
              </CardTitle>
              <CardDescription>
                Dane z Centralnej Bazy Ksiąg Wieczystych (CMD KW Engine).
                {showKwNumber && kwNumber && (
                  <>
                    {" "}
                    · KW:{" "}
                    <code className="text-foreground">{formatKwNumber(kwNumber) ?? kwNumber}</code>
                  </>
                )}
                {doc?.fetched_at && <> · Pobrano: {formatDateTime(doc.fetched_at)}</>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {showKwNumber && (
                <KwPotentialBadge applicationId={applicationId} kwNumber={kwNumber} />
              )}
              {ready && <Badge variant="secondary">Gotowe</Badge>}
              {processing && (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Pobieranie
                </Badge>
              )}
              {error && (
                <Badge variant="destructive">
                  {doc?.status === "not_found" ? "Nie znaleziono" : "Błąd"}
                </Badge>
              )}
              {ocrUploadControls}
              {canFetch && (
                <Button
                  size="sm"
                  variant={ready ? "outline" : "default"}
                  disabled={busy}
                  onClick={() => void onFetch(ready)}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
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
                CMD pobiera dokument z EKW — to może potrwać do kilkudziesięciu sekund. Odśwież po
                chwili.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {doc?.status === "not_found" ? "Nie znaleziono księgi" : "Błąd pobierania"}
              </AlertTitle>
              {doc?.last_error && <AlertDescription>{doc.last_error}</AlertDescription>}
            </Alert>
          )}
          {ready && doc?.last_error && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ostatnia próba odświeżenia nie powiodła się</AlertTitle>
              <AlertDescription>
                {doc.last_error} Poniżej wcześniej pobrana treść
                {doc.fetched_at ? ` (z ${formatDateTime(doc.fetched_at)})` : ""}.
              </AlertDescription>
            </Alert>
          )}
          {ready && (
            <Accordion type="multiple" defaultValue={["dzial_1o", "dzial_2"]}>
              {SECTIONS.map(({ key, label }) => {
                const html = (doc as any)?.[key] as string | null;
                if (!html) return null;
                return (
                  <AccordionItem key={key as string} value={key as string}>
                    <AccordionTrigger className="text-left">{label}</AccordionTrigger>
                    <AccordionContent>
                      <div
                        className="kw-html prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
          {!doc && canFetch && (
            <p className="text-sm text-muted-foreground">
              Treść KW jeszcze nie została pobrana. Kliknij „Pobierz treść KW”, aby uzupełnić ją z
              EKW.
            </p>
          )}
        </CardContent>
      </Card>
      {pasteDialog}
    </>
  );
}
