// Klasyfikacja wyniku rozmowy z webhooka ElevenLabs.
//
// UWAGA na `call_successful` — to NIE jest informacja o tym, czy połączenie
// doszło do skutku, tylko ocena agenta względem kryteriów sukcesu (czy Ania
// osiągnęła cel rozmowy). Wcześniej `succ === "failure"` było sprawdzane przed
// długością rozmowy, więc 291-sekundowa rozmowa, w której klient poprosił
// o 300 tys. pod zastaw domu, lądowała w koszu jako „Błąd połączenia".
// W 30 dni tak oznaczonych zostało 83 rozmów przy zaledwie 19 „odebranych" —
// panel pokazywał ułamek tego, co naprawdę się wydarzyło.
//
// Kolejność reguł jest więc odwrotna: najpierw fakty o połączeniu (czy ktoś
// gadał, czy to poczta głosowa, czy nikt nie odebrał), a ocena jakości rozmowy
// zostaje wyłącznie jako metadana.

export interface CallOutcomeInput {
  /** `metadata.termination_reason` / `disconnection_reason` z ElevenLabs. */
  disconnectionReason?: string | null;
  /** `status` / `call_status` z ElevenLabs. */
  callStatus?: string | null;
  /** `analysis.call_successful` — ocena JAKOŚCI, nie połączenia. */
  callSuccessful?: string | null;
  /** Długość rozmowy w sekundach. */
  durationSec?: number | null;
}

export type CallOutcome = "answered" | "no_answer" | "busy" | "voicemail" | "failed" | "completed";

/** Od tylu sekund uznajemy, że po drugiej stronie ktoś realnie rozmawiał. */
export const HUMAN_CONVERSATION_MIN_SECONDS = 5;

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  answered: "Odebrana",
  no_answer: "Nieodebrana",
  busy: "Zajęte",
  voicemail: "Poczta głosowa",
  failed: "Błąd połączenia",
  completed: "Zakończona",
};

export function callOutcomeLabel(outcome: CallOutcome): string {
  return OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.completed;
}

function isVoicemail(reason: string): boolean {
  return reason.includes("voicemail") || reason.includes("machine");
}

export function classifyCallOutcome(input: CallOutcomeInput): {
  outcome: CallOutcome;
  label: string;
} {
  const reason = (input.disconnectionReason ?? "").toLowerCase();
  const status = (input.callStatus ?? "").toLowerCase();
  const success = (input.callSuccessful ?? "").toLowerCase();
  const duration = input.durationSec ?? 0;

  const outcome: CallOutcome = (() => {
    // 1) Poczta głosowa ma pierwszeństwo — nagranie też „trwa" kilkanaście sekund.
    if (isVoicemail(reason)) return "voicemail";
    // 2) Ktoś rozmawiał. Nieważne, jak agent ocenił własną skuteczność.
    if (duration >= HUMAN_CONVERSATION_MIN_SECONDS) return "answered";
    if (reason.includes("no_answer") || reason.includes("noanswer") || status === "no-answer")
      return "no_answer";
    if (reason.includes("busy")) return "busy";
    // 3) Dopiero tu prawdziwe błędy: krótkie połączenie, które padło.
    if (reason.includes("failed") || reason.includes("error") || status === "failed")
      return "failed";
    if (duration > 0 || reason || status) return "no_answer";
    if (success === "success") return "answered";
    return "completed";
  })();

  return { outcome, label: callOutcomeLabel(outcome) };
}

/**
 * Czy planować kolejne podejście. Rozmowa z człowiekiem NIGDY nie kwalifikuje
 * się do ponowienia — nawet gdy agent uznał ją za nieudaną.
 */
export function shouldRetryCall(outcome: CallOutcome, durationSec?: number | null): boolean {
  // Poczta głosowa trwa kilkanaście sekund, ale po drugiej stronie jest automat —
  // dlatego próg długości dotyczy wszystkiego poza nią.
  if (outcome === "voicemail") return true;
  if ((durationSec ?? 0) >= HUMAN_CONVERSATION_MIN_SECONDS) return false;
  return outcome === "no_answer" || outcome === "busy";
}
