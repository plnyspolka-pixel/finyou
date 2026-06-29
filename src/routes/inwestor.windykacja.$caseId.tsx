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
  type WindCase,
  type WindLoan,
  type WindBorrower,
  type WindEvent,
  type WindDocument,
} from "@/lib/windykacja.functions";
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
  type WindPath,
  type WindEventLite,
  type WindDocumentType,
} from "@/lib/windykacja-procedure";
import {
  calculateDebt,
  maxDelayInterestRate,
  DEFAULT_NBP_REFERENCE_RATE,
} from "@/lib/debt-collection-math";
import { formatPLN, formatDate, formatDateTime } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Upload,
  Lightbulb,
  Gavel,
  Building2,
  ShieldCheck,
  Paperclip,
  Eye,
  Calculator,
  FileDown,
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

  const [kase, setKase] = useState<WindCase | null>(null);
  const [loan, setLoan] = useState<WindLoan | null>(null);
  const [borrower, setBorrower] = useState<WindBorrower | null>(null);
  const [events, setEvents] = useState<WindEvent[]>([]);
  const [documents, setDocuments] = useState<WindDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [action, setAction] = useState<ActionKind>(null);
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

  // Wyliczenie zadłużenia z odsetkami maksymalnymi (silnik kalkulacyjny).
  const debt = useMemo(() => {
    if (!loan) return null;
    const payments = events
      .filter((e) => e.typ === "wplata")
      .map((e) => ({
        paid_on: e.data_zdarzenia.slice(0, 10),
        amount: Number((e.metadata as { kwota?: number })?.kwota ?? 0),
      }));
    return calculateDebt({
      principalAmount: Number(loan.kwota_calkowita || loan.kwota_pozyczki || 0),
      payoutDate: loan.data_umowy,
      dueDate: loan.termin_splaty,
      contractualAnnualRate: Number(loan.oprocentowanie_roczne || 0),
      penaltyAnnualRate: Number(loan.stopa_odsetek_max || 0),
      maxStatutoryRate: Number(loan.stopa_odsetek_max || 0),
      payments,
      actionFees: [],
      asOf: todayISO(),
    });
  }, [loan, events]);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/inwestor/windykacja"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Panel windykacji
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/inwestor/windykacja/$caseId/raport" params={{ caseId }} target="_blank">
              <FileDown className="h-4 w-4 mr-1" /> Raport dowodowy (PDF)
            </Link>
          </Button>
          <Badge className={PATH_BADGE[kase.sciezka]}>{PATH_LABELS[kase.sciezka]}</Badge>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* LEWA — oś czasu */}
        <div className="space-y-4">
          {/* Sugerowane działanie */}
          {suggestion && (
            <Card className={suggestion.urgent ? "border-amber-400 dark:border-amber-700" : ""}>
              <CardContent className="pt-5 flex items-start gap-3">
                <Lightbulb
                  className={`h-5 w-5 mt-0.5 shrink-0 ${suggestion.urgent ? "text-amber-600" : "text-primary"}`}
                />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sugerowane następne działanie
                  </div>
                  <div className="text-sm mt-0.5">{suggestion.text}</div>
                </div>
              </CardContent>
            </Card>
          )}

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
                <CardTitle className="text-base">Dokumenty ({documents.length})</CardTitle>
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
                    <Button variant="ghost" size="sm" onClick={() => setDocPreview(d)}>
                      <Eye className="h-4 w-4 mr-1" /> Podgląd
                    </Button>
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
            </CardContent>
          </Card>

          {/* Stepper etapu */}
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

          {/* Zadłużenie z odsetkami maksymalnymi */}
          {debt && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" /> Wyliczenie zadłużenia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <RowL label="Kapitał / należność główna" value={debt.principalOutstanding} />
                <RowL label="Odsetki za opóźnienie (maks.)" value={debt.delayInterest} />
                <Separator className="my-1" />
                <div className="flex items-center justify-between font-semibold">
                  <span>Razem na dziś</span>
                  <span className="tabular-nums">{formatPLN(debt.totalDue)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Stopa odsetek maks.: {debt.effectiveDelayRate}% (limit art. 481 §2¹ KC).
                  Opóźnienie: {debt.daysOverdue} dni.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Akcje */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Działania</CardTitle>
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MODALE AKCJI */}
      {action && (
        <ActionDialog
          kind={action}
          onClose={() => setAction(null)}
          caseId={caseId}
          kase={kase}
          loan={loan}
          borrower={borrower}
          events={events}
          userId={user?.id}
          fns={{ doContact, doPismo, doDelivery, doWplata, doNotatka, genDoc, doStage }}
          onDone={(ev) => {
            setAction(null);
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
};

function ActionDialog({
  kind,
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
    initialValues(kind, kase, loan, borrower),
  );
  const [file, setFile] = useState<File | null>(null);
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

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
        const res = await fns.genDoc({ data: { caseId, typ: v.typ as WindDocumentType } });
        toast.success("Wygenerowano dokument");
        onDone(res.event);
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

          {kind === "pismo" && (
            <>
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
              <ScanField file={file} setFile={setFile} required />
            </>
          )}

          {kind === "doreczenie" && (
            <>
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
              <ScanField file={file} setFile={setFile} />
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
            <Fld label="Typ dokumentu">
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

function ScanField({
  file,
  setFile,
  required,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  required?: boolean;
}) {
  return (
    <Fld label={`Skan ${required ? "(dowód — zalecany)" : "(opcjonalnie)"}`}>
      <label className="inline-flex">
        <input
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button asChild variant="secondary" size="sm">
          <span>
            <Upload className="h-4 w-4 mr-1" /> {file ? file.name : "Wybierz plik"}
          </span>
        </Button>
      </label>
    </Fld>
  );
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
};

function initialValues(
  kind: Exclude<ActionKind, null>,
  kase: WindCase,
  loan: WindLoan,
  borrower: WindBorrower,
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
  if (kind === "dokument") base.typ = documentsForPath(kase.sciezka)[0];
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
