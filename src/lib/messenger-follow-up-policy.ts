// Kiedy Ania sama przypomina się na Messengerze / Instagramie (follow-up-tick).
// Czysta funkcja — tę samą decyzję podejmuje cron i sprawdza test
// (vitest + MCP `run_ania_e2e`), więc test nie może rozjechać się z produkcją.

/** Godziny od ostatniej wiadomości Ani do przypomnienia; jedno i koniec. */
export const FOLLOWUP_OFFSETS_HOURS = [24];
/** Odpowiedź + przypomnienia w jednej serii bez odzewu klienta. */
export const MAX_OUTBOUND = FOLLOWUP_OFFSETS_HOURS.length + 1;

export const FOLLOWUP_TERMINAL_STATUSES = new Set([
  "zamkniety",
  "closed",
  "won",
  "lost",
  "odrzucony",
  "rezygnacja",
  "wyplacony",
  "spłacony",
  "do_not_contact",
  "blacklist",
]);

/** Przypomnienia tylko 8:00–20:00 czasu polskiego. */
export function isFollowUpQuietHour(now: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  return hour < 8 || hour >= 20;
}

export type FollowUpInput = {
  now: number;
  lastOutboundAt: number;
  lastInboundAt: number;
  /** Wiadomości Ani od ostatniej wiadomości klienta (w bieżącej serii). */
  outboundSinceInbound: number;
  /** Klient prosił o telefon gdziekolwiek w rozmowie. */
  callRequested: boolean;
  leadStatus?: string | null;
  paused?: boolean;
  hasApplication?: boolean;
  isTest?: boolean;
};

export type FollowUpDecision = { send: true; step: number } | { send: false; reason: string };

export function messengerFollowUpDecision(i: FollowUpInput): FollowUpDecision {
  if (i.isTest) return { send: false, reason: "rozmowa testowa" };
  if (isFollowUpQuietHour(i.now)) return { send: false, reason: "cisza nocna (20–8)" };
  if (!i.lastOutboundAt) return { send: false, reason: "Ania jeszcze nie pisała" };
  if (i.lastInboundAt >= i.lastOutboundAt) return { send: false, reason: "klient odpisał" };
  if (i.callRequested) return { send: false, reason: "klient prosił o telefon" };
  if (i.leadStatus && FOLLOWUP_TERMINAL_STATUSES.has(i.leadStatus)) {
    return { send: false, reason: `status ${i.leadStatus}` };
  }
  if (i.leadStatus === "wymaga_kontaktu")
    return { send: false, reason: "czeka na kontakt zespołu" };
  if (i.paused) return { send: false, reason: "przypomnienia wstrzymane" };
  if (i.hasApplication) return { send: false, reason: "lead ma wniosek" };
  const step = Math.max(1, i.outboundSinceInbound);
  if (step >= MAX_OUTBOUND) return { send: false, reason: "limit przypomnień" };
  const offsetH = FOLLOWUP_OFFSETS_HOURS[step - 1];
  if (offsetH == null) return { send: false, reason: "limit przypomnień" };
  if (i.now < i.lastOutboundAt + offsetH * 3600_000) {
    return { send: false, reason: `za wcześnie (po ${offsetH} h)` };
  }
  return { send: true, step };
}
