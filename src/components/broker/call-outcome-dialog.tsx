import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Phone, PhoneOff, Mic, MicOff, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addManualNote } from "@/lib/leads-admin.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  leadName?: string;
  onSaved?: () => void;
};

type Step = "outcome" | "note";

// Web Speech API (Android Chrome, iOS Safari 14.5+, desktop Chrome/Edge).
function getRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export function CallOutcomeDialog({ open, onOpenChange, leadId, leadName, onSaved }: Props) {
  const [step, setStep] = useState<Step>("outcome");
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<any>(null);
  const baseRef = useRef<string>("");

  const addFn = useServerFn(addManualNote);
  const save = useMutation({
    mutationFn: (content: string) => addFn({ data: { leadId, content } }),
    onSuccess: () => {
      toast.success("Notatka zapisana");
      onSaved?.();
      close();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się zapisać"),
  });

  const close = () => {
    stopMic();
    setStep("outcome");
    setNote("");
    onOpenChange(false);
  };

  useEffect(() => {
    if (open) {
      setStep("outcome");
      setNote("");
      setSupported(!!getRecognitionCtor());
    } else {
      stopMic();
    }
  }, [open]);

  const stopMic = () => {
    try {
      recRef.current?.stop?.();
    } catch {}
    recRef.current = null;
    setListening(false);
  };

  const startMic = async () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      toast.error("Twoja przeglądarka nie wspiera dyktowania. Wpisz notatkę ręcznie.");
      return;
    }
    try {
      // Request permission early on browsers that need explicit gesture.
      if (navigator.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => s.getTracks().forEach((t) => t.stop()))
          .catch(() => {});
      }
      baseRef.current = note ? note.trim() + " " : "";
      const rec = new Ctor();
      rec.lang = "pl-PL";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let finalText = "";
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (finalText) baseRef.current = (baseRef.current + finalText).replace(/\s+/g, " ");
        setNote((baseRef.current + interim).trim());
      };
      rec.onerror = (e: any) => {
        if (e?.error === "not-allowed") toast.error("Brak dostępu do mikrofonu");
        else if (e?.error && e.error !== "aborted" && e.error !== "no-speech")
          toast.error(`Mikrofon: ${e.error}`);
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Nie udało się uruchomić dyktowania");
    }
  };

  const handleNotAnswered = () => save.mutate("☎️ Nie odebrano");
  const handleAnswered = () => setStep("note");
  const handleSaveNote = () => {
    const content = note.trim();
    if (!content) {
      toast.error("Dodaj krótką notatkę z rozmowy");
      return;
    }
    save.mutate(`☎️ Odebrano — ${content}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "outcome" ? "Wynik rozmowy" : "Notatka z rozmowy"}
            {leadName && (
              <span className="block text-sm font-normal text-muted-foreground mt-1">
                {leadName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === "outcome" && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <Button
              type="button"
              variant="outline"
              className="h-24 flex-col gap-2 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={handleNotAnswered}
              disabled={save.isPending}
            >
              <PhoneOff className="h-6 w-6" />
              <span className="font-semibold">Nie odebrano</span>
            </Button>
            <Button
              type="button"
              className="h-24 flex-col gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleAnswered}
              disabled={save.isPending}
            >
              <Phone className="h-6 w-6" />
              <span className="font-semibold">Odebrano</span>
            </Button>
          </div>
        )}

        {step === "note" && (
          <div className="space-y-3 py-1">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="O czym rozmawialiście? Możesz też podyktować mikrofonem."
              rows={6}
              autoFocus
            />
            <div className="flex items-center gap-2">
              {supported ? (
                <Button
                  type="button"
                  variant={listening ? "default" : "outline"}
                  size="sm"
                  onClick={listening ? stopMic : startMic}
                  className={
                    listening ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse" : ""
                  }
                >
                  {listening ? (
                    <>
                      <MicOff className="h-4 w-4 mr-1.5" /> Zatrzymaj
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-1.5" /> Dyktuj
                    </>
                  )}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Dyktowanie niedostępne w tej przeglądarce.
                </span>
              )}
              {listening && <span className="text-xs text-rose-600">● nagrywam…</span>}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("outcome")}
                disabled={save.isPending}
              >
                Wstecz
              </Button>
              <Button
                type="button"
                onClick={handleSaveNote}
                disabled={save.isPending || !note.trim()}
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" /> Zapisz
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
