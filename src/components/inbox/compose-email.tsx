import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Paperclip, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendInboxEmail } from "@/lib/inbox.functions";
import { uploadFile } from "@/lib/uploads/unified-upload";
import type { OutboundAttachmentRef } from "@/lib/email-attachments.types";

export type ComposeEmailInitial = {
  to?: string;
  subject?: string;
  body?: string;
  replyToCommunicationId?: string | null;
  attachments?: OutboundAttachmentRef[];
};

function fmtSize(n?: number | null) {
  if (!n || !Number.isFinite(n)) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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
  const [attachments, setAttachments] = useState<OutboundAttachmentRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const send = useServerFn(sendInboxEmail);

  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? "");
      setSubject(initial?.subject ?? "");
      setBody(initial?.body ?? "");
      setAttachments(initial?.attachments ?? []);
    }
  }, [open, initial]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`„${file.name}” jest za duży (max 15 MB na plik)`);
          continue;
        }
        const res = await uploadFile(file, { context: "attachment" });
        setAttachments((prev) => [
          ...prev,
          {
            name: res.fileName,
            path: res.path,
            bucket: res.bucket,
            mime: res.mimeType,
            size: res.size,
          },
        ]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się dodać załącznika");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (idx: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const mut = useMutation({
    mutationFn: () =>
      send({
        data: {
          to: to.trim(),
          subject: subject.trim(),
          body,
          replyToCommunicationId: initial?.replyToCommunicationId ?? null,
          attachments: attachments.length ? attachments : undefined,
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
          <DialogTitle>
            {initial?.replyToCommunicationId ? "Odpowiedz na wiadomość" : "Nowa wiadomość"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="compose-to">Do (można wiele, oddzielone przecinkiem)</Label>
            <Input
              id="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="klient@example.com, drugi@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-subject">Temat</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Temat wiadomości"
            />
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Załączniki{attachments.length ? ` (${attachments.length})` : ""}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || mut.isPending}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                )}
                {uploading ? "Dodawanie…" : "Dodaj plik"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <span
                    key={`${a.path ?? a.url ?? a.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs max-w-full"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate max-w-[220px]" title={a.name}>
                      {a.name}
                    </span>
                    {a.size ? (
                      <span className="text-muted-foreground shrink-0">{fmtSize(a.size)}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      title="Usuń załącznik"
                      disabled={mut.isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachments.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Pliki zostaną dołączone do maila jako normalne załączniki.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Anuluj
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || uploading || !to.trim() || !subject.trim() || !body.trim()}
          >
            <Send className="h-4 w-4 mr-2" />
            {mut.isPending ? "Wysyłam…" : "Wyślij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
