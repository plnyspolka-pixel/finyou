/**
 * Podpis w formie dokumentowej dla dokumentu wygenerowanego w kreatorze.
 * Nie przesyłamy pliku z przeglądarki: serwerowy e-podpis pobiera wskazany
 * generated_documents.id z kontrolą RLS, zamienia DOCX na PDF i zapisuje
 * niezmienny skrót PDF oraz ślad audytowy.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { createEnvelope, type CreateEnvelopeInput } from "@/lib/esign/esign-owner.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type GeneratedSigningDocument = { id: string; title: string };
type Recipient = { name: string; email: string; phone: string };
const emptyRecipient = (): Recipient => ({ name: "", email: "", phone: "" });

export function GeneratedDocumentEsignDialog({
  document, onOpenChange, onCreated,
}: {
  document: GeneratedSigningDocument | null;
  onOpenChange: (open: boolean) => void;
  onCreated?: (envelopeId: string) => void;
}) {
  const create = useServerFn(createEnvelope);
  const [recipients, setRecipients] = useState<Recipient[]>([emptyRecipient()]);
  const [includeSelf, setIncludeSelf] = useState(false);
  const [mode, setMode] = useState<"rownolegle" | "kolejno">("rownolegle");
  const [days, setDays] = useState("30");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setRecipients([emptyRecipient()]);
      setIncludeSelf(false);
      setMode("rownolegle");
      setDays("30");
      setError("");
    }
  }, [document?.id]);

  const validRecipients = recipients.filter(r => r.name.trim() || r.email.trim() || r.phone.trim());
  const valid = !!document && title.trim().length >= 3 &&
    (validRecipients.length > 0 || includeSelf) &&
    validRecipients.every(r => r.name.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) &&
    validRecipients.length + Number(includeSelf) <= 10;

  const send = useMutation({
    mutationFn: async () => {
      if (!document || !valid) throw new Error("Uzupełnij wymagane dane podpisujących.");
      const payload: CreateEnvelopeInput = {
        title: title.trim(),
        generatedDocumentId: document.id,
        signingMode: mode,
        expiresInDays: Number(days),
        sendNow: true,
        signers: [
          ...(includeSelf ? [{ kind: "ja" as const, orderNo: 1, capacityMode: "osoba" as const }] : []),
          ...validRecipients.map((r, i) => ({
            kind: "zewnetrzny" as const,
            fullName: r.name.trim(),
            email: r.email.trim(),
            phone: r.phone.trim() || null,
            capacityMode: "osoba" as const,
            orderNo: i + 1 + Number(includeSelf),
          })),
        ],
      };
      return create({ data: payload });
    },
    onSuccess: result => {
      if (result.sentTo?.length) {
        toast.success("Dokument przekazany do e-podpisu. Zaproszenia: " + result.sentTo.join(", "));
      } else {
        toast.warning("Koperta utworzona, lecz nie potwierdzono wysyłki zaproszeń. Sprawdź jej status w E-podpisie.");
      }
      onOpenChange(false);
      onCreated?.(result.id);
    },
    onError: e => setError(e instanceof Error ? e.message : "Nie udało się przygotować podpisu."),
  });

  const update = (i: number, patch: Partial<Recipient>) =>
    setRecipients(v => v.map((r, j) => i === j ? { ...r, ...patch } : r));

  return (
    <Dialog open={!!document} onOpenChange={open => { if (!send.isPending) onOpenChange(open); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Wyślij dokument do e-podpisu</DialogTitle>
          <DialogDescription>
            {document?.title ?? "Dokument"} — serwer przygotuje PDF z wygenerowanego
            pliku, zweryfikuje podpisujących i zachowa kartę podpisów.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="generated-esign-title">Tytuł dokumentu</Label>
            <Input id="generated-esign-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200}/>
          </div>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox checked={includeSelf} onCheckedChange={v => setIncludeSelf(v === true)}/>
            <span>Ja również podpisuję dokument (dane z mojego konta).</span>
          </label>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Pozostali podpisujący</Label>
              <Button type="button" variant="outline" size="sm"
                disabled={recipients.length + Number(includeSelf) >= 10}
                onClick={() => setRecipients(v => [...v, emptyRecipient()])}>
                <Plus className="mr-1 h-4 w-4"/> Dodaj osobę
              </Button>
            </div>
            {recipients.map((r, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Osoba {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" aria-label={"Usuń osobę " + (i + 1)}
                    onClick={() => setRecipients(v => v.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4"/>
                  </Button>
                </div>
                <Input aria-label={"Imię i nazwisko osoby " + (i + 1)} placeholder="Imię i nazwisko"
                  autoComplete="off" value={r.name} onChange={e => update(i, { name: e.target.value })}/>
                <Input aria-label={"E-mail osoby " + (i + 1)} type="email" placeholder="Adres e-mail"
                  autoComplete="off" value={r.email} onChange={e => update(i, { email: e.target.value })}/>
                <Input aria-label={"Telefon osoby " + (i + 1)} type="tel" placeholder="Telefon (opcjonalnie)"
                  autoComplete="off" value={r.phone} onChange={e => update(i, { phone: e.target.value })}/>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Puste wiersze są pomijane. Maksymalnie 10 podpisujących łącznie.
              Dla podpisujących w imieniu spółki użyj zaawansowanego modułu E-podpis.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="generated-esign-mode">Kolejność</Label>
              <select id="generated-esign-mode" value={mode}
                onChange={e => setMode(e.target.value as "rownolegle" | "kolejno")}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="rownolegle">Wszyscy równocześnie</option>
                <option value="kolejno">Jeden po drugim</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generated-esign-days">Link ważny</Label>
              <select id="generated-esign-days" value={days} onChange={e => setDays(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="7">7 dni</option><option value="14">14 dni</option>
                <option value="30">30 dni</option><option value="60">60 dni</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Podpis dokumentowy (art. 77² KC), nie kwalifikowany. Nie zastępuje
            podpisu kwalifikowanego ani aktu notarialnego, gdy wymaga ich prawo.
            Kliknięcie „Wyślij” uruchamia rzeczywistą wysyłkę zaproszeń e-mail.
          </p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>Anuluj</Button>
          <Button onClick={() => { setError(""); send.mutate(); }} disabled={!valid || send.isPending}>
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
            Wyślij do podpisu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
