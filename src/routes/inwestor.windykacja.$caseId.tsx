import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  getWindCase,
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
  attachWindDocProof,
  type WindCase,
  type WindLoan,
  type WindBorrower,
  type WindEvent,
  type WindDocument,
} from "@/lib/windykacja.functions";
import { placeWindCollectionCall } from "@/lib/windykacja-call.functions";
import {
  WIND_FEE_DEFAULTS,
  WIND_FEE_LABELS,
  normalizeWindFeeTable,
  windFeeForAction,
  type WindFeeKind,
} from "@/lib/windykacja-fees";
import { WindQuickContactDialog, buildWindSmsText } from "@/components/inwestor/wind-quick-actions";
import { HarmonogramEditor, RatyStanTable } from "@/components/inwestor/wind-harmonogram";
import {
  borrowerEditPatch,
  borrowerToEditForm,
  formatDataPL,
  formatStopa,
  formatZl,
  generatorFromHarmonogram,
  harmonogramToForm,
  hasRaty,
  liveCaseLite,
  loanEditPatch,
  loanToEditForm,
  type BorrowerEditForm,
  type GeneratorForm,
  type LoanEditForm,
  type RataForm,
} from "@/components/inwestor/wind-harmonogram-form";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
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
  windDebtSnapshot,
  windLoanIsTerminated,
  defaultDelayRate,
  type WindDebtSnapshot,
} from "@/lib/windykacja-debt";
import { currentMaxDelayRate } from "@/lib/debt-collection-math";
import { parseDataISO } from "@/lib/windykacja-harmonogram";
import { formatRachunekSplaty, warsawToday } from "@/lib/windykacja-recalc";
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
  Pencil,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/inwestor/windykacja/$caseId")({
  component: WindykacjaCaseCard,
});

const nowISO = () => new Date().toISOString();
/** Dzisiejsza data w Polsce — ta sama, na którą serwer przelicza sprawę. */
const todayISO = () => warsawToday();
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type ActionKind =
  | "sms"
  | "email"
  | "telefon"
  | "botcall"
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
  const { user } = useAuth();

  const fetchCase = useServerFn(getWindCase);
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
  const doBotCall = useServerFn(placeWindCollectionCall);
  const attachProof = useServerFn(attachWindDocProof);

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
  const [editOpen, setEditOpen] = useState(false);

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

  // Stan zadłużenia na dziś — ten sam silnik co panel, raport, SMS i telefon
  // AI: zaległość z harmonogramu rat (albo model z jednym terminem spłaty),
  // odsetki za opóźnienie i koszty. Po wypowiedzeniu wymagalna jest całość.
  const snap = useMemo<WindDebtSnapshot | null>(
    () =>
      loan && kase
        ? windDebtSnapshot({ loan, kwotaZalegla: kase.kwota_zalegla, events, asOf: todayISO() })
        : null,
    [loan, kase, events],
  );

  // Podpowiedź procedury z opóźnieniem na dziś (nie z dnia założenia sprawy).
  const suggestion = useMemo(() => {
    if (!kase) return null;
    return suggestNextAction(liveCaseLite(kase, snap), eventsLite, nowISO());
  }, [kase, snap, eventsLite]);

  const terminated = useMemo(() => (loan ? windLoanIsTerminated(loan) : false), [loan]);

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
  // „Uregulowana" = na dziś nic nie jest wymagalne (zaległe raty, odsetki za
  // opóźnienie i koszty spłacone). Raty przyszłe mogą jeszcze pozostać.
  const settled = snap ? snap.doZaplatyTeraz <= 0.005 : kase.kwota_zalegla <= 0;
  const amountDueNow = snap?.doZaplatyTeraz ?? Number(kase.kwota_zalegla || 0);

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
        remaining={snap?.calosc ?? 0}
        nextDue={snap?.najblizszaRata ?? null}
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
        {/* LEWA — harmonogram rat i oś czasu */}
        <div className="space-y-4">
          {snap?.zrodlo === "harmonogram" && snap.raty && (
            <Card>
              <CardHeader className="flex flex-col items-start gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" /> Harmonogram rat — stan na{" "}
                  {formatDataPL(snap.raty.asOf)}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edytuj harmonogram
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {snap.najstarszaZalegla ? (
                    <>
                      Najstarsza zaległa rata:{" "}
                      <span className="font-medium text-foreground">
                        {formatDataPL(snap.najstarszaZalegla)}
                      </span>{" "}
                      ·{" "}
                      <span className={delayColorClass(snap.dniOpoznienia)}>
                        opóźnienie {snap.dniOpoznienia} dni
                      </span>
                    </>
                  ) : (
                    "Brak zaległych rat na dziś."
                  )}
                  {snap.najblizszaRata
                    ? ` · następna rata: ${formatDataPL(snap.najblizszaRata)}`
                    : ""}
                  {snap.wypowiedziana ? " · umowa wypowiedziana — wszystkie raty wymagalne" : ""}
                </div>
                <RatyStanTable raty={snap.raty.raty} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Oś czasu zdarzeń</CardTitle>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="h-8 w-full sm:w-[160px]">
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
                    <TimelineItem key={e.id} e={e} onOpenAttachment={downloadDoc} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pisma wygenerowane w systemie ({documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {documents.map((d) => (
                  <WindDocRow
                    key={d.id}
                    d={d}
                    caseId={caseId}
                    userId={user?.id}
                    onDownload={downloadDoc}
                    onPreview={() => setDocPreview(d)}
                    attachProof={attachProof}
                    onAttached={(ev) => refreshAfterEvent(ev)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* REJESTR CZYNNOŚCI WINDYKACYJNYCH I OPŁAT */}
          <WindActionRegister events={events} />
        </div>

        {/* PRAWA — panel sterowania */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div>
                <div className="text-lg font-semibold">{borrower.imie_nazwisko}</div>
                <div className="text-xs text-muted-foreground">
                  {[
                    `Umowa ${loan.numer_umowy ?? "—"}`,
                    borrower.pesel ? `PESEL ${borrower.pesel}` : null,
                    borrower.nip ? `NIP ${borrower.nip}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info
                  label={terminated ? "Do zapłaty teraz (wypowiedziana)" : "Do zapłaty teraz"}
                  value={formatZl(amountDueNow)}
                  strong
                />
                <Info label="Całe zadłużenie" value={formatZl(snap?.calosc ?? null)} />
                <Info
                  label={snap?.zrodlo === "harmonogram" ? "Zaległe raty" : "Kwota zaległa"}
                  value={formatZl(snap?.zaleglosc ?? kase.kwota_zalegla)}
                />
                <Info
                  label="Opóźnienie"
                  value={`${snap?.dniOpoznienia ?? kase.opoznienie_dni} dni`}
                  valueClass={delayColorClass(snap?.dniOpoznienia ?? kase.opoznienie_dni)}
                />
                {snap?.zrodlo === "harmonogram" ? (
                  <>
                    <Info
                      label="Najstarsza zaległa rata"
                      value={formatDataPL(snap.najstarszaZalegla)}
                    />
                    <Info label="Następna rata" value={formatDataPL(snap.najblizszaRata)} />
                  </>
                ) : (
                  <Info label="Termin spłaty" value={formatDataPL(loan.termin_splaty)} />
                )}
                <Info label="Pożyczkodawca" value={loan.pozyczkodawca ?? "—"} wide />
                <Info label="Rachunek do spłaty" value={loan.rachunek_splaty ?? "—"} wide />
                <Info
                  label="KW / hipoteka"
                  value={`${loan.numer_kw ?? "—"}${
                    loan.kwota_hipoteki != null ? ` · ${formatZl(loan.kwota_hipoteki)}` : ""
                  }`}
                  wide
                />
                <Info
                  label="Akt 777"
                  value={`${loan.akt_notarialny_777 ?? "—"}${
                    loan.kwota_777 != null ? ` · do ${formatZl(loan.kwota_777)}` : ""
                  }`}
                  wide
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4 mr-1" /> Edytuj dane pożyczki i dłużnika
              </Button>
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

          {/* Czynności windykacyjne — telefon AI / SMS / e-mail: każda trafia do
              rejestru czynności z opłatą naliczoną zgodnie z umową. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4" /> Czynności windykacyjne
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              <Button size="sm" className="justify-start" onClick={() => setAction("botcall")}>
                <Phone className="h-4 w-4 mr-1.5" /> Telefon windykacyjny AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => setAction("sms")}
              >
                <MessageSquare className="h-4 w-4 mr-1.5" /> Wyślij SMS
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => setAction("email")}
              >
                <Mail className="h-4 w-4 mr-1.5" /> Wyślij e-mail
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Każda czynność trafia do rejestru czynności windykacyjnych, a opłata jest naliczana
                zgodnie z umową i doliczana do zadłużenia. Opłaty wg umowy:{" "}
                {(["sms", "telefon", "pismo"] as WindFeeKind[])
                  .map(
                    (k) =>
                      `${WIND_FEE_LABELS[k].split(" (")[0].toLowerCase()} ${formatPLN(
                        windFeeForAction(normalizeWindFeeTable(loan.oplaty_windykacyjne), k).fee,
                      )}`,
                  )
                  .join(" · ")}
                {normalizeWindFeeTable(loan.oplaty_windykacyjne)
                  ? ""
                  : " (umowa nie określa — domyślne podpowiedzi)"}
                .
              </p>
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

          {/* Wyliczenie zadłużenia: do zapłaty teraz i całe zadłużenie */}
          {snap && (
            <DebtCard
              snap={snap}
              loan={loan}
              today={todayISO()}
              onAddHarmonogram={() => setEditOpen(true)}
            />
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

      {/* „Telefon windykacyjny AI" / „Wyślij SMS" — ten sam dialog co w panelu:
          czynność + wpis do rejestru + opłata zgodnie z umową. */}
      {(action === "botcall" || action === "sms") && (
        <WindQuickContactDialog
          kind={action}
          caseId={caseId}
          loan={loan}
          borrower={borrower}
          amountDueNow={amountDueNow}
          wholeDebt={snap?.calosc ?? null}
          onClose={() => {
            setAction(null);
            setDocPreset(null);
          }}
          onDone={(ev) => {
            setAction(null);
            setDocPreset(null);
            refreshAfterEvent(ev);
          }}
        />
      )}

      {/* MODALE AKCJI (pozostałe działania) */}
      {action && action !== "botcall" && action !== "sms" && (
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
          snap={snap}
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
            doBotCall,
          }}
          onDone={(ev) => {
            setAction(null);
            setDocPreset(null);
            refreshAfterEvent(ev);
          }}
        />
      )}

      {/* Edycja danych pożyczki i dłużnika (z harmonogramem rat) */}
      {editOpen && (
        <LoanEditDialog
          caseId={caseId}
          loan={loan}
          borrower={borrower}
          saveLoan={saveLoan}
          saveBorrower={saveBorrower}
          onClose={() => setEditOpen(false)}
          onSaved={(close) => {
            if (close) setEditOpen(false);
            void reload();
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
function TimelineItem({
  e,
  onOpenAttachment,
}: {
  e: WindEvent;
  onOpenAttachment?: (path: string) => void;
}) {
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
            {formatZl(meta.kwota)}
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
        {Number(e.oplata) > 0 && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Opłata windykacyjna: <span className="tabular-nums">{formatPLN(Number(e.oplata))}</span>
          </div>
        )}
        {e.zalacznik_url ? (
          <button
            type="button"
            className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => onOpenAttachment?.(e.zalacznik_url!)}
          >
            <Paperclip className="h-3 w-3" /> załącznik — zobacz
          </button>
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
  wide,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClass?: string;
  /** Na całą szerokość (długie wartości: rachunek, akt notarialny). */
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`${strong ? "text-base font-bold" : "text-sm"} tabular-nums break-words ${valueClass ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function RowL({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{formatZl(value)}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// WYLICZENIE ZADŁUŻENIA — „do zapłaty teraz" (zaległe raty + odsetki za
// opóźnienie + koszty) i „całe zadłużenie" (także raty przyszłe).
// ════════════════════════════════════════════════════════════════════
function DebtCard({
  snap,
  loan,
  today,
  onAddHarmonogram,
}: {
  snap: WindDebtSnapshot;
  loan: WindLoan;
  today: string;
  onAddHarmonogram: () => void;
}) {
  const stopaUmowy = Number(loan.stopa_odsetek_max) || 0;
  const maksDzis = currentMaxDelayRate(today);
  const raty = snap.raty;
  const debt = snap.debt;
  const zalegleRaty = raty ? raty.raty.filter((r) => r.wymagalna && r.pozostalo > 0).length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Wyliczenie zadłużenia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {raty ? (
          <>
            <RowL
              label={`Zaległe raty (${zalegleRaty} z ${raty.liczbaRatWymagalnych} wymagalnych)`}
              value={snap.zaleglosc}
            />
            <RowL label="Odsetki za opóźnienie" value={snap.odsetkiZaOpoznienie} />
            {snap.koszty > 0 && (
              <RowL label="Opłaty za czynności windykacyjne" value={snap.koszty} />
            )}
          </>
        ) : debt ? (
          <>
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
            <RowL label="Odsetki za opóźnienie" value={debt.delayInterest} />
            {debt.costsOutstanding > 0 && (
              <RowL label="Opłaty za czynności windykacyjne" value={debt.costsOutstanding} />
            )}
          </>
        ) : null}
        <Separator className="my-1" />
        <RowL
          label={snap.wypowiedziana ? "Do zapłaty teraz (całość wymagalna)" : "Do zapłaty teraz"}
          value={snap.doZaplatyTeraz}
          strong
        />
        {raty && !snap.wypowiedziana && raty.pozostaleRatyPrzyszle > 0 && (
          <RowL
            label={`Raty przyszłe (niewymagalne)${
              raty.najblizszaRata ? ` — najbliższa ${formatDataPL(raty.najblizszaRata)}` : ""
            }`}
            value={raty.pozostaleRatyPrzyszle}
          />
        )}
        <RowL label="Całe zadłużenie" value={snap.calosc} />
        {raty && raty.nadplata > 0 && <RowL label="Nadpłata" value={raty.nadplata} />}

        <div className="rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground mt-1 space-y-0.5">
          {raty ? (
            <>
              <div>
                {snap.wypowiedziana ? (
                  <>
                    <span className="font-medium text-foreground">Umowa wypowiedziana —</span>{" "}
                    wszystkie raty są wymagalne od dnia wypowiedzenia
                    {loan.data_wypowiedzenia ? ` (${formatDataPL(loan.data_wypowiedzenia)})` : ""},
                    bez odsetek umownych za okres po wypowiedzeniu (gdy harmonogram je
                    wyszczególnia). Do zapłaty teraz = całe zadłużenie.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">Umowa niewypowiedziana —</span>{" "}
                    wymagalne są tylko raty po terminie. Odsetki za opóźnienie liczone od każdej
                    zaległej raty od dnia po jej terminie (termin w dniu wolnym przesuwa się na
                    najbliższy dzień roboczy — art. 115 k.c.).
                  </>
                )}
              </div>
              <div>
                Stopa odsetek za opóźnienie:{" "}
                {stopaUmowy > 0
                  ? `${formatStopa(stopaUmowy)}% rocznie (z umowy)`
                  : "odsetki maksymalne"}
                , w każdym dniu nie wyższa niż odsetki maksymalne za opóźnienie (dziś{" "}
                {formatStopa(maksDzis)}%, art. 481 § 2¹ k.c.). Opóźnienie: {snap.dniOpoznienia} dni
                {snap.najstarszaZalegla
                  ? ` — od najstarszej zaległej raty (${formatDataPL(snap.najstarszaZalegla)})`
                  : ""}
                . Wpłaty zaliczane wg umowy: prowizja z rat wymagalnych → koszty windykacyjne →
                odsetki za opóźnienie → odsetki umowne → kapitał (od najstarszej raty).
              </div>
            </>
          ) : debt ? (
            <>
              <div>
                {debt.delayRegime === "calosc_po_wypowiedzeniu" ? (
                  <>
                    <span className="font-medium text-foreground">Umowa wypowiedziana —</span>{" "}
                    odsetki za opóźnienie od całości oprocentowanej:{" "}
                    {formatZl(debt.delayInterestBase)} (kapitał na rękę + prowizja Finance You +
                    odsetki + dopłaty). Prowizja inwestora jest należna, ale bez odsetek.
                  </>
                ) : debt.delayRegime === "zalegle_raty" ? (
                  <>
                    <span className="font-medium text-foreground">Umowa niewypowiedziana —</span>{" "}
                    odsetki za opóźnienie tylko od kwoty zaległej sprawy:{" "}
                    {formatZl(debt.delayInterestBase)}.
                  </>
                ) : (
                  <>Brak wymagalnej zaległości — odsetki za opóźnienie nie są naliczane.</>
                )}
              </div>
              <div>
                Stopa odsetek za opóźnienie: {formatStopa(debt.effectiveDelayRate)}% rocznie
                (odsetki maksymalne dziś: {formatStopa(maksDzis)}%, art. 481 § 2¹ k.c.). Opóźnienie:{" "}
                {snap.dniOpoznienia} dni od terminu spłaty ({formatDataPL(loan.termin_splaty)}).
              </div>
            </>
          ) : null}
        </div>

        {!raty && (
          <div className="mt-1 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
            <div className="space-y-1">
              <div>
                Dodaj harmonogram rat, aby liczyć zaległość z rat. Bez harmonogramu odsetki za
                opóźnienie liczone są od kwoty zaległej sprawy, dopiero po terminie spłaty.
              </div>
              <Button size="sm" variant="outline" className="h-7" onClick={onAddHarmonogram}>
                <CalendarDays className="h-3.5 w-3.5 mr-1" /> Dodaj harmonogram rat
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  remaining,
  nextDue,
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
  /** Całe zadłużenie (także raty przyszłe) — gdy zaległość uregulowana. */
  remaining: number;
  /** Termin najbliższej raty przyszłej. */
  nextDue: string | null;
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
              <CheckCircle2 className="h-5 w-5" />{" "}
              {remaining > 0.005 ? "Zaległe raty uregulowane" : "Zadłużenie spłacone"}
            </div>
            <p className="mt-1 text-green-700 dark:text-green-300">
              {remaining > 0.005
                ? `Na dziś nic nie jest wymagalne. Do spłaty pozostają raty przyszłe: ${formatZl(remaining)}${
                    nextDue ? ` (najbliższa ${formatDataPL(nextDue)})` : ""
                  }. Możesz zamknąć sprawę windykacyjną w trybie zaawansowanym albo monitorować kolejne raty.`
                : "Klient spłacił całe zadłużenie. Możesz zamknąć sprawę z wynikiem „spłacona” w trybie zaawansowanym."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onScan}>
                <ScanLine className="h-4 w-4 mr-1" /> Zrób zdjęcie dokumentu
              </Button>
              <Button variant="ghost" size="sm" onClick={onWplata}>
                <Wallet className="h-4 w-4 mr-1" /> Odnotuj wpłatę
              </Button>
            </div>
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
  doBotCall: ReturnType<typeof useServerFn<typeof placeWindCollectionCall>>;
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
  snap,
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
  /** Stan zadłużenia na dziś (kwoty domyślne SMS-a, telefonu i pism DOCX). */
  snap: WindDebtSnapshot | null;
  fns: Fns;
  onDone: (ev?: WindEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  // Do zapłaty teraz: zaległe raty + odsetki za opóźnienie + koszty (po
  // wypowiedzeniu — całe zadłużenie).
  const amountDueNow = snap?.doZaplatyTeraz ?? Number(kase.kwota_zalegla || 0);
  const [v, setV] = useState<Record<string, string>>(() =>
    initialValues(kind, kase, loan, borrower, initialDocType, amountDueNow),
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
    const path = `windykacja/${userId}/${caseId}/${Date.now()}_${safe}`;
    const { error } = await supabase.storage
      .from(CLIENT_FILES_BUCKET)
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
          data: {
            caseId,
            typ: kind,
            target: v.target,
            subject: v.subject,
            tresc: v.tresc,
            oplata: Number(v.oplata) || 0,
          },
        });
        if ((ev.metadata as { ok?: boolean })?.ok === false)
          toast.error("Wysyłka nie powiodła się — zdarzenie zapisane.");
        else toast.success("Zapisano zdarzenie");
        onDone(ev);
      } else if (kind === "botcall") {
        if (!v.target?.trim()) {
          toast.error("Podaj numer telefonu dłużnika");
          setBusy(false);
          return;
        }
        const res = await fns.doBotCall({
          data: {
            caseId,
            telefon: v.target,
            kwota: Number(v.kwota) || 0,
            oplata: Number(v.oplata) || 0,
          },
        });
        if (res.ok) toast.success("Agent AI dzwoni do dłużnika — wynik pojawi się w osi czasu.");
        else toast.error(res.error ?? "Nie udało się zainicjować połączenia");
        onDone(res.event as WindEvent);
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
            oplata: Number(v.oplata) || 0,
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
          // Pożyczka z harmonogramem: kwoty z rat na dziś (jak pisma z systemu),
          // a nie z migawki zapisanej przy ostatniej zmianie sprawy.
          const zRat = snap?.zrodlo === "harmonogram" && snap.raty ? snap : null;
          const values = buildWindTemplateValues(fields, {
            dluznik: borrower.imie_nazwisko,
            adres: borrower.adres_do_doreczen || borrower.adres_zamieszkania || "",
            pesel: borrower.pesel,
            nip: borrower.nip,
            kwota_zalegla: zRat ? zRat.zaleglosc : Number(kase.kwota_zalegla || 0),
            saldo: zRat
              ? round2(zRat.zaleglosc + (zRat.raty?.pozostaleRatyPrzyszle ?? 0))
              : Number(loan.saldo_pozostale || 0),
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
          {kind === "botcall" && (
            <DialogDescription>
              Agent AI (ElevenLabs) zadzwoni do dłużnika{" "}
              {loan.pozyczkodawca?.trim()
                ? `w imieniu pożyczkodawcy (${loan.pozyczkodawca.trim()})`
                : "w Twoim imieniu"}{" "}
              i przypomni o konieczności uregulowania należności. Kwota do zapłaty jest przekazywana
              do rozmowy automatycznie. Połączenie zostanie zapisane w rejestrze czynności.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          {(kind === "sms" || kind === "telefon" || kind === "botcall") && (
            <Fld label="Numer telefonu">
              <Input value={v.target ?? ""} onChange={(e) => set("target", e.target.value)} />
            </Fld>
          )}
          {kind === "botcall" && (
            <Fld
              label="Kwota do zapłaty do zakomunikowania (zł)"
              hint={
                windLoanIsTerminated(loan)
                  ? `Umowa wypowiedziana — domyślnie całe zadłużenie (wymagalne): ${formatZl(amountDueNow)}.`
                  : `Domyślnie: do zapłaty teraz (zaległe raty + odsetki za opóźnienie + koszty): ${formatZl(amountDueNow)}.`
              }
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                value={v.kwota ?? ""}
                onChange={(e) => set("kwota", e.target.value)}
              />
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

          {/* Opłata windykacyjna za czynność — trafia do rejestru i do zadłużenia. */}
          {(kind === "sms" ||
            kind === "email" ||
            kind === "telefon" ||
            kind === "botcall" ||
            kind === "pismo") && (
            <Fld label="Opłata za czynność windykacyjną (zł) — 0 = bez opłaty">
              <Input
                type="number"
                min={0}
                value={v.oplata ?? "0"}
                onChange={(e) => set("oplata", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Kwota podpowiedziana zgodnie z tabelą opłat z umowy pożyczki (gdy umowa milczy —
                domyślna: {WIND_FEE_DEFAULTS.sms}/{WIND_FEE_DEFAULTS.telefon}/
                {WIND_FEE_DEFAULTS.pismo} zł za SMS/telefon/pismo). Opłata trafia do rejestru
                czynności i jest doliczana do zadłużenia jako koszt windykacji (wpłaty klienta
                pokrywają najpierw koszty — art. 451 k.c.). Nalicz tylko, jeśli umowa przewiduje
                opłaty za czynności windykacyjne.
              </p>
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
            {kind === "sms" || kind === "email"
              ? "Wyślij"
              : kind === "botcall"
                ? "Zadzwoń teraz"
                : "Zapisz"}
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
  botcall: "Telefon windykacyjny — agent AI",
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
  amountDueNow?: number | null,
): Record<string, string> {
  // Kwota komunikowana dłużnikowi: do zapłaty teraz (po wypowiedzeniu — całość).
  const dueNow = Math.max(0, round2(Number(amountDueNow ?? kase.kwota_zalegla) || 0));
  const base: Record<string, string> = { data: todayISO(), data_nadania: todayISO(), oplata: "0" };
  // Opłaty ZGODNIE Z UMOWĄ: tabela opłat z umowy pożyczki, a gdy umowa milczy —
  // domyślna podpowiedź (WIND_FEE_DEFAULTS); umowa bez opłat → 0.
  const feeTable = normalizeWindFeeTable(loan.oplaty_windykacyjne);
  const fee = (k: WindFeeKind) => String(windFeeForAction(feeTable, k).fee);
  if (kind === "sms" || kind === "telefon" || kind === "botcall")
    base.target = borrower.telefon ?? "";
  if (kind === "email") {
    base.target = borrower.email ?? "";
    base.subject = "Finance You — wezwanie do zapłaty";
  }
  if (kind === "sms") {
    base.tresc = buildWindSmsText(loan, dueNow, { wypowiedziana: windLoanIsTerminated(loan) });
    base.oplata = fee("sms");
  }
  if (kind === "email") base.oplata = fee("email");
  if (kind === "telefon") base.oplata = fee("telefon");
  if (kind === "botcall") {
    base.kwota = String(dueNow);
    base.oplata = fee("telefon");
  }
  if (kind === "pismo") base.oplata = fee("pismo");
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
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Podpowiedź pod polem. */
  hint?: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// EDYCJA DANYCH POŻYCZKI I DŁUŻNIKA — pożyczkodawca, kwoty, stopa odsetek
// za opóźnienie, zabezpieczenia, rachunek do spłaty, harmonogram rat oraz
// dane kontaktowe dłużnika. Zapisujemy tylko zmienione pola; zmiana
// harmonogramu (albo stopy) przelicza na serwerze kwotę zaległą, opóźnienie
// i saldo sprawy, a zmiana trafia do akt jako zdarzenie.
// ════════════════════════════════════════════════════════════════════
function LoanEditDialog({
  caseId,
  loan,
  borrower,
  saveLoan,
  saveBorrower,
  onClose,
  onSaved,
}: {
  caseId: string;
  loan: WindLoan;
  borrower: WindBorrower;
  saveLoan: ReturnType<typeof useServerFn<typeof updateWindLoan>>;
  saveBorrower: ReturnType<typeof useServerFn<typeof updateWindBorrower>>;
  onClose: () => void;
  /** Po zapisie (także częściowym): odśwież sprawę; `close` — zamknij okno. */
  onSaved: (close: boolean) => void;
}) {
  const [lf, setLf] = useState<LoanEditForm>(() => loanToEditForm(loan));
  const [bf, setBf] = useState<BorrowerEditForm>(() => borrowerToEditForm(borrower));
  const [raty, setRaty] = useState<RataForm[]>(() => harmonogramToForm(loan.harmonogram));
  const [generator, setGenerator] = useState<GeneratorForm>(() =>
    generatorFromHarmonogram(loan.harmonogram),
  );
  const [busy, setBusy] = useState(false);
  const updL = (k: keyof LoanEditForm, v: string) => setLf((p) => ({ ...p, [k]: v }));
  const updB = <K extends keyof BorrowerEditForm>(k: K, v: BorrowerEditForm[K]) =>
    setBf((p) => ({ ...p, [k]: v }));

  const stopaMaks = defaultDelayRate(parseDataISO(lf.data_umowy));
  const rachunekBledny =
    lf.rachunek_splaty.trim() !== "" && formatRachunekSplaty(lf.rachunek_splaty) == null;
  const usuwaHarmonogram = Boolean(loan.harmonogram?.length) && !hasRaty(raty);

  const save = async () => {
    const l = loanEditPatch(loan, lf, raty);
    const b = borrowerEditPatch(borrower, bf);
    const bledy = [...b.bledy, ...l.bledy];
    if (bledy.length) {
      toast.error(
        bledy.slice(0, 3).join(" ") +
          (bledy.length > 3 ? ` …oraz ${bledy.length - 3} innych błędów.` : ""),
      );
      return;
    }
    const zmianyB = Object.keys(b.patch).length > 0;
    const zmianyL = Object.keys(l.patch).length > 0;
    if (!zmianyB && !zmianyL) {
      toast.message("Brak zmian do zapisania");
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (zmianyB) await saveBorrower({ data: { id: borrower.id, patch: b.patch } });
      if (zmianyL) await saveLoan({ data: { id: loan.id, caseId, patch: l.patch } });
      const zRat = "harmonogram" in l.patch ? l.patch.harmonogram != null : !!loan.harmonogram;
      const co =
        zmianyL && zmianyB
          ? "dane pożyczki i dłużnika"
          : zmianyL
            ? "dane pożyczki"
            : "dane dłużnika";
      toast.success(
        zmianyL && zRat
          ? `Zapisano ${co} — zaległość i opóźnienie przeliczone z harmonogramu rat`
          : `Zapisano ${co}`,
      );
      onSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać danych");
      // Część zmian mogła się zapisać (np. dane dłużnika) — odświeżamy sprawę,
      // okno zostaje otwarte do poprawy.
      onSaved(false);
    } finally {
      setBusy(false);
    }
  };

  const kwotaInput = (k: keyof LoanEditForm) => (
    <Input inputMode="decimal" value={lf[k]} onChange={(e) => updL(k, e.target.value)} />
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Dane pożyczki i dłużnika
          </DialogTitle>
          <DialogDescription>
            Zmiana trafi do akt sprawy. Zmiana harmonogramu rat albo stopy odsetek przelicza kwotę
            zaległą, opóźnienie i saldo sprawy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* POŻYCZKA */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Umowa i kwoty</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Fld
                label="Pożyczkodawca (z umowy)"
                className="sm:col-span-2"
                hint="Strona udzielająca pożyczki — agent AI dzwoni w jej imieniu."
              >
                <Input
                  value={lf.pozyczkodawca}
                  placeholder="np. Finance You sp. z o.o."
                  onChange={(e) => updL("pozyczkodawca", e.target.value)}
                />
              </Fld>
              <Fld label="Numer umowy">
                <Input
                  value={lf.numer_umowy}
                  onChange={(e) => updL("numer_umowy", e.target.value)}
                />
              </Fld>
              <Fld label="Data umowy">
                <Input
                  type="date"
                  value={lf.data_umowy}
                  onChange={(e) => updL("data_umowy", e.target.value)}
                />
              </Fld>
              <Fld label="Kwota wypłacona (na rękę) (zł)">{kwotaInput("kwota_pozyczki")}</Fld>
              <Fld label="Prowizja Finance You (potrącona z wypłaty) (zł)">
                {kwotaInput("prowizja")}
              </Fld>
              <Fld
                label="Kwota do zwrotu bez odsetek (kwota pożyczki + prowizja pożyczkodawcy) (zł)"
                className="sm:col-span-2"
                hint="Bez odsetek umownych — nie wpisuj tu sumy rat."
              >
                {kwotaInput("kwota_calkowita")}
              </Fld>
              <Fld label="Oprocentowanie kapitałowe (% rocznie)">
                {kwotaInput("oprocentowanie_roczne")}
              </Fld>
              <Fld
                label="Termin spłaty (ostatnia rata)"
                hint="Przy zmianie harmonogramu ustawimy termin ostatniej raty, jeśli go nie zmienisz."
              >
                <Input
                  type="date"
                  value={lf.termin_splaty}
                  onChange={(e) => updL("termin_splaty", e.target.value)}
                />
              </Fld>
              <Fld
                label="Odsetki za opóźnienie wg umowy (% rocznie)"
                className="sm:col-span-2"
                hint={`Puste = odsetki maksymalne za opóźnienie z dnia umowy (${formatStopa(stopaMaks)}%). W każdym dniu kalkulator stosuje nie więcej niż odsetki maksymalne z tego dnia.`}
              >
                {kwotaInput("stopa_odsetek_max")}
              </Fld>
            </div>
          </section>

          {/* ZABEZPIECZENIA I RACHUNEK */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Zabezpieczenia i rachunek do spłaty</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Fld
                label="Rachunek do spłaty (NRB)"
                className="sm:col-span-2"
                hint={
                  rachunekBledny ? (
                    <span className="text-red-600">
                      Podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL.
                    </span>
                  ) : undefined
                }
              >
                <Input
                  value={lf.rachunek_splaty}
                  placeholder="NN NNNN NNNN NNNN NNNN NNNN NNNN"
                  onChange={(e) => updL("rachunek_splaty", e.target.value)}
                  onBlur={() => {
                    const r = formatRachunekSplaty(lf.rachunek_splaty);
                    if (r) updL("rachunek_splaty", r);
                  }}
                />
              </Fld>
              <Fld label="Numer KW">
                <Input value={lf.numer_kw} onChange={(e) => updL("numer_kw", e.target.value)} />
              </Fld>
              <Fld label="Kwota hipoteki (zł)">{kwotaInput("kwota_hipoteki")}</Fld>
              <Fld
                label="Akt notarialny — poddanie się egzekucji (art. 777 k.p.c.)"
                hint="Np. Rep. A nr 1234/2026, notariusz …"
              >
                <Input
                  value={lf.akt_notarialny_777}
                  onChange={(e) => updL("akt_notarialny_777", e.target.value)}
                />
              </Fld>
              <Fld label="Kwota z aktu 777 (zł)">{kwotaInput("kwota_777")}</Fld>
            </div>
          </section>

          {/* HARMONOGRAM RAT */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> Harmonogram rat (Załącznik nr 1 do umowy)
            </h3>
            <HarmonogramEditor
              rows={raty}
              onChange={setRaty}
              generator={generator}
              onGeneratorChange={setGenerator}
              hint="Z harmonogramu liczymy zaległość (raty po terminie minus wpłaty), opóźnienie od najstarszej zaległej raty i odsetki za opóźnienie od każdej raty."
            />
            {usuwaHarmonogram && (
              <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                Bez harmonogramu sprawa wróci do modelu z jednym terminem spłaty — odsetki za
                opóźnienie od kwoty zaległej sprawy, dopiero po terminie spłaty.
              </p>
            )}
          </section>

          {/* DŁUŻNIK */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Dłużnik</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Fld label="Imię i nazwisko / nazwa" className="sm:col-span-2">
                <Input
                  value={bf.imie_nazwisko}
                  onChange={(e) => updB("imie_nazwisko", e.target.value)}
                />
              </Fld>
              <Fld label="Typ" hint="Jednoosobowa działalność (PESEL + NIP) to osoba fizyczna.">
                <Select
                  value={bf.typ}
                  onValueChange={(v) => updB("typ", v as BorrowerEditForm["typ"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="osoba_fizyczna">Osoba fizyczna (także JDG)</SelectItem>
                    <SelectItem value="firma">Firma (spółka, osoba prawna)</SelectItem>
                  </SelectContent>
                </Select>
              </Fld>
              <Fld label="Telefon">
                <Input value={bf.telefon} onChange={(e) => updB("telefon", e.target.value)} />
              </Fld>
              <Fld label="PESEL">
                <Input
                  inputMode="numeric"
                  value={bf.pesel}
                  onChange={(e) => updB("pesel", e.target.value)}
                />
              </Fld>
              <Fld label="NIP">
                <Input
                  inputMode="numeric"
                  value={bf.nip}
                  onChange={(e) => updB("nip", e.target.value)}
                />
              </Fld>
              <Fld label="E-mail" className="sm:col-span-2">
                <Input value={bf.email} onChange={(e) => updB("email", e.target.value)} />
              </Fld>
              <Fld label="Adres zamieszkania" className="sm:col-span-2">
                <Input
                  value={bf.adres_zamieszkania}
                  onChange={(e) => updB("adres_zamieszkania", e.target.value)}
                />
              </Fld>
              <Fld
                label="Adres do doręczeń"
                className="sm:col-span-2"
                hint="Na ten adres trafiają pisma (wezwania, wypowiedzenie)."
              >
                <Input
                  value={bf.adres_do_doreczen}
                  onChange={(e) => updB("adres_do_doreczen", e.target.value)}
                />
              </Fld>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}
            Zapisz zmiany
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// PISMO Z SYSTEMU + POTWIERDZENIA NADANIA / ODBIORU
// Inwestor wgrywa skan dowodu nadania (list polecony) i zwrotki (ZPO)
// bezpośrednio przy piśmie, do którego należą.
// ════════════════════════════════════════════════════════════════════
function WindDocRow({
  d,
  caseId,
  userId,
  onDownload,
  onPreview,
  attachProof,
  onAttached,
}: {
  d: WindDocument;
  caseId: string;
  userId?: string;
  onDownload: (path: string) => void;
  onPreview: () => void;
  attachProof: ReturnType<typeof useServerFn<typeof attachWindDocProof>>;
  onAttached: (ev: WindEvent) => void;
}) {
  const nadanieRef = useRef<HTMLInputElement>(null);
  const odbiorRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"nadanie" | "odbior" | null>(null);

  const upload = async (rodzaj: "nadanie" | "odbior", file: File | null) => {
    if (!file || !userId) return;
    setBusy(rodzaj);
    try {
      const safe = file.name.replace(/[^\w.-]+/g, "_");
      const path = `windykacja/${userId}/${caseId}/${rodzaj}_${d.id}_${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw new Error(`Upload: ${error.message}`);
      const res = await attachProof({
        data: {
          caseId,
          documentId: d.id,
          rodzaj,
          plik_url: path,
          data: new Date().toISOString().slice(0, 10),
        },
      });
      toast.success(
        rodzaj === "nadanie"
          ? "Dodano potwierdzenie nadania"
          : "Dodano potwierdzenie odbioru (zwrotkę)",
      );
      onAttached(res.event as WindEvent);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać potwierdzenia");
    } finally {
      setBusy(null);
    }
  };

  const proofChip = (
    rodzaj: "nadanie" | "odbior",
    url: string | null,
    date: string | null,
    ref: React.RefObject<HTMLInputElement | null>,
  ) => {
    const label = rodzaj === "nadanie" ? "nadanie" : "odbiór";
    if (url) {
      return (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"
          onClick={() => onDownload(url)}
          title={`Zobacz potwierdzenie ${label}`}
        >
          <CheckCircle2 className="h-3 w-3" /> {label}
          {date ? ` ${formatDate(date)}` : ""}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={busy != null}
        className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        onClick={() => ref.current?.click()}
        title={`Wgraj skan potwierdzenia ${label}`}
      >
        {busy === rodzaj ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Paperclip className="h-3 w-3" />
        )}
        + {label}
      </button>
    );
  };

  return (
    <div className="rounded-md border p-2 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileSignature className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{d.tytul}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatDate(d.created_at)}</span>
        </div>
        {d.plik_url ? (
          <Button variant="ghost" size="sm" onClick={() => onDownload(d.plik_url!)}>
            <Download className="h-4 w-4 mr-1" /> DOCX
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onPreview}>
            <Eye className="h-4 w-4 mr-1" /> Podgląd
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Potwierdzenia:</span>
        {proofChip("nadanie", d.potwierdzenie_nadania_url, d.data_nadania, nadanieRef)}
        {proofChip("odbior", d.potwierdzenie_odbioru_url, d.data_odbioru, odbiorRef)}
        {!d.potwierdzenie_nadania_url && (
          <span className="text-[11px] text-amber-600">brak dowodu nadania</span>
        )}
      </div>
      <input
        ref={nadanieRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void upload("nadanie", e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={odbiorRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void upload("odbior", e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// REJESTR CZYNNOŚCI WINDYKACYJNYCH I OPŁAT
// Wszystkie czynności (SMS, telefony, pisma, dokumenty, czynności sądowe)
// wraz z naliczonymi opłatami dodatkowymi doliczanymi do zadłużenia.
// ════════════════════════════════════════════════════════════════════
const REGISTER_EVENT_TYPES = new Set([
  "sms",
  "email",
  "telefon",
  "pismo_nadane",
  "dokument_wygenerowany",
  "czynnosc_sadowa",
]);

function WindActionRegister({ events }: { events: WindEvent[] }) {
  const actions = useMemo(
    () =>
      events
        .filter((e) => REGISTER_EVENT_TYPES.has(e.typ) || Number(e.oplata) > 0)
        .sort((a, b) => b.data_zdarzenia.localeCompare(a.data_zdarzenia)),
    [events],
  );
  const sumaOplat = actions.reduce((s, e) => s + (Number(e.oplata) || 0), 0);

  if (actions.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Gavel className="h-4 w-4" /> Rejestr czynności windykacyjnych i opłat
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Data</th>
                <th className="py-1.5 pr-2 font-medium">Czynność</th>
                <th className="py-1.5 text-right font-medium">Opłata</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(e.data_zdarzenia)}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="line-clamp-1">{e.tytul}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                    {Number(e.oplata) > 0 ? (
                      formatPLN(Number(e.oplata))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="py-2 pr-2 font-semibold">
                  Suma opłat windykacyjnych
                </td>
                <td className="py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                  {formatPLN(sumaOplat)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Naliczone opłaty są doliczane do zadłużenia jako koszty windykacji i pokrywane z wpłat
          klienta w pierwszej kolejności (art. 451 k.c.).
        </p>
      </CardContent>
    </Card>
  );
}
