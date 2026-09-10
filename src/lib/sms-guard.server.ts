// Centralny hamulec SMS-ów — JEDNO miejsce, które decyduje, czy wolno wysłać SMS
// na dany numer. Wpięty w `sendSmsInternal`, więc obowiązuje KAŻDE źródło:
// before_call z voicebota, kadencja follow-up, ania_callbacks, saturday_reminder,
// missing_info_follow_up, agent ElevenLabs itd.
//
// Powód: każdy tor wysyłał niezależnie i jeden lead (np. testowy z Mety) dostawał
// serię SMS-ów tego samego dnia — powitalny „za chwilę zadzwoni Ania" przy każdej
// próbie telefonu, SMS z magic linkiem, SMS z kadencji dnia 1 i SMS z callbacków.
//
// Reguły (kategoria zależy od źródła):
//   • critical      — OTP, wysyłka ręczna z panelu, windykacja, test: bez limitów.
//   • conversational— odpowiedź na SMS klienta / SMS zamówiony przez Anię w trakcie
//                     rozmowy: limit antypętlowy, bez okna godzinowego.
//   • automated     — cała reszta (marketing/nurture/przypomnienia): okno godzinowe,
//                     twardy limit dobowy i tygodniowy, dedup identycznej treści,
//                     poszanowanie `clients.do_not_sms` (STOP).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type SmsCategory = "critical" | "conversational" | "automated";

export interface SmsLimits {
  /** Maks. SMS-ów automatycznych na numer w 24 h. */
  automatedMaxPer24h: number;
  /** Maks. SMS-ów automatycznych na numer w 7 dni. */
  automatedMaxPer7d: number;
  /** Maks. odpowiedzi konwersacyjnych na numer w 24 h (bezpiecznik pętli). */
  conversationalMaxPer24h: number;
  /** Ile dni wstecz blokujemy powtórkę tej samej treści (automated). */
  duplicateWindowDays: number;
  /** Okno wysyłki SMS automatycznych — godziny Europe/Warsaw [start, end). */
  windowStartHour: number;
  windowEndHour: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Domyślne limity — nadpisywalne zmiennymi środowiskowymi bez zmiany kodu. */
export function defaultSmsLimits(): SmsLimits {
  return {
    automatedMaxPer24h: envInt("SMS_AUTOMATED_MAX_PER_24H", 1),
    automatedMaxPer7d: envInt("SMS_AUTOMATED_MAX_PER_7D", 3),
    conversationalMaxPer24h: envInt("SMS_CONVERSATIONAL_MAX_PER_24H", 8),
    duplicateWindowDays: envInt("SMS_DUPLICATE_WINDOW_DAYS", 14),
    windowStartHour: envInt("SMS_WINDOW_START_HOUR", 8),
    windowEndHour: envInt("SMS_WINDOW_END_HOUR", 20),
  };
}

/** Źródła, które NIGDY nie podlegają limitom (człowiek albo akcja klienta). */
const CRITICAL_SOURCES = new Set(["phone_verification", "panel_manual", "windykacja", "test"]);

/** Źródła konwersacyjne — klient sam zaczął rozmowę / poprosił o SMS. */
const CONVERSATIONAL_SOURCES = new Set(["sms_agent_reply", "elevenlabs_agent"]);

export function classifySmsSource(source: string | null | undefined): SmsCategory {
  const s = String(source ?? "").trim();
  if (CRITICAL_SOURCES.has(s)) return "critical";
  if (CONVERSATIONAL_SOURCES.has(s)) return "conversational";
  return "automated";
}

/**
 * Normalizacja treści na potrzeby dedupu. Wycinamy URL-e (magic linki różnią się
 * tokenem przy każdej wysyłce, a wiadomość jest ta sama) i interpunkcję.
 */
export function normalizeSmsBody(body: string | null | undefined): string {
  return String(body ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, " ")
    .trim();
}

export function warsawHourAndWeekday(now: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  return {
    hour: Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10),
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
  };
}

export interface RecentSms {
  body: string | null;
  createdAt: string | Date;
}

export type SmsBlockReason =
  | "opt_out"
  | "quiet_hours"
  | "sunday"
  | "duplicate"
  | "rate_limit_24h"
  | "rate_limit_7d"
  | "loop_guard";

export interface SmsDecision {
  allowed: boolean;
  reason?: SmsBlockReason;
  /** Czytelny opis do logów / komunikatu zwrotnego. */
  detail?: string;
}

export interface SmsDecisionInput {
  category: SmsCategory;
  body: string;
  now: Date;
  /** Wychodzące, wysłane SMS-y na ten numer z ostatnich 7+ dni (kolejność dowolna). */
  recent: RecentSms[];
  optedOut: boolean;
  limits?: SmsLimits;
}

/** Czysta decyzja — bez I/O, testowalna. */
export function decideSms(input: SmsDecisionInput): SmsDecision {
  const limits = input.limits ?? defaultSmsLimits();
  if (input.category === "critical") return { allowed: true };

  if (input.optedOut) {
    return { allowed: false, reason: "opt_out", detail: "Numer wypisany z SMS (do_not_sms)" };
  }

  const nowMs = input.now.getTime();
  const since = (hours: number) => nowMs - hours * 3600_000;
  const at = (r: RecentSms) =>
    (typeof r.createdAt === "string" ? new Date(r.createdAt) : r.createdAt).getTime();
  const inLast = (hours: number) => input.recent.filter((r) => at(r) >= since(hours));

  if (input.category === "conversational") {
    const last24h = inLast(24);
    if (last24h.length >= limits.conversationalMaxPer24h) {
      return {
        allowed: false,
        reason: "loop_guard",
        detail: `Limit odpowiedzi SMS: ${last24h.length}/${limits.conversationalMaxPer24h} w 24 h`,
      };
    }
    const normalized = normalizeSmsBody(input.body);
    if (normalized && last24h.some((r) => normalizeSmsBody(r.body) === normalized)) {
      return {
        allowed: false,
        reason: "duplicate",
        detail: "Identyczna odpowiedź poszła już w ostatnich 24 h",
      };
    }
    return { allowed: true };
  }

  // --- automated ---
  const { hour, weekday } = warsawHourAndWeekday(input.now);
  if (weekday === "Sun") {
    return { allowed: false, reason: "sunday", detail: "Niedziela — SMS-ów nie wysyłamy" };
  }
  if (hour < limits.windowStartHour || hour >= limits.windowEndHour) {
    return {
      allowed: false,
      reason: "quiet_hours",
      detail: `Poza oknem SMS (${limits.windowStartHour}:00–${limits.windowEndHour}:00 Warszawa, jest ${hour}:00)`,
    };
  }

  const normalized = normalizeSmsBody(input.body);
  if (normalized) {
    const dupSince = nowMs - limits.duplicateWindowDays * 24 * 3600_000;
    const dup = input.recent.find(
      (r) => at(r) >= dupSince && normalizeSmsBody(r.body) === normalized,
    );
    if (dup) {
      return {
        allowed: false,
        reason: "duplicate",
        detail: `Ta sama treść poszła już ${new Date(at(dup)).toISOString()} (okno ${limits.duplicateWindowDays} dni)`,
      };
    }
  }

  const last24h = inLast(24);
  if (last24h.length >= limits.automatedMaxPer24h) {
    return {
      allowed: false,
      reason: "rate_limit_24h",
      detail: `Limit dobowy: ${last24h.length}/${limits.automatedMaxPer24h} SMS w 24 h`,
    };
  }
  const last7d = inLast(24 * 7);
  if (last7d.length >= limits.automatedMaxPer7d) {
    return {
      allowed: false,
      reason: "rate_limit_7d",
      detail: `Limit tygodniowy: ${last7d.length}/${limits.automatedMaxPer7d} SMS w 7 dni`,
    };
  }

  return { allowed: true };
}

/** Czy numer jest wypisany z SMS-ów (STOP → clients.do_not_sms). */
export async function isSmsOptedOut(phoneNormalized: string): Promise<boolean> {
  const s = admin();
  const { data } = await s
    .from("clients")
    .select("do_not_sms")
    .eq("phone_normalized", phoneNormalized)
    .eq("do_not_sms", true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Wysłane SMS-y wychodzące na numer z ostatnich N dni (domyślnie okno dedupu). */
export async function recentOutboundSms(
  phoneNormalized: string,
  days: number,
): Promise<RecentSms[]> {
  const s = admin();
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const { data } = await s
    .from("lead_communications")
    .select("content, created_at")
    .eq("phone_normalized", phoneNormalized)
    .eq("channel", "sms")
    .eq("direction", "outbound")
    .eq("status", "sent")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{ content: string | null; created_at: string }>;
  return rows.map((r) => ({ body: r.content ?? null, createdAt: r.created_at }));
}

/**
 * Pełne sprawdzenie przed wysyłką. Woła je `sendSmsInternal` — nie trzeba
 * (i nie należy) wywoływać go osobno w poszczególnych torach.
 */
export async function evaluateSmsGuard(opts: {
  phoneNormalized: string;
  body: string;
  source: string;
  category?: SmsCategory;
  now?: Date;
}): Promise<SmsDecision> {
  const category = opts.category ?? classifySmsSource(opts.source);
  if (category === "critical") return { allowed: true };

  const limits = defaultSmsLimits();
  try {
    const [optedOut, recent] = await Promise.all([
      isSmsOptedOut(opts.phoneNormalized),
      recentOutboundSms(opts.phoneNormalized, Math.max(7, limits.duplicateWindowDays)),
    ]);
    return decideSms({
      category,
      body: opts.body,
      now: opts.now ?? new Date(),
      recent,
      optedOut,
      limits,
    });
  } catch (e) {
    // Awaria odczytu nie może zablokować krytycznej komunikacji, ale też nie
    // powinna otwierać zalewu — przepuszczamy i zostawiamy ślad w logach.
    console.error("[sms-guard] check failed, allowing", e);
    return { allowed: true };
  }
}
