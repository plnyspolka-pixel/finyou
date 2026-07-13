import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  extractDocumentDataForTemplate,
  type DocImportResult,
} from "@/lib/document-import-ocr.functions";
import type { DocField } from "@/lib/document-fields";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Loader2, ScanLine, CheckCircle2, AlertTriangle } from "lucide-react";

// ════════════════════════════════════════════════════════════════════
// „Wczytaj dane z innego dokumentu" — użytkownik wgrywa dowolny dokument
// (zdjęcie/skan/PDF/tekst), OCR uruchamia się automatycznie gdy trzeba,
// a system sam wykrywa tyle danych, ile się da, i wpisuje je w pola
// aktualnie wybranego wzoru.
// ════════════════════════════════════════════════════════════════════

const REASON_MSG: Record<string, string> = {
  unsupported: "Nieobsługiwany format — dodaj zdjęcie (JPG/PNG), PDF albo plik tekstowy.",
  rate_limited: "Za dużo zapytań do AI — spróbuj za chwilę.",
  ai_quota: "Wyczerpano limit AI — dane wpisz ręcznie.",
  ai_error: "Nie udało się odczytać dokumentu — dane wpisz ręcznie.",
  no_key: "Odczyt AI niedostępny — dane wpisz ręcznie.",
};

/** ~10 MB — po zakodowaniu base64 mieści się w limicie 15 MB funkcji serwerowej. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

export function DocumentImportScan({
  templateName,
  fields,
  disabled,
  onApply,
}: {
  templateName: string;
  fields: DocField[];
  disabled?: boolean;
  /** Otrzymuje odczytane wartości (id pola → wartość) do wpisania w formularz. */
  onApply: (values: Record<string, string>) => void;
}) {
  const extract = useServerFn(extractDocumentDataForTemplate);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DocImportResult | null>(null);

  const handle = async (file: File | null) => {
    if (!file) return;
    setResult(null);
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Plik jest za duży (maks. 10 MB). Zmniejsz zdjęcie lub PDF.");
      return;
    }
    // Pola wysyłane do AI: bez instrukcji (to nie dane) i bez „kwota słownie"
    // (wylicza się automatycznie z powiązanej kwoty).
    const payloadFields = fields
      .filter((f) => f.semantic !== "instruction" && f.semantic !== "amountWords")
      .map((f) => ({
        id: f.id,
        label: f.label,
        group: f.groupLabel,
        kind: f.semantic,
        options: f.options,
      }));
    if (payloadFields.length === 0) {
      toast.message("Ten wzór nie ma pól do uzupełnienia.");
      return;
    }

    setBusy(true);
    const t = toast.loading("Odczytuję dokument (OCR)…");
    try {
      const isText = file.type.startsWith("text/") || /\.txt$/i.test(file.name);
      const base = { mimeType: file.type || "image/jpeg", fileName: file.name, templateName };
      const r = await extract({
        data: isText
          ? { ...base, rawText: await fileToText(file), fields: payloadFields }
          : { ...base, dataUrl: await fileToDataUrl(file), fields: payloadFields },
      });
      setResult(r);
      if (r.reason === "ok") {
        toast.dismiss(t);
        onApply(r.values);
      } else {
        toast.error(REASON_MSG[r.reason] ?? "Nie udało się odczytać dokumentu.", { id: t });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd odczytu dokumentu", { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" /> Wczytaj dane z innego dokumentu
            </div>
            <p className="text-[11px] text-muted-foreground">
              Wgraj lub sfotografuj dowolny dokument (umowa, odpis KRS, faktura, pismo — PDF,
              zdjęcie lub tekst). Jeśli to skan, automatycznie uruchomi się OCR, a system sam
              wykryje tyle danych, ile się da, i wpisze je w pola wzoru.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || disabled}
              onClick={() => camRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Zrób zdjęcie
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || disabled}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" /> Wgraj dokument
            </Button>
          </div>
        </div>

        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files?.[0] ?? null);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.txt,text/plain"
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files?.[0] ?? null);
            e.currentTarget.value = "";
          }}
        />

        {result && result.reason === "ok" && (
          <div className="rounded-md border border-green-300 bg-green-50 p-2.5 text-xs dark:border-green-800 dark:bg-green-900/20">
            <div className="flex items-center gap-1.5 font-medium text-green-800 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4" /> Rozpoznano: {result.tytul || "dokument"} —
              odczytano {Object.keys(result.values).length} pól.
            </div>
            {result.podsumowanie && (
              <p className="mt-1 text-green-700 dark:text-green-300">{result.podsumowanie}</p>
            )}
            <p className="mt-1 text-green-700/80 dark:text-green-300/80">
              Sprawdź wpisane wartości — odczyt AI wymaga weryfikacji.
            </p>
          </div>
        )}

        {result && result.reason !== "ok" && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {REASON_MSG[result.reason] ?? "Nie udało się odczytać — wpisz dane ręcznie."}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
