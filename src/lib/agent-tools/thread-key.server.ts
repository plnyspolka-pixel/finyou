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
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "thr1";

function sign(threadId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${PREFIX}:${threadId}`).digest("base64url").slice(0, 32);
}

/** `thr1.<threadId>.<podpis>` albo null, gdy brak sekretu. */
export function mintThreadKey(threadId: string, secret = process.env.AGENT_TOOLS_SECRET): string | null {
  if (!secret || !/^[A-Za-z0-9:_-]{1,96}$/.test(threadId)) return null;
  return `${PREFIX}.${threadId}.${sign(threadId, secret)}`;
}

/** Id wątku z poprawnie podpisanego klucza; wszystko inne → null. */
export function verifyThreadKey(raw: unknown, secret = process.env.AGENT_TOOLS_SECRET): string | null {
  if (!secret || typeof raw !== "string" || raw.length > 160) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, threadId, sig] = parts;
  if (!/^[A-Za-z0-9:_-]{1,96}$/.test(threadId)) return null;
  const expected = Buffer.from(sign(threadId, secret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length) return null;
  return timingSafeEqual(expected, got) ? threadId : null;
}

/** Klucz sesji narzędzi dla wątku (odróżniony od id rozmów ElevenLabs). */
export function threadSessionId(threadId: string): string {
  return `thread:${threadId}`;
}
