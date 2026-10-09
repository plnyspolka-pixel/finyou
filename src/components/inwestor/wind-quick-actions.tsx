// ════════════════════════════════════════════════════════════════════
// SZYBKIE CZYNNOŚCI WINDYKACYJNE — „Telefon windykacyjny AI" i „Wyślij SMS".
//
// Jeden dialog dla panelu windykacji i karty sprawy. Po kliknięciu system:
//   1. wykonuje czynność (agent AI ElevenLabs dzwoni / SMS przez Twilio),
//   2. dopisuje ją do rejestru czynności windykacyjnych sprawy (wind_events),
//   3. nalicza opłatę ZGODNIE Z UMOWĄ (tabela opłat z umowy pożyczki; gdy
//      umowa milczy — domyślna podpowiedź; umowa bez opłat — 0 zł). Opłata
//      jest edytowalna przed wysyłką i dolicza się do zadłużenia jako koszt.
//
// Kwota komunikowana dłużnikowi (SMS, telefon AI) to „do zapłaty teraz":
// zaległe raty + odsetki za opóźnienie + koszty windykacyjne — NIE całe
// saldo pożyczki z ratami przyszłymi. Po wypowiedzeniu umowy „do zapłaty
// teraz" jest całym zadłużeniem (windDebtSnapshot w windykacja-debt.ts).
// ════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Gavel, AlertTriangle } from "lucide-react";
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
import { windLoanIsTerminated } from "@/lib/windykacja-debt";
import { formatZl } from "@/components/inwestor/wind-harmonogram-form";
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

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Treść SMS-a windykacyjnego z kwotą do zapłaty teraz (zaległe raty
 * z odsetkami za opóźnienie i kosztami). Po wypowiedzeniu umowy — całe
 * zadłużenie, które stało się wymagalne.
 */
export function buildWindSmsText(
  loan: Pick<WindLoan, "numer_umowy">,
  amountDueNow: number,
  opts: { wypowiedziana?: boolean } = {},
): string {
  const nr = loan.numer_umowy ?? "";
  if (opts.wypowiedziana) {
    return (
      `Umowa ${nr} została wypowiedziana. Całe zadłużenie wynosi ${formatZl(amountDueNow)} ` +
      `(z odsetkami za opóźnienie i kosztami) i jest wymagalne. Prosimy o niezwłoczną spłatę. ` +
      `Brak wpłaty oznacza dalsze czynności windykacyjne i koszty. Finance You`
    );
  }
  return (
    `Przypomnienie: do zapłaty z umowy ${nr} jest teraz ${formatZl(amountDueNow)} ` +
    `(zaległe raty z odsetkami za opóźnienie i kosztami). Prosimy o pilną spłatę. Brak wpłaty oznacza ` +
    `dalsze czynności windykacyjne i koszty. Finance You`
  );
}

export function WindQuickContactDialog({
  kind,
  caseId,
  loan,
  borrower,
  amountDueNow,
  wholeDebt,
  onClose,
  onDone,
}: {
  kind: WindQuickKind;
  caseId: string;
  loan: WindLoan;
  borrower: WindBorrower;
  /**
   * Do zapłaty teraz: zaległe raty + odsetki za opóźnienie + koszty
   * windykacyjne (po wypowiedzeniu — całe zadłużenie). Domyślna kwota
   * SMS-a i telefonu AI.
   */
  amountDueNow: number;
  /** Całe zadłużenie z ratami przyszłymi — tylko informacyjnie. */
  wholeDebt?: number | null;
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

  const wypowiedziana = windLoanIsTerminated(loan);
  const dueNow = Math.max(0, round2(amountDueNow));
  const pozyczkodawca = loan.pozyczkodawca?.trim() || null;

  const [phone, setPhone] = useState(borrower.telefon ?? "");
  // Kwota z groszami — agent AI wypowiada ją dokładnie (nie zaokrąglamy w górę).
  const [amount, setAmount] = useState(String(dueNow));
  const [text, setText] = useState(() => buildWindSmsText(loan, dueNow, { wypowiedziana }));
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
          // Kwota niezmieniona = 0: serwer liczy „do zapłaty teraz" sam (na
          // dzień rozmowy) i zapisuje jej rozbicie w aktach; zmieniona — ręczna.
          data: {
            caseId,
            telefon: phone.trim(),
            kwota: amount.trim() === String(dueNow) ? 0 : Number(amount.replace(",", ".")) || 0,
            oplata,
          },
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
              : `Agent AI zadzwoni do dłużnika ${
                  pozyczkodawca ? `w imieniu pożyczkodawcy (${pozyczkodawca})` : "w Twoim imieniu"
                }, poinformuje o kwocie do zapłaty i zapyta o termin wpłaty. Połączenie trafi do rejestru czynności windykacyjnych z opłatą naliczoną zgodnie z umową.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Numer telefonu dłużnika</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48…" />
          </div>

          {dueNow <= 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Na dziś nie ma wymagalnej zaległości (raty po terminie są zapłacone). Sprawdź, czy
                kontakt windykacyjny jest zasadny.
              </span>
            </div>
          )}

          {kind === "botcall" ? (
            <div className="space-y-1">
              <Label className="text-xs">Kwota do zapłaty do zakomunikowania (zł)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {wypowiedziana
                  ? `Umowa wypowiedziana — domyślnie całe zadłużenie (wymagalne): ${formatZl(dueNow)}.`
                  : `Domyślnie: do zapłaty teraz (zaległe raty + odsetki za opóźnienie + koszty): ${formatZl(dueNow)}.`}
                {!wypowiedziana && wholeDebt != null && wholeDebt > dueNow + 0.005
                  ? ` Całe zadłużenie z ratami przyszłymi (${formatZl(wholeDebt)}) staje się wymagalne dopiero po wypowiedzeniu umowy.`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Treść SMS-a</Label>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                {wypowiedziana
                  ? "Umowa wypowiedziana — w treści całe zadłużenie (wymagalne)."
                  : "Domyślnie: do zapłaty teraz (zaległe raty + odsetki za opóźnienie + koszty)."}
              </p>
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
