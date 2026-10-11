// Narzędzia triage — wspólne dla całej floty agentów (A0 recepcja, A1 intake,
// A2P presale inwestora, A3 panel, A4/A4T windykacja): KTO jest na linii,
// DOWÓD tożsamości, rozpoznane POTRZEBY oraz bezpieczny odczyt bazy
// (`describe_data` / `lookup`). Wszystkie agenty procesowe mogą je wołać,
// bo rozpoznanie i weryfikacja rozmówcy muszą działać także po transferze
// z recepcji (ta sama rozmowa, inny agent).
//
// Zasady (docs/boty-elevenlabs.md, docs/windykacja-agent-glosowy.md):
//  * `identify_caller` patrzy WYŁĄCZNIE na kontakt z kanału (caller-id,
//    nadawca z podpisanego wątku) — numeru czy e-maila, który rozmówca
//    tylko podał, nie sprawdza w bazie (inaczej każdy mógłby pytać „czyj to
//    numer i czy ma długi”). Zwraca trasę bez danych osobowych; kandydata
//    podmiotu zapisuje do sesji, ale NIE podnosi `identity_verified`.
//  * `verify_identity` to dowód sprawdzany W KODZIE — model niczego nie
//    „uznaje”. Akta sprawy i konto inwestora otwiera tylko SILNY dowód:
//    numer umowy RAZEM z imieniem i nazwiskiem pożyczkobiorcy albo kod SMS
//    wysłany na numer zapisany w aktach (`send_verification_code`). Kontakt
//    z kanału + nazwisko wystarcza tylko do danych leada / klienta (caller-id
//    da się podrobić, a nazwa firmy jest jawna w KRS). PESEL nie jest
//    metodą: nie chcemy, by padał na nagrywanej linii.
//  * Każdy tekst, który agent ma wypowiedzieć, leży pod kluczem `say`
//    i jest po polsku; odmowa nie zdradza, KTÓRA część dowodu się nie zgadza.
import type {
  AgentKey,
  OtpSubject,
  SubjectKind,
  ToolContext,
  ToolResult,
  ToolSession,
  ToolSpec,
} from "./types";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  MAX_IDENTITY_ATTEMPTS,
  bumpIdentityAttempt,
  markIdentityVerified,
  maskPhone,
  normalizePhone,
  recordIdentityFailure,
  redactDeep,
  saveSession,
  subjectLocked,
} from "./guard.server";
import { describeReadable, safeLookup } from "./safe-read.server";

// Tabele wind_* i agent_tool_* nie są w wygenerowanym typie Database —
// klient w trybie luźnym, jak w guard.server / safe-read.server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdmin = any;

// Jeden import na proces — równoległe odczyty nie importują klienta naraz.
let adminPromise: Promise<LooseAdmin> | null = null;
function admin(): Promise<LooseAdmin> {
  adminPromise ??= import("@/integrations/supabase/client.server").then(
    (m) => m.supabaseAdmin as LooseAdmin,
  );
  return adminPromise;
}

const ALL_PROCESS: readonly AgentKey[] = [
  "recepcja",
  "intake",
  "inwestor_presale",
  "inwestor_panel",
  "windykacja",
  "windykacja_tekst",
];

// ── Kolumny czytane do rozpoznania rozmówcy ──────────────────────────────────
// Listy jawne i ŚWIADOMIE bez: pesel, nip, dowod_osobisty, bank_account,
// adres_*. Telefon/e-mail są potrzebne do porównania dowodu, ale nigdy nie
// trafiają do wyniku — profil budujemy pole po polu, nie z wiersza.
const LEAD_COLS =
  "id, type, status, first_name, last_name, email, phone_normalized, client_id, loan_application_id, created_at";
const CLIENT_COLS =
  "id, user_id, first_name, last_name, email, phone_normalized, do_not_call, do_not_sms, do_not_email";
const INVESTOR_COLS =
  "id, user_id, first_name, last_name, representative_first_name, representative_last_name, company_name, email, phone, is_active, subscription_status, subscription_active_until";
const BORROWER_COLS = "id, investor_user_id, imie_nazwisko, typ, email, telefon";
const LOAN_COLS = "id, borrower_id, investor_user_id, numer_umowy, status";
const CASE_COLS = "id, loan_id, investor_user_id, data_otwarcia, data_zamkniecia";
const APP_COLS = "id, client_id, status, created_at";
const ENTITLEMENT_COLS = "user_id, audience, active_until";

type Row = Record<string, unknown>;

interface CallerProfile {
  leads: Row[];
  clients: Row[];
  investors: Row[];
  borrowers: Row[];
  loans: Row[];
  /** Sprawy windykacyjne z `data_zamkniecia IS NULL`, najnowsze pierwsze. */
  openCases: Row[];
  applications: Row[];
  entitlements: Row[];
}

export type SuggestedRoute =
  | "intake"
  | "inwestor_presale"
  | "inwestor_panel"
  | "windykacja"
  | "unknown";

// ── Pomocnicze: tekst, nazwiska, telefony ───────────────────────────────────

const str = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).trim().slice(0, max);

/** Mała litera, bez znaków diakrytycznych (jak pl_strip_diacritics w bazie). */
function fold(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .trim();
}

/** Słowa, które nie niosą tożsamości: formy grzecznościowe i formy prawne. */
const NOISE_TOKENS = new Set([
  "pan",
  "pani",
  "panstwo",
  "firma",
  "sp",
  "spolka",
  "spzoo",
  "z",
  "o",
  "oo",
  "s",
  "sa",
  "jawna",
  "komandytowa",
  "cywilna",
  "sc",
  "akcyjna",
]);

function nameTokens(s: unknown): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !NOISE_TOKENS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Równość członu nazwiska z tolerancją jednego błędu dla dłuższych słów —
 * rozmowa idzie przez rozpoznawanie mowy (Kowalski/Kowalsky), a krótkie
 * imiona (Jan/Jana) muszą zgadzać się dokładnie.
 */
function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  return levenshtein(a, b) <= 1;
}

/**
 * Czy podane imię i nazwisko odpowiada zapisanemu. Osoba: imię + co najmniej
 * jeden człon nazwiska (nazwiska dwuczłonowe, drugie imię). Firma: co najmniej
 * dwa znaczące słowa nazwy (albo wszystkie, gdy nazwa jest krótsza).
 */
export function namesMatch(
  provided: unknown,
  stored: unknown,
  opts: { company?: boolean } = {},
): boolean {
  const p = nameTokens(provided);
  const s = nameTokens(stored);
  if (!p.length || !s.length) return false;
  const has = (t: string) => p.some((x) => tokenEq(x, t));
  if (opts.company) {
    const hits = s.filter(has).length;
    return hits >= Math.min(2, s.length);
  }
  if (s.length === 1) return has(s[0]);
  return has(s[0]) && s.slice(1).some(has);
}

/** Samo imię (pierwsze słowo) z „Imię Nazwisko”, z wielką literą. */
function firstNameOf(full: unknown): string | null {
  const first = String(full ?? "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}-]/gu, "");
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Męskie imiona kończące się na -a — wyjątki od reguły „-a ⇒ Pani”. */
const MALE_ENDING_A = new Set([
  "kuba",
  "barnaba",
  "bonawentura",
  "jarema",
  "kosma",
  "sasza",
  "nikita",
  "ilia",
  "mustafa",
  "luka",
  "dyzma",
]);

export function formaOf(firstName: string | null | undefined): "Pan" | "Pani" | "brak" {
  const f = fold(firstName);
  if (!f) return "brak";
  if (MALE_ENDING_A.has(f)) return "Pan";
  return f.endsWith("a") ? "Pani" : "Pan";
}

/** Ostatnie 9 cyfr — wspólny mianownik zapisów „+48 600 100 200” / „600100200”. */
function phoneTail(v: unknown): string {
  return String(v ?? "")
    .replace(/\D/g, "")
    .slice(-9);
}

function samePhone(a: unknown, b: unknown): boolean {
  const x = phoneTail(a);
  return x.length === 9 && x === phoneTail(b);
}

/**
 * Warianty zapisu numeru do filtra `.in()` — kolumny `wind_borrowers.telefon`
 * i `investors.phone` nie mają postaci znormalizowanej, a dane wpisują ludzie.
 * Po pobraniu i tak porównujemy końcówkę cyfr (samePhone).
 */
function phoneVariants(e164: string): string[] {
  const local = phoneTail(e164);
  if (local.length !== 9) return [e164];
  const [a, b, c] = [local.slice(0, 3), local.slice(3, 6), local.slice(6)];
  return Array.from(
    new Set([
      e164,
      `+48${local}`,
      `48${local}`,
      local,
      `0048${local}`,
      `+48 ${local}`,
      `+48 ${a} ${b} ${c}`,
      `+48 ${a}-${b}-${c}`,
      `+48-${a}-${b}-${c}`,
      `(+48) ${a} ${b} ${c}`,
      `${a} ${b} ${c}`,
      `${a}-${b}-${c}`,
      `${a}${b} ${c}`,
    ]),
  );
}

/** Numer umowy do porównania: bez spacji, wielkie litery; luźno — same znaki alfanumeryczne. */
function contractStrict(s: unknown): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}
function contractLoose(s: unknown): string {
  return fold(s).replace(/[^a-z0-9]/g, "");
}
export function contractsMatch(provided: unknown, stored: unknown): boolean {
  const a = contractStrict(provided);
  const b = contractStrict(stored);
  if (!a || !b) return false;
  if (a === b) return true;
  const la = contractLoose(provided);
  return la.length >= 4 && la === contractLoose(stored);
}

const uniqueById = (rows: Row[]): Row[] => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const id = String(r.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const ids = (rows: Row[], key = "id"): string[] =>
  Array.from(
    new Set(
      rows.map((r) => r[key]).filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );

const byCreatedDesc = (a: Row, b: Row, key = "created_at") =>
  String(b[key] ?? "").localeCompare(String(a[key] ?? ""));

// ── Odczyt profilu rozmówcy ──────────────────────────────────────────────────

async function rows(
  q: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await q;
  // Brak tabeli / kolumny nie może zatrzymać rozmowy — logujemy, traktujemy jak pusto.
  if (error) {
    console.warn("[agent-tools/triage] odczyt nie powiódł się:", error.message);
    return [];
  }
  return Array.isArray(data) ? (data as Row[]) : [];
}

/** Dopasowanie e-maila po pobraniu — `ilike` bez znaków specjalnych to równość bez wielkości liter, ale `_` w adresie jest wildcardem. */
const emailEq = (row: Row, email: string) => String(row.email ?? "").toLowerCase() === email;

async function findLeads(
  db: LooseAdmin,
  phone: string | null,
  email: string | null,
): Promise<Row[]> {
  const out: Row[] = [];
  if (phone) {
    out.push(
      ...(await rows(
        db
          .from("leads")
          .select(LEAD_COLS)
          .eq("phone_normalized", phone)
          .order("created_at", { ascending: false })
          .limit(5),
      )),
    );
  }
  if (email) {
    const found = await rows(
      db
        .from("leads")
        .select(LEAD_COLS)
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(5),
    );
    out.push(...found.filter((r) => emailEq(r, email)));
  }
  return uniqueById(out).sort((a, b) => byCreatedDesc(a, b));
}

async function findClients(
  db: LooseAdmin,
  phone: string | null,
  email: string | null,
  extraIds: string[],
): Promise<Row[]> {
  const out: Row[] = [];
  if (phone)
    out.push(
      ...(await rows(
        db.from("clients").select(CLIENT_COLS).eq("phone_normalized", phone).limit(5),
      )),
    );
  if (email) {
    const found = await rows(db.from("clients").select(CLIENT_COLS).ilike("email", email).limit(5));
    out.push(...found.filter((r) => emailEq(r, email)));
  }
  // Klient leada (lead ma client_id) mógł podać inny numer niż ten, z którego dzwoni.
  const missing = extraIds.filter((id) => !out.some((r) => r.id === id));
  if (missing.length)
    out.push(...(await rows(db.from("clients").select(CLIENT_COLS).in("id", missing).limit(5))));
  return uniqueById(out);
}

async function findInvestors(
  db: LooseAdmin,
  phone: string | null,
  email: string | null,
): Promise<Row[]> {
  const out: Row[] = [];
  if (phone) {
    const found = await rows(
      db.from("investors").select(INVESTOR_COLS).in("phone", phoneVariants(phone)).limit(5),
    );
    out.push(...found.filter((r) => samePhone(r.phone, phone)));
  }
  if (email) {
    const found = await rows(
      db.from("investors").select(INVESTOR_COLS).ilike("email", email).limit(5),
    );
    out.push(...found.filter((r) => emailEq(r, email)));
  }
  return uniqueById(out);
}

async function findBorrowers(
  db: LooseAdmin,
  phone: string | null,
  email: string | null,
): Promise<Row[]> {
  const out: Row[] = [];
  if (phone) {
    const found = await rows(
      db.from("wind_borrowers").select(BORROWER_COLS).in("telefon", phoneVariants(phone)).limit(10),
    );
    out.push(...found.filter((r) => samePhone(r.telefon, phone)));
  }
  if (email) {
    const found = await rows(
      db.from("wind_borrowers").select(BORROWER_COLS).ilike("email", email).limit(10),
    );
    out.push(...found.filter((r) => emailEq(r, email)));
  }
  return uniqueById(out);
}

/** Pożyczki pożyczkobiorców + ich OTWARTE sprawy (data_zamkniecia IS NULL). */
async function loansAndOpenCases(
  db: LooseAdmin,
  borrowerIds: string[],
): Promise<{ loans: Row[]; openCases: Row[] }> {
  if (!borrowerIds.length) return { loans: [], openCases: [] };
  const loans = await rows(
    db.from("wind_loans").select(LOAN_COLS).in("borrower_id", borrowerIds).limit(20),
  );
  const loanIds = ids(loans);
  if (!loanIds.length) return { loans, openCases: [] };
  const openCases = await rows(
    db
      .from("wind_collection_cases")
      .select(CASE_COLS)
      .in("loan_id", loanIds)
      .is("data_zamkniecia", null)
      .order("data_otwarcia", { ascending: false })
      .limit(20),
  );
  return { loans, openCases };
}

async function findApplications(
  db: LooseAdmin,
  clientIds: string[],
  appIds: string[],
): Promise<Row[]> {
  const out: Row[] = [];
  if (clientIds.length) {
    out.push(
      ...(await rows(
        db
          .from("loan_applications")
          .select(APP_COLS)
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
          .limit(5),
      )),
    );
  }
  const missing = appIds.filter((id) => !out.some((r) => r.id === id));
  if (missing.length)
    out.push(
      ...(await rows(db.from("loan_applications").select(APP_COLS).in("id", missing).limit(5))),
    );
  return uniqueById(out).sort((a, b) => byCreatedDesc(a, b));
}

async function findEntitlements(db: LooseAdmin, userIds: string[]): Promise<Row[]> {
  if (!userIds.length) return [];
  return rows(
    db
      .from("access_entitlements")
      .select(ENTITLEMENT_COLS)
      .in("user_id", userIds)
      .eq("audience", "investor")
      .limit(10),
  );
}

/** Jeden przebieg po wszystkich źródłach — używany przez identify_caller i verify_identity. */
async function resolveCaller(phone: string | null, email: string | null): Promise<CallerProfile> {
  const empty: CallerProfile = {
    leads: [],
    clients: [],
    investors: [],
    borrowers: [],
    loans: [],
    openCases: [],
    applications: [],
    entitlements: [],
  };
  if (!phone && !email) return empty;
  const db = await admin();
  const [leads, investors, borrowers] = await Promise.all([
    findLeads(db, phone, email),
    findInvestors(db, phone, email),
    findBorrowers(db, phone, email),
  ]);
  const clients = await findClients(db, phone, email, ids(leads, "client_id"));
  const [{ loans, openCases }, applications, entitlements] = await Promise.all([
    loansAndOpenCases(db, ids(borrowers)),
    findApplications(db, ids(clients), ids(leads, "loan_application_id")),
    findEntitlements(db, ids(investors, "user_id")),
  ]);
  return { leads, clients, investors, borrowers, loans, openCases, applications, entitlements };
}

// ── Interpretacja profilu ────────────────────────────────────────────────────

function investorSubscriptionActive(p: CallerProfile, now: Date): boolean {
  const t = now.getTime();
  const notExpired = (until: unknown) => {
    if (!until) return true;
    const ms = Date.parse(String(until));
    return Number.isNaN(ms) || ms > t;
  };
  const fromInvestors = p.investors.some((inv) => {
    const st = String(inv.subscription_status ?? "");
    return (
      (st === "aktywny" || st === "probny") &&
      inv.is_active !== false &&
      notExpired(inv.subscription_active_until)
    );
  });
  // Dostęp kupiony przez Tpay (access_entitlements) jest nowszym źródłem prawdy niż kolumny w investors.
  const fromEntitlements = p.entitlements.some((e) => {
    const ms = Date.parse(String(e.active_until ?? ""));
    return !Number.isNaN(ms) && ms > t;
  });
  return fromInvestors || fromEntitlements;
}

const isCompanyBorrower = (b: Row) => String(b.typ ?? "") === "firma";

/** Pożyczkobiorcy z co najmniej jedną otwartą sprawą, w kolejności najnowszej sprawy. */
function borrowersWithOpenCase(p: CallerProfile): Array<{ borrower: Row; loan: Row; kase: Row }> {
  const out: Array<{ borrower: Row; loan: Row; kase: Row }> = [];
  for (const kase of p.openCases) {
    const loan = p.loans.find((l) => l.id === kase.loan_id);
    const borrower = loan ? p.borrowers.find((b) => b.id === loan.borrower_id) : undefined;
    if (loan && borrower) out.push({ borrower, loan, kase });
  }
  return out;
}

/**
 * Intencja z rozmowy (args.intent) → trasa. Przyjmujemy klucze z promptu
 * recepcji (1–6 / nazwy) oraz swobodny tekst po polsku.
 */
function routeFromIntent(
  intent: unknown,
  isInvestor: boolean,
  investorActive: boolean,
): SuggestedRoute | null {
  const s = fold(intent);
  if (!s) return null;
  const investorRoute: SuggestedRoute =
    isInvestor && investorActive ? "inwestor_panel" : "inwestor_presale";
  if (
    /^(5|inwestor_windykacja|inwestor_panel|panel)$/.test(s) ||
    (/inwest/.test(s) && /windyk|sprawa|panel|zalegl/.test(s))
  ) {
    return isInvestor ? "inwestor_panel" : investorRoute;
  }
  if (
    /^(4|zaleglosc|windykacja|pozyczkobiorca)$/.test(s) ||
    /zaleg|windyk|wezwan|splat|komorni|opozni|monit/.test(s)
  ) {
    return "windykacja";
  }
  if (
    /^(2|inwestor|inwestycja)$/.test(s) ||
    /inwest|kapita|lokow|zainwest|abonament|subskryp/.test(s)
  ) {
    return investorRoute;
  }
  if (
    /^(1|3|pozyczka|finansowanie|status_wniosku|wniosek|intake)$/.test(s) ||
    /pozycz|finans|kredyt|wniosek|status|brak|dokument|hipotek/.test(s)
  ) {
    return "intake";
  }
  if (/^(6|inne|reklamacja|media|dostawca|pomylka)$/.test(s)) return "unknown";
  return null;
}

interface RouteDecision {
  route: SuggestedRoute;
  reason: string;
  alternatives: SuggestedRoute[];
}

function decideRoute(p: CallerProfile, intent: unknown, now: Date): RouteDecision {
  const isInvestor = p.investors.length > 0;
  const investorActive = isInvestor && investorSubscriptionActive(p, now);
  const openCase = borrowersWithOpenCase(p).length > 0;
  const hasLeadOrClient = p.leads.length > 0 || p.clients.length > 0;

  const alternatives: SuggestedRoute[] = [];
  if (openCase) alternatives.push("windykacja");
  if (isInvestor) alternatives.push(investorActive ? "inwestor_panel" : "inwestor_presale");
  if (hasLeadOrClient) alternatives.push("intake");

  if (openCase) {
    return {
      route: "windykacja",
      reason:
        "Kontakt z kanału jest powiązany z umową pożyczki — najpierw potwierdzenie tożsamości, potem sprawa.",
      alternatives,
    };
  }
  const fromIntent = routeFromIntent(intent, isInvestor, investorActive);
  if (fromIntent) {
    return {
      route: fromIntent,
      reason: "Trasa według zadeklarowanej intencji rozmówcy.",
      alternatives,
    };
  }
  if (isInvestor) {
    return investorActive
      ? {
          route: "inwestor_panel",
          reason: "Kontakt z kanału jest powiązany z kontem inwestora.",
          alternatives,
        }
      : {
          route: "inwestor_presale",
          reason:
            "Kontakt z kanału jest powiązany z kontem inwestora — przedsprzedaż / odnowienie.",
          alternatives,
        };
  }
  if (hasLeadOrClient) {
    return {
      route: "intake",
      reason: "Kontakt z kanału jest w systemie jako klient pożyczkowy.",
      alternatives,
    };
  }
  return {
    route: "unknown",
    reason: "Brak rozpoznania po kanale — zapytaj, czego dotyczy sprawa.",
    alternatives,
  };
}

/** Kandydat podmiotu do sesji, zgodny z trasą. Bez identity_verified. */
function candidateFor(route: SuggestedRoute, p: CallerProfile): Partial<ToolSession> {
  const lead = p.leads[0];
  const base: Partial<ToolSession> = { lead_id: (lead?.id as string) ?? null };
  if (route === "windykacja") {
    const hit = borrowersWithOpenCase(p)[0];
    if (hit) {
      // investor_user_id w sesji to konto INWESTORA-rozmówcy, nie wierzyciela
      // sprawy — dla pożyczkobiorcy zostaje puste.
      return {
        ...base,
        subject_kind: "borrower",
        subject_id: hit.borrower.id as string,
        case_id: hit.kase.id as string,
        loan_id: hit.loan.id as string,
      };
    }
  }
  if (route === "inwestor_panel" || route === "inwestor_presale") {
    const inv = p.investors[0];
    if (inv)
      return {
        ...base,
        subject_kind: "investor",
        subject_id: inv.id as string,
        investor_user_id: (inv.user_id as string) ?? null,
      };
  }
  const client = p.clients[0];
  if (client) return { ...base, subject_kind: "client", subject_id: client.id as string };
  if (lead) return { ...base, subject_kind: "lead", subject_id: lead.id as string };
  return base;
}

/** Tekst do powiedzenia po rozpoznaniu — neutralny: nie zdradza, co jest w bazie. */
function sayForRoute(route: SuggestedRoute): string {
  if (route === "windykacja") {
    return "Zanim przejdę do szczegółów, muszę potwierdzić tożsamość. Proszę podać imię i nazwisko oraz numer umowy pożyczki.";
  }
  return "W czym mogę pomóc? Proszę powiedzieć, czego dotyczy sprawa — pożyczki, inwestycji czy istniejącej umowy.";
}

const ok = (result: unknown, rowsCount?: number): ToolResult =>
  rowsCount == null ? { ok: true, result } : { ok: true, result, rows: rowsCount };

// ── identify_caller ──────────────────────────────────────────────────────────

async function identifyCaller(ctx: ToolContext): Promise<ToolResult> {
  // Tylko kontakt z KANAŁU. Numer / e-mail podany w rozmowie (args) nie jest
  // sprawdzany w bazie — to byłaby wyszukiwarka cudzych danych dla każdego.
  const phone = ctx.callerPhone;
  const email = ctx.callerEmail;
  const p = await resolveCaller(phone, email);
  const found = p.leads.length + p.clients.length + p.investors.length + p.borrowers.length > 0;
  const decision = decideRoute(p, ctx.args.intent, ctx.now);

  // Kanał rozmowy decyduje, który sprzeciw klienta ma znaczenie (RODO / UKE).
  const client = p.clients[0];
  const ch = fold(ctx.session.channel);
  const doNotContact =
    !!client &&
    ((/voice|phone|telefon/.test(ch) && client.do_not_call === true) ||
      (/sms/.test(ch) && client.do_not_sms === true) ||
      (/mail/.test(ch) && client.do_not_email === true));

  // Kandydaci podmiotu — tylko dopóki tożsamość NIE jest potwierdzona.
  // Po weryfikacji podmiot jest zamknięty: ponowne identify (np. po transferze)
  // nie może go podmienić.
  if (!ctx.session.identity_verified) {
    await saveSession({
      conversation_id: ctx.session.conversation_id,
      ...candidateFor(decision.route, p),
      do_not_contact: doNotContact,
    });
  }

  // Wynik bez danych osobowych: ani imienia, ani ról, etapu wniosku czy
  // informacji o sprawie — tylko trasa. Szczegóły dopiero po verify_identity.
  return ok({
    known_contact: found,
    suggested_route: decision.route,
    route_reason: decision.reason,
    alternatives: decision.alternatives,
    identity_verified: ctx.session.identity_verified,
    do_not_contact: doNotContact,
    contact_source: phone || email ? "kanal" : "brak",
    ...(ctx.args.phone || ctx.args.email
      ? {
          note: "Numer / e-mail podany w rozmowie nie jest sprawdzany w bazie — nie mów, czy go znasz.",
        }
      : {}),
    say: sayForRoute(decision.route),
  });
}

// ── verify_identity ──────────────────────────────────────────────────────────

interface VerifiedSubject {
  method: string;
  kind: SubjectKind;
  id: string;
  lead_id?: string | null;
  case_id?: string | null;
  loan_id?: string | null;
  investor_user_id?: string | null;
  first_name: string | null;
  company: boolean;
}

/** Kolejność sprawdzania podmiotów „kontakt + nazwisko”: kandydat z sesji, potem wg agenta. */
function subjectOrder(session: ToolSession): SubjectKind[] {
  const byAgent: Record<AgentKey, SubjectKind[]> = {
    windykacja: ["client", "lead"],
    windykacja_tekst: ["client", "lead"],
    inwestor_panel: ["client", "lead"],
    inwestor_presale: ["client", "lead"],
    intake: ["client", "lead"],
    recepcja: ["client", "lead"],
    unknown: ["client", "lead"],
  };
  const order = byAgent[session.agent_key] ?? byAgent.unknown;
  if (order.includes(session.subject_kind))
    return [session.subject_kind, ...order.filter((k) => k !== session.subject_kind)];
  return order;
}

/** Najnowsza otwarta sprawa pożyczki (albo null, gdy sprawa zamknięta / brak). */
async function openCaseForLoan(db: LooseAdmin, loanId: string): Promise<string | null> {
  const kase = (
    await rows(
      db
        .from("wind_collection_cases")
        .select("id")
        .eq("loan_id", loanId)
        .is("data_zamkniecia", null)
        .order("data_otwarcia", { ascending: false })
        .limit(1),
    )
  )[0];
  return (kase?.id as string | undefined) ?? null;
}

/**
 * Pożyczki o podanym numerze umowy — w całej bazie, nie tylko u kandydata:
 * pożyczkobiorca może dzwonić z innego telefonu. Numer sam niczego nie
 * otwiera; dowodem jest dopiero para „numer + imię i nazwisko z umowy”.
 */
async function loansByContract(db: LooseAdmin, contract: string): Promise<Row[]> {
  const exact = await rows(
    db.from("wind_loans").select(LOAN_COLS).eq("numer_umowy", contract.trim()).limit(5),
  );
  const alnum = contract.replace(/[^A-Za-z0-9]/g, "");
  const loose =
    alnum.length >= 4
      ? await rows(
          db
            .from("wind_loans")
            .select(LOAN_COLS)
            .ilike("numer_umowy", `%${alnum.split("").join("%")}%`)
            .limit(20),
        )
      : [];
  return uniqueById([...exact, ...loose]).filter((l) => contractsMatch(contract, l.numer_umowy));
}

async function borrowerById(db: LooseAdmin, id: unknown): Promise<Row | undefined> {
  if (typeof id !== "string" || !id) return undefined;
  return (await rows(db.from("wind_borrowers").select(BORROWER_COLS).eq("id", id).limit(1)))[0];
}

type ContractOutcome =
  | { kind: "verified"; subject: VerifiedSubject }
  | { kind: "need_otp"; loanId: string }
  | { kind: "locked" }
  | { kind: "mismatch"; loanIds: string[] }
  | { kind: "not_found" };

/**
 * Dowód „numer umowy + imię i nazwisko”. Firma (nazwa jest jawna w KRS):
 * dodatkowo kontakt z kanału zapisany przy pożyczkobiorcy, inaczej kod SMS.
 */
async function verifyByContract(
  contract: string,
  fullName: string,
  trusted: { phone: string | null; email: string | null },
): Promise<ContractOutcome> {
  const db = await admin();
  const loans = await loansByContract(db, contract);
  if (!loans.length) return { kind: "not_found" };
  for (const loan of loans) {
    const borrower = await borrowerById(db, loan.borrower_id);
    if (!borrower) continue;
    const company = isCompanyBorrower(borrower);
    if (!fullName || !namesMatch(fullName, borrower.imie_nazwisko, { company })) continue;
    if (
      (await subjectLocked(`loan:${loan.id}`)) ||
      (await subjectLocked(`borrower:${borrower.id}`))
    )
      return { kind: "locked" };
    if (company) {
      const channelMatch =
        (trusted.phone && samePhone(borrower.telefon, trusted.phone)) ||
        (trusted.email && String(borrower.email ?? "").toLowerCase() === trusted.email);
      if (!channelMatch) return { kind: "need_otp", loanId: loan.id as string };
    }
    return {
      kind: "verified",
      subject: {
        method: "contract_number",
        kind: "borrower",
        id: borrower.id as string,
        loan_id: loan.id as string,
        case_id: await openCaseForLoan(db, loan.id as string),
        first_name: company ? null : firstNameOf(borrower.imie_nazwisko),
        company,
      },
    };
  }
  return { kind: "mismatch", loanIds: ids(loans) };
}

/**
 * Dowód „kontakt z kanału + nazwisko” — tylko dla leada / klienta (dane
 * wniosku). Pożyczkobiorca i inwestor tą drogą się nie potwierdzają:
 * caller-id da się podrobić, a nazwisko bywa znane osobom trzecim.
 */
function verifyByContactAndName(
  p: CallerProfile,
  session: ToolSession,
  fullName: string,
  via: "phone" | "email",
  contact: string,
): VerifiedSubject | null {
  const matchesContact = (row: Row, phoneKey: string, emailKey = "email") =>
    via === "phone"
      ? samePhone(row[phoneKey], contact)
      : String(row[emailKey] ?? "").toLowerCase() === contact;
  const method = via === "phone" ? "phone_match" : "email_link";
  // Co najmniej dwa człony zapisanego nazwiska — jedno słowo to za mało na dowód.
  const strongName = (stored: string) =>
    nameTokens(stored).length >= 2 && namesMatch(fullName, stored);

  for (const kind of subjectOrder(session)) {
    if (kind === "client") {
      for (const c of p.clients) {
        if (!matchesContact(c, "phone_normalized")) continue;
        if (!strongName(`${c.first_name ?? ""} ${c.last_name ?? ""}`)) continue;
        const lead = p.leads.find((l) => l.client_id === c.id) ?? null;
        return {
          method,
          kind: "client",
          id: c.id as string,
          lead_id: (lead?.id as string) ?? null,
          first_name: firstNameOf(c.first_name),
          company: false,
        };
      }
    }
    if (kind === "lead") {
      for (const l of p.leads) {
        if (!matchesContact(l, "phone_normalized")) continue;
        if (!strongName(`${l.first_name ?? ""} ${l.last_name ?? ""}`)) continue;
        // Lead z klientem = klient (wnioski są zawężane po client_id).
        if (l.client_id) {
          return {
            method,
            kind: "client",
            id: l.client_id as string,
            lead_id: l.id as string,
            first_name: firstNameOf(l.first_name),
            company: false,
          };
        }
        return {
          method,
          kind: "lead",
          id: l.id as string,
          lead_id: l.id as string,
          first_name: firstNameOf(l.first_name),
          company: false,
        };
      }
    }
  }
  return null;
}

/** Czy kontakt z kanału + nazwisko pasują do pożyczkobiorcy / inwestora (podpowiedź: kod SMS). */
function strongSubjectHint(
  p: CallerProfile,
  fullName: string,
  trusted: { phone: string | null; email: string | null },
): boolean {
  const viaContact = (phone: unknown, email: unknown) =>
    (!!trusted.phone && samePhone(phone, trusted.phone)) ||
    (!!trusted.email && String(email ?? "").toLowerCase() === trusted.email);
  const borrower = p.borrowers.some(
    (b) =>
      viaContact(b.telefon, b.email) &&
      namesMatch(fullName, b.imie_nazwisko, { company: isCompanyBorrower(b) }),
  );
  const investor = p.investors.some((inv) => {
    if (!viaContact(inv.phone, inv.email)) return false;
    const person = `${inv.first_name ?? ""} ${inv.last_name ?? ""}`.trim();
    const representative =
      `${inv.representative_first_name ?? ""} ${inv.representative_last_name ?? ""}`.trim();
    return (
      (!!person && namesMatch(fullName, person)) ||
      (!!representative && namesMatch(fullName, representative))
    );
  });
  return borrower || investor;
}

const SAY_LOCKED =
  "Nie udało się potwierdzić tożsamości. Ze względów bezpieczeństwa nie mogę dziś rozmawiać o szczegółach sprawy. Zapraszam do kontaktu pisemnego lub przez panel.";
const SAY_RETRY =
  "Podane dane nie zgadzają się z tym, co mam w systemie. Spróbujmy jeszcze raz — proszę podać imię i nazwisko dokładnie tak, jak w umowie, i numer umowy.";
const SAY_NEED_PROOF =
  "Żeby przejść do szczegółów, muszę potwierdzić tożsamość. Proszę podać imię i nazwisko oraz numer umowy pożyczki — albo mogę wysłać kod SMS na numer zapisany w umowie.";
const SAY_NEED_OTP =
  "Dla bezpieczeństwa potwierdzę to jeszcze kodem. Wyślę SMS z sześciocyfrowym kodem na numer zapisany w umowie — proszę go podać, gdy przyjdzie.";
const SAY_OTP_BAD = "Ten kod się nie zgadza. Proszę sprawdzić SMS i podać kod jeszcze raz.";
const SAY_OTP_EXPIRED = "Kod stracił ważność. Mogę wysłać nowy.";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const OTP_MAX_SENDS_PER_SUBJECT_24H = 3;

function otpHash(conversationId: string, code: string): string {
  const secret = process.env.AGENT_TOOLS_SECRET ?? "";
  return createHmac("sha256", secret).update(`otp:${conversationId}:${code}`).digest("hex");
}

function otpRef(subject: OtpSubject): string {
  return `${subject.kind}:${subject.id}`;
}

async function verifyWithCode(
  ctx: ToolContext,
  session: ToolSession,
  code: string,
): Promise<ToolResult> {
  const subject = session.otp_subject ?? null;
  const expires = Date.parse(String(session.otp_expires_at ?? ""));
  if (!session.otp_hash || !subject) {
    return ok({
      verified: false,
      locked: false,
      need_code: true,
      say: "Najpierw wyślę kod — wywołaj send_verification_code.",
    });
  }
  if (!Number.isFinite(expires) || expires < ctx.now.getTime()) {
    await saveSession({
      conversation_id: session.conversation_id,
      otp_hash: null,
      otp_expires_at: null,
      otp_subject: null,
      otp_attempts: 0,
    });
    return ok({ verified: false, locked: false, expired: true, say: SAY_OTP_EXPIRED });
  }
  if (await subjectLocked(otpRef(subject)))
    return ok({ verified: false, locked: true, attempts_left: 0, say: SAY_LOCKED });
  const digits = code.replace(/\D/g, "");
  const expected = Buffer.from(session.otp_hash);
  const got = Buffer.from(otpHash(session.conversation_id, digits));
  const match =
    digits.length === 6 && expected.length === got.length && timingSafeEqual(expected, got);
  if (!match) {
    const attempts = (session.otp_attempts ?? 0) + 1;
    const burned = attempts >= OTP_MAX_ATTEMPTS;
    await saveSession({
      conversation_id: session.conversation_id,
      otp_attempts: attempts,
      ...(burned ? { otp_hash: null, otp_expires_at: null, otp_subject: null } : {}),
    });
    await recordIdentityFailure(otpRef(subject), session.conversation_id, "otp_mismatch");
    return ok({
      verified: false,
      locked: false,
      attempts_left: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
      say: burned
        ? "Kod został zablokowany po kilku błędnych próbach. Mogę wysłać nowy."
        : SAY_OTP_BAD,
    });
  }
  await markIdentityVerified(session, "otp_sms", subject);
  const first = await subjectFirstName({
    ...session,
    subject_kind: subject.kind,
    subject_id: subject.id,
  });
  return ok({
    verified: true,
    method: "otp_sms",
    subject_kind: subject.kind,
    first_name: first,
    forma: formaOf(first),
    say: "Dziękuję, tożsamość potwierdzona. Przechodzę do sprawy.",
  });
}

async function verifyIdentity(ctx: ToolContext): Promise<ToolResult> {
  let session = ctx.session;
  const args = ctx.args;

  // Zgoda na nagrywanie zbierana przy okazji — niezależnie od wyniku dowodu.
  if (typeof args.recording_consent === "boolean") {
    session = { ...session, recording_consent: args.recording_consent };
    await saveSession({
      conversation_id: session.conversation_id,
      recording_consent: args.recording_consent,
    });
  }

  if (session.identity_verified) {
    const first = await subjectFirstName(session);
    return ok({
      verified: true,
      method: session.identity_method,
      subject_kind: session.subject_kind,
      first_name: first,
      forma: formaOf(first),
      say: "Tożsamość została już potwierdzona w tej rozmowie.",
    });
  }

  const code = str(args.kod ?? args.code, 20);
  if (code) return verifyWithCode(ctx, session, code);

  if (session.identity_attempts >= MAX_IDENTITY_ATTEMPTS) {
    return ok({ verified: false, locked: true, attempts_left: 0, say: SAY_LOCKED });
  }

  const fullName = str(args.full_name ?? args.imie_nazwisko ?? args.name, 160);
  const contract = str(args.numer_umowy ?? args.contract_number, 80);
  if (!fullName) {
    // Sam numer umowy nie jest dowodem (mógł go zobaczyć ktoś na kopercie) —
    // nie liczymy jako nieudanej próby, prosimy o komplet.
    return ok({
      verified: false,
      locked: false,
      attempts_left: MAX_IDENTITY_ATTEMPTS - session.identity_attempts,
      say: SAY_NEED_PROOF,
    });
  }

  const trusted = { phone: ctx.callerPhone, email: ctx.callerEmail };
  let subject: VerifiedSubject | null = null;

  if (contract) {
    const outcome = await verifyByContract(contract, fullName, trusted);
    if (outcome.kind === "locked")
      return ok({ verified: false, locked: true, attempts_left: 0, say: SAY_LOCKED });
    if (outcome.kind === "need_otp") {
      return ok({
        verified: false,
        locked: false,
        need_code: true,
        numer_umowy_ok: true,
        say: SAY_NEED_OTP,
      });
    }
    if (outcome.kind === "verified") subject = outcome.subject;
    if (outcome.kind === "mismatch") {
      // Umowa istnieje, nazwisko nie pasuje — licznik per pożyczka (nowa
      // rozmowa nie zeruje go, więc zgadywanie nazwisk ma twardy limit).
      for (const loanId of outcome.loanIds)
        await recordIdentityFailure(`loan:${loanId}`, session.conversation_id, "name_mismatch");
    }
  }

  const p =
    trusted.phone || trusted.email ? await resolveCaller(trusted.phone, trusted.email) : null;
  if (!subject && p && trusted.phone)
    subject = verifyByContactAndName(p, session, fullName, "phone", trusted.phone);
  if (!subject && p && trusted.email)
    subject = verifyByContactAndName(p, session, fullName, "email", trusted.email);

  if (!subject) {
    // Kontakt z kanału i nazwisko wskazują pożyczkobiorcę / inwestora, ale
    // to za mało na akta — proponujemy kod SMS zamiast liczyć porażkę.
    if (!contract && p && strongSubjectHint(p, fullName, trusted)) {
      return ok({ verified: false, locked: false, need_code: true, say: SAY_NEED_OTP });
    }
    const bumped = await bumpIdentityAttempt(session);
    const locked = bumped.identity_attempts >= MAX_IDENTITY_ATTEMPTS;
    return ok({
      verified: false,
      locked,
      attempts_left: Math.max(0, MAX_IDENTITY_ATTEMPTS - bumped.identity_attempts),
      say: locked ? SAY_LOCKED : SAY_RETRY,
    });
  }

  await markIdentityVerified(session, subject.method, {
    kind: subject.kind,
    id: subject.id,
    lead_id: subject.lead_id ?? null,
    case_id: subject.case_id ?? null,
    loan_id: subject.loan_id ?? null,
    investor_user_id: subject.investor_user_id ?? null,
  });
  const forma = subject.company ? "brak" : formaOf(subject.first_name);
  return ok({
    verified: true,
    method: subject.method,
    subject_kind: subject.kind,
    // Czy ten dowód otwiera akta sprawy / konto inwestora.
    strong: subject.method === "contract_number",
    first_name: subject.first_name,
    forma,
    // Bez wołacza z imieniem („Panie Jan” to błąd, a odmiana imion w kodzie
    // jest zawodna) — forma grzecznościowa idzie osobno w `forma`.
    say: "Dziękuję, tożsamość potwierdzona. Przechodzę do sprawy.",
  });
}

// ── send_verification_code ───────────────────────────────────────────────────

/**
 * Podmiot, do którego wysyłamy kod, i numer Z AKT (nigdy numer podany w
 * rozmowie): po numerze umowy, a bez niego — kandydat z kanału (caller-id /
 * wątek) wyznaczony przez identify_caller.
 */
async function otpTarget(
  ctx: ToolContext,
): Promise<{ subject: OtpSubject; phone: string | null } | { error: string }> {
  const db = await admin();
  const contract = str(ctx.args.numer_umowy ?? ctx.args.contract_number, 80);
  if (contract) {
    const loans = await loansByContract(db, contract);
    if (loans.length !== 1) {
      return {
        error:
          "Nie mogę wysłać kodu dla tego numeru umowy — poproś o numer dokładnie jak w umowie albo zaproponuj kontakt pisemny.",
      };
    }
    const loan = loans[0];
    const borrower = await borrowerById(db, loan.borrower_id);
    if (!borrower)
      return { error: "Nie mogę wysłać kodu dla tego numeru umowy — zaproponuj kontakt pisemny." };
    return {
      subject: {
        kind: "borrower",
        id: borrower.id as string,
        loan_id: loan.id as string,
        case_id: await openCaseForLoan(db, loan.id as string),
      },
      phone: await normalizePhone(borrower.telefon),
    };
  }
  const s = ctx.session;
  if (s.subject_kind === "borrower" && s.subject_id) {
    const borrower = await borrowerById(db, s.subject_id);
    return {
      subject: { kind: "borrower", id: s.subject_id, loan_id: s.loan_id, case_id: s.case_id },
      phone: await normalizePhone(borrower?.telefon),
    };
  }
  if (s.subject_kind === "investor" && s.subject_id) {
    const inv = (
      await rows(db.from("investors").select("id, user_id, phone").eq("id", s.subject_id).limit(1))
    )[0];
    if (!inv) return { error: "Nie mogę wysłać kodu — zaproponuj logowanie do panelu inwestora." };
    return {
      subject: {
        kind: "investor",
        id: inv.id as string,
        investor_user_id: (inv.user_id as string) ?? null,
      },
      phone: await normalizePhone(inv.phone),
    };
  }
  return {
    error:
      "Nie wiem, na który numer z akt wysłać kod — poproś o numer umowy (kod pójdzie na telefon zapisany w umowie).",
  };
}

async function sendVerificationCode(ctx: ToolContext): Promise<ToolResult> {
  const session = ctx.session;
  if (session.identity_verified)
    return ok({ sent: false, already_verified: true, say: "Tożsamość jest już potwierdzona." });
  const target = await otpTarget(ctx);
  if ("error" in target) return { ok: false, error: target.error };
  const ref = otpRef(target.subject);
  if (await subjectLocked(ref)) return ok({ sent: false, locked: true, say: SAY_LOCKED });
  if (!target.phone) {
    return ok({
      sent: false,
      reason: "brak_numeru_w_aktach",
      say: "W aktach nie ma numeru, na który mogę wysłać kod. Zapraszam do kontaktu pisemnego.",
    });
  }

  const db = await admin();
  const since = new Date(ctx.now.getTime() - 24 * 3_600_000).toISOString();
  const { count } = await db
    .from("automation_events")
    .select("id", { count: "exact", head: true })
    .eq("automation_type", "agent_otp_sent")
    .eq("sent_payload->>subject_ref", ref)
    .gte("created_at", since);
  if ((count ?? 0) >= OTP_MAX_SENDS_PER_SUBJECT_24H) {
    return ok({
      sent: false,
      reason: "limit",
      say: "Dziś wysłałem już kilka kodów na ten numer. Zapraszam do kontaktu pisemnego albo jutro.",
    });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
  const res = await sendSmsInternal({
    phone: target.phone,
    body: `Finance You: kod potwierdzenia rozmowy: ${code}. Nikomu go nie przekazuj poza tą rozmową. Ważny ${OTP_TTL_MINUTES} min.`,
    source: "phone_verification",
    metadata: {
      conversation_id: session.conversation_id,
      agent_key: session.agent_key,
      tool: "send_verification_code",
    },
  });
  if (!res.ok) {
    console.warn("[agent-tools/triage] OTP SMS nie wyszedł:", res.reason ?? res.error);
    return ok({
      sent: false,
      reason: "sms_failed",
      say: "Nie udało się wysłać SMS-a z kodem. Zapraszam do kontaktu pisemnego.",
    });
  }
  await saveSession({
    conversation_id: session.conversation_id,
    otp_hash: otpHash(session.conversation_id, code),
    otp_expires_at: new Date(ctx.now.getTime() + OTP_TTL_MINUTES * 60_000).toISOString(),
    otp_attempts: 0,
    otp_subject: target.subject,
  });
  await db
    .from("automation_events")
    .insert({
      automation_type: "agent_otp_sent",
      status: "sent",
      sent_payload: {
        subject_ref: ref,
        conversation_id: session.conversation_id,
        agent_key: session.agent_key,
      },
      response_payload: { phone_hint: maskPhone(target.phone) },
    })
    .then(
      () => undefined,
      () => undefined,
    );
  return ok({
    sent: true,
    expires_minutes: OTP_TTL_MINUTES,
    say: "Wysłałem SMS z sześciocyfrowym kodem na numer zapisany w umowie. Proszę podać kod, gdy przyjdzie.",
  });
}

/** Imię potwierdzonego podmiotu (do zwrotu grzecznościowego) — po id z sesji. */
async function subjectFirstName(session: ToolSession): Promise<string | null> {
  if (!session.subject_id) return null;
  const db = await admin();
  switch (session.subject_kind) {
    case "borrower": {
      const b = (
        await rows(
          db
            .from("wind_borrowers")
            .select("id, imie_nazwisko, typ")
            .eq("id", session.subject_id)
            .limit(1),
        )
      )[0];
      return b && !isCompanyBorrower(b) ? firstNameOf(b.imie_nazwisko) : null;
    }
    case "client": {
      const c = (
        await rows(
          db.from("clients").select("id, first_name").eq("id", session.subject_id).limit(1),
        )
      )[0];
      return firstNameOf(c?.first_name);
    }
    case "investor": {
      const i = (
        await rows(
          db
            .from("investors")
            .select("id, first_name, representative_first_name")
            .eq("id", session.subject_id)
            .limit(1),
        )
      )[0];
      return firstNameOf(i?.first_name) ?? firstNameOf(i?.representative_first_name);
    }
    case "lead": {
      const l = (
        await rows(db.from("leads").select("id, first_name").eq("id", session.subject_id).limit(1))
      )[0];
      return firstNameOf(l?.first_name);
    }
    default:
      return null;
  }
}

// ── save_needs ───────────────────────────────────────────────────────────────

const NEED_STRING_KEYS = [
  "intent",
  "product",
  "timeline",
  "property_type",
  "property_city",
  "risk_appetite",
  "decision_role",
  "next_step",
  "free_text",
] as const;
const NEED_NUMBER_KEYS = ["amount_pln", "investor_ticket_pln", "investor_horizon_months"] as const;

/** Tylko znane klucze, przycięte wartości — potrzeby lądują też w automation_events. */
function sanitizeNeeds(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of NEED_STRING_KEYS) {
    const v = str(src[k], k === "free_text" ? 1000 : 200);
    if (v) out[k] = v;
  }
  for (const k of NEED_NUMBER_KEYS) {
    const n =
      typeof src[k] === "string"
        ? Number(
            String(src[k])
              .replace(/[^\d.,-]/g, "")
              .replace(",", "."),
          )
        : Number(src[k]);
    if (src[k] != null && Number.isFinite(n)) out[k] = n;
  }
  if (Array.isArray(src.objections)) {
    const list = src.objections
      .map((o) => str(o, 200))
      .filter(Boolean)
      .slice(0, 20);
    if (list.length) out.objections = list;
  } else if (typeof src.objections === "string" && src.objections.trim()) {
    out.objections = [str(src.objections, 200)];
  }
  // Redakcja wartości: PESEL / numer rachunku wypowiedziany „przy okazji” nie ma trafić do zapisu.
  return redactDeep(out);
}

async function saveNeeds(ctx: ToolContext): Promise<ToolResult> {
  const incoming = sanitizeNeeds(ctx.args.needs ?? ctx.args);
  if (!Object.keys(incoming).length) {
    return { ok: false, error: "Brak rozpoznanych potrzeb do zapisania (args.needs)." };
  }
  const prev = (ctx.session.needs ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...prev, ...incoming };
  if (Array.isArray(prev.objections) || Array.isArray(incoming.objections)) {
    merged.objections = Array.from(
      new Set(
        [
          ...((prev.objections as unknown[]) ?? []),
          ...((incoming.objections as unknown[]) ?? []),
        ].map(String),
      ),
    ).slice(0, 20);
  }
  merged.updated_at = ctx.now.toISOString();

  await saveSession({ conversation_id: ctx.session.conversation_id, needs: merged });
  const db = await admin();
  await db
    .from("automation_events")
    .insert({
      automation_type: "agent_needs_recognized",
      status: "ok",
      sent_payload: {
        conversation_id: ctx.session.conversation_id,
        agent_key: ctx.session.agent_key,
        needs: merged,
      },
      response_payload: {
        subject_kind: ctx.session.subject_kind,
        identity_verified: ctx.session.identity_verified,
      },
    })
    .then(
      () => undefined,
      (e: unknown) =>
        console.error(
          "[agent-tools/triage] automation_events",
          (e as { message?: string })?.message,
        ),
    );
  return ok({ saved: true, needs: merged });
}

// ── describe_data / lookup ───────────────────────────────────────────────────

const LOOKUP_INSTRUCTION =
  'Czytasz bazę wyłącznie narzędziem lookup: podaj `table` z poniższej listy, opcjonalnie `columns` (podzbiór dozwolonych), `where` (równość po dozwolonej kolumnie, np. {"typ":"wplata"}) i `limit`. Serwer sam zawęża wiersze do rozmówcy tej rozmowy — nie podajesz identyfikatorów. Tabele z `requires_identity: true` otworzą się dopiero po udanym verify_identity. Danych wrażliwych (PESEL, numery dokumentów, rachunki) nie ma w wynikach i nie pytaj o nie. Liczby i daty streszczaj rozmówcy po polsku, nie czytaj surowych pól.';

async function describeData(ctx: ToolContext): Promise<ToolResult> {
  const tables = await describeReadable(ctx.session.agent_key);
  return ok(
    {
      agent_key: ctx.session.agent_key,
      identity_verified: ctx.session.identity_verified,
      tables,
      instruction: LOOKUP_INSTRUCTION,
    },
    tables.length,
  );
}

async function lookup(ctx: ToolContext): Promise<ToolResult> {
  const table = str(ctx.args.table, 64);
  if (!table) return { ok: false, error: "Podaj `table` — nazwę tabeli z describe_data." };
  const columns = Array.isArray(ctx.args.columns)
    ? ctx.args.columns.map((c) => str(c, 64)).filter(Boolean)
    : null;
  const whereRaw = ctx.args.where;
  const where =
    whereRaw && typeof whereRaw === "object" && !Array.isArray(whereRaw)
      ? (Object.fromEntries(
          Object.entries(whereRaw as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
          ),
        ) as Record<string, string | number | boolean>)
      : null;
  // ElevenLabs wycina z body pola obiektu, których schemat narzędzia nie
  // wymienia — dlatego narzędzie floty wysyła filtr jako dwa płaskie pola.
  const whereColumn = str(ctx.args.where_column, 64);
  const whereValue = ctx.args.where_value;
  const flatWhere =
    whereColumn &&
    (typeof whereValue === "string" ||
      typeof whereValue === "number" ||
      typeof whereValue === "boolean")
      ? { [whereColumn]: typeof whereValue === "string" ? whereValue.slice(0, 200) : whereValue }
      : null;
  const limit = Number.isFinite(Number(ctx.args.limit)) ? Number(ctx.args.limit) : null;

  const out = await safeLookup({
    agent: ctx.session.agent_key,
    session: ctx.session,
    table,
    columns,
    where: flatWhere ?? where,
    limit,
  });
  if (!out.ok) return { ok: false, error: out.error };
  ctx.redactions.push(...out.redactions);
  return ok({ table: table.toLowerCase(), rows: out.rows, columns: out.columns }, out.rows.length);
}

// ── Rejestr ──────────────────────────────────────────────────────────────────

export const TOOLS: readonly ToolSpec[] = [
  {
    name: "identify_caller",
    agents: ALL_PROCESS,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 6, windowMinutes: 10 },
    description:
      "Proponuje trasę rozmowy na podstawie kontaktu z KANAŁU (caller-id, nadawca wątku) i zadeklarowanej potrzeby. Nie zwraca danych osobowych; numeru / e-maila podanego w rozmowie nie sprawdza.",
    handler: identifyCaller,
  },
  {
    name: "verify_identity",
    agents: ALL_PROCESS,
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 5, windowMinutes: 10 },
    description:
      "Potwierdza tożsamość dowodem sprawdzanym w kodzie: imię i nazwisko (args.full_name) RAZEM z numerem umowy (args.numer_umowy) albo kod z SMS-a (args.kod). Kontakt z kanału + nazwisko potwierdza tylko leada / klienta. Maks. 3 próby. Nie przyjmuje PESEL.",
    handler: verifyIdentity,
  },
  {
    name: "send_verification_code",
    agents: ["windykacja", "windykacja_tekst", "inwestor_presale", "inwestor_panel"],
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 2, windowMinutes: 30 },
    description:
      "Wysyła SMS z 6-cyfrowym kodem na numer ZAPISANY W AKTACH (nigdy na numer podany w rozmowie): po args.numer_umowy albo dla kandydata rozpoznanego po kanale. Kod sprawdza verify_identity(kod).",
    handler: sendVerificationCode,
  },
  {
    name: "save_needs",
    agents: ALL_PROCESS,
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 20, windowMinutes: 30 },
    description:
      "Zapisuje rozpoznane potrzeby rozmówcy (args.needs: intent, product, amount_pln, timeline, property_type, property_city, investor_ticket_pln, investor_horizon_months, risk_appetite, decision_role, objections[], next_step, free_text). Scala z wcześniejszymi.",
    handler: saveNeeds,
  },
  {
    name: "describe_data",
    agents: ALL_PROCESS,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 3, windowMinutes: 10 },
    description:
      "Zwraca listę tabel i kolumn, które ten agent może czytać narzędziem lookup, wraz z instrukcją użycia.",
    handler: describeData,
  },
  {
    name: "lookup",
    agents: ALL_PROCESS,
    requiresIdentity: false, // per-tabela wymusza safeLookup
    writes: false,
    rateLimit: { perConversation: 30, windowMinutes: 10 },
    description:
      "Bezpieczny odczyt tabeli z listy describe_data (args: table, columns?, where?, limit?). Wiersze zawężone do rozmówcy; dane sprawy dopiero po verify_identity.",
    handler: lookup,
  },
];
