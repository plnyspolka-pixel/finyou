import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Bug, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { importKwFromScreenshots } from "@/lib/kw-ocr-import.functions";

export function KwPasteSlotsDialog({
  open,
  onOpenChange,
  loanApplicationId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanApplicationId: string;
  onImported: () => void;
}) {
  const doImport = useServerFn(importKwFromScreenshots);
  const storageKey = `kw-paste-text:${loanApplicationId}`;
  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [debug, setDebug] = useState<{ parsed: any } | null>(null);

  useEffect(() => {
    try {
      if (text.trim()) sessionStorage.setItem(storageKey, text);
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }, [text, storageKey]);

  const chars = text.length;

  const submit = async () => {
    if (chars < 20) {
      toast.error("Wklej tekst treści KW (min. 20 znaków).");
      return;
    }
    setBusy(true);
    try {
      let res: any = await doImport({ data: { loanApplicationId, text } });
      if (!res.ok && res.needsForce) {
        if (!window.confirm("Treść tej KW jest już zapisana. Nadpisać ją?")) {
          setBusy(false);
          return;
        }
        res = await doImport({ data: { loanApplicationId, text, force: true } });
      }
      if (res.ok) {
        toast.success(`Treść KW ${res.kwNumber} zapisana`);
        for (const w of (res.warnings ?? []).slice(0, 4)) toast.info(w);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        setText("");
        onImported();
        onOpenChange(false);
      } else {
        toast.error(res.message || "Import nie powiódł się");
      }
    } catch (e: any) {
      toast.error(e?.message || "Import nie powiódł się");
    } finally {
      setBusy(false);
    }
  };

  const runDebug = async () => {
    if (chars < 20) {
      toast.error("Wklej tekst KW (min. 20 znaków).");
      return;
    }
    setDebugBusy(true);
    setDebug(null);
    try {
      const res: any = await doImport({ data: { loanApplicationId, text, dryRun: true } });
      if (res?.debug) {
        setDebug({ parsed: res.debug.parsed });
        toast.success("Podgląd JSON gotowy");
      } else {
        toast.error("Brak danych debug w odpowiedzi");
      }
    } catch (e: any) {
      toast.error(e?.message || "Debug nie powiódł się");
    } finally {
      setDebugBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && text.trim().length > 20 && !busy) {
          if (!window.confirm("Zamknąć okno? Wklejony tekst zostanie utracony.")) return;
        }
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (text.trim()) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Wklej treść KW</DialogTitle>
          <DialogDescription>
            Otwórz KW w{" "}
            <a
              href="https://ekw.ms.gov.pl/eukw_ogol/menu.do"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              EKW <ExternalLink className="h-3 w-3" />
            </a>
            , zaznacz treść (Ctrl+A / Ctrl+C) i wklej ją poniżej. AI podzieli tekst na działy i
            zapisze do KW.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Wklej tutaj treść KW (okładka + działy I-O, I-Sp, II, III, IV)…"
          className="min-h-[320px] font-mono text-xs"
          autoFocus
        />
        <div className="text-xs text-muted-foreground">{chars.toLocaleString("pl-PL")} znaków</div>

        {(debugBusy || debug) && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 max-h-[40vh] overflow-auto">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Bug className="h-4 w-4 text-amber-600" /> Podgląd JSON
            </div>
            {debugBusy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> AI dzieli tekst na sekcje…
              </div>
            )}
            {debug && (
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-72 overflow-auto">
                {JSON.stringify(debug.parsed, null, 2)}
              </pre>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => void runDebug()}
            disabled={busy || debugBusy || chars < 20}
            title="Uruchom parsowanie bez zapisu — pokaż JSON"
          >
            {debugBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bug className="mr-2 h-4 w-4" />
            )}
            Podgląd JSON
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Anuluj
          </Button>
          <Button onClick={() => void submit()} disabled={busy || chars < 20}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Importuj treść KW
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
