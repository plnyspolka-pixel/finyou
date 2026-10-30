// Piaskownica testów end-to-end Ani (MCP `run_ania_e2e`).
//
// Test przepuszcza wiadomość przez DOKŁADNIE ten sam kod co prawdziwy
// Messenger (lead, wzbogacenie, wybór agenta, tura w ElevenLabs), a różni się
// tylko identyfikatorami: nadawca / komentarz testowy zaczyna się od `e2e-`.
// Każde wyjście na zewnątrz (Graph API, push do zespołu, narzędzia agentów
// z prawdziwym skutkiem: SMS, telefon) dla takiego identyfikatora NIE wychodzi
// — trafia do pamięci testu, skąd raport je czyta.

export const E2E_PREFIX = "e2e-";
/** `thread_key` rozmowy testowej — po nim webhooki narzędzi rozpoznają test. */
export const E2E_THREAD_PREFIX = "e2e:";
/** Numery testowe 100 200 3xx — w Polsce nie ma numerów zaczynających się od 1. */
export const E2E_PHONE_PREFIX = "+48100200";

export function isE2ePhone(phone: string | null | undefined): boolean {
  return typeof phone === "string" && phone.replace(/[\s-]/g, "").startsWith(E2E_PHONE_PREFIX);
}

export function isE2eId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(E2E_PREFIX);
}

export function isE2eThread(threadKey: string | null | undefined): boolean {
  return typeof threadKey === "string" && threadKey.startsWith(E2E_THREAD_PREFIX);
}

export type E2eOutbound = {
  kind: "messenger" | "comment_public" | "comment_private";
  to: string;
  text: string;
  proactive?: boolean;
};

// Pamięć jednego uruchomienia testu (ten sam Worker, ta sama obsługa żądania).
const outbox: E2eOutbound[] = [];

export function recordE2eOutbound(entry: E2eOutbound): { ok: true; messageId: string } {
  outbox.push(entry);
  return { ok: true, messageId: `e2e-msg-${outbox.length}` };
}

/** Wiadomości „wysłane” do danego odbiorcy testowego, od najstarszej. */
export function e2eOutboundFor(to: string): E2eOutbound[] {
  return outbox.filter((m) => m.to === to);
}

export function clearE2eOutbound(prefix?: string): void {
  for (let i = outbox.length - 1; i >= 0; i--) {
    if (!prefix || outbox[i].to.startsWith(prefix)) outbox.splice(i, 1);
  }
}
