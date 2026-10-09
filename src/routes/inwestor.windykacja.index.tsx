// PANEL WINDYKACJI — jeden prosty przepływ:
//   1. „Dodaj umowę" (zdjęcie/PDF → system odczytuje dłużnika, kwoty, terminy,
//      harmonogram rat i tabelę opłat windykacyjnych z umowy),
//   2. „Dodaj potwierdzenia wpłat" (system odczytuje kwoty i daty),
//   → na tej podstawie system oblicza zaległość z rat, odsetki za opóźnienie
//     (nie wyższe niż maksymalne, art. 481 § 2¹ k.c.) i proponuje ścieżkę
//     oraz dalsze działania.
// Kwoty spraw: „do zapłaty teraz" (zaległe raty + odsetki za opóźnienie +
// koszty) i „całe zadłużenie" (także raty przyszłe) — windDebtSnapshot.
// Przy każdej sprawie dwa przyciski: „Telefon windykacyjny AI" i „Wyślij SMS".
// Kliknięcie wykonuje czynność ORAZ dopisuje ją do rejestru czynności
// windykacyjnych sprawy z opłatą naliczoną zgodnie z umową.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import {
  listWindDashboard,
  createWindCase,
  seedWindDemo,
  type WindCase,
  type WindLoan,
  type WindBorrower,
  type WindEvent,
} from "@/lib/windykacja.functions";
import {
  PATH_BADGE,
  PATH_LABELS,
  stageLabel,
  delayColorClass,
  suggestNextAction,
  needsActionToday,
  recommendedPathForDelay,
  type WindPath,
  type WindEventLite,
} from "@/lib/windykacja-procedure";
import { windDebtSnapshot, defaultDelayRate, type WindDebtSnapshot } from "@/lib/windykacja-debt";
import { computeZaleglosc, parseDataISO, parseKwota } from "@/lib/windykacja-harmonogram";
import { daysSinceDue, formatRachunekSplaty, warsawToday } from "@/lib/windykacja-recalc";
import type { WindContractData } from "@/lib/windykacja-ocr.functions";
import {
  WIND_FEE_DEFAULTS,
  WIND_FEE_LABELS,
  normalizeWindFeeTable,
  windFeeForAction,
  type WindFeeKind,
} from "@/lib/windykacja-fees";
import {
  WindQuickContactDialog,
  type WindQuickKind,
} from "@/components/inwestor/wind-quick-actions";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContractScanField,
  PaymentScansField,
  type PaymentScan,
} from "@/components/inwestor/wind-smart-scan";
import { HarmonogramEditor } from "@/components/inwestor/wind-harmonogram";
import {
  EMPTY_GENERATOR,
  formToHarmonogram,
  formatDataPL,
  formatStopa,
  formatZl,
  generatorFromHarmonogram,
  generatorFromParams,
  harmonogramToForm,
  hasRaty,
  kwotaDoPola,
  liveCaseLite,
  rozliczenieWplat,
  type GeneratorForm,
  type RataForm,
} from "@/components/inwestor/wind-harmonogram-form";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  Gavel,
  Plus,
  AlertTriangle,
  Wallet,
  FolderOpen,
  Flame,
  Loader2,
  ArrowRight,
  Phone,
  MessageSquare,
  Calculator,
  Lightbulb,
  FileText,
  ScanLine,
  CalendarDays,
} from "lucide-react";

export const Route = createFileRoute("/inwestor/windykacja/")({
  component: WindykacjaDashboard,
});

type CaseRow = WindCase & { loan: (WindLoan & { borrower: WindBorrower }) | null };
type DashEvent = Pick<
  WindEvent,
  | "case_id"
  | "typ"
  | "tytul"
  | "data_zdarzenia"
  | "data_doreczenia"
  | "status_doreczenia"
  | "metadata"
  | "oplata"
>;

const PRIORITY_BADGE: Record<string, string> = {
  niski: "bg-muted text-muted-foreground",
  sredni: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  wysoki: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  krytyczny: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const nowISO = () => new Date().toISOString();
/** Dzisiejsza data w Polsce — ta sama, na którą serwer przelicza sprawy. */
const todayISO = () => warsawToday();

/**
 * Ten sam silnik co karta sprawy, raport, SMS i telefon AI: zaległość
 * z harmonogramu rat (albo model z jednym terminem spłaty), odsetki za
 * opóźnienie i koszty na dziś.
 */
function caseSnapshot(c: CaseRow, events: DashEvent[], asOf: string): WindDebtSnapshot | null {
  if (!c.loan) return null;
  return windDebtSnapshot({ loan: c.loan, kwotaZalegla: c.kwota_zalegla, events, asOf });
}

function WindykacjaDashboard() {
  const navigate = useNavigate();
  const fetchDash = useServerFn(listWindDashboard);
  const createCase = useServerFn(createWindCase);
  const seedDemo = useServerFn(seedWindDemo);

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [eventsByCase, setEventsByCase] = useState<Record<string, DashEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [pathFilter, setPathFilter] = useState<string>("all");
  const [quick, setQuick] = useState<{
    kind: WindQuickKind;
    row: CaseRow;
    amountDueNow: number;
    wholeDebt: number | null;
  } | null>(null);
  const intakeRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetchDash();
      setCases(res.cases as CaseRow[]);
      const map: Record<string, DashEvent[]> = {};
      for (const e of res.events) {
        (map[e.case_id] ??= []).push(e as unknown as DashEvent);
      }
      setEventsByCase(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać danych");
    } finally {
      setLoading(false);
    }
  }, [fetchDash]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const snapByCase = useMemo(() => {
    const asOf = todayISO();
    const m: Record<string, WindDebtSnapshot | null> = {};
    for (const c of cases) m[c.id] = caseSnapshot(c, eventsByCase[c.id] ?? [], asOf);
    return m;
  }, [cases, eventsByCase]);

  const liteEvents = useCallback(
    (id: string): WindEventLite[] =>
      (eventsByCase[id] ?? []).map((e) => ({
        typ: e.typ,
        data_zdarzenia: e.data_zdarzenia,
        data_doreczenia: e.data_doreczenia,
        status_doreczenia: e.status_doreczenia,
      })),
    [eventsByCase],
  );

  const metrics = useMemo(() => {
    const active = cases.filter((c) => !c.data_zamkniecia);
    const dueNow = active.reduce(
      (s, c) => s + Number(snapByCase[c.id]?.doZaplatyTeraz ?? c.kwota_zalegla ?? 0),
      0,
    );
    const whole = active.reduce(
      (s, c) => s + Number(snapByCase[c.id]?.calosc ?? c.kwota_zalegla ?? 0),
      0,
    );
    const penalty = active.reduce(
      (s, c) => s + Number(snapByCase[c.id]?.odsetkiZaOpoznienie ?? 0),
      0,
    );
    const today = active.filter((c) =>
      needsActionToday(liveCaseLite(c, snapByCase[c.id] ?? null), liteEvents(c.id), nowISO()),
    );
    const critical = active.filter((c) => c.priorytet === "krytyczny");
    return {
      activeCount: active.length,
      dueNow,
      whole,
      penalty,
      todayCount: today.length,
      criticalCount: critical.length,
      today,
    };
  }, [cases, snapByCase, liteEvents]);

  const filtered = useMemo(() => {
    const list = pathFilter === "all" ? cases : cases.filter((c) => c.sciezka === pathFilter);
    // Opóźnienie na dziś (z rat), nie zapisane przy zakładaniu sprawy.
    const dni = (c: CaseRow) => snapByCase[c.id]?.dniOpoznienia ?? c.opoznienie_dni;
    return [...list].sort((a, b) => {
      const pr = ["krytyczny", "wysoki", "sredni", "niski"];
      const d = pr.indexOf(a.priorytet) - pr.indexOf(b.priorytet);
      if (d !== 0) return d;
      return dni(b) - dni(a);
    });
  }, [cases, pathFilter, snapByCase]);

  const onSeed = async () => {
    setSeeding(true);
    try {
      await seedDemo();
      toast.success("Dodano dane przykładowe");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać danych");
    } finally {
      setSeeding(false);
    }
  };

  const openQuick = (kind: WindQuickKind, row: CaseRow) => {
    if (!row.loan?.borrower) {
      toast.error("Sprawa nie ma danych dłużnika");
      return;
    }
    const snap = snapByCase[row.id] ?? null;
    setQuick({
      kind,
      row,
      amountDueNow: snap?.doZaplatyTeraz ?? Number(row.kwota_zalegla || 0),
      wholeDebt: snap?.calosc ?? null,
    });
  };

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Windykacja"
        title="Panel windykacji"
        subtitle="Dodaj umowę i potwierdzenia wpłat — system obliczy zaległe raty i odsetki za opóźnienie, zaproponuje dalsze działania i poprowadzi rejestr czynności windykacyjnych z opłatami naliczanymi zgodnie z umową."
        actions={
          <Button
            variant="secondary"
            className="bg-white/15 text-white border-white/20 hover:bg-white/25"
            onClick={() =>
              intakeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Nowa sprawa
          </Button>
        }
      />

      {/* NOWA SPRAWA: dodaj umowę + dodaj potwierdzenia wpłat → system liczy. */}
      <div ref={intakeRef}>
        <NewCaseIntake
          createCase={createCase}
          onCreated={(id) =>
            navigate({ to: "/inwestor/windykacja/$caseId", params: { caseId: id } })
          }
        />
      </div>

      {/* Karty metryczne */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={FolderOpen} label="Sprawy w toku" value={String(metrics.activeCount)} />
        <Metric
          icon={Wallet}
          label="Do zapłaty teraz"
          value={formatPLN(metrics.dueNow)}
          sub={[
            `całe zadłużenie ${formatPLN(metrics.whole)}`,
            metrics.penalty > 0 ? `odsetki za opóźnienie ${formatPLN(metrics.penalty)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          title="Do zapłaty teraz: zaległe raty + odsetki za opóźnienie + koszty windykacyjne (po wypowiedzeniu — całe zadłużenie). Całe zadłużenie obejmuje także raty przyszłe."
        />
        <Metric
          icon={AlertTriangle}
          label="Wymaga działania dziś"
          value={String(metrics.todayCount)}
          accent="amber"
        />
        <Metric
          icon={Flame}
          label="Sprawy krytyczne"
          value={String(metrics.criticalCount)}
          accent="red"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Gavel className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              Brak spraw windykacyjnych. Dodaj umowę i potwierdzenia wpłat powyżej — system założy
              sprawę i obliczy należność.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={onSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Załaduj dane
                przykładowe
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Wymaga działania dziś */}
          {metrics.today.length > 0 && (
            <Card className="border-amber-300 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Wymaga działania dziś (
                  {metrics.today.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.today.map((c) => {
                  const s = suggestNextAction(
                    liveCaseLite(c, snapByCase[c.id] ?? null),
                    liteEvents(c.id),
                    nowISO(),
                  );
                  return (
                    <Link
                      key={c.id}
                      to="/inwestor/windykacja/$caseId"
                      params={{ caseId: c.id }}
                      className="flex items-center justify-between gap-3 rounded-md border p-3 hover:border-primary transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {c.loan?.borrower?.imie_nazwisko ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{s.text}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Filtr + lista spraw z wyliczeniem i szybkimi czynnościami */}
          <Card>
            <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Sprawy ({filtered.length})</CardTitle>
              <Select value={pathFilter} onValueChange={setPathFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie ścieżki</SelectItem>
                  {(Object.keys(PATH_LABELS) as WindPath[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PATH_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="space-y-3">
              {filtered.map((c) => (
                <CaseListRow
                  key={c.id}
                  c={c}
                  events={eventsByCase[c.id] ?? []}
                  lite={liteEvents(c.id)}
                  snap={snapByCase[c.id] ?? null}
                  onQuick={(kind) => openQuick(kind, c)}
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* „Telefon windykacyjny AI" / „Wyślij SMS" — czynność + rejestr + opłata wg umowy. */}
      {quick && quick.row.loan?.borrower && (
        <WindQuickContactDialog
          kind={quick.kind}
          caseId={quick.row.id}
          loan={quick.row.loan}
          borrower={quick.row.loan.borrower}
          amountDueNow={quick.amountDueNow}
          wholeDebt={quick.wholeDebt}
          onClose={() => setQuick(null)}
          onDone={() => {
            setQuick(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ── Wiersz sprawy: wyliczenie, propozycja, dwa przyciski ─────────────
function CaseListRow({
  c,
  events,
  lite,
  snap,
  onQuick,
}: {
  c: CaseRow;
  events: DashEvent[];
  lite: WindEventLite[];
  snap: WindDebtSnapshot | null;
  onQuick: (kind: WindQuickKind) => void;
}) {
  const last = events[0];
  const suggestion = suggestNextAction(liveCaseLite(c, snap), lite, nowISO());
  const dni = snap ? snap.dniOpoznienia : c.opoznienie_dni;
  const dueNow = snap ? snap.doZaplatyTeraz : Number(c.kwota_zalegla || 0);
  const registerCount = events.filter(
    (e) =>
      [
        "sms",
        "email",
        "telefon",
        "pismo_nadane",
        "dokument_wygenerowany",
        "czynnosc_sadowa",
      ].includes(e.typ) || Number(e.oplata) > 0,
  ).length;
  const feeSum = events.reduce((s, e) => s + (Number(e.oplata) || 0), 0);
  const closed = Boolean(c.data_zamkniecia);

  return (
    <div className="rounded-lg border p-3 space-y-3 hover:border-primary/60 transition-colors">
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-center">
        <div className="min-w-0">
          <Link
            to="/inwestor/windykacja/$caseId"
            params={{ caseId: c.id }}
            className="font-medium truncate hover:underline"
          >
            {c.loan?.borrower?.imie_nazwisko ?? "—"}
          </Link>
          <div className="text-xs text-muted-foreground truncate">
            Umowa {c.loan?.numer_umowy ?? "—"} ·{" "}
            {last ? `${last.tytul} (${formatDate(last.data_zdarzenia)})` : "brak zdarzeń"}
          </div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums">{formatZl(dueNow)}</div>
          <div className="text-[11px] text-muted-foreground">
            {snap?.wypowiedziana ? "do zapłaty teraz (umowa wypowiedziana)" : "do zapłaty teraz"}
            {snap && snap.calosc > dueNow + 0.005
              ? ` · całe zadłużenie ${formatZl(snap.calosc)}`
              : ""}
          </div>
          <div className={`text-xs font-medium ${delayColorClass(dni)}`}>
            opóźnienie {dni} dni
            {snap && snap.odsetkiZaOpoznienie > 0
              ? ` · odsetki za opóźnienie ${formatZl(snap.odsetkiZaOpoznienie)}`
              : ""}
          </div>
          {snap?.zrodlo === "harmonogram" && (
            <div className="text-[11px] text-muted-foreground">
              {snap.najstarszaZalegla
                ? `najstarsza zaległa rata: ${formatDataPL(snap.najstarszaZalegla)}`
                : snap.najblizszaRata
                  ? `następna rata: ${formatDataPL(snap.najblizszaRata)}`
                  : "wszystkie raty wymagalne"}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 items-start">
          <Badge className={PATH_BADGE[c.sciezka]}>{PATH_LABELS[c.sciezka]}</Badge>
          <span className="text-xs text-muted-foreground">{stageLabel(c.sciezka, c.etap)}</span>
        </div>
        <Badge className={PRIORITY_BADGE[c.priorytet]}>{c.priorytet}</Badge>
      </div>

      {/* Proponowane dalsze działanie (procedura) */}
      <div
        className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
          suggestion.urgent
            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
            : "bg-muted/40"
        }`}
      >
        <Lightbulb
          className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${suggestion.urgent ? "text-amber-600" : "text-primary"}`}
        />
        <span>{suggestion.text}</span>
      </div>

      {/* Dwa przyciski + stan rejestru czynności */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={closed} onClick={() => onQuick("botcall")}>
          <Phone className="h-4 w-4 mr-1.5" /> Telefon windykacyjny AI
        </Button>
        <Button size="sm" variant="outline" disabled={closed} onClick={() => onQuick("sms")}>
          <MessageSquare className="h-4 w-4 mr-1.5" /> Wyślij SMS
        </Button>
        <Link
          to="/inwestor/windykacja/$caseId"
          params={{ caseId: c.id }}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Gavel className="h-3.5 w-3.5" /> Rejestr czynności: {registerCount}
          {feeSum > 0 ? ` · opłaty ${formatPLN(feeSum)}` : ""}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  title,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  accent?: "amber" | "red";
  title?: string;
}) {
  const color =
    accent === "amber" ? "text-amber-600" : accent === "red" ? "text-red-600" : "text-primary";
  return (
    <Card title={title}>
      <CardContent className="pt-5 flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-lg bg-muted ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold tabular-nums truncate">{value}</div>
          {sub ? <div className="text-[11px] text-muted-foreground truncate">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ── NOWA SPRAWA: dodaj umowę → dodaj potwierdzenia wpłat → system liczy ──
type FeeForm = Record<WindFeeKind, string> & {
  brak_oplat: boolean;
  zrodlo: "umowa" | "recznie" | null;
};

const EMPTY_FEES: FeeForm = {
  sms: "",
  email: "",
  telefon: "",
  pismo: "",
  brak_oplat: false,
  zrodlo: null,
};

type WindPriorityForm = "niski" | "sredni" | "wysoki" | "krytyczny";

/** Formularz nowej sprawy — wszystkie pola jako tekst (kwoty także „7 868,48"). */
type IntakeForm = {
  imie_nazwisko: string;
  typ: "osoba_fizyczna" | "firma";
  pesel: string;
  nip: string;
  email: string;
  telefon: string;
  adres_zamieszkania: string;
  pozyczkodawca: string;
  numer_umowy: string;
  data_umowy: string;
  kwota_pozyczki: string;
  kwota_calkowita: string;
  prowizja: string;
  termin_splaty: string;
  kwota_zalegla: string;
  numer_kw: string;
  kwota_hipoteki: string;
  akt_notarialny_777: string;
  kwota_777: string;
  rachunek_splaty: string;
  oprocentowanie_roczne: string;
  /** Wpisana stopa — używana, gdy źródło stopy ≠ „domyslna". */
  stopa_odsetek_max: string;
  /** Ścieżka wybrana ręcznie — używana, gdy użytkownik zmienił sugerowaną. */
  sciezka: WindPath;
  priorytet: WindPriorityForm;
};

const EMPTY_INTAKE: IntakeForm = {
  imie_nazwisko: "",
  typ: "osoba_fizyczna",
  pesel: "",
  nip: "",
  email: "",
  telefon: "",
  adres_zamieszkania: "",
  pozyczkodawca: "",
  numer_umowy: "",
  data_umowy: "",
  kwota_pozyczki: "",
  kwota_calkowita: "",
  prowizja: "",
  termin_splaty: "",
  kwota_zalegla: "",
  numer_kw: "",
  kwota_hipoteki: "",
  akt_notarialny_777: "",
  kwota_777: "",
  rachunek_splaty: "",
  oprocentowanie_roczne: "",
  stopa_odsetek_max: "",
  sciezka: "miekka",
  priorytet: "sredni",
};

/** Skąd stopa odsetek za opóźnienie: maksymalne z dnia umowy, z umowy (OCR) albo wpisana. */
type StopaZrodlo = "domyslna" | "umowa" | "recznie";

/** Pierwszy etap ścieżki (formularz zakłada sprawę na początku ścieżki). */
function firstStage(sciezka: WindPath): string {
  return sciezka === "miekka"
    ? "kontakt_wstepny"
    : sciezka === "standardowa"
      ? "wezwanie"
      : sciezka === "twarda"
        ? "wypowiedzenie"
        : "ocena_przeslanek";
}

function NewCaseIntake({
  onCreated,
  createCase,
}: {
  onCreated: (caseId: string) => void;
  createCase: ReturnType<typeof useServerFn<typeof createWindCase>>;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [payments, setPayments] = useState<PaymentScan[]>([]);
  const [fees, setFees] = useState<FeeForm>(EMPTY_FEES);
  const [f, setF] = useState<IntakeForm>(EMPTY_INTAKE);
  const [stopaZrodlo, setStopaZrodlo] = useState<StopaZrodlo>("domyslna");
  const [sciezkaManual, setSciezkaManual] = useState(false);
  const [raty, setRaty] = useState<RataForm[]>([]);
  const [generator, setGenerator] = useState<GeneratorForm>(EMPTY_GENERATOR);
  const [ratyZOcr, setRatyZOcr] = useState<"tabela" | "parametry" | null>(null);
  const [ocrUwagi, setOcrUwagi] = useState<string[]>([]);
  const upd = <K extends keyof IntakeForm>(k: K, v: IntakeForm[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const updFee = (k: WindFeeKind, v: string) =>
    setFees((p) => ({ ...p, [k]: v, zrodlo: p.zrodlo ?? "recznie" }));

  const today = todayISO();

  // Stopa odsetek za opóźnienie: domyślnie odsetki maksymalne za opóźnienie
  // z dnia zawarcia umowy (WIN_01) — przeliczana przy zmianie daty umowy,
  // dopóki użytkownik nie wpisze własnej (albo nie odczytano jej z umowy).
  const stopaMaks = defaultDelayRate(parseDataISO(f.data_umowy));
  const stopaTxt = stopaZrodlo === "domyslna" ? kwotaDoPola(stopaMaks) : f.stopa_odsetek_max;
  const stopaWpisana = parseKwota(stopaTxt);
  // Jak serwer: 0 / puste = odsetki maksymalne z dnia umowy.
  const stopaEfektywna = stopaWpisana != null && stopaWpisana > 0 ? stopaWpisana : stopaMaks;

  // Wpłaty z potwierdzeń (te same, które pójdą do serwera).
  const wplatyLive = useMemo(
    () =>
      payments
        .map((p) => ({ paid_on: parseDataISO(p.data) ?? "", amount: parseKwota(p.kwota) ?? 0 }))
        .filter((p) => p.paid_on && p.amount > 0),
    [payments],
  );
  const sumaWplat = wplatyLive.reduce((s, p) => s + p.amount, 0);

  // Harmonogram rat → zaległość na dziś tym samym silnikiem co serwer
  // (computeZaleglosc): niezapłacone raty wymagalne po zaliczeniu wpłat.
  const { harmonogram, bledy: bledyRat } = useMemo(() => formToHarmonogram(raty), [raty]);
  const maRaty = hasRaty(raty);
  const wynik = useMemo(
    () =>
      harmonogram
        ? computeZaleglosc({
            harmonogram,
            payments: wplatyLive,
            asOf: today,
            stopaUmowna: stopaEfektywna,
          })
        : null,
    [harmonogram, wplatyLive, today, stopaEfektywna],
  );

  // Rozliczenie wpłat do dziś: część pokryła odsetki za opóźnienie / koszty
  // albo raty przyszłe — pokazujemy to, żeby rachunek zgadzał się co do grosza.
  const rozl = wynik ? rozliczenieWplat(wynik, wplatyLive) : null;

  // Model jednoterminowy (bez harmonogramu): kwota do zwrotu − wpłaty.
  const naleznoscBazowa = parseKwota(f.kwota_calkowita) || parseKwota(f.kwota_pozyczki) || 0;
  const saldoPoWplatach = Math.max(0, naleznoscBazowa - sumaWplat);

  // Ścieżka: sugerowana z opóźnienia (z rat albo od terminu spłaty), dopóki
  // użytkownik nie wybierze innej.
  const dni = wynik ? wynik.dniOpoznienia : daysSinceDue(parseDataISO(f.termin_splaty), today);
  const sugerowana = recommendedPathForDelay(dni);
  const sciezka: WindPath = sciezkaManual ? f.sciezka : sugerowana;

  const rachunekBledny =
    f.rachunek_splaty.trim() !== "" && formatRachunekSplaty(f.rachunek_splaty) == null;
  const ostatniaRata = harmonogram?.[harmonogram.length - 1]?.termin ?? null;
  const hasContract = Boolean(contractFile) || Boolean(f.imie_nazwisko.trim()) || maRaty;

  const feeTablePayload = () => {
    const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s) || 0));
    const t = {
      sms: num(fees.sms),
      email: num(fees.email),
      telefon: num(fees.telefon),
      pismo: num(fees.pismo),
      brak_oplat: fees.brak_oplat,
      zrodlo: fees.zrodlo,
    };
    return normalizeWindFeeTable(t) ? t : null;
  };

  const uploadToStorage = async (file: File, label: string): Promise<string | null> => {
    if (!user?.id) return null;
    const safe = file.name.replace(/[^\w.-]+/g, "_");
    const path = `windykacja/${user.id}/nowa/${Date.now()}_${label}_${safe}`;
    const { error } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      toast.error(`Upload (${label}): ${error.message}`);
      return null;
    }
    return path;
  };

  const reset = () => {
    setContractFile(null);
    setPayments([]);
    setFees(EMPTY_FEES);
    setShowDetails(false);
    setF((p) => ({ ...EMPTY_INTAKE, priorytet: p.priorytet }));
    setStopaZrodlo("domyslna");
    setSciezkaManual(false);
    setRaty([]);
    setGenerator(EMPTY_GENERATOR);
    setRatyZOcr(null);
    setOcrUwagi([]);
  };

  // Odczyt umowy (OCR) → formularz. Pola, których umowa nie podaje, zostają.
  const applyContract = (d: WindContractData) => {
    const uwagi = [...(d.ostrzezenia ?? [])];
    // Odsetki za opóźnienie: liczba z umowy, nie wyżej niż maksymalne z dnia
    // umowy; „dwukrotność odsetek ustawowych" (null) → maksymalne.
    let stopaUmowy: string | null = null;
    if (d.odsetki_za_opoznienie != null && d.odsetki_za_opoznienie > 0) {
      const maks = defaultDelayRate(d.data_umowy ?? parseDataISO(f.data_umowy));
      const stopa = Math.min(d.odsetki_za_opoznienie, maks);
      if (d.odsetki_za_opoznienie > maks + 0.001) {
        uwagi.push(
          `Odsetki za opóźnienie z umowy (${formatStopa(d.odsetki_za_opoznienie)}%) przekraczają odsetki maksymalne z dnia umowy — przyjęto ${formatStopa(maks)}%.`,
        );
      }
      stopaUmowy = kwotaDoPola(stopa);
    }
    const kw = (n: number | null | undefined, prev: string) => (n != null ? kwotaDoPola(n) : prev);
    setF((p) => ({
      ...p,
      imie_nazwisko: d.imie_nazwisko ?? p.imie_nazwisko,
      typ: d.typ ?? p.typ,
      pesel: d.pesel ?? p.pesel,
      nip: d.nip ?? p.nip,
      email: d.email ?? p.email,
      telefon: d.telefon ?? p.telefon,
      adres_zamieszkania: d.adres ?? p.adres_zamieszkania,
      pozyczkodawca: d.pozyczkodawca ?? p.pozyczkodawca,
      numer_umowy: d.numer_umowy ?? p.numer_umowy,
      data_umowy: d.data_umowy ?? p.data_umowy,
      kwota_pozyczki: kw(d.kwota_pozyczki, p.kwota_pozyczki),
      kwota_calkowita: kw(d.kwota_calkowita, p.kwota_calkowita),
      prowizja: kw(d.prowizja, p.prowizja),
      termin_splaty: d.termin_splaty ?? p.termin_splaty,
      numer_kw: d.numer_kw ?? p.numer_kw,
      kwota_hipoteki: kw(d.kwota_hipoteki, p.kwota_hipoteki),
      akt_notarialny_777: d.akt_notarialny_777 ?? p.akt_notarialny_777,
      kwota_777: kw(d.kwota_777, p.kwota_777),
      rachunek_splaty: d.rachunek_splaty ?? p.rachunek_splaty,
      oprocentowanie_roczne: kw(d.oprocentowanie_roczne, p.oprocentowanie_roczne),
      stopa_odsetek_max: stopaUmowy ?? p.stopa_odsetek_max,
    }));
    if (stopaUmowy != null) setStopaZrodlo("umowa");
    else setStopaZrodlo((z) => (z === "recznie" ? z : "domyslna"));

    // Harmonogram rat (Zał. 1) — z tabeli w umowie albo z parametrów.
    const maParametry = d.data_pierwszej_raty != null || d.liczba_rat != null;
    if (d.harmonogram && d.harmonogram.length > 0) {
      setRaty(harmonogramToForm(d.harmonogram));
      setRatyZOcr(d.harmonogram_zrodlo ?? "tabela");
      setGenerator(maParametry ? generatorFromParams(d) : generatorFromHarmonogram(d.harmonogram));
    } else {
      if (maParametry) setGenerator(generatorFromParams(d));
      uwagi.push(
        "W umowie nie odczytano harmonogramu rat — wygeneruj raty z parametrów umowy albo przepisz Załącznik nr 1.",
      );
    }
    setOcrUwagi(uwagi);

    // Tabela opłat windykacyjnych z umowy — podstawa naliczania w rejestrze.
    const t = d.oplaty_windykacyjne;
    if (t) {
      setFees({
        sms: t.sms != null ? String(t.sms) : "",
        email: t.email != null ? String(t.email) : "",
        telefon: t.telefon != null ? String(t.telefon) : "",
        pismo: t.pismo != null ? String(t.pismo) : "",
        brak_oplat: Boolean(t.brak_oplat),
        zrodlo: "umowa",
      });
    }
  };

  const submit = async () => {
    if (!f.imie_nazwisko.trim()) {
      setShowDetails(true);
      toast.error("Podaj dłużnika (dodaj umowę albo wpisz dane ręcznie)");
      return;
    }
    if (bledyRat.length) {
      toast.error(`Popraw harmonogram rat: ${bledyRat[0]}`);
      return;
    }
    if (rachunekBledny) {
      setShowDetails(true);
      toast.error("Rachunek do spłaty: podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL.");
      return;
    }
    // Wpłaty z kwotą > 0 muszą mieć datę — od niej zależy rozliczenie rat
    // i odsetek za opóźnienie.
    const doWyslania = payments
      .map((p) => ({ p, kwota: parseKwota(p.kwota) ?? 0, data: parseDataISO(p.data) }))
      .filter((w) => w.kwota > 0);
    if (doWyslania.some((w) => !w.data)) {
      toast.error("Podaj datę każdej wpłaty (z potwierdzenia przelewu).");
      return;
    }
    setBusy(true);
    try {
      // 1) Skan umowy + potwierdzenia przelewów → Storage (dowody w aktach).
      const umowaUrl = contractFile ? await uploadToStorage(contractFile, "umowa") : null;
      const wplaty: Array<{ kwota: number; data: string; zalacznik_url?: string | null }> = [];
      for (const w of doWyslania) {
        const url = await uploadToStorage(w.p.file, "wplata");
        wplaty.push({ kwota: w.kwota, data: w.data as string, zalacznik_url: url });
      }

      // 2) Utworzenie sprawy — serwer liczy zaległość z harmonogramu i wpłat
      //    (albo z kwoty do zwrotu w modelu jednoterminowym), a opłaty
      //    windykacyjne nalicza wg tabeli z umowy. Kwoty wysyłamy jako tekst
      //    — serwer czyta też zapis „7 868,48" i zwraca błąd z nazwą pola.
      const res = await createCase({
        data: {
          imie_nazwisko: f.imie_nazwisko.trim(),
          typ: f.typ,
          pesel: f.pesel.trim() || null,
          nip: f.nip.trim() || null,
          email: f.email.trim() || null,
          telefon: f.telefon.trim() || null,
          adres_zamieszkania: f.adres_zamieszkania.trim() || null,
          adres_do_doreczen: f.adres_zamieszkania.trim() || null,
          email_zgoda_doreczenia: false,
          pozyczkodawca: f.pozyczkodawca,
          numer_umowy: f.numer_umowy.trim() || null,
          data_umowy: f.data_umowy,
          kwota_pozyczki: f.kwota_pozyczki,
          kwota_calkowita: f.kwota_calkowita,
          prowizja: f.prowizja,
          termin_splaty: f.termin_splaty,
          numer_kw: f.numer_kw.trim() || null,
          kwota_hipoteki: f.kwota_hipoteki,
          akt_notarialny_777: f.akt_notarialny_777,
          kwota_777: f.kwota_777,
          rachunek_splaty: f.rachunek_splaty,
          oprocentowanie_roczne: f.oprocentowanie_roczne,
          stopa_odsetek_max: stopaTxt,
          oplaty_windykacyjne: feeTablePayload(),
          harmonogram: harmonogram ?? null,
          // Z harmonogramem kwota zaległa liczona z rat (serwer ignoruje pole).
          kwota_zalegla: harmonogram ? 0 : f.kwota_zalegla,
          sciezka,
          etap: firstStage(sciezka),
          priorytet: f.priorytet,
          umowa_url: umowaUrl,
          wplaty,
        },
      });
      if (res.ostrzezenie) toast.warning(res.ostrzezenie);
      toast.success(
        harmonogram
          ? `Utworzono sprawę — zaległe raty na dziś: ${formatZl(res.kwota_zalegla)}`
          : "Utworzono sprawę — należność wyliczona z umowy i wpłat",
      );
      reset();
      onCreated(res.caseId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć sprawy");
    } finally {
      setBusy(false);
    }
  };

  const feePreview = (["sms", "telefon", "pismo"] as WindFeeKind[])
    .map((k) => {
      const info = windFeeForAction(normalizeWindFeeTable(feeTablePayload()), k);
      return `${WIND_FEE_LABELS[k].split(" (")[0].toLowerCase()} ${formatPLN(info.fee)}`;
    })
    .join(" · ");
  const feeNote = (
    <>
      Opłaty wg umowy: {feePreview}
      {fees.zrodlo === "umowa" ? " (odczytane z umowy)" : " (domyślne — możesz poprawić)"}.
    </>
  );

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Nowa sprawa windykacyjna
        </CardTitle>
        <CardDescription>
          Dodaj umowę i potwierdzenia wpłat. Na tej podstawie system obliczy zaległe raty, odsetki
          za opóźnienie (nie wyższe niż maksymalne, art. 481 § 2¹ k.c.) i kwotę do zapłaty teraz,
          zaproponuje ścieżkę i dalsze działania — a każdy telefon windykacyjny AI i SMS dopisze do
          rejestru czynności z opłatą zgodnie z umową.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* KROK 1: DODAJ UMOWĘ */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                1
              </span>
              <FileText className="h-4 w-4 text-primary" /> Dodaj umowę
            </div>
            <ContractScanField onFile={setContractFile} onExtract={applyContract} />
          </div>

          {/* KROK 2: DODAJ POTWIERDZENIA WPŁAT */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                2
              </span>
              <ScanLine className="h-4 w-4 text-primary" /> Dodaj potwierdzenia wpłat
            </div>
            <PaymentScansField payments={payments} onChange={setPayments} />
          </div>
        </div>

        {/* Uwagi z odczytu umowy — do sprawdzenia przez inwestora. */}
        {ocrUwagi.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Sprawdź dane odczytane z umowy
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {ocrUwagi.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {/* KROK 3: HARMONOGRAM RAT — podstawa wyliczenia zaległości. */}
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              3
            </span>
            <CalendarDays className="h-4 w-4 text-primary" /> Harmonogram rat (Załącznik nr 1 do
            umowy)
            {ratyZOcr && maRaty ? (
              <Badge variant="secondary" className="font-normal">
                {ratyZOcr === "tabela"
                  ? "odczytany z umowy"
                  : "wygenerowany z parametrów umowy — sprawdź"}
              </Badge>
            ) : null}
          </div>
          <HarmonogramEditor
            rows={raty}
            onChange={setRaty}
            generator={generator}
            onGeneratorChange={setGenerator}
            hint="Zaległość to suma rat, których termin minął, a które nie zostały zapłacone (po zaliczeniu wpłat) — nie całe saldo pożyczki. Opóźnienie liczymy od najstarszej niezapłaconej raty."
          />
        </div>

        {/* Co policzy system */}
        <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <Calculator className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span>
            Z harmonogramu i wpłat system obliczy zaległe raty, odsetki za opóźnienie od każdej
            zaległej raty (stopa z umowy, w każdym dniu nie wyższa niż odsetki maksymalne — art. 481
            § 2¹ k.c.) i kwotę do zapłaty teraz. Wpłaty zalicza wg umowy (WIN_04): prowizja z rat
            wymagalnych → koszty windykacyjne → odsetki za opóźnienie → odsetki umowne → kapitał (od
            najstarszej raty). Opłaty za czynności (SMS, telefon, wezwanie) nalicza według tabeli
            opłat z umowy.
          </span>
        </div>

        {/* Wyliczenie na żywo — zaległość z harmonogramu albo model jednoterminowy. */}
        {wynik ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zaległość z harmonogramu na {formatDataPL(wynik.asOf)}
            </div>
            <IntakeRow
              label={`Raty wymagalne do dziś (${wynik.liczbaRatWymagalnych} z ${wynik.raty.length})`}
              value={formatZl(wynik.sumaWymagalna)}
            />
            {rozl && (
              <>
                <IntakeRow
                  label={`Wpłaty klienta do dziś (${rozl.liczba})`}
                  value={`− ${formatZl(rozl.suma)}`}
                />
                {(rozl.naOdsetkiIKoszty > 0 || rozl.naRatyPrzyszle > 0 || rozl.nadplata > 0) && (
                  <p className="text-right text-[11px] text-muted-foreground">
                    {[
                      rozl.naOdsetkiIKoszty > 0
                        ? `w tym na odsetki za opóźnienie i koszty ${formatZl(rozl.naOdsetkiIKoszty)}`
                        : null,
                      rozl.naRatyPrzyszle > 0
                        ? `na raty przyszłe ${formatZl(rozl.naRatyPrzyszle)}`
                        : null,
                      rozl.nadplata > 0 ? `nadpłata ${formatZl(rozl.nadplata)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </>
            )}
            <IntakeRow label="Zaległe raty (kwota zaległa)" value={formatZl(wynik.zaleglosc)} />
            <IntakeRow
              label={`Odsetki za opóźnienie (${formatStopa(stopaEfektywna)}% rocznie, nie więcej niż maks.)`}
              value={formatZl(wynik.odsetkiZaOpoznienie)}
            />
            <IntakeRow
              label="Do zapłaty teraz"
              value={formatZl(wynik.doZaplatyTeraz)}
              strong
              border
            />
            <IntakeRow
              label={`Raty przyszłe (niewymagalne)${
                wynik.najblizszaRata ? ` — najbliższa ${formatDataPL(wynik.najblizszaRata)}` : ""
              }`}
              value={formatZl(wynik.pozostaleRatyPrzyszle)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {wynik.najstarszaZalegla ? (
                <>
                  Opóźnienie: <span className={delayColorClass(dni)}>{dni} dni</span> — od
                  najstarszej zaległej raty ({formatDataPL(wynik.najstarszaZalegla)}). Sugerowana
                  ścieżka: {PATH_LABELS[sugerowana]}.{" "}
                </>
              ) : (
                <>Brak zaległych rat na dziś — sugerowana ścieżka: {PATH_LABELS[sugerowana]}. </>
              )}
              {feeNote}
            </p>
          </div>
        ) : !maRaty && naleznoscBazowa > 0 ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <IntakeRow label="Kwota do zwrotu (z umowy)" value={formatZl(naleznoscBazowa)} />
            <IntakeRow
              label={`Wpłaty klienta (${wplatyLive.length})`}
              value={`− ${formatZl(sumaWplat)}`}
            />
            <IntakeRow
              label="Pozostała należność (bez odsetek)"
              value={formatZl(saldoPoWplatach)}
              strong
              border
            />
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
              Dodaj harmonogram rat, aby liczyć zaległość z rat. Bez harmonogramu odsetki za
              opóźnienie liczone są od kwoty zaległej sprawy, dopiero po terminie spłaty.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Odsetki za opóźnienie ({formatStopa(stopaEfektywna)}% rocznie) system doliczy w karcie
              sprawy. {feeNote}
            </p>
          </div>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center text-muted-foreground"
          onClick={() => setShowDetails((s) => !s)}
        >
          {showDetails
            ? "Ukryj dane szczegółowe"
            : "Sprawdź / popraw dane odczytane z umowy i opłaty windykacyjne"}
        </Button>

        <div className={showDetails ? "grid sm:grid-cols-2 gap-3" : "hidden"}>
          <Fld label="Dłużnik / firma" className="sm:col-span-2">
            <Input value={f.imie_nazwisko} onChange={(e) => upd("imie_nazwisko", e.target.value)} />
          </Fld>
          <Fld
            label="Typ"
            hint="Jednoosobowa działalność (PESEL + NIP) to osoba fizyczna; „firma” — spółki i osoby prawne."
          >
            <Select
              value={f.typ}
              onValueChange={(v) => upd("typ", v as "osoba_fizyczna" | "firma")}
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
          <Fld label="PESEL">
            <Input
              inputMode="numeric"
              value={f.pesel}
              onChange={(e) => upd("pesel", e.target.value)}
            />
          </Fld>
          <Fld label="NIP">
            <Input inputMode="numeric" value={f.nip} onChange={(e) => upd("nip", e.target.value)} />
          </Fld>
          <Fld label="E-mail">
            <Input value={f.email} onChange={(e) => upd("email", e.target.value)} />
          </Fld>
          <Fld label="Telefon">
            <Input value={f.telefon} onChange={(e) => upd("telefon", e.target.value)} />
          </Fld>
          <Fld label="Adres" className="sm:col-span-2">
            <Input
              value={f.adres_zamieszkania}
              onChange={(e) => upd("adres_zamieszkania", e.target.value)}
            />
          </Fld>
          <Fld
            label="Pożyczkodawca (z umowy)"
            className="sm:col-span-2"
            hint="Strona udzielająca pożyczki — agent AI dzwoni w jej imieniu."
          >
            <Input
              value={f.pozyczkodawca}
              placeholder="np. Finance You sp. z o.o."
              onChange={(e) => upd("pozyczkodawca", e.target.value)}
            />
          </Fld>
          <Fld label="Numer umowy">
            <Input value={f.numer_umowy} onChange={(e) => upd("numer_umowy", e.target.value)} />
          </Fld>
          <Fld label="Data umowy">
            <Input
              type="date"
              value={f.data_umowy}
              onChange={(e) => upd("data_umowy", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota wypłacona (na rękę) (zł)">
            <Input
              inputMode="decimal"
              value={f.kwota_pozyczki}
              onChange={(e) => upd("kwota_pozyczki", e.target.value)}
            />
          </Fld>
          <Fld label="Prowizja Finance You (potrącona z wypłaty) (zł)">
            <Input
              inputMode="decimal"
              value={f.prowizja}
              onChange={(e) => upd("prowizja", e.target.value)}
            />
          </Fld>
          <Fld
            label="Kwota do zwrotu bez odsetek (kwota pożyczki + prowizja pożyczkodawcy) (zł)"
            className="sm:col-span-2"
            hint="Bez odsetek umownych — nie wpisuj tu sumy rat."
          >
            <Input
              inputMode="decimal"
              value={f.kwota_calkowita}
              onChange={(e) => upd("kwota_calkowita", e.target.value)}
            />
          </Fld>
          <Fld
            label="Termin spłaty (ostatnia rata)"
            hint={
              ostatniaRata
                ? `Puste = termin ostatniej raty z harmonogramu (${formatDataPL(ostatniaRata)}).`
                : undefined
            }
          >
            <Input
              type="date"
              value={f.termin_splaty}
              onChange={(e) => upd("termin_splaty", e.target.value)}
            />
          </Fld>
          <Fld label="Oprocentowanie kapitałowe (% rocznie)">
            <Input
              inputMode="decimal"
              value={f.oprocentowanie_roczne}
              onChange={(e) => upd("oprocentowanie_roczne", e.target.value)}
            />
          </Fld>
          <Fld
            label="Odsetki za opóźnienie wg umowy (% rocznie)"
            className="sm:col-span-2"
            hint={
              <>
                {stopaZrodlo === "domyslna"
                  ? `Odsetki maksymalne za opóźnienie z dnia umowy (${formatStopa(stopaMaks)}%) — zmień, jeśli umowa przewiduje niższe.`
                  : stopaZrodlo === "umowa"
                    ? "Odczytane z umowy."
                    : `Wpisane ręcznie. Puste = odsetki maksymalne z dnia umowy (${formatStopa(stopaMaks)}%).`}{" "}
                W każdym dniu kalkulator stosuje nie więcej niż odsetki maksymalne za opóźnienie z
                tego dnia.
                {stopaZrodlo !== "domyslna" ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setStopaZrodlo("domyslna")}
                    >
                      Przywróć maksymalne
                    </button>
                  </>
                ) : null}
              </>
            }
          >
            <Input
              inputMode="decimal"
              value={stopaTxt}
              onChange={(e) => {
                upd("stopa_odsetek_max", e.target.value);
                setStopaZrodlo("recznie");
              }}
            />
          </Fld>
          <Fld
            label="Kwota zaległa (po wpłatach) (zł)"
            className="sm:col-span-2"
            hint={
              harmonogram
                ? "Liczona z harmonogramu rat (raty po terminie minus wpłaty) — pole nieaktywne."
                : `Podstawa odsetek za opóźnienie w modelu bez harmonogramu. Wpisz kwotę już po odjęciu wpłat; puste = cała pozostała należność${
                    saldoPoWplatach > 0 ? ` (${formatZl(saldoPoWplatach)})` : ""
                  }.`
            }
          >
            <Input
              inputMode="decimal"
              disabled={Boolean(harmonogram)}
              value={harmonogram ? "" : f.kwota_zalegla}
              placeholder={
                harmonogram
                  ? wynik
                    ? kwotaDoPola(wynik.zaleglosc)
                    : ""
                  : saldoPoWplatach > 0
                    ? kwotaDoPola(saldoPoWplatach)
                    : ""
              }
              onChange={(e) => upd("kwota_zalegla", e.target.value)}
            />
          </Fld>
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
              value={f.rachunek_splaty}
              placeholder="NN NNNN NNNN NNNN NNNN NNNN NNNN"
              onChange={(e) => upd("rachunek_splaty", e.target.value)}
              onBlur={() => {
                const r = formatRachunekSplaty(f.rachunek_splaty);
                if (r) upd("rachunek_splaty", r);
              }}
            />
          </Fld>
          <Fld label="Numer KW">
            <Input value={f.numer_kw} onChange={(e) => upd("numer_kw", e.target.value)} />
          </Fld>
          <Fld label="Kwota hipoteki (zł)">
            <Input
              inputMode="decimal"
              value={f.kwota_hipoteki}
              onChange={(e) => upd("kwota_hipoteki", e.target.value)}
            />
          </Fld>
          <Fld
            label="Akt notarialny — poddanie się egzekucji (art. 777 k.p.c.)"
            hint="Np. Rep. A nr 1234/2026, notariusz …"
          >
            <Input
              value={f.akt_notarialny_777}
              onChange={(e) => upd("akt_notarialny_777", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota z aktu 777 (zł)">
            <Input
              inputMode="decimal"
              value={f.kwota_777}
              onChange={(e) => upd("kwota_777", e.target.value)}
            />
          </Fld>
          <Fld
            label="Ścieżka"
            hint={
              sciezkaManual && f.sciezka !== sugerowana ? (
                <>
                  Sugerowana przy opóźnieniu {dni} dni: {PATH_LABELS[sugerowana]}.{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setSciezkaManual(false)}
                  >
                    Przywróć sugerowaną
                  </button>
                </>
              ) : (
                `Dobrana do opóźnienia (${dni} dni) — możesz zmienić.`
              )
            }
          >
            <Select
              value={sciezka}
              onValueChange={(v) => {
                upd("sciezka", v as WindPath);
                setSciezkaManual(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PATH_LABELS) as WindPath[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PATH_LABELS[p]}
                    {p === sugerowana ? " (sugerowana)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Priorytet">
            <Select
              value={f.priorytet}
              onValueChange={(v) => upd("priorytet", v as WindPriorityForm)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="niski">Niski</SelectItem>
                <SelectItem value="sredni">Średni</SelectItem>
                <SelectItem value="wysoki">Wysoki</SelectItem>
                <SelectItem value="krytyczny">Krytyczny</SelectItem>
              </SelectContent>
            </Select>
          </Fld>

          {/* OPŁATY ZA CZYNNOŚCI WINDYKACYJNE WG UMOWY */}
          <div className="sm:col-span-2 rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Gavel className="h-4 w-4 text-muted-foreground" /> Opłaty za czynności windykacyjne
              wg umowy (zł)
              {fees.zrodlo === "umowa" ? (
                <Badge variant="secondary" className="font-normal">
                  odczytane z umowy
                </Badge>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Puste pole = umowa nie określa opłaty za tę czynność (system podpowie domyślną: SMS{" "}
              {WIND_FEE_DEFAULTS.sms} zł, e-mail {WIND_FEE_DEFAULTS.email} zł, telefon{" "}
              {WIND_FEE_DEFAULTS.telefon} zł, pismo {WIND_FEE_DEFAULTS.pismo} zł). Opłaty muszą mieć
              podstawę w umowie pożyczki.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(WIND_FEE_LABELS) as WindFeeKind[]).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-[11px]">{WIND_FEE_LABELS[k].split(" (")[0]}</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={fees.brak_oplat}
                    value={fees[k]}
                    placeholder={String(WIND_FEE_DEFAULTS[k])}
                    onChange={(e) => updFee(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="wind-brak-oplat"
                checked={fees.brak_oplat}
                onCheckedChange={(v) =>
                  setFees((p) => ({ ...p, brak_oplat: v === true, zrodlo: p.zrodlo ?? "recznie" }))
                }
              />
              <Label htmlFor="wind-brak-oplat" className="text-xs font-normal">
                Umowa nie przewiduje opłat za czynności windykacyjne (0 zł)
              </Label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {(hasContract || payments.length > 0) && (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Wyczyść
            </Button>
          )}
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4 mr-1" />
            )}
            Utwórz sprawę i oblicz należność
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Wiersz wyliczenia w formularzu nowej sprawy. */
function IntakeRow({
  label,
  value,
  strong,
  border,
}: {
  label: string;
  value: string;
  strong?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${strong ? "font-semibold" : ""} ${
        border ? "mt-1 border-t pt-1" : ""
      }`}
    >
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
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
