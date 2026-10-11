// Wspólny kanał tekstowy (Messenger, Instagram, e-mail, czat, SMS) obsługiwany
// przez flotę: recepcja rozpoznaje potrzebę, specjalista prowadzi sprawę.
//
// Problem, który rozwiązuje ten moduł: router wiadomości otwiera nową rozmowę
// ElevenLabs dla KAŻDEJ wiadomości. Wbudowane `transfer_to_agent` działa
// tylko w obrębie jednej rozmowy, więc bez pamięci trasy recepcja
// rozpoznawałaby klienta od nowa przy każdej wiadomości, a pożyczkobiorca
// potwierdzałby tożsamość przy każdym SMS-ie. Dlatego:
//  * wątek ma stały, podpisany klucz (thread-key.server) — sesja narzędzi
//    (tożsamość, potrzeby) żyje w agent_tool_sessions pod
//    `thread:lead:<id>:<skrót nadawcy>`. Wątek to lead RAZEM z nadawcą
//    uwierzytelnionym przez platformę (sesja czatu, PSID, numer SMS, adres
//    e-mail): lead dopasowuje się po kontakcie, który każdy może wpisać
//    w formularzu, więc sam lead nie może nieść potwierdzonej tożsamości;
//  * trasę wybiera KOD z potrzeby zapisanej przez recepcję (save_needs →
//    needs.intent), nie model;
//  * gdy recepcja w tej turze rozpoznała potrzebę, ta sama wiadomość od razu
//    trafia do specjalisty — klient dostaje odpowiedź merytoryczną, a nie
//    „przekazuję rozmowę…”.
//
// Przełącznik: voicebot_settings.agent_fleet.text_entry = "recepcja".
// Bez niego moduł zwraca null i router działa jak dotąd (A1 intake).
import { EXISTING_AGENTS } from "@/lib/agent-fleet";
import {
  channelIdentityDigest,
  mintThreadKey,
  threadSessionId,
} from "@/lib/agent-tools/thread-key.server";

/** Klucz potrzeby (TRIAGE_INTENTS) → specjalista w kanale tekstowym. */
const INTENT_ROUTE: Record<string, TextRoute> = {
  nowe_finansowanie: "intake",
  trwajacy_wniosek: "intake",
  inwestowanie: "inwestor_presale_tekst",
  inwestor_z_kontem: "inwestor_panel",
  splata_umowy: "windykacja_tekst",
};

export type TextRoute =
  | "recepcja_tekst"
  | "intake"
  | "inwestor_presale_tekst"
  | "inwestor_panel"
  | "windykacja_tekst";

/** Po tylu dniach ciszy wątek zaczyna znowu od recepcji (sprawa mogła się zmienić). */
export const ROUTE_TTL_DAYS = 30;

export interface FleetSettings {
  text_entry?: "recepcja" | "intake" | null;
  agents?: Partial<Record<string, string>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdmin = any;
let adminPromise: Promise<LooseAdmin> | null = null;
function admin(): Promise<LooseAdmin> {
  adminPromise ??= import("@/integrations/supabase/client.server").then(
    (m) => m.supabaseAdmin as LooseAdmin,
  );
  return adminPromise;
}

export async function loadFleetSettings(): Promise<FleetSettings | null> {
  const s = await admin();
  const { data, error } = await s
    .from("voicebot_settings")
    .select("agent_fleet")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data?.agent_fleet || typeof data.agent_fleet !== "object") return null;
  return data.agent_fleet as FleetSettings;
}

/** Trasa wątku z zapisanej potrzeby; nieświeża albo nieznana → recepcja. */
export function routeFromSession(
  session: { needs?: Record<string, unknown> | null; updated_at?: string | null } | null,
  now: Date,
): TextRoute {
  const intent = String(session?.needs?.intent ?? "");
  const route = INTENT_ROUTE[intent];
  if (!route) return "recepcja_tekst";
  const updated = session?.updated_at ? Date.parse(session.updated_at) : NaN;
  if (Number.isFinite(updated) && now.getTime() - updated > ROUTE_TTL_DAYS * 86_400_000)
    return "recepcja_tekst";
  return route;
}

export function agentIdForRoute(route: TextRoute, settings: FleetSettings): string | null {
  if (route === "intake") return settings.agents?.intake ?? EXISTING_AGENTS.intake;
  if (route === "inwestor_panel")
    return settings.agents?.inwestor_panel ?? EXISTING_AGENTS.inwestor_panel;
  return settings.agents?.[route] ?? null;
}

async function loadThreadSession(
  sessionId: string,
): Promise<{ needs?: Record<string, unknown>; updated_at?: string } | null> {
  const s = await admin();
  const { data } = await s
    .from("agent_tool_sessions")
    .select("needs, updated_at")
    .eq("conversation_id", sessionId)
    .maybeSingle();
  return data ?? null;
}

export interface ChannelIdentity {
  kind: "chat" | "messenger" | "instagram" | "sms" | "email";
  value: string;
}

/**
 * Id wątku: lead + skrót nadawcy z kanału. Kontakt do klucza (numer SMS,
 * adres e-mail) idzie osobno, podpisany — narzędzia traktują go jak
 * caller-id (kandydat, nie dowód).
 */
export function threadFor(
  leadId: string,
  identity: ChannelIdentity,
): {
  threadId: string;
  contact: { phone?: string | null; email?: string | null };
} {
  const value = identity.value.trim();
  return {
    threadId: `lead:${leadId}:${channelIdentityDigest(identity.kind, value.toLowerCase())}`,
    contact:
      identity.kind === "sms"
        ? { phone: value }
        : identity.kind === "email"
          ? { email: value.toLowerCase() }
          : {},
  };
}

export interface FleetTurnInput {
  leadId: string;
  channel: string;
  /** Nadawca uwierzytelniony przez platformę kanału; bez niego flota się nie włącza. */
  channelIdentity?: ChannelIdentity | null;
  /** Wiadomość z doklejonym kontekstem historii (jak w runAgentTurn). */
  message: string;
  dynamicVariables: Record<string, string>;
  now?: Date;
}

export interface FleetTurnResult {
  ok: boolean;
  reply?: string;
  route?: TextRoute;
  error?: string;
}

/**
 * Jedna tura na wspólnym kanale tekstowym. Zwraca null, gdy flota nie jest
 * włączona dla kanałów tekstowych (router zostaje przy dotychczasowej ścieżce).
 */
export async function fleetTextTurn(input: FleetTurnInput): Promise<FleetTurnResult | null> {
  const settings = await loadFleetSettings().catch(() => null);
  if (!settings || settings.text_entry !== "recepcja") return null;
  // Bez nadawcy z kanału (np. follow-up wysyłany z inicjatywy systemu) nie ma
  // czym związać wątku — zostaje dotychczasowa ścieżka A1.
  const identity = input.channelIdentity;
  if (!identity?.value?.trim()) return null;

  const { threadId, contact } = threadFor(input.leadId, identity);
  const threadKey = mintThreadKey(threadId, undefined, contact);
  if (!threadKey) return { ok: false, error: "Brak AGENT_TOOLS_SECRET — nie można podpisać wątku" };
  const sessionId = threadSessionId(threadId);
  const now = input.now ?? new Date();

  const { elevenLabsTextTurn } = await import("@/lib/elevenlabs-text-turn.server");
  const vars = { ...input.dynamicVariables, thread_key: threadKey };

  const route = routeFromSession(await loadThreadSession(sessionId), now);
  const agentId = agentIdForRoute(route, settings);
  if (!agentId) return { ok: false, error: `Brak agenta dla trasy ${route}` };

  const first = await elevenLabsTextTurn({
    agentId,
    userMessage: input.message,
    dynamicVariables: vars,
  });
  if (!first.ok || !first.reply)
    return { ok: false, route, error: first.error ?? "pusta odpowiedź" };
  if (route !== "recepcja_tekst") return { ok: true, reply: first.reply, route };

  // Recepcja mogła w tej turze zapisać potrzebę — wtedy ta sama wiadomość
  // idzie od razu do specjalisty, a odpowiedź recepcji („przekazuję…”) znika.
  const next = routeFromSession(await loadThreadSession(sessionId), now);
  if (next === "recepcja_tekst") return { ok: true, reply: first.reply, route };
  const nextAgent = agentIdForRoute(next, settings);
  if (!nextAgent) return { ok: true, reply: first.reply, route };
  const second = await elevenLabsTextTurn({
    agentId: nextAgent,
    userMessage: input.message,
    dynamicVariables: vars,
  });
  if (!second.ok || !second.reply) return { ok: true, reply: first.reply, route };
  return { ok: true, reply: second.reply, route: next };
}
