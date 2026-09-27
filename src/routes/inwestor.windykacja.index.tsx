// PANEL WINDYKACJI — jeden prosty przepływ:
//   1. „Dodaj umowę" (zdjęcie/PDF → system odczytuje dłużnika, kwoty, terminy
//      i tabelę opłat windykacyjnych z umowy),
//   2. „Dodaj potwierdzenia wpłat" (system odczytuje kwoty i daty),
//   → na tej podstawie system oblicza odsetki karne (maksymalne za
//     opóźnienie, art. 481 § 2¹ k.c.), pozostałą należność i proponuje
//     dalsze działania.
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
  type WindPath,
  type WindEventLite,
} from "@/lib/windykacja-procedure";
import {
  calculateDebt,
  splitInvestorPrincipal,
  DEFAULT_MAX_DELAY_RATE,
  type DebtCalcResult,
} from "@/lib/debt-collection-math";
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
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Ten sam silnik co karta sprawy: zadłużenie na dziś z odsetkami karnymi i kosztami. */
function computeCaseDebt(c: CaseRow, events: DashEvent[]): DebtCalcResult | null {
  const loan = c.loan;
  if (!loan) return null;
  const payments = events
    .filter((e) => e.typ === "wplata")
    .map((e) => ({
      paid_on: e.data_zdarzenia.slice(0, 10),
      amount: Number((e.metadata as { kwota?: number } | null)?.kwota ?? 0),
    }));
  const actionFees = events
    .filter((e) => Number(e.oplata) > 0)
    .map((e) => ({ action_date: e.data_zdarzenia.slice(0, 10), fee: Number(e.oplata) }));
  const terminated = Boolean(loan.data_wypowiedzenia) || loan.status === "wypowiedziana";
  const { bearing, investorCommission } = splitInvestorPrincipal(loan);
  return calculateDebt({
    principalAmount: bearing,
    interestExemptPrincipal: investorCommission,
    payoutDate: loan.data_umowy,
    dueDate: loan.termin_splaty,
    contractualAnnualRate: Number(loan.oprocentowanie_roczne || 0),
    penaltyAnnualRate: Number(loan.stopa_odsetek_max || 0),
    maxStatutoryRate: Number(loan.stopa_odsetek_max || 0),
    terminated,
    terminationDate: loan.data_wypowiedzenia,
    overdueInstallmentsAmount: Number(c.kwota_zalegla || 0),
    surcharges: Number(loan.kwota_doplat || 0),
    payments,
    actionFees,
    asOf: todayISO(),
  });
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
  const [quick, setQuick] = useState<{ kind: WindQuickKind; row: CaseRow; debt: number } | null>(
    null,
  );
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

  const debtByCase = useMemo(() => {
    const m: Record<string, DebtCalcResult | null> = {};
    for (const c of cases) m[c.id] = computeCaseDebt(c, eventsByCase[c.id] ?? []);
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
    const total = active.reduce(
      (s, c) => s + Number(debtByCase[c.id]?.totalDue ?? c.kwota_zalegla ?? 0),
      0,
    );
    const penalty = active.reduce((s, c) => s + Number(debtByCase[c.id]?.delayInterest ?? 0), 0);
    const today = active.filter((c) =>
      needsActionToday(
        {
          sciezka: c.sciezka,
          etap: c.etap,
          opoznienie_dni: c.opoznienie_dni,
          kwota_zalegla: c.kwota_zalegla,
        },
        liteEvents(c.id),
        nowISO(),
      ),
    );
    const critical = active.filter((c) => c.priorytet === "krytyczny");
    return {
      activeCount: active.length,
      total,
      penalty,
      todayCount: today.length,
      criticalCount: critical.length,
      today,
    };
  }, [cases, debtByCase, liteEvents]);

  const filtered = useMemo(() => {
    const list = pathFilter === "all" ? cases : cases.filter((c) => c.sciezka === pathFilter);
    return [...list].sort((a, b) => {
      const pr = ["krytyczny", "wysoki", "sredni", "niski"];
      const d = pr.indexOf(a.priorytet) - pr.indexOf(b.priorytet);
      if (d !== 0) return d;
      return b.opoznienie_dni - a.opoznienie_dni;
    });
  }, [cases, pathFilter]);

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
    setQuick({ kind, row, debt: debtByCase[row.id]?.totalDue ?? Number(row.kwota_zalegla || 0) });
  };

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Windykacja"
        title="Panel windykacji"
        subtitle="Dodaj umowę i potwierdzenia wpłat — system obliczy odsetki karne, zaproponuje dalsze działania i poprowadzi rejestr czynności windykacyjnych z opłatami naliczanymi zgodnie z umową."
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
          label="Zadłużenie z odsetkami karnymi"
          value={formatPLN(metrics.total)}
          sub={
            metrics.penalty > 0 ? `w tym odsetki karne ${formatPLN(metrics.penalty)}` : undefined
          }
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
                    {
                      sciezka: c.sciezka,
                      etap: c.etap,
                      opoznienie_dni: c.opoznienie_dni,
                      kwota_zalegla: c.kwota_zalegla,
                    },
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
                  debt={debtByCase[c.id] ?? null}
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
          debtTotal={quick.debt}
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
  debt,
  onQuick,
}: {
  c: CaseRow;
  events: DashEvent[];
  lite: WindEventLite[];
  debt: DebtCalcResult | null;
  onQuick: (kind: WindQuickKind) => void;
}) {
  const last = events[0];
  const suggestion = suggestNextAction(
    {
      sciezka: c.sciezka,
      etap: c.etap,
      opoznienie_dni: c.opoznienie_dni,
      kwota_zalegla: c.kwota_zalegla,
    },
    lite,
    nowISO(),
  );
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
          <div className="text-lg font-bold tabular-nums">
            {formatPLN(debt?.totalDue ?? c.kwota_zalegla)}
          </div>
          <div className={`text-xs font-medium ${delayColorClass(c.opoznienie_dni)}`}>
            opóźnienie {c.opoznienie_dni} dni
            {debt && debt.delayInterest > 0
              ? ` · odsetki karne ${formatPLN(debt.delayInterest)}`
              : ""}
          </div>
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
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  accent?: "amber" | "red";
}) {
  const color =
    accent === "amber" ? "text-amber-600" : accent === "red" ? "text-red-600" : "text-primary";
  return (
    <Card>
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
  const [f, setF] = useState({
    imie_nazwisko: "",
    typ: "osoba_fizyczna" as "osoba_fizyczna" | "firma",
    pesel: "",
    email: "",
    telefon: "",
    adres_zamieszkania: "",
    numer_umowy: "",
    data_umowy: "",
    kwota_pozyczki: "",
    kwota_calkowita: "",
    prowizja: "",
    termin_splaty: "",
    kwota_zalegla: "",
    numer_kw: "",
    oprocentowanie_roczne: "",
    stopa_odsetek_max: String(DEFAULT_MAX_DELAY_RATE),
    sciezka: "miekka" as WindPath,
    priorytet: "sredni" as "niski" | "sredni" | "wysoki" | "krytyczny",
  });
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const updFee = (k: WindFeeKind, v: string) =>
    setFees((p) => ({ ...p, [k]: v, zrodlo: p.zrodlo ?? "recznie" }));

  // Automatyczne wyliczenie należności: kwota do zwrotu − suma wpłat.
  const sumaWplat = payments.reduce((s, p) => s + (Number(p.kwota) || 0), 0);
  const naleznoscBazowa = Number(f.kwota_calkowita) || Number(f.kwota_pozyczki) || 0;
  const wyliczonaZaleglosc = Math.max(0, naleznoscBazowa - sumaWplat);
  const hasContract = Boolean(contractFile) || Boolean(f.imie_nazwisko.trim());

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
    setF((p) => ({
      ...p,
      imie_nazwisko: "",
      pesel: "",
      email: "",
      telefon: "",
      adres_zamieszkania: "",
      numer_umowy: "",
      data_umowy: "",
      kwota_pozyczki: "",
      kwota_calkowita: "",
      prowizja: "",
      termin_splaty: "",
      kwota_zalegla: "",
      numer_kw: "",
      oprocentowanie_roczne: "",
      stopa_odsetek_max: String(DEFAULT_MAX_DELAY_RATE),
    }));
  };

  const submit = async () => {
    if (!f.imie_nazwisko.trim()) {
      setShowDetails(true);
      toast.error("Podaj dłużnika (dodaj umowę albo wpisz dane ręcznie)");
      return;
    }
    setBusy(true);
    try {
      // 1) Skan umowy + potwierdzenia przelewów → Storage (dowody w aktach).
      const umowaUrl = contractFile ? await uploadToStorage(contractFile, "umowa") : null;
      const wplaty: Array<{ kwota: number; data: string; zalacznik_url?: string | null }> = [];
      for (const p of payments) {
        const kwota = Number(p.kwota) || 0;
        if (kwota <= 0) continue;
        const url = await uploadToStorage(p.file, "wplata");
        wplaty.push({ kwota, data: p.data, zalacznik_url: url });
      }

      // 2) Utworzenie sprawy — system sam liczy należność z umowy i wpłat,
      //    a opłaty windykacyjne nalicza wg tabeli z umowy.
      const res = await createCase({
        data: {
          imie_nazwisko: f.imie_nazwisko,
          typ: f.typ,
          pesel: f.pesel,
          email: f.email,
          telefon: f.telefon,
          adres_zamieszkania: f.adres_zamieszkania,
          adres_do_doreczen: f.adres_zamieszkania,
          email_zgoda_doreczenia: false,
          numer_umowy: f.numer_umowy,
          data_umowy: f.data_umowy,
          kwota_pozyczki: Number(f.kwota_pozyczki) || 0,
          kwota_calkowita: Number(f.kwota_calkowita) || 0,
          prowizja: Number(f.prowizja) || 0,
          termin_splaty: f.termin_splaty,
          numer_kw: f.numer_kw,
          oprocentowanie_roczne: Number(f.oprocentowanie_roczne) || 0,
          stopa_odsetek_max: Number(f.stopa_odsetek_max) || DEFAULT_MAX_DELAY_RATE,
          oplaty_windykacyjne: feeTablePayload(),
          kwota_zalegla: Number(f.kwota_zalegla) || 0,
          sciezka: f.sciezka,
          etap:
            f.sciezka === "miekka"
              ? "kontakt_wstepny"
              : f.sciezka === "standardowa"
                ? "wezwanie"
                : f.sciezka === "twarda"
                  ? "wypowiedzenie"
                  : "ocena_przeslanek",
          priorytet: f.priorytet,
          umowa_url: umowaUrl,
          wplaty,
        },
      });
      toast.success("Utworzono sprawę — należność i odsetki karne wyliczone z umowy i wpłat");
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

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Nowa sprawa windykacyjna
        </CardTitle>
        <CardDescription>
          Dodaj umowę i potwierdzenia wpłat. Na tej podstawie system obliczy odsetki karne
          (maksymalne za opóźnienie, art. 481 § 2¹ k.c.), pozostałą należność i zaproponuje dalsze
          działania — a każdy telefon windykacyjny AI i SMS dopisze do rejestru czynności z opłatą
          zgodnie z umową.
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
            <ContractScanField
              onFile={setContractFile}
              onExtract={(d) => {
                setF((p) => ({
                  ...p,
                  imie_nazwisko: d.imie_nazwisko ?? p.imie_nazwisko,
                  typ: d.typ ?? p.typ,
                  pesel: d.pesel ?? d.nip ?? p.pesel,
                  email: d.email ?? p.email,
                  telefon: d.telefon ?? p.telefon,
                  adres_zamieszkania: d.adres ?? p.adres_zamieszkania,
                  numer_umowy: d.numer_umowy ?? p.numer_umowy,
                  data_umowy: d.data_umowy ?? p.data_umowy,
                  kwota_pozyczki:
                    d.kwota_pozyczki != null ? String(d.kwota_pozyczki) : p.kwota_pozyczki,
                  kwota_calkowita:
                    d.kwota_calkowita != null ? String(d.kwota_calkowita) : p.kwota_calkowita,
                  prowizja: d.prowizja != null ? String(d.prowizja) : p.prowizja,
                  termin_splaty: d.termin_splaty ?? p.termin_splaty,
                  numer_kw: d.numer_kw ?? p.numer_kw,
                  oprocentowanie_roczne:
                    d.oprocentowanie_roczne != null
                      ? String(d.oprocentowanie_roczne)
                      : p.oprocentowanie_roczne,
                  // Odsetki za opóźnienie wg umowy, nie wyżej niż maksymalne.
                  stopa_odsetek_max:
                    d.odsetki_za_opoznienie != null
                      ? String(Math.min(d.odsetki_za_opoznienie, DEFAULT_MAX_DELAY_RATE))
                      : p.stopa_odsetek_max,
                }));
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
              }}
            />
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

        {/* Co policzy system */}
        <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <Calculator className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span>
            Na podstawie umowy i wpłat system obliczy odsetki karne (maksymalne za opóźnienie — art.
            481 § 2¹ k.c.) oraz pozostałą należność (wpłaty zaliczane wg art. 451 k.c.: koszty →
            odsetki → kapitał) i zaproponuje dalsze działania zgodnie z procedurą windykacyjną.
            Opłaty za czynności (SMS, telefon, wezwanie) nalicza według tabeli opłat z umowy.
          </span>
        </div>

        {/* Automatyczne wyliczenie należności. */}
        {naleznoscBazowa > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Kwota do zwrotu (z umowy)</span>
              <span className="tabular-nums">{formatPLN(naleznoscBazowa)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Wpłaty klienta ({payments.filter((p) => Number(p.kwota) > 0).length})
              </span>
              <span className="tabular-nums">− {formatPLN(sumaWplat)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t pt-1 font-semibold">
              <span>Wyliczona należność (bez odsetek)</span>
              <span className="tabular-nums">{formatPLN(wyliczonaZaleglosc)}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Odsetki karne (maks. {Number(f.stopa_odsetek_max) || DEFAULT_MAX_DELAY_RATE}% rocznie)
              system doliczy automatycznie w karcie sprawy, na podstawie dat z umowy i wpłat. Opłaty
              wg umowy: {feePreview}
              {fees.zrodlo === "umowa" ? " (odczytane z umowy)" : " (domyślne — możesz poprawić)"}.
            </p>
          </div>
        )}

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
          <Fld label="Typ">
            <Select value={f.typ} onValueChange={(v) => upd("typ", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="osoba_fizyczna">Osoba fizyczna</SelectItem>
                <SelectItem value="firma">Firma</SelectItem>
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="PESEL / NIP">
            <Input value={f.pesel} onChange={(e) => upd("pesel", e.target.value)} />
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
          <Fld label="Kwota pożyczki (zł)">
            <Input
              type="number"
              value={f.kwota_pozyczki}
              onChange={(e) => upd("kwota_pozyczki", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota całkowita do zwrotu (zł)">
            <Input
              type="number"
              value={f.kwota_calkowita}
              onChange={(e) => upd("kwota_calkowita", e.target.value)}
            />
          </Fld>
          <Fld label="Prowizja Finance You (zł)">
            <Input
              type="number"
              value={f.prowizja}
              onChange={(e) => upd("prowizja", e.target.value)}
            />
          </Fld>
          <Fld label="Termin spłaty">
            <Input
              type="date"
              value={f.termin_splaty}
              onChange={(e) => upd("termin_splaty", e.target.value)}
            />
          </Fld>
          <Fld label="Oprocentowanie kapitałowe (% rocznie)">
            <Input
              type="number"
              step="0.1"
              value={f.oprocentowanie_roczne}
              onChange={(e) => upd("oprocentowanie_roczne", e.target.value)}
            />
          </Fld>
          <Fld label="Odsetki za opóźnienie wg umowy (% rocznie, nie więcej niż maks.)">
            <Input
              type="number"
              step="0.1"
              value={f.stopa_odsetek_max}
              onChange={(e) => upd("stopa_odsetek_max", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota zaległa (zł) — puste = wyliczona automatycznie">
            <Input
              type="number"
              value={f.kwota_zalegla}
              placeholder={wyliczonaZaleglosc > 0 ? String(wyliczonaZaleglosc) : ""}
              onChange={(e) => upd("kwota_zalegla", e.target.value)}
            />
          </Fld>
          <Fld label="Numer KW">
            <Input value={f.numer_kw} onChange={(e) => upd("numer_kw", e.target.value)} />
          </Fld>
          <Fld label="Ścieżka">
            <Select value={f.sciezka} onValueChange={(v) => upd("sciezka", v)}>
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
          <Fld label="Priorytet">
            <Select value={f.priorytet} onValueChange={(v) => upd("priorytet", v)}>
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
