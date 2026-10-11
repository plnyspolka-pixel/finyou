// Strażnik narzędzi agentów: autoryzacja wywołania, sesja rozmowy, limity,
// redakcja danych wrażliwych i audyt. Każda decyzja (także odmowa) zostaje
// w `agent_tool_calls`. Zasada: domyślnie ODMOWA; wszystko, co nie jest
// wprost dozwolone, jest zabronione.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readThreadKey, threadSessionId } from "./thread-key.server";
import type { AgentKey, SubjectKind, ToolDecision, ToolRequestBody, ToolSession } from "./types";
import { AGENT_KEYS } from "./types";

// Tabele `agent_tool_*` nie są jeszcze w wygenerowanym typie Database —
// klient w trybie luźnym, jak w elevenlabs-agents.server (voicebot_settings).
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

// ── Autoryzacja transportu ───────────────────────────────────────────────────

/**
 * Porównanie sekretu w czasie stałym. `allowQueryToken` = true tylko dla
 * narzędzi odczytu nisko-wrażliwych (zgodność wstecz z `?token=`); zapisy i
 * dane podmiotu wymagają nagłówka.
 */
export function authorizeRequest(
  request: Request,
  opts: { allowQueryToken: boolean },
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.AGENT_TOOLS_SECRET;
  if (!secret) return { ok: false, reason: "secret_not_configured" };
  const header = request.headers.get("x-agent-tools-secret");
  let provided = header;
  if (!provided && opts.allowQueryToken) {
    provided = new URL(request.url).searchParams.get("token");
  }
  if (!provided) return { ok: false, reason: "missing_secret" };
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return { ok: false, reason: "bad_secret" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_secret" };
}

// ── Normalizacja wejścia ─────────────────────────────────────────────────────

export function normalizeAgentKey(raw: unknown): AgentKey {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (AGENT_KEYS as readonly string[]).includes(s) ? (s as AgentKey) : "unknown";
}

/** Nazwa narzędzia bez prefiksu `fy_` i w jednym stylu (snake_case). */
export function normalizeToolName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^fy[_-]/, "")
    .replace(/[^a-z0-9_]/g, "_");
}

/**
 * Klucz sesji narzędzi:
 *  1. podpisany `thread_key` (kanały asynchroniczne — wątek trwa wiele
 *     rozmów ElevenLabs, patrz thread-key.server.ts),
 *  2. `system__conversation_id` z ElevenLabs,
 *  3. brak obu (wywołanie spoza ElevenLabs) — losowy, jednorazowy klucz.
 * Świadomie NIE wyprowadzamy klucza z telefonu ani e-maila: te pola może
 * podać model, a wspólny klucz oznaczałby dziedziczenie cudzej, już
 * potwierdzonej tożsamości.
 */
export function resolveConversationId(body: ToolRequestBody, _callerPhone?: string | null): string {
  const thread = readThreadKey((body as { thread_key?: unknown }).thread_key);
  if (thread) return threadSessionId(thread.threadId);
  const raw = String(body.conversation_id ?? "").trim();
  if (raw && raw.length <= 128 && /^[A-Za-z0-9_:-]+$/.test(raw) && !raw.startsWith("thread:"))
    return raw;
  return `ephemeral:${randomUUID()}`;
}

/**
 * Kontakt potwierdzony przez KANAŁ, nie przez rozmówcę:
 *  * `body.phone` — zmienna systemowa `system__caller_id` (model jej nie
 *    ustawia, klient widgetu też nie: prefiks `system__` jest zastrzeżony);
 *  * nadawca zapisany w podpisanym kluczu wątku (SMS / e-mail).
 * `args.phone` / `args.email` NIGDY tu nie trafiają — to tylko deklaracje.
 * Caller-id da się podrobić w sieci PSTN, więc ten kontakt wskazuje
 * KANDYDATA i wystarcza do danych leada, ale nie do akt sprawy ani konta
 * inwestora (tam numer umowy z nazwiskiem albo kod SMS).
 */
export async function resolveTrustedContact(
  body: ToolRequestBody,
): Promise<{ phone: string | null; email: string | null; source: "caller_id" | "thread" | null }> {
  const callerId = await normalizePhone(body?.phone);
  if (callerId) return { phone: callerId, email: null, source: "caller_id" };
  const thread = readThreadKey((body as { thread_key?: unknown })?.thread_key);
  if (thread && (thread.phone || thread.email)) {
    return {
      phone: await normalizePhone(thread.phone),
      email: normalizeEmail(thread.email),
      source: "thread",
    };
  }
  return { phone: null, email: null, source: null };
}

export async function normalizePhone(raw: unknown): Promise<string | null> {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const { normalizePolishPhone } = await import("@/lib/phone");
  const { normalized } = normalizePolishPhone(s);
  return normalized || null;
}

export function normalizeEmail(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

// ── Sesja rozmowy ────────────────────────────────────────────────────────────

const EMPTY_SESSION = (
  conversationId: string,
  agentKey: AgentKey,
  channel: string,
): ToolSession => ({
  conversation_id: conversationId,
  agent_key: agentKey,
  channel,
  subject_kind: "unknown",
  subject_id: null,
  lead_id: null,
  case_id: null,
  loan_id: null,
  investor_user_id: null,
  identity_verified: false,
  identity_method: null,
  identity_verified_at: null,
  identity_attempts: 0,
  recording_consent: null,
  do_not_contact: false,
  needs: {},
});

export async function loadSession(
  conversationId: string,
  agentKey: AgentKey,
  channel: string,
): Promise<ToolSession> {
  const s = await admin();
  const { data } = await s
    .from("agent_tool_sessions")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!data) {
    const fresh = EMPTY_SESSION(conversationId, agentKey, channel);
    // Zapis „best effort” — brak tabeli (migracja nie zastosowana) nie może
    // zatrzymać rozmowy; wtedy sesja żyje tylko w pamięci tego wywołania.
    await s
      .from("agent_tool_sessions")
      .insert(fresh)
      .then(
        () => undefined,
        () => undefined,
      );
    return fresh;
  }
  // Sesja należy do rozmowy; agent_key może się zmienić po transferze
  // (recepcja → windykacja), ale weryfikacja tożsamości NIE przechodzi na
  // inny podmiot — zostaje przy tym samym conversation_id.
  const session = {
    ...EMPTY_SESSION(conversationId, agentKey, channel),
    ...(data as Partial<ToolSession>),
    agent_key: agentKey,
    needs: (data as any).needs ?? {},
  } as ToolSession;
  return expireIdentity(session, new Date());
}

/** Ważność potwierdzonej tożsamości: rozmowa telefoniczna vs wątek tekstowy. */
export const IDENTITY_TTL_MINUTES = { call: 120, thread: 12 * 60 } as const;

/**
 * Potwierdzenie tożsamości wygasa. W wątku tekstowym (Messenger, SMS, czat)
 * rozmowa ciągnie się dniami, a urządzenie może trafić w inne ręce — po
 * czasie ważności rozmówca potwierdza się od nowa, a podmiot sesji wraca
 * do stanu „nieznany” (kandydatów wyznaczy ponownie identify_caller).
 */
export function expireIdentity(session: ToolSession, now: Date): ToolSession {
  if (!session.identity_verified) return session;
  const ttl = session.conversation_id.startsWith("thread:")
    ? IDENTITY_TTL_MINUTES.thread
    : IDENTITY_TTL_MINUTES.call;
  const at = Date.parse(String(session.identity_verified_at ?? ""));
  if (Number.isFinite(at) && now.getTime() - at <= ttl * 60_000) return session;
  return {
    ...session,
    identity_verified: false,
    identity_method: null,
    identity_verified_at: null,
    identity_attempts: 0,
    subject_kind: "unknown",
    subject_id: null,
    lead_id: null,
    case_id: null,
    loan_id: null,
    investor_user_id: null,
  };
}

export async function saveSession(
  patch: Partial<ToolSession> & { conversation_id: string },
): Promise<void> {
  const s = await admin();
  await s
    .from("agent_tool_sessions")
    .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: "conversation_id" })
    .then(
      () => undefined,
      (e: unknown) => console.error("[agent-tools] saveSession", (e as any)?.message),
    );
}

/**
 * Jedyna funkcja, która podnosi `identity_verified`. Woła ją handler
 * `verify_identity` PO sprawdzeniu dowodu w kodzie. Prompt nie ma do niej
 * dostępu inaczej niż przez ten handler.
 */
export async function markIdentityVerified(
  session: ToolSession,
  method: string,
  subject: {
    kind: SubjectKind;
    id: string | null;
    lead_id?: string | null;
    case_id?: string | null;
    loan_id?: string | null;
    investor_user_id?: string | null;
  },
): Promise<ToolSession> {
  const next: ToolSession = {
    ...session,
    identity_verified: true,
    identity_method: method,
    identity_verified_at: new Date().toISOString(),
    // Podmiot w CAŁOŚCI z dowodu. Żadne pole nie zostaje z kandydata sesji:
    // inaczej weryfikacja „jako ja” zostawiałaby sprawę / konto kogoś, kogo
    // identify_caller podsunął wcześniej (np. po cudzym e-mailu).
    subject_kind: subject.kind,
    subject_id: subject.id,
    lead_id: subject.lead_id ?? null,
    case_id: subject.case_id ?? null,
    loan_id: subject.loan_id ?? null,
    investor_user_id: subject.investor_user_id ?? null,
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    otp_subject: null,
  };
  await saveSession(next);
  return next;
}

/** Metody, które otwierają akta sprawy i konto inwestora (nie tylko dane leada). */
export const STRONG_IDENTITY_METHODS: readonly string[] = ["contract_number", "otp_sms"];

export function hasStrongIdentity(session: ToolSession): boolean {
  return (
    session.identity_verified &&
    STRONG_IDENTITY_METHODS.includes(String(session.identity_method ?? ""))
  );
}

// ── Blokada prób per podmiot ─────────────────────────────────────────────────
// Limit 3 prób dotyczy jednej rozmowy; nowa rozmowa zaczyna od zera. Dlatego
// nieudane dowody wobec KONKRETNEGO podmiotu (umowa się zgadza, nazwisko nie;
// zły kod SMS) liczymy także per podmiot, niezależnie od rozmowy.

export const SUBJECT_FAILURE_LIMIT = 5;
export const SUBJECT_FAILURE_WINDOW_HOURS = 24;

export async function recordIdentityFailure(
  subjectRef: string,
  conversationId: string,
  reason: string,
): Promise<void> {
  const s = await admin();
  await s
    .from("agent_identity_failures")
    .insert({
      subject_ref: subjectRef,
      conversation_id: conversationId,
      reason: reason.slice(0, 64),
    })
    .then(
      () => undefined,
      (e: unknown) => console.error("[agent-tools] identity failure insert", (e as any)?.message),
    );
}

export async function subjectLocked(subjectRef: string): Promise<boolean> {
  const s = await admin();
  const since = new Date(Date.now() - SUBJECT_FAILURE_WINDOW_HOURS * 3_600_000).toISOString();
  const { count, error } = await s
    .from("agent_identity_failures")
    .select("id", { count: "exact", head: true })
    .eq("subject_ref", subjectRef)
    .gte("created_at", since);
  if (error) {
    console.warn("[agent-tools] identity failure counter unavailable:", error.message);
    return false;
  }
  return (count ?? 0) >= SUBJECT_FAILURE_LIMIT;
}

export const MAX_IDENTITY_ATTEMPTS = 3;

export async function bumpIdentityAttempt(session: ToolSession): Promise<ToolSession> {
  const next = { ...session, identity_attempts: session.identity_attempts + 1 };
  await saveSession({
    conversation_id: session.conversation_id,
    identity_attempts: next.identity_attempts,
  });
  return next;
}

// ── Limity ───────────────────────────────────────────────────────────────────

export async function countRecentCalls(
  conversationId: string,
  tool: string,
  windowMinutes: number,
): Promise<number> {
  const s = await admin();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await s
    .from("agent_tool_calls")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("tool", tool)
    .eq("decision", "ok")
    .gte("created_at", since);
  // Brak tabeli = brak licznika; wtedy limit nie blokuje (fail-open tylko na
  // liczniku, nie na autoryzacji — i logujemy to).
  if (error) {
    console.warn("[agent-tools] rate-limit counter unavailable:", error.message);
    return 0;
  }
  return count ?? 0;
}

// ── Redakcja danych wrażliwych ───────────────────────────────────────────────

/** Klucze, które NIGDY nie opuszczają serwera, niezależnie od tabeli. */
export const DENY_KEY_PATTERNS: readonly RegExp[] = [
  /pesel/i,
  /password|haslo|hasło|secret|token|api_key|apikey/i,
  /embedding/i,
  /^iban$|rachunek_(?!splaty)/i, // rachunek_splaty wolno (dyktowany tylko na prośbę)
  /nr_dowodu|numer_dowodu|dowod_osobisty|seria_dowodu|paszport/i,
  /karta|card_number|cvv/i,
  /ssn|tax_id_secret/i,
  /^metadata$/i, // surowe blobs mogą nieść cokolwiek — handler wyciąga pola jawnie
];

/** Suma kontrolna PESEL — maskujemy tylko prawdziwe numery, nie każde 11 cyfr. */
export function isValidPesel(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = w.reduce((acc, wi, i) => acc + wi * Number(digits[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
}

/** Suma kontrolna NIP. */
export function isValidNip(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((acc, wi, i) => acc + wi * Number(digits[i]), 0) % 11;
  return sum !== 10 && sum === Number(digits[9]);
}

/** Suma kontrolna numeru dowodu osobistego (AAA + cyfra kontrolna + 5 cyfr). */
export function isValidIdCard(raw: string): boolean {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{3}\d{6}$/.test(s)) return false;
  const val = (c: string) => (/[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : Number(c));
  const w = [7, 3, 1, 0, 7, 3, 1, 7, 3];
  const sum = s.split("").reduce((acc, c, i) => acc + w[i] * val(c), 0);
  return sum % 10 === val(s[3]);
}

const digitsOf = (m: string) => m.replace(/\D/g, "");

/** Wartości wyglądające jak dane wrażliwe — maskowane nawet pod niewinnym kluczem. */
const VALUE_PATTERNS: Array<{ name: string; re: RegExp; mask: (m: string) => string }> = [
  // Numer rachunku PL: 26 cyfr (z/bez spacji) — przed PESEL, bo zawiera ciągi 11 cyfr.
  {
    name: "iban",
    re: /\b(?:PL)?\d{2}(?:[ -]?\d{4}){6}\b/g,
    mask: (m) => `…${m.replace(/\D/g, "").slice(-4)}`,
  },
  // PESEL: 11 cyfr, także ze spacjami / myślnikami, z poprawną sumą kontrolną.
  // Nie po „+” (numer +48… to telefon, nie PESEL).
  {
    name: "pesel",
    re: /(?<![+\d])\d(?:[ -]?\d){10}(?!\d)/g,
    mask: (m) => (isValidPesel(digitsOf(m)) ? "[PESEL ukryty]" : m),
  },
  // NIP: 10 cyfr (123-456-78-90, 123-45-67-890, ciągiem), z sumą kontrolną.
  {
    name: "nip",
    re: /(?<![+\d])\d{3}[ -]?\d{2,3}[ -]?\d{2}[ -]?\d{2,3}(?!\d)/g,
    mask: (m) => (digitsOf(m).length === 10 && isValidNip(digitsOf(m)) ? "[NIP ukryty]" : m),
  },
  // Dowód osobisty: AAA 123456 z sumą kontrolną.
  {
    name: "dowod",
    re: /\b[A-Za-z]{3}[ ]?\d{6}\b/g,
    mask: (m) => (isValidIdCard(m) ? "[numer dowodu ukryty]" : m),
  },
  // Karta płatnicza 13–19 cyfr
  { name: "card", re: /\b(?:\d[ -]?){13,19}\b/g, mask: () => "[numer karty ukryty]" },
];

export function isDeniedKey(key: string): boolean {
  return DENY_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Głęboka redakcja obiektu wyniku. Zwraca kopię + listę nazw redakcji.
 * `allow` pozwala handlerowi wprost przepuścić klucz, który pasuje do deny
 * (np. `rachunek_splaty` już przefiltrowany przez handler).
 */
export function redactDeep<T>(value: T, allow: readonly string[] = [], trail: string[] = []): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, path: string): unknown => {
    if (v == null) return v;
    if (typeof v === "string") {
      let out = v;
      for (const p of VALUE_PATTERNS) {
        p.re.lastIndex = 0;
        const next = out.replace(p.re, (m) => p.mask(m));
        if (next !== out) {
          out = next;
          trail.push(`${p.name}@${path || "$"}`);
        }
        p.re.lastIndex = 0;
      }
      return out;
    }
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return undefined;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (isDeniedKey(k) && !allow.includes(k)) {
        trail.push(`key:${k}@${path || "$"}`);
        continue;
      }
      // Klucz przepuszczony wprost (np. rachunek_splaty z umowy) nie przechodzi
      // też maskowania wartości — inaczej numer rachunku zamieniałby się w „…1234”.
      out[k] = allow.includes(k) ? val : walk(val, path ? `${path}.${k}` : k);
    }
    return out;
  };
  return walk(value, "") as T;
}

/** Maska telefonu do potwierdzenia bez ujawniania: „…kończy się na 12 34”. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? `…${d.slice(-4, -2)} ${d.slice(-2)}` : null;
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [u, d] = email.split("@");
  if (!u || !d) return null;
  return `${u.slice(0, 1)}***@${d}`;
}

// ── Audyt ────────────────────────────────────────────────────────────────────

/** Skrót argumentów do audytu: klucze + typy + długości, bez treści. */
export function argsDigest(args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (isDeniedKey(k)) {
      out[k] = "<redacted>";
      continue;
    }
    if (v == null) out[k] = "null";
    else if (typeof v === "string") out[k] = `string(${v.length})`;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    else if (Array.isArray(v)) out[k] = `array(${v.length})`;
    else out[k] = `object(${Object.keys(v as object).length})`;
  }
  return out;
}

export async function auditCall(entry: {
  conversation_id: string;
  agent_key: AgentKey;
  tool: string;
  decision: ToolDecision;
  reason?: string | null;
  args: Record<string, unknown>;
  rows?: number | null;
  redactions?: string[];
  duration_ms: number;
}): Promise<void> {
  const s = await admin();
  await s
    .from("agent_tool_calls")
    .insert({
      conversation_id: entry.conversation_id,
      agent_key: entry.agent_key,
      tool: entry.tool,
      decision: entry.decision,
      reason: entry.reason ?? null,
      args_digest: argsDigest(entry.args),
      rows_returned: entry.rows ?? null,
      redactions: entry.redactions?.length ? Array.from(new Set(entry.redactions)) : null,
      duration_ms: entry.duration_ms,
    })
    .then(
      () => undefined,
      (e: unknown) => console.error("[agent-tools] audit insert", (e as any)?.message),
    );
  // Odmowy i błędy dodatkowo w automation_events — tam zespół już patrzy.
  if (entry.decision !== "ok") {
    await s
      .from("automation_events")
      .insert({
        automation_type: "agent_tool_denied",
        status: "skipped",
        sent_payload: {
          conversation_id: entry.conversation_id,
          agent_key: entry.agent_key,
          tool: entry.tool,
          reason: entry.reason ?? null,
        },
        response_payload: { decision: entry.decision },
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
}
