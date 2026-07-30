import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { markGoodLead, markBadLead, unmarkBadLead } from "@/lib/lead-quality.functions";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function MetaRateButtons({
  leadId,
  markedBad,
  qualityTier,
  onChanged,
  compact = false,
}: {
  leadId: string;
  markedBad?: boolean | null;
  qualityTier?: string | null;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const goodFn = useServerFn(markGoodLead);
  const badFn = useServerFn(markBadLead);
  const unmarkFn = useServerFn(unmarkBadLead);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  const good = useMutation({
    mutationFn: () => goodFn({ data: { leadId } }),
    onSuccess: () => {
      toast.success("Wysłano sygnał TOP do Meta");
      onChanged?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się"),
  });
  const bad = useMutation({
    mutationFn: () => badFn({ data: { leadId, reason: reason.trim() || "spam" } }),
    onSuccess: () => {
      toast.success("Wysłano sygnał złego leada do Meta");
      setReasonOpen(false);
      setReason("");
      onChanged?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się"),
  });
  const unmark = useMutation({
    mutationFn: () => unmarkFn({ data: { leadId } }),
    onSuccess: () => {
      toast.success("Cofnięto oznaczenie");
      onChanged?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się"),
  });

  const busy = good.isPending || bad.isPending || unmark.isPending;
  const sz = compact ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs";

  if (markedBad) {
    return (
      <Button
        size="sm"
        variant="outline"
        className={`${sz} bg-white/10 text-white border-white/25 hover:bg-white/20`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          unmark.mutate();
        }}
        disabled={busy}
      >
        {unmark.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Cofnij „zły"
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <div
        className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/[0.06] p-0.5"
        title="Oceń leada dla Meta (Conversion API)"
      >
        <Button
          size="sm"
          className={`${sz} bg-emerald-500/25 text-emerald-50 border border-emerald-300/40 hover:bg-emerald-500/45 ${qualityTier === "A" ? "ring-1 ring-emerald-300" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            good.mutate();
          }}
          disabled={busy}
          aria-label="Dobry lead — wyślij sygnał do Meta"
        >
          {good.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <ThumbsUp className="h-3.5 w-3.5 mr-1" />
              TOP
            </>
          )}
        </Button>
        <Button
          size="sm"
          className={`${sz} bg-rose-500/25 text-rose-50 border border-rose-300/40 hover:bg-rose-500/45`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setReasonOpen(true);
          }}
          disabled={busy}
          aria-label="Zły lead — wyślij sygnał do Meta"
        >
          <ThumbsDown className="h-3.5 w-3.5 mr-1" />
          Spam
        </Button>
      </div>

      <Dialog open={reasonOpen} onOpenChange={(v) => !v && !bad.isPending && setReasonOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Oznacz jako zły lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Wyślemy do Meta negatywny sygnał (BadLead), żeby algorytm uczył się nie kierować
            podobnych leadów. Krótko opisz powód.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="np. fałszywy numer, spam, żart, konkurencja…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReasonOpen(false)} disabled={bad.isPending}>
              Anuluj
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => bad.mutate()}
              disabled={bad.isPending || reason.trim().length < 3}
            >
              {bad.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Wyślij sygnał do Meta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
