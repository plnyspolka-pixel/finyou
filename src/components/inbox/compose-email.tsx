import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { sendInboxEmail } from "@/lib/inbox.functions";

export type ComposeEmailInitial = {
  to?: string;
  subject?: string;
  body?: string;
  replyToCommunicationId?: string | null;
  /** Wniosek, którego dotyczy wiadomość (np. oferta do inwestorów) —
   *  odpowiedzi będą automatycznie mapowane z powrotem do wniosku. */
  loanApplicationId?: string | null;
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
  const send = useServerFn(sendInboxEmail);

  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? "");
      setSubject(initial?.subject ?? "");
      setBody(initial?.body ?? "");
    }
  }, [open, initial]);

  const mut = useMutation({
    mutationFn: () =>
      send({
        data: {
          to: to.trim(),
          subject: subject.trim(),
          body,
          replyToCommunicationId: initial?.replyToCommunicationId ?? null,
          loanApplicationId: initial?.loanApplicationId ?? null,
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
          <DialogTitle>{initial?.replyToCommunicationId ? "Odpowiedz na wiadomość" : "Nowa wiadomość"}</DialogTitle>
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
