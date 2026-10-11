// Narzędzia agentów windykacyjnych: A4 (telefon) i A4T (SMS / e-mail / czat).
//
// Czego pilnuje KOD, a nie prompt:
//  * dane sprawy (kwota, umowa, rachunek) dopiero po potwierdzeniu tożsamości
//    — `requiresIdentity` egzekwuje rejestr, a handler i tak czyta wyłącznie
//    sprawę z sesji rozmowy (nigdy id z body, bo body to twierdzenie modelu);
//  * kwota i opóźnienie liczone tym samym silnikiem co karta sprawy i telefon
//    z panelu (windDebtSnapshot + buildWindCallVariables) — agent tekstowy mówi
//    dokładnie to, co głosowy, a obaj to, co widzi inwestor;
//  * termin deklaracji nie może przekroczyć limitu etapu (windPromiseDeadline)
//    — model nie negocjuje go sam, dostaje gotową odmowę z datą do powtórzenia;
//  * PESEL pożyczkobiorcy służy wyłącznie do ustalenia formy grzecznościowej
//    (wewnątrz buildWindCallVariables) i nigdy nie trafia do wyniku;
//  * każde ustalenie ląduje w aktach sprawy (wind_events) w tej samej konwencji
//    co zapisy z telefonu z panelu (metadata.deklarowana_data / _kwota,
//    metadata.conversation_id) — kolejny kontakt widzi „poprzednią deklarację”.
import type { AgentKey, ToolContext, ToolResult, ToolSession, ToolSpec } from "./types";
import { hasStrongIdentity, saveSession } from "./guard.server";
import {
  windDebtSnapshot,
  type WindDebtEvent,
  type WindDebtLoan,
  type WindDebtSnapshot,
} from "@/lib/windykacja-debt";
import {
  WIND_NO_DATA,
  buildWindCallVariables,
  formatDatePl,
  kwotaCyframi,
  kwotaDoMowy,
  warsawISODate,
  windPromiseDeadline,
  type WindAgentVariable,
  type WindCallStage,
  type WindPreviousPromise,
} from "@/lib/windykacja-agent-prompt";
import { parseDataISO, parseKwota } from "@/lib/windykacja-harmonogram";

const WIND_AGENTS: readonly AgentKey[] = ["windykacja", "windykacja_tekst"];

/** Autor wpisów w aktach — odróżnia ustalenia agenta od wpisów zespołu. */
const AUTHOR = "agent AI";

/** Gdy umowa nie podaje pożyczkodawcy, a profil inwestora nie ma imienia. */
const FALLBACK_LENDER = "inwestora Finance You";

// Tabele wind_* i agent_tool_* czytamy klientem w trybie luźnym — tak jak
// guard.server i windykacja-call.functions (nazwy relacji w select są dynamiczne).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdmin = any;

// Jeden import na proces: równoległe odczyty (pożyczkodawca + dokumenty w
// Promise.all) nie importują modułu klienta wielokrotnie naraz.
let adminPromise: Promise<LooseAdmin> | null = null;
function admin(): Promise<LooseAdmin> {
  adminPromise ??= import("@/integrations/supabase/client.server").then(
    (m) => m.supabaseAdmin as LooseAdmin,
  );
  return adminPromise;
}

// ── Odczyt sprawy (jak placeWindCollectionCall) ─────────────────────────────

/**
 * Kolumny pożyczki do rozmowy + wszystko, czego potrzebuje windDebtSnapshot.
 * Ta sama lista co CALL_LOAN_COLS w windykacja-call.functions.ts (tam
 * nieeksportowana, a import tamtego modułu ciągnie createServerFn i
 * middleware Pro). Zmiana tam = zmiana tu.
 */
const LOAN_COLS =
  "borrower_id, numer_umowy, data_umowy, termin_splaty, status, data_wypowiedzenia, rachunek_splaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, oplaty_windykacyjne, pozyczkodawca, kwota_pozyczki, kwota_calkowita, prowizja, oprocentowanie_roczne, stopa_odsetek_max, kwota_doplat, harmonogram";

interface CaseBorrower {
  imie_nazwisko: string | null;
  typ: string | null;
  /** Tylko do formy grzecznościowej w buildWindCallVariables — nie wychodzi z serwera. */
  pesel: string | null;
  telefon: string | null;
}

interface CaseLoan extends WindDebtLoan {
  borrower_id?: string | null;
  numer_umowy: string | null;
  data_umowy: string | null;
  termin_splaty: string | null;
  status: string | null;
  data_wypowiedzenia: string | null;
  rachunek_splaty: string | null;
  numer_kw: string | null;
  kwota_hipoteki: number | null;
  akt_notarialny_777: string | null;
  kwota_777: number | null;
  oplaty_windykacyjne: unknown;
  pozyczkodawca: string | null;
  borrower: CaseBorrower | null;
}

interface CaseRow {
  id: string;
  investor_user_id: string | null;
  loan_id: string | null;
  sciezka: string | null;
  etap: string | null;
  opoznienie_dni: number | null;
  kwota_zalegla: number | null;
  data_otwarcia: string | null;
  data_zamkniecia: string | null;
  loan: CaseLoan | null;
}

interface CaseEvent extends WindDebtEvent {
  id?: string;
  tytul?: string | null;
}

interface CaseDocument {
  typ: string | null;
  tytul: string | null;
  status: string | null;
  data_nadania: string | null;
  data_odbioru: string | null;
}

type LoadedCase = { ok: true; kase: CaseRow; loan: CaseLoan } | { ok: false; error: string };

/**
 * Sprawa rozmowy: z sesji (case_id), a gdy sesja zna tylko pożyczkę —
 * jej otwarta sprawa (najnowsza). Nigdy z body. Tylko dla podmiotu
 * „pożyczkobiorca” — sprawa nie może zostać w sesji po kimś innym.
 */
async function resolveCaseId(session: ToolSession): Promise<string | null> {
  if (session.subject_kind !== "borrower") return null;
  if (session.case_id) return session.case_id;
  if (!session.loan_id) return null;
  const s = await admin();
  const { data } = await s
    .from("wind_collection_cases")
    .select("id")
    .eq("loan_id", session.loan_id)
    .is("data_zamkniecia", null)
    .order("data_otwarcia", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function loadCase(session: ToolSession): Promise<LoadedCase> {
  // Akta tylko po SILNYM dowodzie (numer umowy z nazwiskiem albo kod SMS) —
  // sam caller-id z nazwiskiem nie wystarcza, bo numer da się podrobić.
  if (!hasStrongIdentity(session) || session.subject_kind !== "borrower") {
    return {
      ok: false,
      error:
        "Akta sprawy dopiero po potwierdzeniu tożsamości numerem umowy z imieniem i nazwiskiem albo kodem SMS (verify_identity).",
    };
  }
  const caseId = await resolveCaseId(session);
  if (!caseId) {
    return {
      ok: false,
      error: "Brak sprawy w sesji rozmowy — najpierw identify_caller / verify_identity.",
    };
  }
  const s = await admin();
  const { data, error } = await s
    .from("wind_collection_cases")
    .select(
      `id, investor_user_id, loan_id, sciezka, etap, opoznienie_dni, kwota_zalegla, data_otwarcia, data_zamkniecia, loan:wind_loans(${LOAN_COLS}, borrower:wind_borrowers(imie_nazwisko, typ, pesel, telefon))`,
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) return { ok: false, error: `Nie można odczytać sprawy: ${error.message}` };
  if (!data) return { ok: false, error: "Sprawa z sesji nie istnieje." };
  const kase = data as CaseRow;
  if (!kase.loan) return { ok: false, error: "Sprawa nie ma przypisanej umowy pożyczki." };
  // Druga linia obrony: umowa sprawy należy do potwierdzonego pożyczkobiorcy.
  if (kase.loan.borrower_id && session.subject_id && kase.loan.borrower_id !== session.subject_id) {
    console.error("[agent-tools] sprawa z sesji nie należy do potwierdzonego podmiotu", kase.id);
    return { ok: false, error: "Sprawa z sesji nie należy do potwierdzonego rozmówcy." };
  }
  return { ok: true, kase, loan: kase.loan };
}

/**
 * Wszystkie zdarzenia sprawy (najnowsze pierwsze): wpłaty (metadata.kwota)
 * i opłaty (oplata) są podstawą kwoty, deklaracje — „poprzedniej deklaracji”.
 * Bez kompletu kwota byłaby błędna, więc błąd odczytu przerywa narzędzie.
 */
async function loadEvents(
  caseId: string,
): Promise<{ ok: true; events: CaseEvent[] } | { ok: false; error: string }> {
  const s = await admin();
  const { data, error } = await s
    .from("wind_events")
    .select("id, typ, tytul, data_zdarzenia, metadata, oplata")
    .eq("case_id", caseId)
    .order("data_zdarzenia", { ascending: false });
  if (error) return { ok: false, error: `Nie można odczytać zdarzeń sprawy: ${error.message}` };
  return { ok: true, events: (data ?? []) as CaseEvent[] };
}

/** Dokumenty w aktach — bez treści i linków (agent mówi tylko, CO i KIEDY). */
async function loadDocuments(caseId: string): Promise<CaseDocument[]> {
  const s = await admin();
  const { data } = await s
    .from("wind_documents")
    .select("typ, tytul, status, data_nadania, data_odbioru")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as CaseDocument[]).map((d) => ({
    typ: d.typ ?? null,
    tytul: d.tytul ?? null,
    status: d.status ?? null,
    data_nadania: d.data_nadania ?? null,
    data_odbioru: d.data_odbioru ?? null,
  }));
}

/**
 * W czyim imieniu mówi agent: pożyczkodawca z umowy, a gdy go brak — imię
 * i nazwisko właściciela sprawy z profilu (ten sam odczyt co w
 * placeWindCollectionCall). Świadomie BEZ e-maila z profilu: agent nie podaje
 * żadnych danych kontaktowych poza tymi z umowy (NO_INVENTED_CONTACT_RULES).
 */
async function lenderName(kase: CaseRow, loan: CaseLoan): Promise<string> {
  const zUmowy = (loan.pozyczkodawca ?? "").trim();
  if (zUmowy) return zUmowy;
  if (!kase.investor_user_id) return FALLBACK_LENDER;
  const s = await admin();
  const { data: profile } = await s
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", kase.investor_user_id)
    .maybeSingle();
  return (
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || FALLBACK_LENDER
  );
}

// ── Stan sprawy do rozmowy ──────────────────────────────────────────────────

/**
 * Zdarzenia, w których agent (głosowy albo tekstowy) zapisał deklarację.
 * placeWindCollectionCall patrzy tylko na „telefon”; tu także na kanały
 * tekstowe — deklaracja złożona SMS-em obowiązuje tak samo.
 */
const PROMISE_EVENT_TYPES = new Set(["telefon", "sms", "email", "notatka"]);

function findPreviousPromise(events: CaseEvent[]): WindPreviousPromise | null {
  const ev = events.find(
    (e) => PROMISE_EVENT_TYPES.has(e.typ) && typeof e.metadata?.deklarowana_data === "string",
  );
  return ev
    ? {
        data: String(ev.metadata?.deklarowana_data),
        kwota: Number(ev.metadata?.deklarowana_kwota) || null,
        z_dnia: ev.data_zdarzenia,
      }
    : null;
}

interface CaseState {
  today: string;
  snapshot: WindDebtSnapshot;
  zmienne: Record<WindAgentVariable, string>;
  stage: WindCallStage;
  /** Ostatni dzień, który agent może przyjąć jako termin wpłaty (RRRR-MM-DD). */
  deadlineISO: string;
  lender: string;
}

function computeState(
  kase: CaseRow,
  loan: CaseLoan,
  events: CaseEvent[],
  lender: string,
  now: Date,
): CaseState {
  const today = warsawISODate(now);
  const snapshot = windDebtSnapshot({
    loan,
    kwotaZalegla: Number(kase.kwota_zalegla ?? 0),
    events,
    asOf: today,
  });
  const zmienne = buildWindCallVariables({
    now,
    imieInwestora: lender,
    borrower: loan.borrower,
    loan,
    kase: {
      sciezka: kase.sciezka,
      opoznienie_dni: kase.opoznienie_dni,
      data_otwarcia: kase.data_otwarcia,
    },
    // „Do zapłaty teraz” (po wypowiedzeniu — całość), nigdy całe saldo przed
    // wypowiedzeniem; dokładnie tak liczy telefon z panelu.
    kwota: snapshot.doZaplatyTeraz,
    dniOpoznienia: snapshot.zrodlo === "harmonogram" ? snapshot.dniOpoznienia : null,
    previousPromise: findPreviousPromise(events),
    paymentsAfterISO: events.filter((e) => e.typ === "wplata").map((e) => e.data_zdarzenia),
  });
  const stage = zmienne.etap as WindCallStage;
  return {
    today,
    snapshot,
    zmienne,
    stage,
    deadlineISO: windPromiseDeadline(today, stage),
    lender,
  };
}

const LOAN_STATUS_LABELS: Record<string, string> = {
  aktywna: "aktywna",
  w_zwloce: "w zwłoce",
  wypowiedziana: "wypowiedziana",
  windykacja_komornicza: "egzekucja komornicza",
  splacona: "spłacona",
  windykacja_karna: "postępowanie karne",
};

const round2 = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

/** Najbliższe niezapłacone raty (zaległe najpierw) — tylko z harmonogramu. */
function nextInstalments(snapshot: WindDebtSnapshot, n: number) {
  return (snapshot.raty?.raty ?? [])
    .filter((r) => r.pozostalo > 0.005)
    .slice(0, n)
    .map((r) => ({
      termin: r.termin,
      kwota: round2(r.kwota),
      pozostalo: round2(r.pozostalo),
      status: r.wymagalna ? "zalegla" : "przyszla",
    }));
}

function buildBrief(
  loan: CaseLoan,
  events: CaseEvent[],
  dokumenty: CaseDocument[],
  st: CaseState,
): Record<string, unknown> {
  const { snapshot, zmienne } = st;
  const doZaplaty = round2(snapshot.doZaplatyTeraz);
  return {
    umowa: {
      numer: loan.numer_umowy ?? null,
      data: loan.data_umowy ?? null,
      kwota_pozyczki: loan.kwota_pozyczki != null ? round2(loan.kwota_pozyczki) : null,
      termin_splaty: loan.termin_splaty ?? null,
      status: LOAN_STATUS_LABELS[String(loan.status ?? "")] ?? loan.status ?? null,
      wypowiedziana: snapshot.wypowiedziana,
      data_wypowiedzenia: loan.data_wypowiedzenia ?? null,
    },
    pozyczkodawca: st.lender,
    zadluzenie: {
      do_zaplaty_teraz: doZaplaty,
      slownie: doZaplaty >= 1 ? kwotaDoMowy(doZaplaty) : WIND_NO_DATA,
      sklad: {
        zalegle_raty: round2(snapshot.zaleglosc),
        odsetki: round2(snapshot.odsetkiZaOpoznienie),
        koszty: round2(snapshot.koszty),
      },
      dni_opoznienia: zmienne.dni_opoznienia === WIND_NO_DATA ? 0 : Number(zmienne.dni_opoznienia),
      stan_na: st.today,
    },
    etap: st.stage,
    termin_maksymalny: zmienne.termin_maksymalny,
    termin_maksymalny_iso: st.deadlineISO,
    zabezpieczenia: {
      hipoteka: zmienne.hipoteka === "tak" ? "tak" : "brak",
      akt_777: zmienne.akt_777 === "tak" ? "tak" : "brak",
    },
    oplaty_windykacyjne: zmienne.oplaty_windykacyjne,
    // Jedyny rachunek, jaki agent może podać — z umowy tej sprawy.
    rachunek_splaty: (loan.rachunek_splaty ?? "").trim() || null,
    poprzednia_deklaracja: zmienne.poprzednia_deklaracja,
    harmonogram_najblizsze: nextInstalments(snapshot, 3),
    // Bez metadata: surowe bloby mogą nieść numery telefonów, kwoty wpłat
    // z opisami itp. — agent dostaje tylko oś czasu.
    historia: events.slice(0, 8).map((e) => ({
      data: e.data_zdarzenia,
      typ: e.typ,
      tytul: e.tytul ?? null,
    })),
    dokumenty,
    zmienne,
  };
}

// ── Pomocnicze: typ zdarzenia, teksty, daty ─────────────────────────────────

/**
 * Typ wpisu w aktach według kanału rozmowy: agent głosowy zawsze „telefon”
 * (tak szuka go webhook i poprzednia deklaracja), tekstowy — SMS / e-mail,
 * a czat i inne kanały jako notatka (wind_event_type nie ma „czat”).
 */
export function eventTypeFor(
  session: Pick<ToolSession, "agent_key" | "channel">,
): "telefon" | "sms" | "email" | "notatka" {
  if (session.agent_key === "windykacja") return "telefon";
  const ch = String(session.channel ?? "").toLowerCase();
  if (ch === "sms") return "sms";
  if (ch === "email") return "email";
  return "notatka";
}

function cleanText(v: unknown, max = 500): string | null {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

/** „11 956,69 zł” albo „1 050 zł” — do akt i do podsumowania. */
function zlTekst(n: number): string {
  const v = round2(n);
  const grosze = Math.abs(v - Math.round(v)) > 0.004;
  return `${v
    .toLocaleString("pl-PL", {
      minimumFractionDigits: grosze ? 2 : 0,
      maximumFractionDigits: 2,
    })
    .replace(/\u00a0/g, " ")} zł`;
}

function isoToUtcNoon(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

function addDaysISO(iso: string, days: number): string {
  const d = isoToUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Najbliższy przyszły dzień tygodnia (0 = niedziela); ten sam dzień = za tydzień. */
function nextWeekdayISO(todayISO: string, dow: number): string {
  const diff = (dow - isoToUtcNoon(todayISO).getUTCDay() + 7) % 7;
  return addDaysISO(todayISO, diff === 0 ? 7 : diff);
}

const WEEKDAY_STEMS: ReadonlyArray<[re: RegExp, dow: number]> = [
  [/poniedzia/u, 1],
  [/wtor/u, 2],
  [/[śs]rod/u, 3],
  [/czwart/u, 4],
  [/pi[ąa]t(?:ek|ku|kiem)?\b/u, 5],
  [/sobot/u, 6],
  [/niedziel/u, 0],
];

const MONTH_STEMS: readonly RegExp[] = [
  /^stycz/u,
  /^lut/u,
  /^mar/u,
  /^kwiet/u,
  /^maj/u,
  /^czerw/u,
  /^lip/u,
  /^sierp/u,
  /^wrze[śs]/u,
  /^pa[źz]dz/u,
  /^listop/u,
  /^grud/u,
];

const SMALL_NUMBERS: Record<string, number> = {
  jeden: 1,
  jednego: 1,
  dwa: 2,
  dwóch: 2,
  dwu: 2,
  trzy: 3,
  trzech: 3,
  cztery: 4,
  czterech: 4,
  pięć: 5,
  pięciu: 5,
  sześć: 6,
  sześciu: 6,
  siedem: 7,
  siedmiu: 7,
  osiem: 8,
  ośmiu: 8,
  dziewięć: 9,
  dziewięciu: 9,
  dziesięć: 10,
  dziesięciu: 10,
  czternaście: 14,
  czternastu: 14,
};

/** Dzień/miesiąc bez roku: ten rok, a gdy już minął — przyszły. */
function dayMonthToISO(day: number, month: number, todayISO: string, year?: number): string | null {
  const y = year ?? Number(todayISO.slice(0, 4));
  const candidate = parseDataISO(
    `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
  if (!candidate) return null;
  if (year == null && candidate < todayISO) {
    return parseDataISO(
      `${y + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return candidate;
}

/**
 * Termin wpłaty z wypowiedzi rozmówcy → RRRR-MM-DD, deterministycznie
 * względem dzisiejszej daty w Warszawie. Obsługiwane: ISO, DD.MM(.RRRR),
 * „dziś/jutro/pojutrze”, „za 3 dni / za tydzień”, dni tygodnia (w piątek,
 * do piątku, w przyszły wtorek), „9 października”, „do końca miesiąca”,
 * „po weekendzie”. Wszystko inne („jak dostanę pieniądze”) → null: agent ma
 * dopytać o konkretny dzień, a nie zgadywać.
 */
export function parsePromiseDate(raw: unknown, todayISO: string): string | null {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;

  const iso = parseDataISO(s);
  if (iso) return iso;

  const dm = /^(?:do |na |w )?(\d{1,2})[./-](\d{1,2})\.?$/u.exec(s);
  if (dm) return dayMonthToISO(Number(dm[1]), Number(dm[2]), todayISO);

  if (/^(dzi[śs]|dzisiaj|teraz|od razu|zaraz|w trakcie rozmowy)$/u.test(s)) return todayISO;
  if (/pojutrze/u.test(s)) return addDaysISO(todayISO, 2);
  if (/jutro/u.test(s)) return addDaysISO(todayISO, 1);
  if (/^za tydzie[ńn]$/u.test(s)) return addDaysISO(todayISO, 7);

  const za = /^(?:za|w ci[ąa]gu) (\d{1,2}|\p{L}+) (dni|dzie[ńn]|dnia|tyg\p{L}*)$/u.exec(s);
  if (za) {
    const n = /^\d+$/u.test(za[1]) ? Number(za[1]) : SMALL_NUMBERS[za[1]];
    if (!n) return null;
    return addDaysISO(todayISO, /^tyg/u.test(za[2]) ? n * 7 : n);
  }

  if (/ko[ńn]c\p{L}* miesi[ąa]ca/u.test(s)) {
    const [y, m] = todayISO.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  if (/ko[ńn]c\p{L}* tygodnia/u.test(s)) {
    // Koniec tygodnia = piątek (przelew księguje się w dzień roboczy);
    // w weekend wyrażenie jest dwuznaczne — agent dopyta.
    const dow = isoToUtcNoon(todayISO).getUTCDay();
    if (dow === 0 || dow === 6) return null;
    return dow === 5 ? todayISO : nextWeekdayISO(todayISO, 5);
  }
  if (/po weekendzie/u.test(s)) return nextWeekdayISO(todayISO, 1);

  const dMonth = /(\d{1,2})\.? (\p{L}+)(?: (\d{4}))?/u.exec(s);
  if (dMonth) {
    const idx = MONTH_STEMS.findIndex((re) => re.test(dMonth[2]));
    if (idx >= 0) {
      return dayMonthToISO(
        Number(dMonth[1]),
        idx + 1,
        todayISO,
        dMonth[3] ? Number(dMonth[3]) : undefined,
      );
    }
  }

  for (const [re, dow] of WEEKDAY_STEMS) {
    if (re.test(s)) {
      const d = nextWeekdayISO(todayISO, dow);
      return /przysz/u.test(s) && d < addDaysISO(todayISO, 7) ? addDaysISO(d, 7) : d;
    }
  }
  return null;
}

/**
 * Numer rachunku do dyktowania: polski NRB jako „12 3456 7890 …” (2 + 6×4),
 * inne formaty — czwórkami od początku. Tylko z rachunku umowy tej sprawy.
 */
export function accountGroups(raw: string): string[] {
  const compact = raw.replace(/[\s-]/g, "").toUpperCase();
  const body = compact.startsWith("PL") ? compact.slice(2) : compact;
  if (/^\d{26}$/u.test(body)) return [body.slice(0, 2), ...(body.slice(2).match(/\d{4}/g) ?? [])];
  return compact.match(/.{1,4}/g) ?? [compact];
}

// ── Narzędzia ───────────────────────────────────────────────────────────────

async function getCollectionCase(ctx: ToolContext): Promise<ToolResult> {
  const loaded = await loadCase(ctx.session);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { kase, loan } = loaded;
  const ev = await loadEvents(kase.id);
  if (!ev.ok) return { ok: false, error: ev.error };
  const [lender, dokumenty] = await Promise.all([lenderName(kase, loan), loadDocuments(kase.id)]);
  const st = computeState(kase, loan, ev.events, lender, ctx.now);
  // Ślad do audytu: metadata zdarzeń i PESEL świadomie nie wychodzą.
  ctx.redactions.push("key:metadata@historia", "key:pesel@borrower");
  return { ok: true, rows: 1, result: buildBrief(loan, ev.events, dokumenty, st) };
}

interface PropozycjaReszty {
  kwota_miesiecznie: number | null;
  od_kiedy: string | null;
  ile_rat: number | null;
}

function parsePropozycja(raw: unknown, todayISO: string): PropozycjaReszty | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kwota = parseKwota(o.kwota_miesiecznie);
  const odKiedyRaw = cleanText(o.od_kiedy, 60);
  const ileRat = Math.floor(Number(o.ile_rat));
  const out: PropozycjaReszty = {
    kwota_miesiecznie: kwota != null && kwota > 0 ? round2(kwota) : null,
    od_kiedy: odKiedyRaw ? (parsePromiseDate(odKiedyRaw, todayISO) ?? odKiedyRaw) : null,
    ile_rat: Number.isFinite(ileRat) && ileRat > 0 ? ileRat : null,
  };
  return out.kwota_miesiecznie || out.od_kiedy || out.ile_rat ? out : null;
}

function propozycjaTekst(p: PropozycjaReszty): string {
  return [
    p.kwota_miesiecznie ? `${zlTekst(p.kwota_miesiecznie)} miesięcznie` : null,
    p.od_kiedy
      ? `od ${parseDataISO(p.od_kiedy) ? formatDatePl(p.od_kiedy, false) : p.od_kiedy}`
      : null,
    p.ile_rat ? `${p.ile_rat} rat` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

async function recordPaymentPromise(ctx: ToolContext): Promise<ToolResult> {
  const loaded = await loadCase(ctx.session);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { kase, loan } = loaded;
  const ev = await loadEvents(kase.id);
  if (!ev.ok) return { ok: false, error: ev.error };
  const lender = await lenderName(kase, loan);
  const st = computeState(kase, loan, ev.events, lender, ctx.now);
  const terminMaks = formatDatePl(st.deadlineISO);

  // Odmowy „biznesowe” wracają jako ok:true/accepted:false z gotowym zdaniem —
  // model ma je przeczytać rozmówcy, a nie traktować jak awarię narzędzia.
  const reject = (powod: string, say: string): ToolResult => ({
    ok: true,
    result: {
      accepted: false,
      powod,
      termin_maksymalny: terminMaks,
      termin_maksymalny_iso: st.deadlineISO,
      say,
    },
  });

  const kwota = parseKwota(ctx.args.kwota_pln);
  if (kwota == null || !Number.isFinite(kwota) || kwota <= 0) {
    return reject("brak_kwoty", "Jaką kwotę mogę zapisać jako deklarację wpłaty?");
  }
  const dataISO = parsePromiseDate(ctx.args.data, st.today);
  if (!dataISO) {
    return reject(
      "data_nieczytelna",
      `Potrzebuję konkretnego dnia wpłaty — mogę przyjąć termin najpóźniej ${terminMaks}. Który dzień jest realny?`,
    );
  }
  if (dataISO < st.today) {
    return reject(
      "data_przeszla",
      `Ten dzień już minął. Jaki najbliższy dzień jest realny? Mogę przyjąć termin najpóźniej ${terminMaks}.`,
    );
  }
  if (dataISO > st.deadlineISO) {
    return reject(
      "po_terminie_maksymalnym",
      `Mogę przyjąć termin najpóźniej ${terminMaks}. Czy da się to zrobić do tego dnia?`,
    );
  }

  const sposob = cleanText(ctx.args.sposob, 120);
  const przeszkody = cleanText(ctx.args.przeszkody, 300);
  const propozycja = parsePropozycja(ctx.args.propozycja_reszty, st.today);
  const dataSlownie = formatDatePl(dataISO);
  const czesciowa = round2(kwota) < round2(st.snapshot.doZaplatyTeraz) - 0.005;

  const tresc = [
    `Deklaracja wpłaty złożona agentowi AI (${eventTypeFor(ctx.session)}, kanał: ${ctx.session.channel}).`,
    `Kwota: ${zlTekst(kwota)}${czesciowa ? ` (część z ${zlTekst(st.snapshot.doZaplatyTeraz)} do zapłaty na ${st.today})` : ""}. Termin: ${dataSlownie} (${dataISO}).${sposob ? ` Sposób: ${sposob}.` : ""}`,
    przeszkody ? `Możliwe przeszkody: ${przeszkody}` : null,
    propozycja
      ? `Propozycja spłaty reszty (do decyzji pożyczkodawcy): ${propozycjaTekst(propozycja)}.`
      : null,
    `Etap rozmowy: ${st.stage}; najpóźniejszy dopuszczalny termin: ${st.deadlineISO}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const s = await admin();
  const { error } = await s.from("wind_events").insert({
    case_id: kase.id,
    typ: eventTypeFor(ctx.session),
    kategoria: "automatyczne",
    tytul: "Deklaracja wpłaty (agent AI)",
    tresc,
    data_zdarzenia: ctx.now.toISOString(),
    oplata: 0,
    autor: AUTHOR,
    metadata: {
      conversation_id: ctx.session.conversation_id,
      deklarowana_kwota: round2(kwota),
      deklarowana_data: dataISO,
      sposob,
      przeszkody,
      propozycja_reszty: propozycja,
      agent_key: ctx.session.agent_key,
      channel: ctx.session.channel,
      zrodlo: "agent_tool",
    },
  });
  if (error) return { ok: false, error: `Nie udało się zapisać deklaracji: ${error.message}` };

  const podsumowanie = `Zapisuję: ${zlTekst(kwota)}${sposob ? `, ${sposob}` : ""}, termin wpłaty: ${dataSlownie}, na rachunek z umowy${loan.numer_umowy ? `, w tytule numer umowy ${loan.numer_umowy}` : ""}.${propozycja ? ` Propozycja spłaty reszty (${propozycjaTekst(propozycja)}) trafi do pożyczkodawcy, który podejmie decyzję.` : ""}`;

  return {
    ok: true,
    rows: 1,
    result: {
      accepted: true,
      deklarowana_kwota: round2(kwota),
      deklarowana_data: dataISO,
      deklarowana_data_slownie: dataSlownie,
      czesciowa,
      podsumowanie,
    },
  };
}

/** Rodzaje notatek → tytuł w aktach (po polsku, zrozumiały dla inwestora). */
const NOTE_KINDS: Record<string, string> = {
  osoba_trzecia: "Odebrała osoba trzecia — bez ujawnienia sprawy",
  poczta_glosowa: "Poczta głosowa — bez pozostawienia wiadomości",
  brak_zgody_na_nagrywanie: "Brak zgody na nagrywanie — dalszy kontakt pisemnie",
  prosba_o_kontakt: "Prośba o kontakt pożyczkodawcy",
  juz_zaplacil: "Rozmówca twierdzi, że już zapłacił — do sprawdzenia",
  spor_o_kwote: "Rozmówca kwestionuje kwotę",
  upadlosc_restrukturyzacja: "Upadłość / restrukturyzacja — wstrzymać żądanie zapłaty",
  zgon: "Informacja o śmierci pożyczkobiorcy",
  prosba_nie_dzwonic: "Prośba, by nie dzwonić — dalszy kontakt pisemnie",
  odmowa: "Odmowa zapłaty",
  inne: "Notatka z rozmowy",
};

/** Rodzaje dozwolone przed potwierdzeniem tożsamości (oznaczane „Niezweryfikowane”). */
// Prośbę „nie dzwońcie” szanujemy od każdego, kto odbiera — ale bez
// potwierdzenia zostaje notatką do decyzji zespołu (bez automatu).
const UNVERIFIED_KINDS = new Set([
  "osoba_trzecia",
  "poczta_glosowa",
  "brak_zgody_na_nagrywanie",
  "prosba_o_kontakt",
  "prosba_nie_dzwonic",
  "zgon",
  "inne",
]);

/** Sprawy, których zespół nie może przeoczyć w osi czasu. */
const URGENT_KINDS = new Set(["zgon", "upadlosc_restrukturyzacja"]);

async function recordCallNote(ctx: ToolContext): Promise<ToolResult> {
  const rodzaj = String(ctx.args.rodzaj ?? "")
    .trim()
    .toLowerCase();
  const label = NOTE_KINDS[rodzaj];
  if (!label) {
    return {
      ok: false,
      error: `Nieznany rodzaj notatki „${rodzaj}”. Dozwolone: ${Object.keys(NOTE_KINDS).join(", ")}.`,
    };
  }
  const verified = hasStrongIdentity(ctx.session) && ctx.session.subject_kind === "borrower";
  // Przed potwierdzeniem tożsamości wolno tylko to, co nie zmienia sprawy
  // pożyczkobiorcy: kto odebrał, poczta głosowa, brak zgody, informacja
  // osoby trzeciej. Twierdzenia o spłacie, sporze, upadłości czy odmowie
  // zapisujemy dopiero od potwierdzonego rozmówcy.
  if (!verified && !UNVERIFIED_KINDS.has(rodzaj)) {
    return {
      ok: false,
      error: `Notatkę „${rodzaj}” zapisuję dopiero po potwierdzeniu tożsamości (verify_identity). Bez tego użyj rodzaju „inne” i zaproponuj kontakt pisemny.`,
    };
  }
  const tresc = cleanText(ctx.args.tresc, 1000);
  const pilne = URGENT_KINDS.has(rodzaj);
  const tytul = `${pilne ? "PILNE: " : ""}${verified ? "" : "Niezweryfikowane: "}${label} (agent AI)`;
  const s = await admin();

  // Sprawa: potwierdzona albo kandydat z kanału (caller-id / wątek — nigdy
  // z numeru podanego w rozmowie). Bez sprawy notatka trafia do skrzynki
  // zespołu, nie do cudzych akt.
  const caseId = await resolveCaseId(ctx.session);
  if (!caseId) {
    const { error: uErr } = await s.from("automation_events").insert({
      automation_type: "wind_note_unassigned",
      status: "received",
      sent_payload: {
        conversation_id: ctx.session.conversation_id,
        agent_key: ctx.session.agent_key,
        channel: ctx.session.channel,
        rodzaj,
        tresc: tresc ?? label,
      },
      response_payload: { identity_verified: ctx.session.identity_verified },
    });
    if (uErr) return { ok: false, error: "Nie udało się zapisać notatki." };
    return {
      ok: true,
      rows: 1,
      result: { saved: true, przypisana_do_sprawy: false, tytul, pilne },
    };
  }

  const { data: ev, error } = await s
    .from("wind_events")
    .insert({
      case_id: caseId,
      typ: eventTypeFor(ctx.session),
      kategoria: "automatyczne",
      tytul,
      tresc: tresc ?? label,
      data_zdarzenia: ctx.now.toISOString(),
      oplata: 0,
      autor: AUTHOR,
      metadata: {
        conversation_id: ctx.session.conversation_id,
        rodzaj,
        agent_key: ctx.session.agent_key,
        channel: ctx.session.channel,
        identity_verified: ctx.session.identity_verified,
        zrodlo: "agent_tool",
      },
    })
    .select("id")
    .single();
  if (error) {
    console.error("[agent-tools] record_call_note", error.message);
    return { ok: false, error: "Nie udało się zapisać notatki." };
  }

  if (rodzaj === "prosba_nie_dzwonic") {
    // Sesja: dalsze narzędzia tej rozmowy widzą sprzeciw.
    await saveSession({ conversation_id: ctx.session.conversation_id, do_not_contact: true });
  }
  if (rodzaj === "prosba_nie_dzwonic" && verified) {
    // Dziennik automatyzacji: zespół widzi, że kontakt ma iść pisemnie —
    // bez czekania na przegląd akt. Tylko od potwierdzonego rozmówcy.
    const { error: aErr } = await s.from("automation_events").insert({
      automation_type: "wind_do_not_contact",
      status: "sent",
      sent_payload: {
        case_id: caseId,
        conversation_id: ctx.session.conversation_id,
        agent_key: ctx.session.agent_key,
        channel: ctx.session.channel,
        rodzaj,
      },
      response_payload: {
        event_id: ev?.id ?? null,
        identity_verified: ctx.session.identity_verified,
      },
    });
    if (aErr) console.error("[agent-tools] wind_do_not_contact", aErr.message);
  }

  return {
    ok: true,
    rows: 1,
    result: {
      saved: true,
      tytul,
      pilne,
      ...(rodzaj === "prosba_nie_dzwonic" ? { do_not_contact: true } : {}),
    },
  };
}

async function getPaymentInstructions(ctx: ToolContext): Promise<ToolResult> {
  const loaded = await loadCase(ctx.session);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { kase, loan } = loaded;
  const numer = (loan.numer_umowy ?? "").trim();
  const tytulPrzelewu = numer ? `Umowa nr ${numer}` : "Spłata pożyczki";
  const rachunek = (loan.rachunek_splaty ?? "").trim();
  if (!rachunek) {
    return {
      ok: true,
      result: {
        available: false,
        tytul_przelewu: tytulPrzelewu,
        say: `Rachunek jest w umowie pożyczki — proszę wykonać przelew na ten sam rachunek co dotychczas, w tytule: ${tytulPrzelewu}. Innego rachunku nie podaję.`,
      },
    };
  }
  const odbiorca = await lenderName(kase, loan);
  const grupy = accountGroups(rachunek);
  return {
    ok: true,
    rows: 1,
    result: {
      available: true,
      rachunek_splaty: grupy.join(" "),
      // Grupy osobno — do dyktowania powoli, z prośbą o powtórzenie.
      rachunek_splaty_grupy: grupy,
      tytul_przelewu: tytulPrzelewu,
      odbiorca,
      // Bez cyfr w `say`: numer czyta się z `rachunek_splaty_grupy` (tylko
      // ten klucz omija maskowanie rachunków w redakcji wyniku).
      say: `Przelew na rachunek z umowy, odbiorca ${odbiorca}, w tytule: ${tytulPrzelewu}. Numer podaj powoli, grupami cyfr z pola rachunek_splaty_grupy, i poproś rozmówcę o powtórzenie — potwierdzisz, czy się zgadza.`,
    },
  };
}

export const TOOLS: readonly ToolSpec[] = [
  {
    name: "get_collection_case",
    agents: WIND_AGENTS,
    requiresIdentity: true,
    writes: false,
    rateLimit: { perConversation: 4, windowMinutes: 10 },
    description:
      "Akta sprawy rozmówcy po potwierdzeniu tożsamości: umowa, pożyczkodawca, kwota do zapłaty teraz (ze składem i słownie), opóźnienie, etap, najpóźniejszy termin wpłaty, zabezpieczenia, opłaty z umowy, poprzednia deklaracja, najbliższe raty, historia i dokumenty. Pod kluczem „zmienne” komplet zmiennych agenta głosowego. Bez argumentów.",
    handler: getCollectionCase,
  },
  {
    name: "record_payment_promise",
    agents: WIND_AGENTS,
    requiresIdentity: true,
    writes: true,
    rateLimit: { perConversation: 3, windowMinutes: 30 },
    description:
      "Zapisuje w aktach deklarację wpłaty. args: kwota_pln (liczba > 0), data (RRRR-MM-DD albo „jutro”, „w piątek”, „9 października”), sposob (np. „przelew z aplikacji”), przeszkody?, propozycja_reszty? {kwota_miesiecznie, od_kiedy, ile_rat}. Termin po najpóźniejszym dopuszczalnym → accepted:false z datą do zaproponowania. Zwraca podsumowanie do odczytania rozmówcy.",
    handler: recordPaymentPromise,
  },
  {
    name: "record_call_note",
    agents: WIND_AGENTS,
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 6, windowMinutes: 30 },
    description:
      "Notatka do akt sprawy. args: rodzaj (osoba_trzecia | poczta_glosowa | brak_zgody_na_nagrywanie | prosba_o_kontakt | juz_zaplacil | spor_o_kwote | upadlosc_restrukturyzacja | zgon | prosba_nie_dzwonic | odmowa | inne), tresc (1–3 zdania). Przed potwierdzeniem tożsamości tylko: osoba_trzecia, poczta_glosowa, brak_zgody_na_nagrywanie, prosba_o_kontakt, prosba_nie_dzwonic, zgon, inne (zapis jako niezweryfikowany). „prosba_nie_dzwonic” oznacza w sesji sprzeciw wobec dalszych telefonów.",
    handler: recordCallNote,
  },
  {
    name: "get_payment_instructions",
    agents: WIND_AGENTS,
    requiresIdentity: true,
    writes: false,
    rateLimit: { perConversation: 3, windowMinutes: 10 },
    description:
      "Rachunek do spłaty z umowy tej sprawy (grupami cyfr do dyktowania), tytuł przelewu i odbiorca. Tylko na wyraźną prośbę rozmówcy; innego rachunku nie ma. Bez argumentów.",
    handler: getPaymentInstructions,
  },
];
