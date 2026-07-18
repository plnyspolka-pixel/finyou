import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardPaste, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { importKwFromScreenshots } from "@/lib/kw-ocr-import.functions";
import { cn } from "@/lib/utils";

const SLOTS: Array<{ key: string; label: string; hint: string }> = [
  { key: "okladka", label: "Okładka", hint: "Numer KW, sąd, typ księgi" },
  { key: "dzial1", label: "Dział I (I-O + I-Sp)", hint: "Oznaczenie nieruchomości i spis praw" },
  { key: "dzial2", label: "Dział II", hint: "Właściciele / użytkownicy wieczyści" },
  { key: "dzial3", label: "Dział III", hint: "Prawa, roszczenia, ograniczenia" },
  { key: "dzial4", label: "Dział IV", hint: "Hipoteki" },
];

const MAX_BYTES = 6_500_000;

type Slot = { dataUrl: string; mimeType: string; fileName: string } | null;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Nie udało się wczytać obrazu"));
    r.readAsDataURL(file);
  });
}

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
  const doOcrImport = useServerFn(importKwFromScreenshots);
  const [slots, setSlots] = useState<Slot[]>(() => SLOTS.map(() => null));
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const boxRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (open) {
      setSlots(SLOTS.map(() => null));
      setActiveIdx(0);
      // focus first slot so Ctrl+V works immediately
      setTimeout(() => boxRefs.current[0]?.focus(), 50);
    }
  }, [open]);

  const setSlot = async (idx: number, file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(`Obraz jest za duży (limit ~6 MB)`);
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = { dataUrl, mimeType: file.type || "image/png", fileName: file.name || `${SLOTS[idx].key}.png` };
      return next;
    });
    // move focus to next empty slot
    const nextEmpty = SLOTS.findIndex((_, i) => i > idx && !slots[i]);
    if (nextEmpty >= 0) {
      setActiveIdx(nextEmpty);
      setTimeout(() => boxRefs.current[nextEmpty]?.focus(), 30);
    }
  };

  const handlePaste = (idx: number) => async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await setSlot(idx, file);
          return;
        }
      }
    }
  };

  const handleGlobalPaste = async (e: ClipboardEvent) => {
    if (!open) return;
    // if focus is on a slot, its own handler will run; this is only for edge cases
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await setSlot(activeIdx, file);
          return;
        }
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: ClipboardEvent) => void handleGlobalPaste(e);
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx, slots]);

  const clearSlot = (idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  const onFile = (idx: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void setSlot(idx, f);
    e.target.value = "";
  };

  const filledCount = slots.filter(Boolean).length;

  const submit = async () => {
    const images = slots
      .map((s, i) => (s ? { ...s, fileName: s.fileName || `${SLOTS[i].key}.png` } : null))
      .filter(Boolean) as Array<{ dataUrl: string; mimeType: string; fileName: string }>;
    if (images.length === 0) {
      toast.error("Wgraj przynajmniej jeden screen");
      return;
    }
    setBusy(true);
    try {
      let res = await doOcrImport({ data: { loanApplicationId, images } });
      if (!res.ok && (res as any).needsForce) {
        if (!window.confirm("Treść tej KW jest już zapisana. Nadpisać ją danymi z OCR?")) {
          setBusy(false);
          return;
        }
        res = await doOcrImport({ data: { loanApplicationId, images, force: true } });
      }
      if (res.ok) {
        toast.success(`Treść KW ${res.kwNumber} zaimportowana`, { description: res.summary });
        for (const w of (res.warnings ?? []).slice(0, 4)) toast.info(w);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Wgraj screeny treści KW</DialogTitle>
          <DialogDescription>
            Kliknij w pojemnik i wklej screen z EKW (Ctrl+V / Cmd+V). Możesz też przeciągnąć plik lub kliknąć „Wybierz plik”.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SLOTS.map((s, idx) => {
            const val = slots[idx];
            const isActive = activeIdx === idx;
            return (
              <div
                key={s.key}
                ref={(el) => { boxRefs.current[idx] = el; }}
                tabIndex={0}
                onClick={() => setActiveIdx(idx)}
                onFocus={() => setActiveIdx(idx)}
                onPaste={handlePaste(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) await setSlot(idx, f);
                }}
                className={cn(
                  "relative rounded-lg border-2 border-dashed p-3 min-h-[160px] flex flex-col items-center justify-center text-center cursor-pointer transition-colors outline-none",
                  val ? "border-emerald-500/50 bg-emerald-500/5" : "border-muted-foreground/30 hover:border-primary/50 bg-muted/20",
                  isActive && !val && "border-primary ring-2 ring-primary/30",
                )}
              >
                <div className="absolute top-2 left-2 text-xs font-medium text-muted-foreground">
                  {idx + 1}. {s.label}
                </div>
                {val ? (
                  <>
                    <img src={val.dataUrl} alt={s.label} className="max-h-32 w-auto object-contain rounded mt-4" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); clearSlot(idx); }}
                      className="absolute top-1 right-1 rounded-full bg-background border p-1 hover:bg-destructive hover:text-destructive-foreground"
                      aria-label="Usuń"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="h-6 w-6 text-muted-foreground mb-1 mt-4" />
                    <div className="text-xs text-muted-foreground">Kliknij i wklej (Ctrl+V)</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">{s.hint}</div>
                    <label
                      className="mt-2 text-xs underline text-primary cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      wybierz plik
                      <input type="file" accept="image/*" className="hidden" onChange={onFile(idx)} />
                    </label>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-xs text-muted-foreground mr-auto">
            Wypełnione: <b>{filledCount}</b> / {SLOTS.length}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Anuluj</Button>
          <Button onClick={() => void submit()} disabled={busy || filledCount === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importuj treść KW
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
