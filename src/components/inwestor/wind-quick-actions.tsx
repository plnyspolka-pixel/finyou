// ════════════════════════════════════════════════════════════════════
// SZYBKIE CZYNNOŚCI WINDYKACYJNE — „Telefon windykacyjny AI" i „Wyślij SMS".
//
// Jeden dialog dla panelu windykacji i karty sprawy. Po kliknięciu system:
//   1. wykonuje czynność (agent AI ElevenLabs dzwoni / SMS przez Twilio),
//   2. dopisuje ją do rejestru czynności windykacyjnych sprawy (wind_events),
//   3. nalicza opłatę ZGODNIE Z UMOWĄ (tabela opłat z umowy pożyczki; gdy
//      umowa milczy — domyślna podpowiedź; umowa bez opłat — 0 zł). Opłata
//      jest edytowalna przed wysyłką i dolicza się do zadłużenia jako koszt.
// ════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPLN } from "@/lib/labels";
import {
  performWindContact,
  type WindBorrower,
  type WindEvent,
  type WindLoan,
} from "@/lib/windykacja.functions";
import { placeWindCollectionCall } from "@/lib/windykacja-call.functions";
import { normalizeWindFeeTable, windFeeForAction } from "@/lib/windykacja-fees";

export type WindQuickKind = "botcall" | "sms";

const FEE_SOURCE_LABEL: Record<"umowa" | "domyslna" | "brak", string> = {
  umowa: "opłata wg tabeli opłat z umowy",
  domyslna: "umowa nie określa opłaty — domyślna podpowiedź (możesz zmienić)",
  brak: "umowa nie przewiduje opłat windykacyjnych — 0 zł",
};

/** Treść SMS-a windykacyjnego z kwotą zadłużenia (z odsetkami karnymi). */
export function buildWindSmsText(loan: Pick<WindLoan, "numer_umowy">, debtTotal: number): string {
  return (
    `Przypomnienie: zaległość z umowy ${loan.numer_umowy ?? ""} wynosi ${formatPLN(debtTotal)} ` +
    `(z odsetkami za opóźnienie). Prosimy o pilną spłatę. Brak wpłaty oznacza dalsze czynności ` +
    `windykacyjne i koszty. Finance You`
  );
}

export function WindQuickContactDialog({
  kind,
  caseId,
  loan,
  borrower,
  debtTotal,
  onClose,
  onDone,
}: {
  kind: WindQuickKind;
  caseId: string;
  loan: WindLoan;
  borrower: WindBorrower;
  /** Zadłużenie na dziś (kapitał + odsetki karne + koszty) — komunikowane dłużnikowi. */
  debtTotal: number;
  onClose: () => void;
  onDone: (ev?: WindEvent) => void;
}) {
  const doContact = useServerFn(performWindContact);
  const doBotCall = useServerFn(placeWindCollectionCall);

  const feeTable = useMemo(
    () => normalizeWindFeeTable(loan.oplaty_windykacyjne),
    [loan.oplaty_windykacyjne],
  );
  const feeInfo = useMemo(
    () => windFeeForAction(feeTable, kind === "sms" ? "sms" : "telefon"),
    [feeTable, kind],
  );

  const [phone, setPhone] = useState(borrower.telefon ?? "");
  const [amount, setAmount] = useState(String(Math.round(debtTotal)));
  const [text, setText] = useState(() => buildWindSmsText(loan, debtTotal));
  const [fee, setFee] = useState(String(feeInfo.fee));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!phone.trim()) {
      toast.error("Podaj numer telefonu dłużnika");
      return;
    }
    setBusy(true);
    try {
      const oplata = Math.max(0, Number(fee) || 0);
      if (kind === "sms") {
        if (!text.trim()) {
          toast.error("Treść SMS-a jest wymagana");
          return;
        }
        const ev = await doContact({
          data: { caseId, typ: "sms", target: phone.trim(), tresc: text.trim(), oplata },
        });
        const ok = (ev.metadata as { ok?: boolean })?.ok !== false;
        if (ok) {
          toast.success(
            `SMS wysłany i dopisany do rejestru czynności${
              Number(ev.oplata) > 0 ? ` — opłata ${formatPLN(Number(ev.oplata))}` : ""
            }.`,
          );
        } else {
          toast.error("SMS nie wyszedł — próba zapisana w rejestrze, bez opłaty.");
        }
        onDone(ev);
      } else {
        const res = await doBotCall({
          data: { caseId, telefon: phone.trim(), kwota: Number(amount) || 0, oplata },
        });
        if (res.ok) {
          toast.success(
            `Agent AI dzwoni do dłużnika — połączenie dopisane do rejestru czynności${
              oplata > 0 ? ` z opłatą ${formatPLN(oplata)}` : ""
            }.`,
          );
        } else {
          toast.error(res.error ?? "Nie udało się zainicjować połączenia");
        }
        onDone(res.event as WindEvent);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wykonać czynności");
    } finally {
      setBusy(false);
    }
  };

  const Icon = kind === "sms" ? MessageSquare : Phone;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />{" "}
            {kind === "sms" ? "Wyślij SMS windykacyjny" : "Telefon windykacyjny AI"}
          </DialogTitle>
          <DialogDescription>
            {kind === "sms"
              ? "SMS zostanie wysłany do dłużnika, a czynność trafi do rejestru czynności windykacyjnych z opłatą naliczoną zgodnie z umową."
              : "Agent AI zadzwoni do dłużnika w Twoim imieniu, poinformuje o zaległości i zapyta o termin wpłaty. Połączenie trafi do rejestru czynności windykacyjnych z opłatą naliczoną zgodnie z umową."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Numer telefonu dłużnika</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48…" />
          </div>

          {kind === "botcall" ? (
            <div className="space-y-1">
              <Label className="text-xs">Kwota zaległości do zakomunikowania (zł)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Domyślnie zadłużenie na dziś z odsetkami karnymi: {formatPLN(debtTotal)}.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Treść SMS-a</Label>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}

          <div className="space-y-1 rounded-md border bg-muted/40 p-3">
            <Label className="flex items-center gap-1.5 text-xs">
              <Gavel className="h-3.5 w-3.5" /> Opłata za czynność windykacyjną (zł)
            </Label>
            <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              {FEE_SOURCE_LABEL[feeInfo.source]}. Naliczona opłata dopisuje się do rejestru
              czynności i do zadłużenia jako koszt windykacji (art. 451 k.c. — wpłaty pokrywają
              najpierw koszty).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 mr-1" />
            )}
            {kind === "sms" ? "Wyślij SMS" : "Zadzwoń (agent AI)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
