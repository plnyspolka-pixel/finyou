// Strażnik narzędzi agentów: autoryzacja wywołania, sesja rozmowy, limity,
// redakcja danych wrażliwych i audyt. Każda decyzja (także odmowa) zostaje
// w `agent_tool_calls`. Zasada: domyślnie ODMOWA; wszystko, co nie jest
// wprost dozwolone, jest zabronione.
import { createHash, timingSafeEqual } from "node:crypto";
import type {
  AgentKey,
  SubjectKind,
  ToolDecision,
  ToolRequestBody,
  ToolSession,
} from "./types";
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
 * ElevenLabs podaje w `system__conversation_id` identyfikator rozmowy. Gdy
 * go brak (np. test z konsoli), budujemy stabilny zastępczy z telefonu /
 * e-maila, żeby limity i weryfikacja tożsamości nadal działały per rozmówca.
 */
export function resolveConversationId(body: ToolRequestBody, callerPhone: string | null): string {
  const raw = String(body.conversation_id ?? "").trim();
  if (raw && raw.length <= 128) return raw;
  const seed = callerPhone ?? String(body.email ?? "").toLowerCase() ?? "anon";
  return `synthetic:${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
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

const EMPTY_SESSION = (conversationId: string, agentKey: AgentKey, channel: string): ToolSession => ({
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
    await s.from("agent_tool_sessions").insert(fresh).then(
      () => undefined,
      () => undefined,
    );
    return fresh;
  }
  // Sesja należy do rozmowy; agent_key może się zmienić po transferze
  // (recepcja → windykacja), ale weryfikacja tożsamości NIE przechodzi na
  // inny podmiot — zostaje przy tym samym conversation_id.
  return {
    ...EMPTY_SESSION(conversationId, agentKey, channel),
    ...(data as Partial<ToolSession>),
    agent_key: agentKey,
    needs: (data as any).needs ?? {},
  } as ToolSession;
}

export async function saveSession(patch: Partial<ToolSession> & { conversation_id: string }): Promise<void> {
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
  subject: { kind: SubjectKind; id: string | null; lead_id?: string | null; case_id?: string | null; loan_id?: string | null; investor_user_id?: string | null },
): Promise<ToolSession> {
  const next: ToolSession = {
    ...session,
    identity_verified: true,
    identity_method: method,
    identity_verified_at: new Date().toISOString(),
    subject_kind: subject.kind,
    subject_id: subject.id,
    lead_id: subject.lead_id ?? session.lead_id,
    case_id: subject.case_id ?? session.case_id,
    loan_id: subject.loan_id ?? session.loan_id,
    investor_user_id: subject.investor_user_id ?? session.investor_user_id,
  };
  await saveSession(next);
  return next;
}

export const MAX_IDENTITY_ATTEMPTS = 3;

export async function bumpIdentityAttempt(session: ToolSession): Promise<ToolSession> {
  const next = { ...session, identity_attempts: session.identity_attempts + 1 };
  await saveSession({ conversation_id: session.conversation_id, identity_attempts: next.identity_attempts });
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

/** Wartości wyglądające jak dane wrażliwe — maskowane nawet pod niewinnym kluczem. */
const VALUE_PATTERNS: Array<{ name: string; re: RegExp; mask: (m: string) => string }> = [
  // PESEL: 11 cyfr
  { name: "pesel", re: /\b\d{11}\b/g, mask: () => "[PESEL ukryty]" },
  // Numer rachunku PL: 26 cyfr (z/bez spacji)
  {
    name: "iban",
    re: /\b(?:PL)?\d{2}(?:[ \-]?\d{4}){6}\b/g,
    mask: (m) => `…${m.replace(/\D/g, "").slice(-4)}`,
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
        if (p.re.test(out)) {
          out = out.replace(p.re, (m) => p.mask(m));
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
      out[k] = walk(val, path ? `${path}.${k}` : k);
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
