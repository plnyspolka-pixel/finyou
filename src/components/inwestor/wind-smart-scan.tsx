import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  analyzeWindDocument,
  analyzeWindContract,
  type WindOcrResult,
  type WindContractData,
} from "@/lib/windykacja-ocr.functions";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Upload,
  Loader2,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from "lucide-react";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

const REASON_MSG: Record<string, string> = {
  unsupported: "Nieobsługiwany format — dodaj zdjęcie (JPG/PNG) lub PDF.",
  rate_limited: "Za dużo zapytań do AI — spróbuj za chwilę.",
  ai_quota: "Wyczerpano limit AI — dane wpisz ręcznie.",
  ai_error: "Nie udało się odczytać dokumentu — dane wpisz ręcznie.",
  no_key: "Odczyt AI niedostępny — dane wpisz ręcznie.",
};

/**
 * Pole „zrób zdjęcie / wgraj skan" z automatycznym odczytem dokumentu.
 * Po wybraniu pliku uruchamia OCR (analyzeWindDocument) i przez `onExtract`
 * przekazuje rozpoznane dane do formularza. Surowy plik oddaje przez `onFile`
 * (do zapisania w Storage jako dowód).
 */
export function SmartScanField({
  onExtract,
  onFile,
  required,
  hint,
}: {
  onExtract?: (r: WindOcrResult) => void;
  onFile: (file: File | null) => void;
  required?: boolean;
  /** Krótka podpowiedź, co sfotografować. */
  hint?: string;
}) {
  const analyze = useServerFn(analyzeWindDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WindOcrResult | null>(null);

  const handle = async (file: File | null) => {
    setResult(null);
    onFile(file);
    setName(file?.name ?? null);
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await analyze({
        data: { dataUrl, mimeType: file.type || "image/jpeg", fileName: file.name },
      });
      setResult(r);
      if (r.reason === "ok") {
        onExtract?.(r);
        toast.success("Odczytano dokument — sprawdź dane i zapisz.");
      } else {
        toast.error(REASON_MSG[r.reason] ?? "Nie udało się odczytać dokumentu.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd odczytu dokumentu");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-dashed p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScanLine className="h-4 w-4 text-primary" /> Zrób zdjęcie dokumentu
          {required ? (
            <span className="text-xs font-normal text-muted-foreground">(dowód)</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hint ?? "Sfotografuj pismo — system sam rozpozna, co to jest, i wypełni dane."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => camRef.current?.click()}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-1" />
            )}
            Zrób zdjęcie
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" /> Wgraj plik
          </Button>
          {name && !busy && (
            <span className="self-center text-xs text-muted-foreground">{name}</span>
          )}
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
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files?.[0] ?? null);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Odczytuję dokument…
        </div>
      )}

      {result && result.reason === "ok" && (
        <div className="rounded-md border border-green-300 bg-green-50 p-2.5 text-xs dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-center gap-1.5 font-medium text-green-800 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4" /> Rozpoznano: {result.tytul || "dokument"}
          </div>
          {result.podsumowanie && (
            <p className="mt-1 text-green-700 dark:text-green-300">{result.podsumowanie}</p>
          )}
        </div>
      )}

      {result && result.reason !== "ok" && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{REASON_MSG[result.reason] ?? "Nie udało się odczytać — wpisz dane ręcznie."}</span>
        </div>
      )}
    </div>
  );
}

/**
 * „Wgraj / sfotografuj umowę" — odczytuje dane z umowy pożyczki i przez
 * `onExtract` wypełnia formularz nowej sprawy. Inwestor nie musi nic
 * przepisywać.
 */
export function ContractScanField({
  onExtract,
  onFile,
}: {
  onExtract: (d: WindContractData) => void;
  /** Surowy plik umowy — do zapisania w Storage jako dowód w aktach. */
  onFile?: (file: File | null) => void;
}) {
  const analyze = useServerFn(analyzeWindContract);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<WindContractData | null>(null);

  const handle = async (file: File | null) => {
    setDone(null);
    onFile?.(file);
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const d = await analyze({
        data: { dataUrl, mimeType: file.type || "image/jpeg", fileName: file.name },
      });
      if (d.reason === "ok") {
        onExtract(d);
        setDone(d);
        toast.success("Odczytano umowę — sprawdź dane i uzupełnij brakujące.");
      } else {
        toast.error(REASON_MSG[d.reason] ?? "Nie udało się odczytać umowy.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd odczytu umowy");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-primary" /> Masz umowę? Wgraj ją — wypełnimy dane za
        Ciebie
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Zrób zdjęcie lub wgraj umowę pożyczki (PDF/zdjęcie). Odczytamy dłużnika, kwoty i terminy.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => camRef.current?.click()}>
          {busy ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-1" />
          )}
          Zrób zdjęcie umowy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-1" /> Wgraj umowę
        </Button>
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
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      {busy && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Odczytuję umowę…
        </div>
      )}
      {done && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" /> Uzupełniono dane z umowy — sprawdź poniżej.
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// POTWIERDZENIA PRZELEWÓW (wiele plików) — system odczytuje kwoty i daty,
// a na tej podstawie sam wylicza pozostałą należność.
// ════════════════════════════════════════════════════════════════════

export type PaymentScan = {
  /** Lokalny identyfikator wiersza. */
  key: string;
  file: File;
  kwota: string; // edytowalne (string dla inputa)
  data: string; // ISO yyyy-mm-dd
  rozpoznano: boolean;
};

/**
 * „Wgraj potwierdzenia przelewów otrzymanych od klienta" — multi-upload z
 * automatycznym odczytem kwoty i daty każdej wpłaty. Rodzic dostaje pełną
 * listę przez `onChange` i sam liczy sumę wpłat / pozostałą należność.
 */
export function PaymentScansField({
  payments,
  onChange,
}: {
  payments: PaymentScan[];
  onChange: (list: PaymentScan[]) => void;
}) {
  const analyze = useServerFn(analyzeWindDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const added: PaymentScan[] = [];
    try {
      for (const file of files) {
        let kwota = "";
        let data = "";
        let rozpoznano = false;
        try {
          const dataUrl = await fileToDataUrl(file);
          const r = await analyze({
            data: { dataUrl, mimeType: file.type || "image/jpeg", fileName: file.name },
          });
          if (r.reason === "ok" && r.kwota != null) {
            kwota = String(r.kwota);
            rozpoznano = true;
          }
          if (r.reason === "ok" && r.dataISO) data = r.dataISO;
        } catch {
          /* odczyt opcjonalny — kwotę można wpisać ręcznie */
        }
        added.push({
          key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file,
          kwota,
          data: data || new Date().toISOString().slice(0, 10),
          rozpoznano,
        });
      }
    } finally {
      setBusy(false);
    }
    onChange([...payments, ...added]);
    const odczytane = added.filter((p) => p.rozpoznano).length;
    if (odczytane > 0) toast.success(`Odczytano ${odczytane} z ${added.length} potwierdzeń.`);
    else toast.message("Dodano potwierdzenia — sprawdź kwoty i daty.");
  };

  const update = (key: string, patch: Partial<Pick<PaymentScan, "kwota" | "data">>) =>
    onChange(payments.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key: string) => onChange(payments.filter((p) => p.key !== key));

  const suma = payments.reduce((s, p) => s + (Number(p.kwota) || 0), 0);

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ScanLine className="h-4 w-4 text-primary" /> Potwierdzenia przelewów od klienta
      </div>
      <p className="text-xs text-muted-foreground">
        Wgraj potwierdzenia wpłat otrzymanych dotychczas (PDF/zdjęcia, można kilka naraz). Odczytamy
        kwoty i daty, a system sam wyliczy pozostałą należność.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => camRef.current?.click()}>
          {busy ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-1" />
          )}
          Zrób zdjęcie
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-1" /> Wgraj pliki
        </Button>
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.currentTarget.value = "";
        }}
      />

      {payments.length > 0 && (
        <div className="space-y-1.5">
          {payments.map((p) => (
            <div key={p.key} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs" title={p.file.name}>
                {p.file.name}
              </span>
              <input
                type="number"
                className="h-8 w-[110px] rounded-md border bg-background px-2 text-sm tabular-nums"
                placeholder="kwota zł"
                value={p.kwota}
                onChange={(e) => update(p.key, { kwota: e.target.value })}
              />
              <input
                type="date"
                className="h-8 w-[140px] rounded-md border bg-background px-2 text-sm"
                value={p.data}
                onChange={(e) => update(p.key, { data: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => remove(p.key)}
              >
                Usuń
              </Button>
              {!p.rozpoznano && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> wpisz kwotę ręcznie
                </span>
              )}
            </div>
          ))}
          <div className="text-right text-sm font-medium">
            Suma wpłat:{" "}
            <span className="tabular-nums">
              {new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(suma)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
