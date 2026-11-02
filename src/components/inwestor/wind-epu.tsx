import { useMemo, useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCopy, ExternalLink, FileUp, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { recordWindEpuEvent, EPU_STATUS_LABELS } from "@/lib/windykacja-epu.functions";
import type { WindLoan, WindBorrower, WindEvent } from "@/lib/windykacja.functions";
import type { WindCreditorView } from "@/lib/investor-party";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const E_SAD_URL = "https://www.e-sad.gov.pl/";
type EpuStatus = keyof typeof EPU_STATUS_LABELS;
const UPDATE_STATUSES: EpuStatus[] = [
  "filed", "order", "served", "objection", "final", "discontinued", "enforcement", "other",
];
const todayPL = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Skopiowano dane do formularza e-Sądu");
  } catch {
    toast.error("Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie.");
  }
}

/** Samodzielne EPU: bez API, bez automatycznego składania i bez statusów z sądu. */
export function WindEpuPanel({
  caseId, userId, loan, borrower, creditor, events, onUpdated, onDownload,
}: {
  caseId: string;
  userId?: string;
  loan: WindLoan;
  borrower: WindBorrower;
  creditor: WindCreditorView | null;
  events: WindEvent[];
  onUpdated: () => void;
  onDownload: (path: string) => void;
}) {
  const record = useServerFn(recordWindEpuEvent);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(loan.termin_splaty?.slice(0, 10) ?? "");
  const [claimBasis, setClaimBasis] = useState(loan.numer_umowy
    ? `Umowa pożyczki nr ${loan.numer_umowy}`
    : "");
  const [facts, setFacts] = useState("");
  const [evidence, setEvidence] = useState("");
  const [status, setStatus] = useState<EpuStatus>("filed");
  const [sygnatura, setSygnatura] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayPL());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const epuEvents = useMemo(
    () => events.filter((event) => event.metadata?.epu === true)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [events],
  );
  const latestReference = epuEvents.find((event) => event.metadata?.epu_sygnatura)
    ?.metadata?.epu_sygnatura as string | undefined;

  const numericAmount = Number(amount.trim().replace(/\s/g, "").replace(",", "."));
  const isValidAmount = amount.trim().length > 0 &&
    Number.isFinite(numericAmount) && numericAmount > 0;
  const plaintiff = creditor?.party?.legalName?.trim() ?? "";
  const defendant = borrower.imie_nazwisko?.trim() ?? "";
  const debtorAddress = borrower.adres_do_doreczen || borrower.adres_zamieszkania || "";
  const ready = Boolean(plaintiff && defendant && debtorAddress && (borrower.pesel || borrower.nip) &&
    isValidAmount && dueDate && claimBasis.trim() && facts.trim() && evidence.trim());

  const blocks = useMemo(() => [
    {
      label: "Powód i pozwany",
      value: `Powód: ${plaintiff || "[uzupełnij profil wierzyciela]"}\nPozwany: ${defendant || "[uzupełnij dane dłużnika]"}\nAdres pozwanego: ${debtorAddress || "[uzupełnij adres]"}${borrower.pesel ? `\nPESEL: ${borrower.pesel}` : ""}${borrower.nip ? `\nNIP: ${borrower.nip}` : ""}`,
    },
    {
      label: "Żądanie i podstawa",
      value: `Kwota roszczenia głównego: ${isValidAmount ? numericAmount.toFixed(2) : "[wpisz zweryfikowaną kwotę]"} zł\nTermin płatności: ${dueDate || "[uzupełnij]"}\nTytuł roszczenia: ${claimBasis || "[uzupełnij]"}\nOdsetki: określ rodzaj, stopę i datę początkową w formularzu e-Sądu (nie są doliczane automatycznie do kwoty głównej).`,
    },
    {
      label: "Uzasadnienie — treść do weryfikacji",
      value: `Powód dochodzi zapłaty z tytułu: ${claimBasis || "[podstawa roszczenia]"}.\nTermin wymagalności według dokumentów: ${dueDate || "[data]"}.\nOpis okoliczności i rozliczenia podany przez wierzyciela:\n${facts || "[uzupełnij fakty, wpłaty, reklamacje i podstawy wyliczenia]"}`,
    },
    {
      label: "Dowody do wskazania w e-Sądzie (bez załączania plików)",
      value: evidence || "[wpisz dokumenty i fakty, które mają wykazać]",
    },
  ], [plaintiff, defendant, debtorAddress, borrower.pesel, borrower.nip,
    isValidAmount, numericAmount, dueDate, claimBasis, facts, evidence]);
  const pack = blocks.map((b) => `${b.label.toUpperCase()}\n${b.value}`).join("\n\n");

  const save = async (kind: "draft" | "update") => {
    if (!userId) { toast.error("Zaloguj się, aby zapisać dane."); return; }
    if (kind === "draft" && !ready) {
      toast.error("Uzupełnij wszystkie dane pozwu przed zapisaniem szkicu."); return;
    }
    if (kind === "update" && status === "filed" && !note.trim() && !sygnatura.trim() && !file) {
      toast.error("Podaj sygnaturę, opis lub dokument potwierdzający zgłoszenie."); return;
    }
    setBusy(true);
    try {
      let attachmentPath: string | null = null;
      if (kind === "update" && file) {
        if (file.size > 15 * 1024 * 1024 ||
          !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Załącznik musi być PDF/JPG/PNG/WebP i mieć maksymalnie 15 MB.");
        }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
        attachmentPath = `windykacja/${userId}/${caseId}/epu/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from(CLIENT_FILES_BUCKET)
          .upload(attachmentPath, file, { upsert: false, contentType: file.type });
        if (error) throw new Error(error.message);
      }
      await record({ data: {
        caseId, status: kind === "draft" ? "prepared" : status,
        sygnatura: kind === "draft" ? null : sygnatura.trim() || latestReference || null,
        occurredOn: kind === "draft" ? todayPL() : occurredOn,
        note: kind === "draft" ? "Przygotowano dane do samodzielnego złożenia pozwu." : note.trim() || null,
        attachmentPath,
        claimSummary: kind === "draft" ? pack : null,
      } });
      toast.success(kind === "draft" ? "Zapisano szkic danych do EPU" : "Dodano aktualizację sprawy");
      if (kind === "update") { setNote(""); setFile(null); }
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać zdarzenia");
    } finally { setBusy(false); }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" /> e-Sąd (EPU) — pozew i monitoring ręczny
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Przygotowujemy dane do formularza. Wierzyciel sam loguje się do e-Sądu,
          przepisuje informacje, podpisuje i opłaca pozew. Nie wysyłamy pozwu ani
          dokumentów do sądu i nie pobieramy statusów automatycznie.
        </p>
        {loan.akt_notarialny_777 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Ta sprawa ma wskazany akt 777. Sprawdź najpierw możliwość uzyskania klauzuli
            wykonalności bez pozwu EPU.
          </p>
        )}
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer font-medium text-sm">
            1. Przygotuj dane pozwu do skopiowania
          </summary>
          <div className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">
              To szkic, nie ocena dopuszczalności EPU. Sprawdź wymagalność,
              przedawnienie, właściwą kwotę i identyfikatory stron. Nie wpisuj
              do kwoty głównej odsetek ani niezweryfikowanych opłat.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="epu-claim-amount">Kwota roszczenia głównego (PLN)</Label>
                <Input id="epu-claim-amount" inputMode="decimal" value={amount}
                  onChange={(event) => setAmount(event.target.value)} placeholder="np. 4250,00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="epu-due-date">Termin płatności</Label>
                <Input id="epu-due-date" type="date" value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="epu-basis">Podstawa roszczenia</Label>
              <Input id="epu-basis" value={claimBasis}
                onChange={(event) => setClaimBasis(event.target.value)}
                placeholder="np. faktura VAT nr... / umowa nr..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="epu-facts">Fakty, wpłaty i sposób wyliczenia</Label>
              <Textarea id="epu-facts" rows={3} value={facts}
                onChange={(event) => setFacts(event.target.value)}
                placeholder="Opisz powstanie długu, termin, historię płatności i pozostałą kwotę." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="epu-evidence">Wykaz dowodów (nazwy dokumentów)</Label>
              <Textarea id="epu-evidence" rows={2} value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="Umowa, faktura, potwierdzenie wykonania usługi, wezwanie..." />
            </div>
            {blocks.map((block) => (
              <div key={block.label} className="space-y-1">
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-xs font-medium">{block.label}</span>
                  <Button size="sm" variant="ghost" type="button"
                    onClick={() => void copyText(block.value)}>
                    <ClipboardCopy className="h-3.5 w-3.5 mr-1" /> Kopiuj
                  </Button>
                </div>
                <Textarea readOnly rows={Math.min(7, Math.max(2, block.value.split("\n").length))}
                  value={block.value} className="text-xs" />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void copyText(pack)}>
                <ClipboardCopy className="h-4 w-4 mr-2" /> Kopiuj cały pakiet
              </Button>
              <Button type="button" disabled={busy || !ready} onClick={() => void save("draft")}>
                Zapisz przygotowanie w historii
              </Button>
            </div>
          </div>
        </details>

        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium text-sm">2. Wyślij i opłać pozew w e-Sądzie</div>
          <p className="text-xs text-muted-foreground">
            Zaloguj się, utwórz pozew, uzupełnij pola, podpisz i opłać go bezpośrednio
            w systemie EPU. Dowody należy wskazać, ale nie dołącza się ich do pozwu.
          </p>
          <Button asChild type="button" variant="outline">
            <a href={E_SAD_URL} target="_blank" rel="noopener noreferrer">
              Otwórz oficjalny e-Sąd <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          </Button>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="font-medium text-sm">3. Wróć i dodaj informację z e-Sądu</div>
          {latestReference && <p className="text-xs">Ostatnia zapisana sygnatura: <strong>{latestReference}</strong></p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="epu-status">Co się wydarzyło?</Label>
              <select id="epu-status" className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={status} onChange={(e) => setStatus(e.target.value as EpuStatus)}>
                {UPDATE_STATUSES.map((s) =>
                  <option key={s} value={s}>{EPU_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="epu-event-date">Data zdarzenia</Label>
              <Input id="epu-event-date" type="date" max={todayPL()}
                value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="epu-signature">Sygnatura (jeżeli została nadana)</Label>
            <Input id="epu-signature" value={sygnatura} onChange={(e) => setSygnatura(e.target.value)}
              placeholder={latestReference || "np. VI Nc-e ..."} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="epu-note">Opis / treść informacji otrzymanej z sądu</Label>
            <Textarea id="epu-note" rows={3} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Co dokładnie otrzymałeś? Jakie terminy lub polecenia wskazano?" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="epu-file">Dokument lub zrzut ekranu (opcjonalnie, do akt Finance You)</Label>
            <Input id="epu-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={onFile} />
            <p className="text-xs text-muted-foreground">
              Plik zostanie dodany tylko do naszej teczki sprawy, nie do e-Sądu (maks. 15 MB).
            </p>
          </div>
          <Button type="button" disabled={busy || !occurredOn} onClick={() => void save("update")}>
            <FileUp className="h-4 w-4 mr-2" /> Zapisz aktualizację
          </Button>
          <p className="text-xs text-muted-foreground">
            Statusy są zgłaszane przez wierzyciela; platforma nie potwierdza ich w sądzie.
            Terminy procesowe należy zweryfikować w otrzymanych dokumentach.
          </p>
        </div>

        {epuEvents.length > 0 && (
          <div className="space-y-2">
            <div className="font-medium text-sm">Historia EPU ({epuEvents.length})</div>
            {epuEvents.map((event) => (
              <div key={event.id} className="rounded-md border p-2 text-xs space-y-1">
                <div className="font-medium">{event.tytul}</div>
                <div className="text-muted-foreground">
                  {event.data_zdarzenia.slice(0, 10)}
                  {event.metadata?.epu_sygnatura ? ` · ${event.metadata.epu_sygnatura}` : ""}
                </div>
                {event.tresc && <p className="whitespace-pre-wrap">{event.tresc}</p>}
                {event.zalacznik_url && (
                  <Button type="button" variant="link" className="h-auto p-0 text-xs"
                    onClick={() => onDownload(event.zalacznik_url!)}>
                    Otwórz dodany dokument
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
