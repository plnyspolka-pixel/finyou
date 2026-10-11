// Narzędzia inwestorskie — A2P (przedsprzedaż), A3 (panel inwestora) i A0
// (recepcja, gdy rozmówca pyta o inwestowanie).
//
// Czego pilnuje KOD, a nie prompt:
//  * cena abonamentu pochodzi z katalogu `access_products` — tego samego,
//    z którego liczy płatność createAccessCheckout. Zmiana ceny w bazie od razu
//    zmienia to, co mówi bot, bez edycji promptu; plans.ts jest tylko
//    zapleczem na wypadek pustego katalogu (i wtedy wynik to zaznacza);
//  * teaser Projektu budujemy POLE PO POLU z białej listy (kwota, okres, typ
//    nieruchomości, miasto, LTV, oprocentowanie) — żadnych identyfikatorów,
//    nazwisk, adresów ani numerów KW, nawet gdyby RPC zaczęło je zwracać;
//  * stan konta inwestora dopiero po potwierdzeniu tożsamości i wyłącznie dla
//    konta z sesji rozmowy (session.investor_user_id) — nigdy z body / args;
//  * kwalifikację A/B/C liczy kod z oczyszczonych liczb — model jej nie
//    „ocenia”, a nierealne kwoty (typowy błąd rozpoznawania mowy) odrzucamy,
//    zamiast z nich kwalifikować;
//  * żadnych obietnic: ani zysku, ani decyzji, ani terminu oddzwonienia —
//    teksty `say` są napisane tak, żeby agent nie musiał ich dopowiadać.
import type { AgentKey, ToolContext, ToolResult, ToolSpec } from "./types";
import {
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
  redactDeep,
  saveSession,
} from "./guard.server";
import {
  ACCESS_PRESENTATION,
  SUBSCRIPTION_OPTIONS,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
  SUBSCRIPTION_YEARLY_SAVINGS_PLN,
  plnLabel,
} from "@/lib/investor-plan/plans";
import {
  FY_COMMISSION_MIN_PLN,
  FY_COMMISSION_PCT,
  LTV_MAX,
  formatRatePl,
  maxCapitalRate,
} from "@/lib/contract-engine/fees";
import { FUNDACJA, REGULAMIN_ABONAMENTU_PATH } from "@/lib/legal/regulamin-abonamentu";
import { COMPANY_DATA } from "@/lib/company";
import { propertyTypeLabels } from "@/lib/labels";
import { parseKwota } from "@/lib/windykacja-harmonogram";

// Tabele access_products / investor_* / agent_tool_* i RPC czytamy klientem
// w trybie luźnym — jak guard.server i tools-collections.server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdmin = any;

// Jeden import na proces: równoległe odczyty (stan konta: RPC + kryteria +
// zlecenia) nie importują modułu klienta naraz — przy wyścigu dwóch
// dynamicznych importów vitest potrafi podać prawdziwy moduł zamiast atrapy.
let adminPromise: Promise<LooseAdmin> | null = null;
function admin(): Promise<LooseAdmin> {
  adminPromise ??= import("@/integrations/supabase/client.server").then(
    (m) => m.supabaseAdmin as LooseAdmin,
  );
  return adminPromise;
}

// lead-comms i nadawca SMS ciągną własnych klientów / createServerFn —
// ładujemy je leniwie i też raz na proces.
type LeadComms = typeof import("@/lib/lead-comms.server");
let leadCommsPromise: Promise<LeadComms> | null = null;
const leadComms = (): Promise<LeadComms> => (leadCommsPromise ??= import("@/lib/lead-comms.server"));

type SmsSender = typeof import("@/lib/voicebot.functions");
let smsPromise: Promise<SmsSender> | null = null;
const smsSender = (): Promise<SmsSender> => (smsPromise ??= import("@/lib/voicebot.functions"));

const INVEST: readonly AgentKey[] = ["inwestor_presale", "inwestor_panel", "recepcja"];
/** Kontakt opiekuna inwestorów zamawiają tylko agenci inwestorscy — recepcja najpierw przekazuje rozmowę. */
const INVEST_DIRECT: readonly AgentKey[] = ["inwestor_presale", "inwestor_panel"];

/** Wartość `leads.type` dla inwestora — ta sama co w lead-magnetach i filtrach panelu. */
const LEAD_TYPE_INVESTOR = "inwestorski" as const;
const LEAD_SOURCE = "agent_inwestor";

/** Rejestracja inwestora — ten sam adres, który bot tekstowy podstawia za {{LINK_REJESTRACJA_INWESTORA}}. */
export const INVESTOR_REGISTRATION_URL = `${COMPANY_DATA.website}/rejestracja?role=inwestor`;
const REGISTRATION_SPOKEN = "financeyou.pl/rejestracja";

/** Źródło SMS-a jak w elevenlabs-send-sms (link od agenta w trakcie rozmowy) — hamulec SMS traktuje je jednakowo. */
const SMS_SOURCE = "elevenlabs_agent";

/** Statusy zlecenia, które jeszcze „pracują” (jak w legal-pack.functions). */
const OPEN_ORDER_STATUSES = ["zlozone", "przyjete"] as const;

/** Status leada, który wolno podnieść do „wymaga_kontaktu” — dalszych etapów lejka nie cofamy. */
const CALLBACK_REPLACEABLE_STATUSES = new Set(["", "nowy"]);
const CALLBACK_STATUS = "wymaga_kontaktu";

const MAX_TICKET_PLN = 1_000_000_000;
const MAX_HORIZON_MONTHS = 600;
const MAX_STRING = 500;
const MAX_LIST = 10;

type Row = Record<string, unknown>;

// ── Pomocnicze ───────────────────────────────────────────────────────────────

const ok = (result: unknown, rowsCount?: number): ToolResult =>
  rowsCount == null ? { ok: true, result } : { ok: true, result, rows: rowsCount };

const str = (v: unknown, max = MAX_STRING): string =>
  typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).trim().slice(0, max);

/** Mała litera, bez polskich znaków — do porównań wartości mówionych („kwartał” = „kwartal”). */
function fold(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .trim();
}

const isObj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);

async function rows(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await q;
  // Brak tabeli / kolumny nie może zatrzymać rozmowy — logujemy, traktujemy jak pusto.
  if (error) {
    console.warn("[agent-tools/investor] odczyt nie powiódł się:", error.message);
    return [];
  }
  return Array.isArray(data) ? (data as Row[]) : [];
}

async function callRpc(db: LooseAdmin, fn: string, args?: Row): Promise<{ data: unknown; error: string | null }> {
  try {
    const { data, error } = await (args ? db.rpc(fn, args) : db.rpc(fn));
    return { data, error: error ? String(error.message ?? "rpc error") : null };
  } catch (e) {
    return { data: null, error: String((e as { message?: string })?.message ?? e) };
  }
}

async function insertEvent(automationType: string, sent: Row, response: Row = {}): Promise<boolean> {
  const db = await admin();
  const { error } = await db
    .from("automation_events")
    .insert({ automation_type: automationType, status: "ok", sent_payload: sent, response_payload: response })
    .then(
      (r: { error?: { message: string } | null }) => ({ error: r?.error ?? null }),
      (e: unknown) => ({ error: { message: String((e as { message?: string })?.message ?? e) } }),
    );
  if (error) console.error("[agent-tools/investor] automation_events", error.message);
  return !error;
}

const warsawStamp = (d: Date): string =>
  new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }).format(d);

// ── get_pricing ──────────────────────────────────────────────────────────────

export interface PricingProduct {
  code: string;
  label: string;
  duration_days: number | null;
  price_pln: number;
  price_label: string;
}

/** Wiersze katalogu → produkty inwestora. Filtr kodu powtarzamy tu, bo `_` w LIKE to dowolny znak. */
export function productsFromRows(list: Row[]): PricingProduct[] {
  const out: PricingProduct[] = [];
  for (const r of list) {
    const code = str(r.code, 80);
    if (!code.startsWith("investor_") || r.active === false) continue;
    if (r.audience != null && r.audience !== "investor") continue;
    const grosz = Number(r.amount_grosz);
    if (!Number.isFinite(grosz) || grosz <= 0) continue;
    const days = Number(r.duration_days);
    const price = Math.round(grosz) / 100;
    out.push({
      code,
      label: str(r.label, 120) || code,
      duration_days: Number.isFinite(days) && days > 0 ? Math.round(days) : null,
      price_pln: price,
      price_label: plnLabel(price),
    });
  }
  return out;
}

function plansProducts(): PricingProduct[] {
  return Object.values(SUBSCRIPTION_OPTIONS).map((o) => ({
    code: o.productCode,
    label: `Abonament inwestora — ${o.label.toLowerCase()}`,
    duration_days: o.days,
    price_pln: o.pricePln,
    price_label: o.priceLabel,
  }));
}

/**
 * Zdanie o cenie i rabat roczny liczone z PRODUKTÓW (czyli z bazy) w tym samym
 * brzmieniu co SUBSCRIPTION_PRICE_SENTENCE — przy cenach z plans.ts wynik jest
 * identyczny, a po zmianie ceny w bazie zdanie zmienia się razem z nią.
 */
export function pricingSummary(products: PricingProduct[]): {
  price_sentence: string;
  yearly_discount_pct: number | null;
  yearly_savings_pln: number | null;
} {
  const byCode = (code: string) => products.find((p) => p.code === code);
  const byDays = (min: number, max: number) =>
    products.find((p) => p.duration_days != null && p.duration_days >= min && p.duration_days <= max);
  const monthly = byCode(SUBSCRIPTION_OPTIONS.miesiecznie.productCode) ?? byDays(28, 31);
  const yearly = byCode(SUBSCRIPTION_OPTIONS.rocznie.productCode) ?? byDays(360, 366);
  if (monthly && yearly) {
    const yearAtMonthly = monthly.price_pln * 12;
    const savings = Math.round(yearAtMonthly - yearly.price_pln);
    // Rabat zaokrąglony W DÓŁ — jak w plans.ts: nigdy nie zawyżamy.
    const pct = savings > 0 ? Math.floor((savings / yearAtMonthly) * 100) : 0;
    const base = `${plnLabel(monthly.price_pln)} miesięcznie albo ${plnLabel(yearly.price_pln)} za rok`;
    return {
      price_sentence: savings > 0 ? `${base} — przy płatności rocznej ${pct}% taniej (oszczędzasz ${plnLabel(savings)})` : base,
      yearly_discount_pct: pct,
      yearly_savings_pln: Math.max(0, savings),
    };
  }
  return {
    price_sentence: products
      .map((p) => (p.duration_days ? `${p.price_label} za ${p.duration_days} dni` : p.price_label))
      .join(" albo "),
    yearly_discount_pct: null,
    yearly_savings_pln: null,
  };
}

/** Kolejność wejścia inwestora (decyzja właściciela 2026-09-30). */
export const ONBOARDING_ORDER: readonly string[] = [
  "1. Abonament — płatność przez Tpay (przelew albo BLIK) otwiera panel inwestora; płacąc, inwestor akceptuje Regulamin abonamentu inwestora.",
  "2. Umowy — w panelu inwestor uzupełnia dane, przechodzi weryfikację i akceptuje Umowę ramową (v7), NDA i umowę RODO z Finance You.",
  "3. Moduł ofert — akceptacja umów otwiera Zlecenia poszukiwania Projektów i dopasowane Projekty.",
];

/** Punkty oferty jako zwykłe zdania (Cecha: Zaleta Korzyść) — do odczytania albo streszczenia. */
export function includedBullets(): string[] {
  return ACCESS_PRESENTATION.bullets.map((b) => `${b.cecha}: ${b.zaleta} ${b.korzysc}`);
}

async function getPricing(ctx: ToolContext): Promise<ToolResult> {
  const db = await admin();
  const { data, error } = await db
    .from("access_products")
    .select("code, audience, label, duration_days, amount_grosz, currency, active, sort_order")
    .eq("audience", "investor")
    .eq("active", true)
    .like("code", "investor_%")
    .order("sort_order", { ascending: true })
    .limit(20);
  if (error) console.warn("[agent-tools/investor] access_products:", error.message);

  const fromDb = productsFromRows(Array.isArray(data) ? (data as Row[]) : []);
  const source = fromDb.length ? "access_products" : "plans.ts";
  const products = fromDb.length ? fromDb : plansProducts();
  const summary = fromDb.length
    ? pricingSummary(fromDb)
    : {
        price_sentence: SUBSCRIPTION_PRICE_SENTENCE,
        yearly_discount_pct: SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
        yearly_savings_pln: SUBSCRIPTION_YEARLY_SAVINGS_PLN,
      };
  const maxRate = maxCapitalRate(ctx.now);

  return ok(
    {
      source,
      products,
      price_sentence: summary.price_sentence,
      payment_sentence: SUBSCRIPTION_PAYMENT_SENTENCE,
      discount: {
        yearly_discount_pct: summary.yearly_discount_pct,
        yearly_savings_pln: summary.yearly_savings_pln,
      },
      client_commission: `Prowizję płaci Klient (pożyczkobiorca): ${FY_COMMISSION_PCT}% kwoty pożyczki, nie mniej niż ${plnLabel(FY_COMMISSION_MIN_PLN)}, bez VAT — potrącaną z wypłaty. Inwestor nie płaci opłaty sukcesu ani opłat za Projekty.`,
      seller: {
        name: FUNDACJA.nazwa,
        sentence: `Sprzedawcą abonamentu jest ${FUNDACJA.nazwa}; faktura bez VAT. Płacąc, inwestor akceptuje Regulamin abonamentu inwestora.`,
        terms_url: `${COMPANY_DATA.website}${REGULAMIN_ABONAMENTU_PATH}`,
      },
      what_is_included: includedBullets(),
      onboarding_order: ONBOARDING_ORDER,
      limits: {
        max_annual_rate_pct: maxRate,
        ltv_max_pct: LTV_MAX,
        sentence: `Finansowanie wyłącznie na cel związany z działalnością gospodarczą klienta (B2B); oprocentowanie nie przekracza odsetek maksymalnych (obecnie ${formatRatePl(maxRate)}% rocznie), LTV maksymalnie ${LTV_MAX}%.`,
      },
      say: `Abonament inwestora kosztuje ${summary.price_sentence}. ${SUBSCRIPTION_PAYMENT_SENTENCE}`,
    },
    products.length,
  );
}

// ── get_offer_teasers ────────────────────────────────────────────────────────

export interface AnonymousTeaser {
  amount_pln: number | null;
  period_months: number | null;
  property_type: string | null;
  city: string | null;
  ltv_pct: number | null;
  annual_rate_pct: number | null;
}

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n: number | null, digits: number): number | null =>
  n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits;

/** Numer księgi wieczystej (np. WA1M/00012345/6) — nie może wyjść nawet z pola „miasto”. */
const KW_RE = /[a-z]{2}\d[a-z]\/\d{8}\/\d/gi;

/**
 * Samo miasto: tekst do pierwszego przecinka / średnika, bez „ul. …”, cyfr
 * (numer domu, kod pocztowy) i numeru KW. Pole wpisują ludzie — bywa w nim
 * pełny adres.
 */
export function safeCity(v: unknown): string | null {
  const first = String(v ?? "")
    .replace(KW_RE, " ")
    .split(/[,;\n(]/)[0];
  const cleaned = first
    .replace(/(^|\s)(ul|al|os|pl|ulica|aleja|osiedle)\.?(\s.*)?$/i, " ")
    .replace(/[^\p{L}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    // Resztki kodu pocztowego („00-511 Warszawa” → „- Warszawa”).
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .slice(0, 60);
  return cleaned || null;
}

function safePropertyType(v: unknown): string | null {
  const key = str(v, 60);
  if (!key) return null;
  return propertyTypeLabels[key] ?? (key.replace(/[^\p{L}\s_-]/gu, "").replace(/_/g, " ").trim() || null);
}

/** Teaser z białej listy pól — wszystko inne (id, project_ref, adres, wartość) zostaje na serwerze. */
export function anonymizeTeaser(r: Row): AnonymousTeaser {
  const period = numOrNull(r.preferred_period_months);
  return {
    amount_pln: round(numOrNull(r.loan_amount), 0),
    period_months: period == null ? null : Math.round(period),
    property_type: safePropertyType(r.property_type),
    city: safeCity(r.city),
    ltv_pct: round(numOrNull(r.estimated_ltv), 1),
    annual_rate_pct: round(numOrNull(r.annual_investor_rate), 2),
  };
}

const TEASERS_MAX = 5;

async function getOfferTeasers(_ctx: ToolContext): Promise<ToolResult> {
  const db = await admin();
  const { data, error } = await callRpc(db, "investor_offer_teasers");
  if (error) {
    console.warn("[agent-tools/investor] investor_offer_teasers:", error);
    return ok({
      available: false,
      say: "Nie mogę teraz pokazać przykładowych Projektów. Mogę za to opowiedzieć, jak działa dopasowanie Projektów do Zlecenia inwestora.",
    });
  }
  const list = (Array.isArray(data) ? (data as Row[]) : []).slice().sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
  const teasers = list.slice(0, TEASERS_MAX).map(anonymizeTeaser);
  return ok(
    {
      available: true,
      count_total: list.length,
      teasers,
      say: teasers.length
        ? `Mam ${list.length === 1 ? "jeden przykładowy Projekt" : `przykładowe Projekty (${list.length})`} — podaję tylko parametry: kwotę, okres, typ nieruchomości, miasto, LTV i oprocentowanie. Dane klienta i szczegóły są dostępne dopiero w module ofert, po akceptacji umów.`
        : "Nie mam teraz przykładowych Projektów do pokazania. Projekty dopasowujemy do Zlecenia inwestora — po wykupieniu abonamentu i akceptacji umów w panelu.",
    },
    teasers.length,
  );
}

// ── get_investor_state ───────────────────────────────────────────────────────

/** Kolumny konta jak w safe-read (READABLE_TABLES.investors) — bez pesel, nip, bank_account, kontaktu. */
const INVESTOR_STATE_COLS =
  "id, user_id, investor_type, entity_type, company_name, is_active, subscription_plan, subscription_status, subscription_active_until, screening_result, created_at";
const CRITERIA_COLS = "investor_id, min_amount, max_amount, auto_send_enabled, accepting_applications, paused_until, updated_at";

export type InvestorNextStep =
  | "dokoncz_rejestracje"
  | "wykup_abonament"
  | "zaakceptuj_umowy"
  | "zloz_zlecenie"
  | "sprawdz_oferty";

/** Następny krok inwestora — ta sama kolejność bramek co w panelu (abonament → umowy → moduł ofert). */
export function deriveNextStep(s: {
  hasInvestor: boolean;
  hasAccess: boolean;
  legalPackComplete: boolean;
  openOrders: number;
}): { next_step: InvestorNextStep; say: string } {
  if (!s.hasInvestor) {
    return {
      next_step: "dokoncz_rejestracje",
      say: "Nie widzę jeszcze uzupełnionego profilu inwestora. Pierwszy krok to rejestracja konta inwestora i abonament w panelu.",
    };
  }
  if (!s.hasAccess) {
    return {
      next_step: "wykup_abonament",
      // Bez kwoty: cena żyje w bazie — po nią agent woła get_pricing.
      say: `Pierwszy krok to abonament — wykupuje się go w panelu, w zakładce Dostęp i płatności. ${SUBSCRIPTION_PAYMENT_SENTENCE}`,
    };
  }
  if (!s.legalPackComplete) {
    return {
      next_step: "zaakceptuj_umowy",
      say: "Abonament jest aktywny. Żeby zobaczyć oferty, w panelu trzeba jeszcze uzupełnić dane, przejść weryfikację i zaakceptować Umowę ramową, NDA i umowę RODO.",
    };
  }
  if (s.openOrders > 0) {
    return {
      next_step: "sprawdz_oferty",
      say: "Abonament i umowy są w porządku, a Zlecenie jest aktywne — dopasowane Projekty pojawiają się w module ofert w panelu.",
    };
  }
  return {
    next_step: "zloz_zlecenie",
    say: "Abonament i umowy są w porządku. Następny krok to Zlecenie poszukiwania Projektów w module ofert — według niego dopasowujemy Projekty.",
  };
}

interface AccessSummary {
  source: "get_access_state" | "investors";
  has_access: boolean;
  active_until: string | null;
  days_left: number | null;
}

async function accessSummary(db: LooseAdmin, uid: string, investor: Row | null, now: Date): Promise<AccessSummary> {
  const { data, error } = await callRpc(db, "get_access_state", { _audience: "investor", _user_id: uid });
  if (!error && isObj(data)) {
    // Ta sama reguła co strona /inwestor/abonament: płatny dostęp, obejście zespołu albo moduł projektów.
    return {
      source: "get_access_state",
      has_access: Boolean(data.hasPaidAccess || data.isBypass || data.hasModuleAccess),
      active_until: typeof data.activeUntil === "string" ? data.activeUntil : null,
      days_left: numOrNull(data.daysLeft),
    };
  }
  // RPC niedostępne → kolumny abonamentu w investors (jak identify_caller).
  const until = investor?.subscription_active_until ? String(investor.subscription_active_until) : null;
  const untilMs = until ? Date.parse(until) : NaN;
  const status = String(investor?.subscription_status ?? "");
  const notExpired = !until || Number.isNaN(untilMs) || untilMs > now.getTime();
  return {
    source: "investors",
    has_access: !!investor && (status === "aktywny" || status === "probny") && investor.is_active !== false && notExpired,
    active_until: until,
    days_left: Number.isNaN(untilMs) ? null : Math.max(0, Math.ceil((untilMs - now.getTime()) / 86_400_000)),
  };
}

async function getInvestorState(ctx: ToolContext): Promise<ToolResult> {
  const s = ctx.session;
  // Rejestr wymusza tożsamość; powtarzamy, bo konto inwestora to dane podmiotu.
  // investor_user_id bierzemy tylko, gdy POTWIERDZONYM podmiotem jest inwestor —
  // kandydat z identify_caller mógł zostać w sesji po weryfikacji jako klient.
  const uid = s.identity_verified && s.subject_kind === "investor" ? s.investor_user_id : null;
  if (!uid) {
    return {
      ok: false,
      error: "Rozmowa nie jest powiązana z potwierdzonym kontem inwestora — najpierw identify_caller i verify_identity.",
    };
  }
  const db = await admin();
  const investor = (await rows(db.from("investors").select(INVESTOR_STATE_COLS).eq("user_id", uid).limit(1)))[0] ?? null;
  const access = await accessSummary(db, uid, investor, ctx.now);
  const legal = await callRpc(db, "investor_legal_pack_complete", { _user_id: uid });
  const legalPackComplete = !legal.error && legal.data === true;
  const criteria = investor?.id
    ? ((await rows(db.from("investor_distribution_criteria").select(CRITERIA_COLS).eq("investor_id", investor.id).limit(1)))[0] ?? null)
    : null;
  const orders = await rows(
    db.from("investor_orders").select("id, status, expires_at").eq("user_id", uid).in("status", [...OPEN_ORDER_STATUSES]).limit(50),
  );
  // Przyjęte Zlecenie po terminie ważności panel i tak oznacza jako wygasłe — nie liczymy go.
  const openOrders = orders.filter((o) => {
    const ms = o.expires_at ? Date.parse(String(o.expires_at)) : NaN;
    return Number.isNaN(ms) || ms > ctx.now.getTime();
  }).length;

  const step = deriveNextStep({ hasInvestor: !!investor, hasAccess: access.has_access, legalPackComplete, openOrders });
  return ok({
    investor: investor
      ? {
          investor_type: investor.investor_type ?? null,
          entity_type: investor.entity_type ?? null,
          company_name: investor.company_name ?? null,
          is_active: investor.is_active ?? null,
          subscription_plan: investor.subscription_plan ?? null,
          subscription_status: investor.subscription_status ?? null,
          subscription_active_until: investor.subscription_active_until ?? null,
          screening_result: investor.screening_result ?? null,
        }
      : null,
    access,
    legal_pack_complete: legal.error ? null : legalPackComplete,
    criteria: criteria
      ? {
          min_amount: criteria.min_amount ?? null,
          max_amount: criteria.max_amount ?? null,
          auto_send_enabled: criteria.auto_send_enabled ?? null,
          accepting_applications: criteria.accepting_applications ?? null,
          paused_until: criteria.paused_until ?? null,
        }
      : null,
    open_orders: openOrders,
    next_step: step.next_step,
    say: step.say,
  });
}

// ── save_investor_needs ──────────────────────────────────────────────────────

export const DECISION_ROLES = ["decydent", "rekomenduje", "szuka_info"] as const;
export const EXPERIENCE_LEVELS = ["pierwszy_raz", "kilka", "portfel"] as const;
export const TIMELINES = ["teraz", "kwartal", "kiedys"] as const;
export type DecisionRole = (typeof DECISION_ROLES)[number];
export type Experience = (typeof EXPERIENCE_LEVELS)[number];
export type Timeline = (typeof TIMELINES)[number];
export type Qualification = "A" | "B" | "C";

function enumOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const s = fold(v).replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

/**
 * Liczba z mowy / tekstu: „250 tys.”, „1,5 mln zł”, „200k”, „8,5%”.
 * `undefined` = nie podano, `null` = podano, ale to nie jest skończona liczba.
 */
export function parseSpokenNumber(v: unknown): number | null | undefined {
  if (v == null || (typeof v === "string" && !v.trim())) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = fold(v)
    .replace(/%|procent\w*/g, "")
    // Bez \b na początku — „250zł” bywa pisane łącznie.
    .replace(/(zlotych|zloty|zl|pln)\.?(?=\s|$)/g, "")
    .trim();
  let mult = 1;
  const suffix = s.match(/\s*(mld|miliard\w*|mln|milion\w*|tys\w*|k)\.?$/);
  if (suffix) {
    const u = suffix[1];
    mult = u.startsWith("mld") || u.startsWith("miliard") ? 1e9 : u.startsWith("mln") || u.startsWith("milion") ? 1e6 : 1e3;
    s = s.slice(0, suffix.index).trim();
  }
  const n = parseKwota(s);
  return n == null ? null : n * mult;
}

function boolOf(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  return ["true", "tak", "yes", "1"].includes(fold(v));
}

function listOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
  return Array.from(new Set(raw.map((x) => str(x, MAX_STRING)).filter(Boolean))).slice(0, MAX_LIST);
}

export interface InvestorNeeds {
  ticket_pln: number | null;
  horizon_months: number | null;
  min_yield_pct: number | null;
  property_types: string[];
  regions: string[];
  decision_role: DecisionRole | null;
  experience: Experience | null;
  objections: string[];
  timeline: Timeline | null;
  wants_callback: boolean;
  callback_phone: string | null;
  callback_email: string | null;
  summary: string | null;
}

export type ParsedNeeds = { ok: true; needs: InvestorNeeds; flags: string[] } | { ok: false; errors: string[] };

/**
 * Walidacja argumentów: liczby niepoprawne (nie-liczba, nieskończoność,
 * ujemne, ticket > 1 mld zł) ODRZUCAMY — agent ma dopytać, a nie kwalifikować
 * z błędu rozpoznawania mowy. Wartości poprawne, ale skrajne, przycinamy
 * (horyzont do 600 mies., rentowność do 100%). Tekst: maks. 500 znaków,
 * listy: maks. 10 pozycji; PESEL / numer rachunku wypowiedziany „przy okazji”
 * jest maskowany przed zapisem.
 */
export async function parseInvestorNeeds(args: Row, now: Date): Promise<ParsedNeeds> {
  const errors: string[] = [];
  const flags: string[] = [];

  const ticketRaw = parseSpokenNumber(args.ticket_pln);
  let ticket: number | null = null;
  if (ticketRaw === null) errors.push("ticket_pln: to nie jest liczba");
  else if (ticketRaw !== undefined) {
    if (ticketRaw < 0) errors.push("ticket_pln: kwota nie może być ujemna");
    else if (ticketRaw > MAX_TICKET_PLN) errors.push("ticket_pln: kwota powyżej 1 mld zł — dopytaj rozmówcę");
    else ticket = Math.round(ticketRaw);
  }

  const horizonRaw = parseSpokenNumber(args.horizon_months);
  let horizon: number | null = null;
  if (horizonRaw === null) errors.push("horizon_months: to nie jest liczba");
  else if (horizonRaw !== undefined) {
    if (horizonRaw < 0) errors.push("horizon_months: okres nie może być ujemny");
    else {
      horizon = Math.min(Math.round(horizonRaw), MAX_HORIZON_MONTHS);
      if (horizonRaw > MAX_HORIZON_MONTHS) flags.push("horizon_clamped");
    }
  }

  const yieldRaw = parseSpokenNumber(args.min_yield_pct);
  let minYield: number | null = null;
  if (yieldRaw === null) errors.push("min_yield_pct: to nie jest liczba");
  else if (yieldRaw !== undefined) {
    if (yieldRaw < 0) errors.push("min_yield_pct: rentowność nie może być ujemna");
    else {
      minYield = Math.min(Math.round(yieldRaw * 100) / 100, 100);
      if (yieldRaw > 100) flags.push("min_yield_clamped");
      if (minYield > maxCapitalRate(now) + 1e-9) flags.push("min_yield_above_statutory_max");
    }
  }

  if (errors.length) return { ok: false, errors };

  const needs: InvestorNeeds = redactDeep({
    ticket_pln: ticket,
    horizon_months: horizon,
    min_yield_pct: minYield,
    property_types: listOf(args.property_types),
    regions: listOf(args.regions),
    decision_role: enumOf(args.decision_role, DECISION_ROLES),
    experience: enumOf(args.experience, EXPERIENCE_LEVELS),
    objections: listOf(args.objections),
    timeline: enumOf(args.timeline, TIMELINES),
    wants_callback: boolOf(args.wants_callback),
    // Kontakt normalizowany osobno (poniżej) — telefon E.164 redakcja wzięłaby za PESEL.
    callback_phone: null,
    callback_email: null,
    summary: str(args.summary, MAX_STRING) || null,
  });
  needs.callback_phone = await normalizePhone(args.callback_phone);
  needs.callback_email = normalizeEmail(args.callback_email);
  return { ok: true, needs, flags };
}

const hasAnyNeed = (n: InvestorNeeds): boolean =>
  n.ticket_pln != null ||
  n.horizon_months != null ||
  n.min_yield_pct != null ||
  n.property_types.length > 0 ||
  n.regions.length > 0 ||
  n.decision_role != null ||
  n.experience != null ||
  n.objections.length > 0 ||
  n.timeline != null ||
  n.wants_callback ||
  !!n.summary;

/**
 * A — decydent z dużym ticketem (≥ 200 000 zł) i bliskim terminem;
 * B — ticket ≥ 50 000 zł albo bliski termin; C — reszta.
 * Brak kwoty liczy się jak 0 (nie zgadujemy).
 */
export function qualifyInvestor(n: Pick<InvestorNeeds, "ticket_pln" | "decision_role" | "timeline">): Qualification {
  const ticket = n.ticket_pln ?? 0;
  const soon = n.timeline === "teraz" || n.timeline === "kwartal";
  if (ticket >= 200_000 && n.decision_role === "decydent" && soon) return "A";
  if (ticket >= 50_000 || soon) return "B";
  return "C";
}

const QUALIFICATION_NOTE: Record<Qualification, string> = {
  A: "Kwalifikacja A (decydent, duży ticket, bliski termin): przedstaw abonament (get_pricing) i zaproponuj link do rejestracji (send_investor_registration_link). Litery kwalifikacji nie wypowiadaj.",
  B: "Kwalifikacja B: odpowiedz na pytania i obiekcje, zaproponuj link do rejestracji. Litery kwalifikacji nie wypowiadaj.",
  C: "Kwalifikacja C: wyjaśnij spokojnie, jak działa współpraca, bez nacisku; link do rejestracji tylko na prośbę. Litery kwalifikacji nie wypowiadaj.",
};

/**
 * Lead rozmowy: z sesji, istniejący po telefonie / e-mailu, albo nowy
 * (upsertLeadFromSource, typ „inwestorski”). Istniejącego NIE przepuszczamy
 * przez upsert — helper nadpisałby mu `type` i `source` (np. leadowi
 * pożyczkowemu tej samej osoby). Nowy powstaje BEZ e-maila: dla nowego leada
 * z e-mailem helper zakłada stub wniosku pożyczkowego (klient + wniosek +
 * sekwencja maili dla pożyczkobiorcy), a inwestorowi to niepotrzebne —
 * e-mail dopisuje patchLead.
 */
async function ensureInvestorLead(
  ctx: ToolContext,
  contact: { phone: string | null; email: string | null },
): Promise<string | null> {
  if (ctx.session.lead_id) return ctx.session.lead_id;
  if (!contact.phone && !contact.email) return null;
  try {
    const lc = await leadComms();
    const existing = await lc.findLeadId({ phoneNormalized: contact.phone, email: contact.email });
    if (existing) return existing;
    return await lc.upsertLeadFromSource({
      type: LEAD_TYPE_INVESTOR,
      source: LEAD_SOURCE,
      phoneRaw: contact.phone,
      phoneNormalized: contact.phone,
    });
  } catch (e) {
    console.error("[agent-tools/investor] lead", (e as { message?: string })?.message);
    return null;
  }
}

/** Dopisuje do leada bez nadpisywania: application_data scalane, kontakt tylko w puste pola. */
async function patchLead(
  leadId: string,
  patch: { applicationData?: Row; email?: string | null; phone?: string | null; noteLine?: string; status?: string },
): Promise<boolean> {
  const db = await admin();
  const lead = (
    await rows(db.from("leads").select("id, status, notes, email, phone_normalized, application_data").eq("id", leadId).limit(1))
  )[0];
  if (!lead) return false;
  const upd: Row = {};
  if (patch.applicationData) {
    upd.application_data = { ...(isObj(lead.application_data) ? lead.application_data : {}), ...patch.applicationData };
  }
  if (patch.email && !lead.email) upd.email = patch.email;
  if (patch.phone && !lead.phone_normalized) {
    upd.phone_normalized = patch.phone;
    upd.phone_raw = patch.phone;
  }
  if (patch.noteLine) {
    const prev = String(lead.notes ?? "").trim();
    upd.notes = (prev ? `${prev}\n${patch.noteLine}` : patch.noteLine).slice(-8000);
  }
  if (patch.status && CALLBACK_REPLACEABLE_STATUSES.has(String(lead.status ?? ""))) upd.status = patch.status;
  if (!Object.keys(upd).length) return true;
  const { error } = await db.from("leads").update(upd).eq("id", leadId);
  if (error) {
    console.error("[agent-tools/investor] lead update", error.message);
    return false;
  }
  return true;
}

async function saveInvestorNeeds(ctx: ToolContext): Promise<ToolResult> {
  const parsed = await parseInvestorNeeds(ctx.args, ctx.now);
  if (!parsed.ok) {
    return { ok: false, error: `Niepoprawne wartości — dopytaj rozmówcę i wywołaj ponownie: ${parsed.errors.join("; ")}.` };
  }
  const { needs, flags } = parsed;
  if (!hasAnyNeed(needs)) return { ok: false, error: "Brak rozpoznanych potrzeb do zapisania." };

  const qualification = qualifyInvestor(needs);
  const phone = needs.callback_phone ?? ctx.callerPhone;
  const email = needs.callback_email ?? ctx.callerEmail;
  const leadId = await ensureInvestorLead(ctx, { phone, email });
  const storedNeeds = { ...needs, recognized_at: ctx.now.toISOString(), conversation_id: ctx.session.conversation_id };
  const onLead = leadId
    ? await patchLead(leadId, { applicationData: { investor_needs: storedNeeds, qualification }, email, phone })
    : false;

  // Sesja: pełne potrzeby inwestora + klucze w konwencji save_needs (triage),
  // żeby kolejny agent po transferze widział je w tym samym miejscu.
  const prev = (ctx.session.needs ?? {}) as Row;
  const prevObjections = Array.isArray(prev.objections) ? prev.objections.map(String) : [];
  const merged: Row = {
    ...prev,
    intent: prev.intent ?? "inwestycja",
    ...(needs.ticket_pln != null ? { investor_ticket_pln: needs.ticket_pln } : {}),
    ...(needs.horizon_months != null ? { investor_horizon_months: needs.horizon_months } : {}),
    ...(needs.decision_role ? { decision_role: needs.decision_role } : {}),
    ...(needs.timeline ? { timeline: needs.timeline } : {}),
    objections: Array.from(new Set([...prevObjections, ...needs.objections])).slice(0, 20),
    investor_needs: needs,
    investor_qualification: qualification,
    updated_at: ctx.now.toISOString(),
  };
  await saveSession({
    conversation_id: ctx.session.conversation_id,
    needs: merged,
    ...(leadId && !ctx.session.lead_id ? { lead_id: leadId } : {}),
  });
  await insertEvent(
    "investor_needs_recognized",
    {
      conversation_id: ctx.session.conversation_id,
      agent_key: ctx.session.agent_key,
      lead_id: leadId,
      qualification,
      // Kontakt w zdarzeniu tylko zamaskowany — pełny jest na leadzie.
      needs: { ...needs, callback_phone: maskPhone(needs.callback_phone), callback_email: maskEmail(needs.callback_email) },
    },
    { saved_on_lead: onLead, flags },
  );

  const notes = [QUALIFICATION_NOTE[qualification]];
  if (needs.wants_callback) notes.push("Rozmówca chce kontaktu — wywołaj request_investor_callback.");
  if (!leadId) notes.push("Brak telefonu i e-maila — potrzeby zostały tylko w tej rozmowie; poproś o kontakt, jeśli rozmówca chce link albo kontakt.");
  const maxRate = maxCapitalRate(ctx.now);
  return ok({
    saved: true,
    qualification,
    lead_id: leadId,
    saved_on_lead: onLead,
    flags,
    agent_note: notes.join(" "),
    say: flags.includes("min_yield_above_statutory_max")
      ? `Dziękuję, zanotowane. Jedna uwaga: oprocentowanie pożyczki nie może przekroczyć odsetek maksymalnych — obecnie ${formatRatePl(maxRate)}% rocznie.`
      : "Dziękuję, zanotowane.",
  });
}

// ── request_investor_callback ────────────────────────────────────────────────

export const CALLBACK_SAY =
  "Zapisuję prośbę o kontakt. Nie obiecuję terminu — jeśli opiekun inwestorów uzna, że może pomóc, odezwie się bezpośrednio.";

async function requestInvestorCallback(ctx: ToolContext): Promise<ToolResult> {
  const phone = (await normalizePhone(ctx.args.phone ?? ctx.args.callback_phone)) ?? ctx.callerPhone;
  const email = normalizeEmail(ctx.args.email ?? ctx.args.callback_email) ?? ctx.callerEmail;
  if (!phone && !email) {
    return {
      ok: false,
      error: "Brak numeru telefonu i e-maila — poproś rozmówcę o jedno z nich i podaj w args.phone albo args.email.",
    };
  }
  // Tekst swobodny może nieść PESEL / numer rachunku — maskujemy przed zapisem.
  const topic = redactDeep(str(ctx.args.topic ?? ctx.args.reason, MAX_STRING));
  const preferred = redactDeep(str(ctx.args.preferred_time, 100));

  const leadId = await ensureInvestorLead(ctx, { phone, email });
  const line =
    `[AI ${warsawStamp(ctx.now)}] Prośba o kontakt opiekuna inwestorów (agent ${ctx.session.agent_key}, rozmowa ${ctx.session.conversation_id})` +
    (phone ? `, tel. ${phone}` : "") +
    (email ? `, e-mail ${email}` : "") +
    (preferred ? `, preferowana pora: ${preferred}` : "") +
    (topic ? ` — ${topic}` : "");
  const onLead = leadId ? await patchLead(leadId, { noteLine: line, email, phone, status: CALLBACK_STATUS }) : false;

  await saveSession({
    conversation_id: ctx.session.conversation_id,
    needs: { ...(ctx.session.needs ?? {}), wants_callback: true, callback_requested_at: ctx.now.toISOString() },
    ...(leadId && !ctx.session.lead_id ? { lead_id: leadId } : {}),
  });
  const evented = await insertEvent("investor_callback_requested", {
    conversation_id: ctx.session.conversation_id,
    agent_key: ctx.session.agent_key,
    lead_id: leadId,
    phone_hint: maskPhone(phone),
    email_hint: maskEmail(email),
    preferred_time: preferred || null,
    topic: topic || null,
  });
  // Agent nie może powiedzieć „zapisuję”, jeśli prośba nigdzie nie trafiła.
  if (!onLead && !evented) {
    return { ok: false, error: "Nie udało się zapisać prośby o kontakt — przeproś i podaj rozmówcy adres kontakt@financeyou.pl." };
  }
  return ok({
    saved: true,
    lead_id: leadId,
    saved_on_lead: onLead,
    phone_hint: maskPhone(phone),
    email_hint: maskEmail(email),
    say: CALLBACK_SAY,
  });
}

// ── send_investor_registration_link ──────────────────────────────────────────

export const REGISTRATION_SMS_BODY = `Finance You: link do rejestracji konta inwestora: ${INVESTOR_REGISTRATION_URL}`;

async function sendInvestorRegistrationLink(ctx: ToolContext): Promise<ToolResult> {
  const link = { link: INVESTOR_REGISTRATION_URL, link_spoken: REGISTRATION_SPOKEN };
  const fallbackSay = `Adres do rejestracji to ${REGISTRATION_SPOKEN} — przy rejestracji proszę wybrać konto inwestora.`;
  const phone = ctx.callerPhone;
  if (!phone) {
    return ok({ sent: false, channel: "agent", ...link, say: `Link do rejestracji konta inwestora: ${INVESTOR_REGISTRATION_URL}` });
  }
  // Sprzeciw wobec kontaktu w tej rozmowie (RODO / UKE) — bez SMS-a, link tylko słownie.
  if (ctx.session.do_not_contact) {
    return ok({ sent: false, channel: "agent", reason: "do_not_contact", ...link, say: fallbackSay });
  }
  // Ten sam nadawca co SMS od agenta głosowego (elevenlabs-send-sms): hamulec
  // sendSmsInternal pilnuje STOP (do_not_sms), okna godzin i limitów.
  const { sendSmsInternal } = await smsSender();
  const res = await sendSmsInternal({
    phone,
    body: REGISTRATION_SMS_BODY,
    source: SMS_SOURCE,
    metadata: {
      conversation_id: ctx.session.conversation_id,
      agent_key: ctx.session.agent_key,
      tool: "send_investor_registration_link",
    },
  });
  if (res.ok) {
    return ok({
      sent: true,
      channel: "sms",
      phone_hint: maskPhone(phone),
      ...link,
      say: `Link do rejestracji jest już w SMS-ie na numer kończący się na ${maskPhone(phone)?.replace("…", "") ?? "podany"}.`,
    });
  }
  return ok({
    sent: false,
    channel: "agent",
    reason: res.reason ?? (res.skipped ? "sms_skipped" : "sms_failed"),
    ...link,
    say: `Nie mogę teraz wysłać SMS-a. ${fallbackSay}`,
  });
}

// ── Rejestr ──────────────────────────────────────────────────────────────────

export const TOOLS: readonly ToolSpec[] = [
  {
    name: "get_pricing",
    agents: INVEST,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 4, windowMinutes: 10 },
    description:
      "Aktualny cennik abonamentu inwestora z bazy (produkty, zdanie o cenie, rabat roczny, płatność Tpay/BLIK bez karty i bez odnawiania), prowizja płacona przez Klienta, sprzedawca, co obejmuje abonament i kolejność wejścia (abonament → umowy → moduł ofert).",
    handler: getPricing,
  },
  {
    name: "get_offer_teasers",
    agents: INVEST,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 4, windowMinutes: 10 },
    description:
      "Do 5 anonimowych przykładów Projektów: kwota, okres, typ nieruchomości, miasto, LTV, oprocentowanie — bez identyfikatorów, adresów i danych klienta. Gdy brak przykładów lub odczyt się nie uda, zwraca `say` do powtórzenia.",
    handler: getOfferTeasers,
  },
  {
    name: "get_investor_state",
    agents: INVEST,
    requiresIdentity: true,
    writes: false,
    rateLimit: { perConversation: 4, windowMinutes: 10 },
    description:
      "Stan konta potwierdzonego inwestora rozmowy: abonament (czy aktywny, do kiedy), komplet umów, kryteria, liczba otwartych Zleceń i następny krok (next_step + `say`). Wymaga verify_identity.",
    handler: getInvestorState,
  },
  {
    name: "save_investor_needs",
    agents: INVEST,
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 10, windowMinutes: 30 },
    description:
      "Zapisuje potrzeby inwestora i liczy kwalifikację A/B/C. args: ticket_pln, horizon_months, min_yield_pct?, property_types[], regions[], decision_role (decydent|rekomenduje|szuka_info), experience (pierwszy_raz|kilka|portfel), objections[], timeline (teraz|kwartal|kiedys), wants_callback, callback_phone?, callback_email?, summary. Niepoprawne liczby są odrzucane — wtedy dopytaj.",
    handler: saveInvestorNeeds,
  },
  {
    name: "request_investor_callback",
    agents: INVEST_DIRECT,
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 2, windowMinutes: 30 },
    description:
      "Zapisuje prośbę o kontakt opiekuna inwestorów (args: phone? / email?, preferred_time?, topic?; domyślnie numer rozmowy). Nie obiecuje terminu — powtórz `say` dosłownie.",
    handler: requestInvestorCallback,
  },
  {
    name: "send_investor_registration_link",
    agents: INVEST,
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 1, windowMinutes: 30 },
    description:
      "Wysyła SMS z linkiem do rejestracji konta inwestora na numer rozmowy; bez numeru (czat) albo gdy SMS nie wyjdzie — zwraca link do podania lub wpisania rozmówcy.",
    handler: sendInvestorRegistrationLink,
  },
];
