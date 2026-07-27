import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  getWindCase,
  updateWindCase,
  updateWindLoan,
  updateWindBorrower,
  changeWindStage,
  performWindContact,
  addWindPismoNadane,
  addWindDelivery,
  addWindWplata,
  addWindNotatka,
  generateWindDocument,
  recordWindGeneratedDoc,
  setWindTermination,
  type WindCase,
  type WindLoan,
  type WindBorrower,
  type WindEvent,
  type WindDocument,
} from "@/lib/windykacja.functions";
import {
  listDocxTemplates,
  getDocxTemplatePreview,
  generateDocxFromTemplate,
  getGeneratedDocSignedUrl,
  type DocTemplate,
} from "@/lib/document-generator.functions";
import { extractOrderedFields } from "@/lib/document-fields";
import { buildWindTemplateValues } from "@/lib/windykacja-docfill";
import { SmartScanField } from "@/components/inwestor/wind-smart-scan";
import type { WindOcrResult } from "@/lib/windykacja-ocr.functions";
import {
  PATH_LABELS,
  PATH_BADGE,
  PATH_STAGES,
  stageLabel,
  delayColorClass,
  suggestNextAction,
  effectiveDeliveryDate,
  documentsForPath,
  DOCUMENT_LABELS,
  stepGuide,
  stageProgress,
  type WindPath,
  type WindEventLite,
  type WindDocumentType,
  type StepActionKind,
  type StepGuide,
} from "@/lib/windykacja-procedure";
import {
  calculateDebt,
  splitInvestorPrincipal,
  maxDelayInterestRate,
  DEFAULT_NBP_REFERENCE_RATE,
  type DebtCalcResult,
} from "@/lib/debt-collection-math";
import { formatPLN, formatDate, formatDateTime } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  MessageSquare,
  Mail,
  Phone,
  FileText,
  FileSignature,
  Wallet,
  StickyNote,
  GitBranch,
  Loader2,
  Send,
  Lightbulb,
  Gavel,
  Building2,
  ShieldCheck,
  Paperclip,
  Eye,
  Calculator,
  FileDown,
  Download,
  ChevronRight,
  ChevronLeft,
  Scale,
  CheckCircle2,
  Settings2,
  ScanLine,
} from "lucide-react";

export const Route = createFileRoute("/inwestor/windykacja/$caseId")({
  component: WindykacjaCaseCard,
});

const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);

type ActionKind =
  | "sms"
  | "email"
  | "telefon"
  | "pismo"
  | "doreczenie"
  | "dokument"
  | "wplata"
  | "notatka"
  | "etap"
  | "skan"
  | null;

const EVENT_ICON: Record<string, typeof FileText> = {
  sms: MessageSquare,
  email: Mail,
  telefon: Phone,
  pismo_nadane: FileText,
  pismo_doreczone: ShieldCheck,
  pismo_awizo: FileText,
  pismo_zwrot: FileText,
  wplata: Wallet,
  dokument_wygenerowany: FileSignature,
  zmiana_etapu: GitBranch,
  notatka: StickyNote,
  czynnosc_sadowa: Gavel,
};

const DELIVERY_LABEL: Record<string, string> = {
  oczekuje: "oczekuje na doręczenie",
  doreczone: "doręczone",
  awizowane: "awizowane",
  termin_uplynal: "termin upłynął (fikcja doręczenia)",
  zwrot: "zwrot — fikcja doręczenia",
};

function WindykacjaCaseCard() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchCase = useServerFn(getWindCase);
  const saveCase = useServerFn(updateWindCase);
  const saveLoan = useServerFn(updateWindLoan);
  const saveBorrower = useServerFn(updateWindBorrower);
  const doStage = useServerFn(changeWindStage);
  const doContact = useServerFn(performWindContact);
  const doPismo = useServerFn(addWindPismoNadane);
  const doDelivery = useServerFn(addWindDelivery);
  const doWplata = useServerFn(addWindWplata);
  const doNotatka = useServerFn(addWindNotatka);
  const genDoc = useServerFn(generateWindDocument);
  const setTermination = useServerFn(setWindTermination);
  const listTemplates = useServerFn(listDocxTemplates);
  const previewTemplate = useServerFn(getDocxTemplatePreview);
  const genDocx = useServerFn(generateDocxFromTemplate);
  const recordDoc = useServerFn(recordWindGeneratedDoc);
  const signUrl = useServerFn(getGeneratedDocSignedUrl);

  const downloadDoc = async (path: string) => {
    try {
      const { url } = await signUrl({ data: { path } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać pliku");
    }
  };

  const [kase, setKase] = useState<WindCase | null>(null);
  const [loan, setLoan] = useState<WindLoan | null>(null);
  const [borrower, setBorrower] = useState<WindBorrower | null>(null);
  const [events, setEvents] = useState<WindEvent[]>([]);
  const [documents, setDocuments] = useState<WindDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [action, setAction] = useState<ActionKind>(null);
  const [docPreset, setDocPreset] = useState<WindDocumentType | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busyNav, setBusyNav] = useState(false);
  const [docPreview, setDocPreview] = useState<WindDocument | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetchCase({ data: { caseId } });
      setKase(res.case);
      setLoan(res.loan);
      setBorrower(res.borrower);
      setEvents(res.events);
      setDocuments(res.documents);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać sprawy");
    } finally {
      setLoading(false);
    }
  }, [caseId, fetchCase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const eventsLite: WindEventLite[] = useMemo(
    () =>
      events.map((e) => ({
        typ: e.typ,
        data_zdarzenia: e.data_zdarzenia,
        data_doreczenia: e.data_doreczenia,
        status_doreczenia: e.status_doreczenia,
      })),
    [events],
  );

  const suggestion = useMemo(() => {
    if (!kase) return null;
    return suggestNextAction(
      {
        sciezka: kase.sciezka,
        etap: kase.etap,
        opoznienie_dni: kase.opoznienie_dni,
        kwota_zalegla: kase.kwota_zalegla,
      },
      eventsLite,
      nowISO(),
    );
  }, [kase, eventsLite]);

  const terminated = useMemo(
    () => Boolean(loan?.data_wypowiedzenia) || loan?.status === "wypowiedziana",
    [loan],
  );

  // Wyliczenie zadłużenia z odsetkami maksymalnymi (silnik kalkulacyjny).
  // Logika finansowa zależy od wypowiedzenia: gdy umowa wypowiedziana —
  // odsetki za opóźnienie od całości; gdy nie — tylko od zaległych rat.
  const debt = useMemo(() => {
    if (!loan || !kase) return null;
    const payments = events
      .filter((e) => e.typ === "wplata")
      .map((e) => ({
        paid_on: e.data_zdarzenia.slice(0, 10),
        amount: Number((e.metadata as { kwota?: number })?.kwota ?? 0),
      }));
    const { bearing, investorCommission } = splitInvestorPrincipal(loan);
    return calculateDebt({
      // Część oprocentowana = kwota na rękę + prowizja Finance You.
      principalAmount: bearing,
      // Prowizja inwestora — spłacana z kapitałem, bez odsetek.
      interestExemptPrincipal: investorCommission,
      payoutDate: loan.data_umowy,
      dueDate: loan.termin_splaty,
      contractualAnnualRate: Number(loan.oprocentowanie_roczne || 0),
      penaltyAnnualRate: Number(loan.stopa_odsetek_max || 0),
      maxStatutoryRate: Number(loan.stopa_odsetek_max || 0),
      terminated,
      terminationDate: loan.data_wypowiedzenia,
      overdueInstallmentsAmount: Number(kase.kwota_zalegla || 0),
      surcharges: Number(loan.kwota_doplat || 0),
      payments,
      actionFees: [],
      asOf: todayISO(),
    });
  }, [loan, kase, events, terminated]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return events;
    if (eventFilter === "pisma") return events.filter((e) => e.typ.startsWith("pismo"));
    if (eventFilter === "kontakt")
      return events.filter((e) => ["sms", "email", "telefon"].includes(e.typ));
    if (eventFilter === "sadowe") return events.filter((e) => e.typ === "czynnosc_sadowa");
    return events;
  }, [events, eventFilter]);

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;
  if (!kase || !loan || !borrower)
    return <div className="text-muted-foreground">Nie znaleziono sprawy.</div>;

  const refreshAfterEvent = (ev?: WindEvent) => {
    if (ev) setEvents((p) => [ev, ...p]);
    void reload();
  };

  // Otwiera jedno, główne działanie kroku (z ewentualnym typem dokumentu).
  const openStepAction = (kind: StepActionKind, docType?: WindDocumentType | null) => {
    if (kind === "info") return;
    setDocPreset(docType ?? null);
    setAction(kind as ActionKind);
  };

  // „Dalej / Wstecz" — przejście między etapami ścieżki.
  const goToStage = async (etap: string) => {
    if (!kase) return;
    setBusyNav(true);
    try {
      const ev = await doStage({ data: { caseId, sciezka: kase.sciezka, etap, note: null } });
      toast.success("Przejście do kolejnego kroku");
      refreshAfterEvent(ev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zmienić etapu");
    } finally {
      setBusyNav(false);
    }
  };

  // Jednorazowy wybór dla sprawy: czy umowa jest wypowiedziana.
  const onSetTermination = async (isTerminated: boolean, date?: string) => {
    if (!loan) return;
    setBusyNav(true);
    try {
      const ev = await setTermination({
        data: {
          loanId: loan.id,
          caseId,
          terminated: isTerminated,
          data_wypowiedzenia: date ?? null,
        },
      });
      toast.success(isTerminated ? "Oznaczono jako wypowiedzianą" : "Cofnięto wypowiedzenie");
      refreshAfterEvent(ev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
    } finally {
      setBusyNav(false);
    }
  };

  const stages = PATH_STAGES[kase.sciezka];
  const { index: stageIdx, total: stageTotal } = stageProgress(kase.sciezka, kase.etap);
  const guide = stepGuide(kase.sciezka, kase.etap);
  const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null;
  const nextStage = stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null;
  const settled = kase.kwota_zalegla <= 0;

  return (
    <div className="space-y-5">
      <Link
        to="/inwestor/windykacja"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Panel windykacji
      </Link>
      <FancyPageHeader
        eyebrow="Sprawa windykacyjna"
        title={<>Sprawa {loan?.numer_umowy ?? caseId.slice(0, 8)}</>}
        subtitle={borrower?.imie_nazwisko ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="bg-white/15 text-white border-white/20 hover:bg-white/25"
            >
              <Link to="/inwestor/windykacja/$caseId/raport" params={{ caseId }} target="_blank">
                <FileDown className="h-4 w-4 mr-1" /> Raport (PDF)
              </Link>
            </Button>
            <Badge className={PATH_BADGE[kase.sciezka]}>{PATH_LABELS[kase.sciezka]}</Badge>
          </div>
        }
      />

      {/* ASYSTENT KROK PO KROKU — prosty przewodnik dla inwestora. */}
      <WizardCard
        guide={guide}
        stageIdx={stageIdx}
        stageTotal={stageTotal}
        suggestionText={suggestion?.text}
        urgent={suggestion?.urgent}
        settled={settled}
        terminated={terminated}
        terminationDate={loan.data_wypowiedzenia}
        debt={debt}
        prevLabel={prevStage?.label ?? null}
        nextLabel={nextStage?.label ?? null}
        busy={busyNav}
        onAction={openStepAction}
        onPrev={prevStage ? () => goToStage(prevStage.key) : undefined}
        onNext={nextStage ? () => goToStage(nextStage.key) : undefined}
        onSetTermination={onSetTermination}
        onWplata={() => setAction("wplata")}
        onScan={() => setAction("skan")}
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* LEWA — oś czasu */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Oś czasu zdarzeń</CardTitle>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="pisma">Tylko pisma</SelectItem>
                  <SelectItem value="kontakt">Tylko kontakt</SelectItem>
                  <SelectItem value="sadowe">Tylko sądowe</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {filteredEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak zdarzeń.</p>
              ) : (
                <ol className="relative border-l ml-3 space-y-4">
                  {filteredEvents.map((e) => (
                    <TimelineItem key={e.id} e={e} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pliki klienta ({documents.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSignature className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{d.tytul}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(d.created_at)}
                      </span>
                    </div>
                    {d.plik_url ? (
                      <Button variant="ghost" size="sm" onClick={() => downloadDoc(d.plik_url!)}>
                        <Download className="h-4 w-4 mr-1" /> Pobierz DOCX
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setDocPreview(d)}>
                        <Eye className="h-4 w-4 mr-1" /> Podgląd
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* PRAWA — panel sterowania */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div>
                <div className="text-lg font-semibold">{borrower.imie_nazwisko}</div>
                <div className="text-xs text-muted-foreground">
                  Umowa {loan.numer_umowy ?? "—"} ·{" "}
                  {borrower.pesel
                    ? `PESEL ${borrower.pesel}`
                    : borrower.nip
                      ? `NIP ${borrower.nip}`
                      : ""}
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Kwota zaległa" value={formatPLN(kase.kwota_zalegla)} strong />
                <Info label="Saldo pożyczki" value={formatPLN(loan.saldo_pozostale)} />
                <Info
                  label="Opóźnienie"
                  value={`${kase.opoznienie_dni} dni`}
                  valueClass={delayColorClass(kase.opoznienie_dni)}
                />
                <Info label="Termin spłaty" value={formatDate(loan.termin_splaty)} />
                <Info label="KW" value={loan.numer_kw ?? "—"} />
                <Info label="Akt 777" value={loan.akt_notarialny_777 ?? "—"} />
              </div>
              <Separator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-muted-foreground"
                onClick={() => setAdvanced((a) => !a)}
              >
                <Settings2 className="h-4 w-4 mr-1" />
                {advanced ? "Ukryj tryb zaawansowany" : "Tryb zaawansowany (wszystkie działania)"}
              </Button>
            </CardContent>
          </Card>

          {/* Stepper etapu — tryb zaawansowany */}
          {advanced && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  Etap: {stageLabel(kase.sciezka, kase.etap)}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setAction("etap")}>
                  <GitBranch className="h-4 w-4 mr-1" /> Zmień
                </Button>
              </CardHeader>
              <CardContent>
                <ol className="space-y-1.5">
                  {PATH_STAGES[kase.sciezka].map((s, i) => {
                    const idx = PATH_STAGES[kase.sciezka].findIndex((x) => x.key === kase.etap);
                    const done = i < idx;
                    const current = i === idx;
                    return (
                      <li key={s.key} className="flex items-center gap-2 text-sm">
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                            current
                              ? "bg-primary text-primary-foreground"
                              : done
                                ? "bg-green-600 text-white"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span
                          className={
                            current
                              ? "font-medium"
                              : done
                                ? "text-muted-foreground line-through"
                                : "text-muted-foreground"
                          }
                        >
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Zadłużenie z odsetkami maksymalnymi */}
          {debt && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" /> Wyliczenie zadłużenia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <RowL
                  label="Kapitał oprocentowany (na rękę + prow. Finance You)"
                  value={debt.principalOutstanding}
                />
                {debt.investorCommissionOutstanding > 0 && (
                  <RowL
                    label="Prowizja inwestora (bez odsetek)"
                    value={debt.investorCommissionOutstanding}
                  />
                )}
                {debt.contractualInterest > 0 && (
                  <RowL label="Odsetki kapitałowe (umowne)" value={debt.contractualInterest} />
                )}
                {debt.surchargesOutstanding > 0 && (
                  <RowL label="Dopłaty / koszty umowne" value={debt.surchargesOutstanding} />
                )}
                <RowL label="Odsetki za opóźnienie (maks.)" value={debt.delayInterest} />
                <Separator className="my-1" />
                <div className="flex items-center justify-between font-semibold">
                  <span>Razem na dziś</span>
                  <span className="tabular-nums">{formatPLN(debt.totalDue)}</span>
                </div>
                <div className="rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground mt-1 space-y-0.5">
                  <div>
                    {debt.delayRegime === "calosc_po_wypowiedzeniu" ? (
                      <>
                        <span className="font-medium text-foreground">Umowa wypowiedziana —</span>{" "}
                        odsetki za opóźnienie od całości oprocentowanej:{" "}
                        {formatPLN(debt.delayInterestBase)} (kapitał na rękę + prowizja Finance You
                        + odsetki + dopłaty). Prowizja inwestora jest należna, ale bez odsetek.
                      </>
                    ) : debt.delayRegime === "zalegle_raty" ? (
                      <>
                        <span className="font-medium text-foreground">
                          Umowa niewypowiedziana —
                        </span>{" "}
                        odsetki za opóźnienie tylko od zaległych rat:{" "}
                        {formatPLN(debt.delayInterestBase)}.
                      </>
                    ) : (
                      <>Brak wymagalnej zaległości — odsetki za opóźnienie nie są naliczane.</>
                    )}
                  </div>
                  <div>
                    Stopa odsetek maks.: {debt.effectiveDelayRate}% (limit art. 481 § 2¹ k.c.).
                    Opóźnienie: {debt.daysOverdue} dni.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Akcje — tryb zaawansowany (pełna paleta działań) */}
          {advanced && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Wszystkie działania</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <ActBtn
                  icon={MessageSquare}
                  label="Wyślij SMS"
                  onClick={() => setAction("sms")}
                  hint={suggestion?.hint === "sms"}
                />
                <ActBtn
                  icon={Mail}
                  label="Wyślij e-mail"
                  onClick={() => setAction("email")}
                  hint={suggestion?.hint === "email"}
                />
                <ActBtn
                  icon={Phone}
                  label="Zadzwoń"
                  onClick={() => setAction("telefon")}
                  hint={suggestion?.hint === "telefon"}
                />
                <ActBtn
                  icon={FileText}
                  label="Dodaj pismo"
                  onClick={() => setAction("pismo")}
                  hint={suggestion?.hint === "pismo"}
                />
                <ActBtn
                  icon={ShieldCheck}
                  label="Doręczenie"
                  onClick={() => setAction("doreczenie")}
                  hint={suggestion?.hint === "doreczenie"}
                />
                <ActBtn
                  icon={FileSignature}
                  label="Generuj dokument"
                  onClick={() => setAction("dokument")}
                  hint={suggestion?.hint === "dokument"}
                />
                <ActBtn icon={Wallet} label="Dodaj wpłatę" onClick={() => setAction("wplata")} />
                <ActBtn
                  icon={StickyNote}
                  label="Dodaj notatkę"
                  onClick={() => setAction("notatka")}
                />
                <ActBtn
                  icon={ScanLine}
                  label="Zrób zdjęcie dokumentu"
                  onClick={() => setAction("skan")}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* MODALE AKCJI */}
      {action && (
        <ActionDialog
          kind={action}
          initialDocType={docPreset}
          onClose={() => {
            setAction(null);
            setDocPreset(null);
          }}
          caseId={caseId}
          kase={kase}
          loan={loan}
          borrower={borrower}
          events={events}
          userId={user?.id}
          fns={{
            doContact,
            doPismo,
            doDelivery,
            doWplata,
            doNotatka,
            genDoc,
            doStage,
            listTemplates,
            previewTemplate,
            genDocx,
            recordDoc,
          }}
          onDone={(ev) => {
            setAction(null);
            setDocPreset(null);
            refreshAfterEvent(ev);
          }}
        />
      )}

      {/* Podgląd dokumentu */}
      <Dialog open={docPreview != null} onOpenChange={(o) => !o && setDocPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{docPreview?.tytul}</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
            {docPreview?.tresc}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Pozycja osi czasu ────────────────────────────────────────────────
function TimelineItem({ e }: { e: WindEvent }) {
  const Icon = EVENT_ICON[e.typ] ?? FileText;
  const meta = e.metadata as { kwota?: number; numer_nadania?: string };
  const delivery = e.status_doreczenia;
  const deadline =
    e.data_doreczenia &&
    (delivery === "doreczone" || delivery === "termin_uplynal" || delivery === "zwrot")
      ? new Date(new Date(e.data_doreczenia).getTime() + 7 * 86_400_000)
      : null;
  const overdue = deadline ? Date.now() > deadline.getTime() : false;
  return (
    <li className="ml-5">
      <span className="absolute -left-[9px] grid h-4 w-4 place-items-center rounded-full bg-background ring-2 ring-border">
        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
      </span>
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-medium text-sm">{e.tytul}</span>
          <span className="text-xs text-muted-foreground">{formatDateTime(e.data_zdarzenia)}</span>
        </div>
        {e.typ === "wplata" && meta?.kwota != null && (
          <div className="text-sm font-semibold text-green-700 dark:text-green-400 mt-0.5">
            {formatPLN(meta.kwota)}
          </div>
        )}
        {e.tresc && (
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">
            {e.tresc}
          </p>
        )}
        {meta?.numer_nadania && (
          <div className="text-[11px] text-muted-foreground mt-1">
            Nr nadania: {meta.numer_nadania}
          </div>
        )}
        {delivery && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
            <Badge variant="secondary">{DELIVERY_LABEL[delivery] ?? delivery}</Badge>
            {e.data_doreczenia && delivery !== "oczekuje" && (
              <span className="text-muted-foreground">data: {formatDate(e.data_doreczenia)}</span>
            )}
            {deadline && (
              <span className={overdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
                {overdue
                  ? "termin 7 dni upłynął — można składać wniosek o klauzulę"
                  : `termin upływa ${formatDate(deadline.toISOString())}`}
              </span>
            )}
          </div>
        )}
        {e.zalacznik_url ? (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-primary">
            <Paperclip className="h-3 w-3" /> załącznik
          </div>
        ) : e.typ.startsWith("pismo") ? (
          <div className="mt-1.5 text-[11px] text-amber-600">
            niekompletne — brak skanu (dowodu)
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Info({
  label,
  value,
  strong,
  valueClass,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`${strong ? "text-base font-bold" : "text-sm"} tabular-nums ${valueClass ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function RowL({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatPLN(value)}</span>
    </div>
  );
}

function ActBtn({
  icon: Icon,
  label,
  onClick,
  hint,
}: {
  icon: typeof Mail;
  label: string;
  onClick: () => void;
  hint?: boolean;
}) {
  return (
    <Button
      variant={hint ? "default" : "outline"}
      size="sm"
      className="justify-start"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 mr-1.5 shrink-0" /> <span className="text-xs">{label}</span>
    </Button>
  );
}

// ════════════════════════════════════════════════════════════════════
// ASYSTENT KROK PO KROKU (hero) — prosty przewodnik „następny / następny".
// ════════════════════════════════════════════════════════════════════
const STEP_ACTION_ICON: Record<StepActionKind, typeof Mail> = {
  sms: MessageSquare,
  telefon: Phone,
  email: Mail,
  pismo: FileText,
  doreczenie: ShieldCheck,
  dokument: FileSignature,
  wplata: Wallet,
  notatka: StickyNote,
  etap: GitBranch,
  info: Lightbulb,
};

function WizardCard({
  guide,
  stageIdx,
  stageTotal,
  suggestionText,
  urgent,
  settled,
  terminated,
  terminationDate,
  debt,
  prevLabel,
  nextLabel,
  busy,
  onAction,
  onPrev,
  onNext,
  onSetTermination,
  onWplata,
  onScan,
}: {
  guide: StepGuide;
  stageIdx: number;
  stageTotal: number;
  suggestionText?: string;
  urgent?: boolean;
  settled: boolean;
  terminated: boolean;
  terminationDate: string | null;
  debt: DebtCalcResult | null;
  prevLabel: string | null;
  nextLabel: string | null;
  busy: boolean;
  onAction: (kind: StepActionKind, docType?: WindDocumentType | null) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSetTermination: (terminated: boolean, date?: string) => void;
  onWplata: () => void;
  onScan: () => void;
}) {
  const [askDate, setAskDate] = useState(false);
  const [date, setDate] = useState(todayISO());
  const Icon = STEP_ACTION_ICON[guide.akcja] ?? Lightbulb;
  const pct = stageTotal > 0 ? Math.round(((stageIdx + 1) / stageTotal) * 100) : 0;

  return (
    <Card className="border-primary/40">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Asystent krok po kroku
          </CardTitle>
          <Badge variant="secondary">
            Krok {Math.min(stageIdx + 1, stageTotal)} z {stageTotal}
          </Badge>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* JEDNORAZOWY WYBÓR DLA SPRAWY: czy umowa jest wypowiedziana. */}
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" /> Czy umowa jest wypowiedziana?
          </div>
          <p className="text-xs text-muted-foreground">
            To jeden raz ustalana decyzja dla tej sprawy. Decyduje, od jakiej kwoty liczymy odsetki
            za opóźnienie: po wypowiedzeniu — od całości długu; przed — tylko od zaległych rat.
          </p>
          {askDate ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Data wypowiedzenia</Label>
                <Input
                  type="date"
                  className="h-9 w-[160px]"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  onSetTermination(true, date);
                  setAskDate(false);
                }}
              >
                Potwierdź wypowiedzenie
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAskDate(false)}>
                Anuluj
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={!terminated ? "default" : "outline"}
                disabled={busy}
                onClick={() => terminated && onSetTermination(false)}
              >
                Nie — umowa obowiązuje
              </Button>
              <Button
                size="sm"
                variant={terminated ? "default" : "outline"}
                disabled={busy}
                onClick={() => (terminated ? undefined : setAskDate(true))}
              >
                Tak — wypowiedziana
                {terminated && terminationDate ? ` (${formatDate(terminationDate)})` : ""}
              </Button>
            </div>
          )}
        </div>

        {settled ? (
          <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-900/20">
            <div className="flex items-center gap-2 font-medium text-green-800 dark:text-green-200">
              <CheckCircle2 className="h-5 w-5" /> Zaległość uregulowana
            </div>
            <p className="mt-1 text-green-700 dark:text-green-300">
              Klient spłacił zaległość. Możesz zamknąć sprawę z wynikiem „spłacona" w trybie
              zaawansowanym.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div className="text-base font-semibold">{guide.tytul}</div>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{guide.opis}</p>
            </div>

            {suggestionText && (
              <div
                className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${
                  urgent
                    ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                    : "bg-muted/40"
                }`}
              >
                <Lightbulb
                  className={`h-4 w-4 mt-0.5 shrink-0 ${urgent ? "text-amber-600" : "text-primary"}`}
                />
                <span>{suggestionText}</span>
              </div>
            )}

            {/* PODSTAWA PRAWNA — co i na jakiej podstawie robimy. */}
            {guide.podstawa_prawna.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" /> Podstawa prawna
                </div>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {guide.podstawa_prawna.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-primary">§</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* JEDNO główne działanie + nawigacja Wstecz / Dalej. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                size="lg"
                className="sm:flex-1"
                disabled={busy}
                onClick={() => onAction(guide.akcja, guide.dokumentTyp)}
              >
                <Icon className="h-4 w-4 mr-2" /> {guide.akcjaLabel}
              </Button>
              <div className="flex gap-2">
                {onPrev && (
                  <Button variant="ghost" disabled={busy} onClick={onPrev}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> {prevLabel ?? "Wstecz"}
                  </Button>
                )}
                {onNext && (
                  <Button variant="outline" disabled={busy} onClick={onNext}>
                    {nextLabel ?? "Dalej"} <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onScan}>
                <ScanLine className="h-4 w-4 mr-1" /> Zrób zdjęcie dokumentu
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={onWplata}
              >
                <Wallet className="h-4 w-4 mr-1" /> Klient zapłacił? Odnotuj wpłatę
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════
// MODAL AKCJI
// ════════════════════════════════════════════════════════════════════
type Fns = {
  doContact: ReturnType<typeof useServerFn<typeof performWindContact>>;
  doPismo: ReturnType<typeof useServerFn<typeof addWindPismoNadane>>;
  doDelivery: ReturnType<typeof useServerFn<typeof addWindDelivery>>;
  doWplata: ReturnType<typeof useServerFn<typeof addWindWplata>>;
  doNotatka: ReturnType<typeof useServerFn<typeof addWindNotatka>>;
  genDoc: ReturnType<typeof useServerFn<typeof generateWindDocument>>;
  doStage: ReturnType<typeof useServerFn<typeof changeWindStage>>;
  listTemplates: ReturnType<typeof useServerFn<typeof listDocxTemplates>>;
  previewTemplate: ReturnType<typeof useServerFn<typeof getDocxTemplatePreview>>;
  genDocx: ReturnType<typeof useServerFn<typeof generateDocxFromTemplate>>;
  recordDoc: ReturnType<typeof useServerFn<typeof recordWindGeneratedDoc>>;
};

function ActionDialog({
  kind,
  initialDocType,
  onClose,
  caseId,
  kase,
  loan,
  borrower,
  events,
  userId,
  fns,
  onDone,
}: {
  kind: Exclude<ActionKind, null>;
  initialDocType?: WindDocumentType | null;
  onClose: () => void;
  caseId: string;
  kase: WindCase;
  loan: WindLoan;
  borrower: WindBorrower;
  events: WindEvent[];
  userId?: string;
  fns: Fns;
  onDone: (ev?: WindEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() =>
    initialValues(kind, kase, loan, borrower, initialDocType),
  );
  const [file, setFile] = useState<File | null>(null);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  // Wzory DOCX z Kreatora dokumentów (kategorie windykacyjne na górze).
  useEffect(() => {
    if (kind !== "dokument") return;
    void (async () => {
      try {
        const all = await fns.listTemplates();
        const wind = all.filter((t) => (t.category ?? "").startsWith("windykacja"));
        const rest = all.filter((t) => !(t.category ?? "").startsWith("windykacja"));
        setTemplates([...wind, ...rest]);
      } catch {
        /* lista wzorów opcjonalna */
      }
    })();
  }, [kind, fns]);

  const uploadScan = async (): Promise<string | null> => {
    if (!file || !userId) return null;
    const safe = file.name.replace(/[^\w.-]+/g, "_");
    const path = `${userId}/windykacja/${caseId}/${Date.now()}_${safe}`;
    const { error } = await supabase.storage
      .from("documents")
      .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (error) {
      toast.error(`Upload: ${error.message}`);
      return null;
    }
    return path;
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "sms" || kind === "email" || kind === "telefon") {
        const ev = await fns.doContact({
          data: { caseId, typ: kind, target: v.target, subject: v.subject, tresc: v.tresc },
        });
        if ((ev.metadata as { ok?: boolean })?.ok === false)
          toast.error("Wysyłka nie powiodła się — zdarzenie zapisane.");
        else toast.success("Zapisano zdarzenie");
        onDone(ev);
      } else if (kind === "skan") {
        // Zdjęcie dokumentu → automatyczne rozpoznanie i zapis właściwego zdarzenia.
        if (!file) {
          toast.error("Najpierw zrób zdjęcie lub wgraj dokument.");
          setBusy(false);
          return;
        }
        const scan = await uploadScan();
        const detected = v.detectedType as WindOcrResult["documentType"] | undefined;
        if (detected === "wplata" && Number(v.kwota) > 0) {
          const res = await fns.doWplata({
            data: {
              caseId,
              loanId: loan.id,
              kwota: Number(v.kwota) || 0,
              data: v.data || todayISO(),
              sposob: "przelew (odczyt ze zdjęcia)",
            },
          });
          toast.success("Odnotowano wpłatę z potwierdzenia");
          onDone(res.event);
        } else if (
          detected === "pismo_doreczone" ||
          detected === "pismo_awizo" ||
          detected === "pismo_zwrot"
        ) {
          const statusMap: Record<
            string,
            {
              typ: "pismo_doreczone" | "pismo_awizo" | "pismo_zwrot";
              status: "doreczone" | "awizowane" | "termin_uplynal" | "zwrot";
            }
          > = {
            doreczone: { typ: "pismo_doreczone", status: "doreczone" },
            awizowane: { typ: "pismo_awizo", status: "awizowane" },
            termin_uplynal: { typ: "pismo_zwrot", status: "termin_uplynal" },
            zwrot: { typ: "pismo_zwrot", status: "zwrot" },
          };
          const m = statusMap[v.status_doreczenia] ?? {
            typ: detected,
            status: detected === "pismo_awizo" ? "awizowane" : "doreczone",
          };
          const ev = await fns.doDelivery({
            data: {
              caseId,
              typ: m.typ,
              status_doreczenia: m.status,
              data: v.data || todayISO(),
              zalacznik_url: scan,
              note: v.tytul || null,
            },
          });
          toast.success("Zapisano doręczenie ze zdjęcia");
          onDone(ev);
        } else {
          // pismo_nadane / wezwanie / umowa / inne → pismo w aktach.
          const ev = await fns.doPismo({
            data: {
              caseId,
              tytul: v.tytul || "Dokument (zdjęcie)",
              data_nadania: v.data || todayISO(),
              numer_nadania: v.numer_nadania || null,
              zalacznik_url: scan,
              tresc: v.podsumowanie || null,
            },
          });
          toast.success("Dodano dokument do akt");
          onDone(ev);
        }
      } else if (kind === "pismo") {
        const scan = await uploadScan();
        const ev = await fns.doPismo({
          data: {
            caseId,
            tytul: v.tytul,
            data_nadania: v.data_nadania,
            numer_nadania: v.numer_nadania,
            zalacznik_url: scan,
            tresc: v.tresc,
          },
        });
        toast.success("Dodano pismo nadane");
        onDone(ev);
      } else if (kind === "doreczenie") {
        const scan = await uploadScan();
        const map: Record<
          string,
          {
            typ: "pismo_doreczone" | "pismo_awizo" | "pismo_zwrot";
            status: "doreczone" | "awizowane" | "termin_uplynal" | "zwrot";
          }
        > = {
          doreczone: { typ: "pismo_doreczone", status: "doreczone" },
          awizo: { typ: "pismo_awizo", status: "awizowane" },
          termin: { typ: "pismo_zwrot", status: "termin_uplynal" },
          zwrot: { typ: "pismo_zwrot", status: "zwrot" },
        };
        const m = map[v.rodzaj] ?? map.doreczone;
        const ev = await fns.doDelivery({
          data: {
            caseId,
            typ: m.typ,
            status_doreczenia: m.status,
            data: v.data,
            zalacznik_url: scan,
            note: v.note,
          },
        });
        toast.success("Zaktualizowano doręczenie");
        onDone(ev);
      } else if (kind === "wplata") {
        const res = await fns.doWplata({
          data: { caseId, loanId: loan.id, kwota: Number(v.kwota), data: v.data, sposob: v.sposob },
        });
        toast.success("Odnotowano wpłatę");
        onDone(res.event);
      } else if (kind === "notatka") {
        const ev = await fns.doNotatka({ data: { caseId, tresc: v.tresc } });
        toast.success("Dodano notatkę");
        onDone(ev);
      } else if (kind === "dokument") {
        if (v.source === "docx") {
          if (!v.templateId) {
            toast.error("Wybierz wzór DOCX");
            setBusy(false);
            return;
          }
          const tpl = templates.find((t) => t.id === v.templateId);
          // 1) podgląd → pola → auto-uzupełnienie danymi sprawy
          const { text } = await fns.previewTemplate({ data: { templateId: v.templateId } });
          const fields = extractOrderedFields(text);
          const values = buildWindTemplateValues(fields, {
            dluznik: borrower.imie_nazwisko,
            adres: borrower.adres_do_doreczen || borrower.adres_zamieszkania || "",
            pesel: borrower.pesel,
            nip: borrower.nip,
            kwota_zalegla: Number(kase.kwota_zalegla || 0),
            saldo: Number(loan.saldo_pozostale || 0),
            prowizja: loan.prowizja,
            kwota_pozyczki: loan.kwota_pozyczki,
            numer_kw: loan.numer_kw,
            akt_777: loan.akt_notarialny_777,
            numer_umowy: loan.numer_umowy,
            data_umowy: loan.data_umowy,
            rachunek: loan.rachunek_splaty,
            dataISO: todayISO(),
          });
          // 2) wygeneruj DOCX z wzoru
          const gen = await fns.genDocx({ data: { templateId: v.templateId, values } });
          // 3) zapisz w sprawie (zdarzenie + dokument z linkiem)
          const res = await fns.recordDoc({
            data: {
              caseId,
              typ: v.typ as WindDocumentType,
              tytul: tpl?.name ?? "Dokument",
              plik_url: gen.docxPath,
            },
          });
          toast.success("Wygenerowano DOCX z wzoru Kreatora");
          onDone(res.event);
        } else {
          const res = await fns.genDoc({ data: { caseId, typ: v.typ as WindDocumentType } });
          toast.success("Wygenerowano dokument");
          onDone(res.event);
        }
      } else if (kind === "etap") {
        const ev = await fns.doStage({
          data: { caseId, sciezka: v.sciezka as WindPath, etap: v.etap, note: v.note },
        });
        toast.success("Zmieniono etap");
        onDone(ev);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wykonać działania");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITLES[kind]}</DialogTitle>
          {(kind === "sms" || kind === "email") && (
            <DialogDescription>
              Wiadomość zostanie wysłana i zapisana w rejestrze dowodowym.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          {(kind === "sms" || kind === "telefon") && (
            <Fld label="Numer telefonu">
              <Input value={v.target ?? ""} onChange={(e) => set("target", e.target.value)} />
            </Fld>
          )}
          {kind === "email" && (
            <>
              <Fld label="Adres e-mail">
                <Input value={v.target ?? ""} onChange={(e) => set("target", e.target.value)} />
              </Fld>
              <Fld label="Temat">
                <Input value={v.subject ?? ""} onChange={(e) => set("subject", e.target.value)} />
              </Fld>
            </>
          )}
          {(kind === "sms" || kind === "email" || kind === "telefon" || kind === "notatka") && (
            <Fld
              label={
                kind === "telefon"
                  ? "Notatka z rozmowy (wymagana)"
                  : kind === "notatka"
                    ? "Treść notatki"
                    : "Treść"
              }
            >
              <Textarea
                rows={kind === "sms" ? 4 : 8}
                value={v.tresc ?? ""}
                onChange={(e) => set("tresc", e.target.value)}
              />
            </Fld>
          )}

          {kind === "skan" && (
            <>
              <SmartScanField
                required
                hint="Sfotografuj dowolne pismo (dowód nadania, zwrotkę, awizo, zwrot, potwierdzenie wpłaty). System sam rozpozna typ i uzupełni dane — Ty tylko zapisujesz."
                onFile={setFile}
                onExtract={(r) => applyOcrToSkan(r, set)}
              />
              {v.detectedType && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Zapiszemy jako
                  </div>
                  <div className="font-medium">{OCR_TYPE_LABEL[v.detectedType] ?? "Dokument"}</div>
                  {v.data && <div className="text-xs text-muted-foreground">Data: {v.data}</div>}
                  {v.numer_nadania && (
                    <div className="text-xs text-muted-foreground">
                      Nr nadania: {v.numer_nadania}
                    </div>
                  )}
                  {v.kwota && v.detectedType === "wplata" && (
                    <div className="text-xs text-muted-foreground">Kwota: {v.kwota} zł</div>
                  )}
                </div>
              )}
            </>
          )}

          {kind === "pismo" && (
            <>
              <SmartScanField
                required
                hint="Zrób zdjęcie dowodu nadania — odczytamy numer nadania i datę."
                onFile={setFile}
                onExtract={(r) => {
                  if (r.tytul) set("tytul", r.tytul);
                  if (r.dataISO) set("data_nadania", r.dataISO);
                  if (r.numer_nadania) set("numer_nadania", r.numer_nadania);
                }}
              />
              <Fld label="Tytuł pisma">
                <Input
                  value={v.tytul ?? ""}
                  onChange={(e) => set("tytul", e.target.value)}
                  placeholder="np. Wezwanie do zapłaty — nadane"
                />
              </Fld>
              <div className="grid grid-cols-2 gap-3">
                <Fld label="Data nadania">
                  <Input
                    type="date"
                    value={v.data_nadania ?? ""}
                    onChange={(e) => set("data_nadania", e.target.value)}
                  />
                </Fld>
                <Fld label="Numer nadania">
                  <Input
                    value={v.numer_nadania ?? ""}
                    onChange={(e) => set("numer_nadania", e.target.value)}
                  />
                </Fld>
              </div>
            </>
          )}

          {kind === "doreczenie" && (
            <>
              <SmartScanField
                hint="Zrób zdjęcie zwrotki / awizo / zwrotu — rozpoznamy rodzaj i datę doręczenia."
                onFile={setFile}
                onExtract={(r) => {
                  const map: Record<string, string> = {
                    doreczone: "doreczone",
                    awizowane: "awizo",
                    termin_uplynal: "termin",
                    zwrot: "zwrot",
                  };
                  if (r.status_doreczenia && map[r.status_doreczenia])
                    set("rodzaj", map[r.status_doreczenia]);
                  if (r.dataISO) set("data", r.dataISO);
                }}
              />
              <Fld label="Rodzaj zdarzenia">
                <Select value={v.rodzaj} onValueChange={(val) => set("rodzaj", val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doreczone">Doręczone (zwrotka)</SelectItem>
                    <SelectItem value="awizo">Awizo</SelectItem>
                    <SelectItem value="termin">
                      Termin odbioru upłynął (fikcja doręczenia)
                    </SelectItem>
                    <SelectItem value="zwrot">Zwrot przesyłki (fikcja doręczenia)</SelectItem>
                  </SelectContent>
                </Select>
              </Fld>
              <Fld label="Data">
                <Input
                  type="date"
                  value={v.data ?? ""}
                  onChange={(e) => set("data", e.target.value)}
                />
              </Fld>
            </>
          )}

          {kind === "wplata" && (
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Kwota (zł)">
                <Input
                  type="number"
                  value={v.kwota ?? ""}
                  onChange={(e) => set("kwota", e.target.value)}
                />
              </Fld>
              <Fld label="Data">
                <Input
                  type="date"
                  value={v.data ?? ""}
                  onChange={(e) => set("data", e.target.value)}
                />
              </Fld>
              <Fld label="Sposób" className="col-span-2">
                <Input
                  value={v.sposob ?? ""}
                  onChange={(e) => set("sposob", e.target.value)}
                  placeholder="np. przelew"
                />
              </Fld>
            </div>
          )}

          {kind === "dokument" && (
            <>
              <Fld label="Źródło dokumentu">
                <Select value={v.source} onValueChange={(val) => set("source", val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Gotowy wzór DOCX (Kreator dokumentów)</SelectItem>
                    <SelectItem value="tekst">Szablon tekstowy (szybki podgląd)</SelectItem>
                  </SelectContent>
                </Select>
              </Fld>
              <Fld label="Kategoria (do akt sprawy)">
                <Select value={v.typ} onValueChange={(val) => set("typ", val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentsForPath(kase.sciezka).map((t) => (
                      <SelectItem key={t} value={t}>
                        {DOCUMENT_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Fld>
              {v.source === "docx" && (
                <Fld label="Wzór DOCX">
                  <Select
                    value={v.templateId ?? ""}
                    onValueChange={(val) => set("templateId", val)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={templates.length ? "Wybierz wzór…" : "Ładowanie wzorów…"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.category ? ` · ${t.category}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Wzór zostanie automatycznie uzupełniony danymi sprawy (dłużnik, kwoty, KW,
                    data). Puste pola pozostaną do ręcznego wpełnienia.
                  </p>
                </Fld>
              )}
            </>
          )}

          {kind === "etap" && (
            <>
              <Fld label="Ścieżka">
                <Select value={v.sciezka} onValueChange={(val) => set("sciezka", val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PATH_LABELS) as WindPath[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PATH_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Fld>
              <Fld label="Etap">
                <Select value={v.etap} onValueChange={(val) => set("etap", val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PATH_STAGES[(v.sciezka as WindPath) ?? kase.sciezka].map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Fld>
              <Fld label="Notatka (opcjonalnie)">
                <Textarea
                  rows={3}
                  value={v.note ?? ""}
                  onChange={(e) => set("note", e.target.value)}
                />
              </Fld>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {kind === "sms" || kind === "email" ? "Wyślij" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Etykiety typów rozpoznanych ze zdjęcia (do potwierdzenia w dialogu „skan").
const OCR_TYPE_LABEL: Record<string, string> = {
  pismo_nadane: "Pismo nadane (dowód nadania)",
  pismo_doreczone: "Doręczenie — zwrotka",
  pismo_awizo: "Doręczenie — awizo",
  pismo_zwrot: "Doręczenie — zwrot / nieodebrane",
  wplata: "Wpłata (z potwierdzenia)",
  wezwanie: "Wezwanie do zapłaty",
  umowa: "Umowa pożyczki",
  inne: "Dokument do akt",
};

/** Przenosi dane rozpoznane ze zdjęcia do stanu formularza „skan". */
function applyOcrToSkan(r: WindOcrResult, set: (k: string, v: string) => void) {
  set("detectedType", r.documentType);
  if (r.tytul) set("tytul", r.tytul);
  if (r.dataISO) set("data", r.dataISO);
  if (r.numer_nadania) set("numer_nadania", r.numer_nadania);
  if (r.status_doreczenia) set("status_doreczenia", r.status_doreczenia);
  if (r.kwota != null) set("kwota", String(r.kwota));
  if (r.podsumowanie) set("podsumowanie", r.podsumowanie);
}

const TITLES: Record<Exclude<ActionKind, null>, string> = {
  sms: "Wyślij SMS",
  email: "Wyślij e-mail",
  telefon: "Rozmowa telefoniczna",
  pismo: "Dodaj pismo nadane",
  doreczenie: "Aktualizacja doręczenia",
  dokument: "Generuj dokument",
  wplata: "Dodaj wpłatę",
  notatka: "Dodaj notatkę",
  etap: "Zmień etap / ścieżkę",
  skan: "Zrób zdjęcie dokumentu",
};

function initialValues(
  kind: Exclude<ActionKind, null>,
  kase: WindCase,
  loan: WindLoan,
  borrower: WindBorrower,
  initialDocType?: WindDocumentType | null,
): Record<string, string> {
  const base: Record<string, string> = { data: todayISO(), data_nadania: todayISO() };
  if (kind === "sms" || kind === "telefon") base.target = borrower.telefon ?? "";
  if (kind === "email") {
    base.target = borrower.email ?? "";
    base.subject = "Finance You — wezwanie do zapłaty";
  }
  if (kind === "sms")
    base.tresc = `Przypomnienie: zaległość z umowy ${loan.numer_umowy ?? ""} wynosi ${formatPLN(kase.kwota_zalegla)}. Prosimy o pilną spłatę.`;
  if (kind === "doreczenie") base.rodzaj = "doreczone";
  if (kind === "dokument") {
    const allowed = documentsForPath(kase.sciezka);
    base.typ = initialDocType && allowed.includes(initialDocType) ? initialDocType : allowed[0];
    base.source = "docx";
    base.templateId = "";
  }
  if (kind === "etap") {
    base.sciezka = kase.sciezka;
    base.etap = kase.etap;
  }
  return base;
}

function Fld({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
