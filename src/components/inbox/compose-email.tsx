import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { sendInboxEmail } from "@/lib/inbox.functions";
import { generateAgentDraft } from "@/lib/text-agent-draft.functions";

export type ComposeEmailInitial = {
  to?: string;
  subject?: string;
  body?: string;
  replyToCommunicationId?: string | null;
  /** Lead powiązany z wiadomością (dla kontekstu bota). */
  leadId?: string | null;
  /** Treść wiadomości, na którą odpisujemy (dla bota AI). */
  incomingText?: string | null;
};

export function ComposeEmailDialog({
  open,
  onOpenChange,
  initial,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ComposeEmailInitial;
  onSent?: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hint, setHint] = useState("");
  // Cytowany oryginał (przy odpowiedzi) trzymamy osobno, aby regeneracja AI go nie kasowała.
  const [quoted, setQuoted] = useState("");
  const send = useServerFn(sendInboxEmail);
  const draft = useServerFn(generateAgentDraft);

  const isReply = !!initial?.replyToCommunicationId;

  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? "");
      setSubject(initial?.subject ?? "");
      setBody(initial?.body ?? "");
      setQuoted(initial?.replyToCommunicationId ? (initial?.body ?? "") : "");
      setHint("");
    }
  }, [open, initial]);

  const gen = useMutation({
    mutationFn: () =>
      draft({
        data: {
          channel: "email",
          mode: isReply ? "reply" : "compose",
          leadId: initial?.leadId ?? null,
          incomingMessage: initial?.incomingText ?? null,
          instruction: hint.trim() || null,
          subject: subject.trim() || null,
        },
      }),
    onSuccess: (res: { text: string }) => {
      const text = (res?.text ?? "").trim();
      if (!text) {
        toast.error("Bot nie zwrócił treści");
        return;
      }
      // Szkic AI na górze, cytowany oryginał (jeśli był) pod spodem.
      setBody(quoted ? `${text}\n${quoted}` : text);
      toast.success("Szkic wygenerowany");
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wygenerować"),
  });

  const mut = useMutation({
    mutationFn: () =>
      send({
        data: {
          to: to.trim(),
          subject: subject.trim(),
          body,
          replyToCommunicationId: initial?.replyToCommunicationId ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Wiadomość wysłana");
      onOpenChange(false);
      onSent?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się wysłać"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isReply ? "Odpowiedz na wiadomość" : "Nowa wiadomość"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="compose-to">Do (można wiele, oddzielone przecinkiem)</Label>
            <Input id="compose-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="klient@example.com, drugi@example.com" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-subject">Temat</Label>
            <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Temat wiadomości" />
          </div>

          <div className="rounded-md border border-dashed p-2.5 space-y-2 bg-muted/30">
            <Label htmlFor="compose-hint" className="text-xs flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Asystent AI (Gemini Pro) {isReply ? "— odpisze na podstawie wątku" : "— napisze wiadomość"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="compose-hint"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Wskazówka dla bota (opcjonalnie), np. zaproponuj rozmowę telefoniczną"
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    gen.mutate();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={() => gen.mutate()} disabled={gen.isPending} className="shrink-0">
                <Sparkles className="h-4 w-4 mr-2" />
                {gen.isPending ? "Piszę…" : isReply ? "Odpisz AI" : "Napisz AI"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-body">Treść</Label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder="Napisz wiadomość…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Anuluj
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !to.trim() || !subject.trim() || !body.trim()}
          >
            <Send className="h-4 w-4 mr-2" />
            {mut.isPending ? "Wysyłam…" : "Wyślij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
