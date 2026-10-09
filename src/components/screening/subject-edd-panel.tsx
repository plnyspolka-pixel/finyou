// Wzmożone środki dla potwierdzonego PEP: źródło majątku i źródło środków
// z załącznikami oraz akceptacja członka zarządu (rola administrator).
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSubjectByBoard,
  getAttachmentUrl,
  saveSubjectSourceOfWealth,
  uploadSubjectAttachment,
} from "@/lib/screening/screening.functions";
import type { ScreeningSubjectStatus } from "@/lib/screening/types";
import { fmtDate } from "./shared";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function SubjectEddPanel({
  subjectId,
  status,
  onChanged,
}: {
  subjectId: string;
  status: ScreeningSubjectStatus;
  onChanged: () => void;
}) {
  const saveFn = useServerFn(saveSubjectSourceOfWealth);
  const uploadFn = useServerFn(uploadSubjectAttachment);
  const urlFn = useServerFn(getAttachmentUrl);
  const approveFn = useServerFn(approveSubjectByBoard);
  const [sow, setSow] = useState(status.source_of_wealth ?? "");
  const [sof, setSof] = useState(status.source_of_funds ?? "");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { subjectId, sourceOfWealth: sow, sourceOfFunds: sof } }),
    onSuccess: () => {
      toast.success("Zapisano źródło majątku i środków.");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 10 * 1024 * 1024) throw new Error("Plik większy niż 10 MB.");
      return uploadFn({
        data: {
          subjectId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64: await fileToBase64(file),
        },
      });
    },
    onSuccess: () => {
      toast.success("Załącznik dodany.");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const approve = useMutation({
    mutationFn: () => approveFn({ data: { subjectId, note } }),
    onSuccess: () => {
      toast.success("Akceptacja zarządu zapisana — relacja odblokowana.");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base">Wzmożone środki bezpieczeństwa (PEP)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="space-y-1">
          <li>
            Wzmożone monitorowanie: <b>{status.enhanced_monitoring ? "TAK" : "nie"}</b>
          </li>
          <li>
            Wstrzymanie operacji:{" "}
            <b>{status.operations_hold ? `TAK — ${status.hold_reason ?? ""}` : "nie"}</b>
          </li>
          <li>
            Akceptacja członka zarządu:{" "}
            <b>
              {status.board_approved_at
                ? `udzielona ${fmtDate(status.board_approved_at)}`
                : status.board_approval_required
                  ? "WYMAGANA przed nawiązaniem / kontynuacją relacji"
                  : "nie dotyczy"}
            </b>
          </li>
        </ul>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sow">Źródło majątku *</Label>
            <Textarea id="sow" rows={3} value={sow} onChange={(e) => setSow(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sof">Źródło środków (dla tej transakcji) *</Label>
            <Textarea id="sof" rows={3} value={sof} onChange={(e) => setSof(e.target.value)} />
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => save.mutate()}
          disabled={save.isPending || sow.trim().length < 3 || sof.trim().length < 3}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Zapisz
        </Button>

        <div className="space-y-2">
          <p className="font-medium">Załączniki potwierdzające</p>
          <ul className="space-y-1">
            {status.sow_attachments.map((a) => (
              <li key={a.path}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline"
                  onClick={async () => {
                    try {
                      const { url } = await urlFn({ data: { path: a.path } });
                      window.open(url, "_blank", "noopener");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <FileText className="h-4 w-4" /> {a.name}
                </button>{" "}
                <span className="text-xs text-muted-foreground">{fmtDate(a.uploaded_at)}</span>
              </li>
            ))}
          </ul>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Dodaj dokument
          </Button>
        </div>

        {status.board_approval_required && !status.board_approved_at && (
          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="board-note">Akceptacja członka zarządu — uzasadnienie *</Label>
            <Textarea
              id="board-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              onClick={() => approve.mutate()}
              disabled={approve.isPending || note.trim().length < 10}
            >
              {approve.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Akceptuję relację z PEP (członek zarządu)
            </Button>
            <p className="text-xs text-muted-foreground">
              Wymaga roli administratora, uzupełnionego źródła majątku i środków oraz co najmniej
              jednego załącznika.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
