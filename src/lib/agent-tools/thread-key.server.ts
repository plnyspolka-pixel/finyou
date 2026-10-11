// Klucz wątku dla kanałów asynchronicznych (Messenger, SMS, e-mail, czat).
//
// Router wiadomości otwiera NOWĄ rozmowę ElevenLabs przy każdej wiadomości
// (elevenlabs-text-turn), więc `system__conversation_id` zmienia się co turę.
// Bez stałego klucza sesja narzędzi (agent_tool_sessions) gubiłaby
// potwierdzoną tożsamość i rozpoznaną potrzebę między wiadomościami — klient
// potwierdzałby się przy każdym SMS-ie, a recepcja rozpoznawała go od nowa.
//
// Klucz trafia do agenta jako zmienna dynamiczna `thread_key`. Zmienne
// dynamiczne może ustawić także klient widgetu, dlatego klucz jest PODPISANY
// (HMAC z AGENT_TOOLS_SECRET): tylko nasz serwer może go wybić, a podrobiony
// albo cudzy klucz jest ignorowany — sesja wraca wtedy do id rozmowy.
//
// Wątek to NIE sam lead: lead dopasowuje się po e-mailu / telefonie, które
// każdy może wpisać w formularzu czatu. Wątek wiąże lead z tożsamością, którą
// uwierzytelniła PLATFORMA kanału (sesja czatu w przeglądarce, PSID Messengera,
// numer nadawcy SMS, adres nadawcy e-maila). Obca sesja czatu = inny wątek =
// brak cudzej, potwierdzonej tożsamości.
//
// Klucz v2 niesie też kontakt z kanału (numer nadawcy SMS / adres e-maila) —
// to jedyna droga, którą narzędzia dostają „pewny” kontakt w kanałach
// tekstowych. Kontakt, który rozmówca tylko NAPISAŁ, przychodzi w `args`
// i nigdy nie jest dowodem.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const V1 = "thr1";
const V2 = "thr2";
const THREAD_ID_RE = /^[A-Za-z0-9:_-]{1,96}$/;

export interface ThreadClaims {
  threadId: string;
  /** Numer nadawcy z kanału (SMS) — E.164. */
  phone?: string | null;
  /** Adres nadawcy z kanału (e-mail). */
  email?: string | null;
}

function sign(prefix: string, payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${prefix}:${payload}`)
    .digest("base64url")
    .slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * `thr1.<threadId>.<podpis>` (bez kontaktu) albo `thr2.<payload>.<podpis>`
 * (z kontaktem kanału); null, gdy brak sekretu albo id ma niedozwolone znaki.
 */
export function mintThreadKey(
  threadId: string,
  secret = process.env.AGENT_TOOLS_SECRET,
  contact: { phone?: string | null; email?: string | null } = {},
): string | null {
  if (!secret || !THREAD_ID_RE.test(threadId)) return null;
  const phone = contact.phone?.trim() || null;
  const email = contact.email?.trim().toLowerCase() || null;
  if (!phone && !email) return `${V1}.${threadId}.${sign(V1, threadId, secret)}`;
  const payload = Buffer.from(JSON.stringify({ t: threadId, p: phone, e: email })).toString(
    "base64url",
  );
  return `${V2}.${payload}.${sign(V2, payload, secret)}`;
}

/** Pełna treść poprawnie podpisanego klucza; wszystko inne → null. */
export function readThreadKey(
  raw: unknown,
  secret = process.env.AGENT_TOOLS_SECRET,
): ThreadClaims | null {
  if (!secret || typeof raw !== "string" || raw.length > 600) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [prefix, payload, sig] = parts;
  if (prefix === V1) {
    if (!THREAD_ID_RE.test(payload)) return null;
    return safeEqual(sign(V1, payload, secret), sig) ? { threadId: payload } : null;
  }
  if (prefix === V2) {
    if (!safeEqual(sign(V2, payload, secret), sig)) return null;
    try {
      const o = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        t?: unknown;
        p?: unknown;
        e?: unknown;
      };
      if (typeof o.t !== "string" || !THREAD_ID_RE.test(o.t)) return null;
      return {
        threadId: o.t,
        phone: typeof o.p === "string" && o.p ? o.p : null,
        email: typeof o.e === "string" && o.e ? o.e : null,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Id wątku z poprawnie podpisanego klucza; wszystko inne → null. */
export function verifyThreadKey(
  raw: unknown,
  secret = process.env.AGENT_TOOLS_SECRET,
): string | null {
  return readThreadKey(raw, secret)?.threadId ?? null;
}

/** Klucz sesji narzędzi dla wątku (odróżniony od id rozmów ElevenLabs). */
export function threadSessionId(threadId: string): string {
  return `thread:${threadId}`;
}

/**
 * Skrót tożsamości kanału do id wątku: id sesji czatu / PSID / adres nie
 * trafiają do klucza wprost (klucz widzi model), tylko ich skrót.
 */
export function channelIdentityDigest(kind: string, value: string): string {
  return `${kind}-${createHash("sha256").update(`${kind}:${value}`).digest("hex").slice(0, 20)}`;
}
