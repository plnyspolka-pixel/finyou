// Reguły oceny odpowiedzi Ani w teście end-to-end — czyste funkcje, każda
// odpowiada konkretnej wpadce z produkcji (październik 2026).
import { isInternalRoutingNote } from "@/lib/ania-text-policy";

export type CheckResult = { name: string; pass: boolean; detail?: string };

/** Powitanie agenta wysłane zamiast odpowiedzi (A0/A2P po zerwanej sesji). */
export function isBareGreeting(reply: string): boolean {
  const t = reply.trim().replace(/\s+/g, " ");
  return /^dzień dobry,? tu ania z finance you\.? w czym mogę pomóc\??$/i.test(t);
}

/** Ania mówi o sobie w rodzaju męskim („Napisałem do Ciebie…”). */
export function hasMasculineSelf(reply: string): boolean {
  return /(?<!\p{L})(napisa|zapisa|sprawdzi|przekaza|wysła|zrobi|przygotowa|wróci|odezwa)łem(?!\p{L})/iu.test(
    reply,
  );
}

export function hasEmoji(reply: string): boolean {
  return /\p{Extended_Pictographic}/u.test(reply);
}

/** Odpowiedź urwana w pół zdania. */
export function looksTruncated(reply: string): boolean {
  const t = reply.trim();
  return t.length > 0 && !/[.!?…)»"”:]$/.test(t);
}

/** Reguły tekstu wspólne dla każdej odpowiedzi Ani do klienta. */
export function textChecks(reply: string): CheckResult[] {
  return [
    { name: "nie jest samym powitaniem", pass: !isBareGreeting(reply) },
    {
      name: "bez notatki wewnętrznej",
      pass: !isInternalRoutingNote(reply),
      detail: isInternalRoutingNote(reply) ? "np. „przekazuję go na ścieżkę…”" : undefined,
    },
    { name: "Ania w formie żeńskiej", pass: !hasMasculineSelf(reply) },
    { name: "bez emoji", pass: !hasEmoji(reply) },
    { name: "odpowiedź nieurwana", pass: !looksTruncated(reply) },
  ];
}

/**
 * Czy odpowiedź zawiera wszystko, co agent powiedział w ElevenLabs po
 * ostatniej wiadomości klienta (wykrywa ucinanie po pierwszym zdaniu).
 */
export function coversTranscript(
  reply: string,
  transcript: Array<{ role: string; message?: string | null }>,
): { pass: boolean; missing: string[] } {
  // Bez tury klienta (otwarcie A2P) liczy się wszystko, co agent powiedział.
  const lastUser = transcript.map((t) => t.role).lastIndexOf("user");
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const replyN = norm(reply);
  const missing = transcript
    .slice(lastUser + 1)
    .filter((t) => t.role === "agent" && t.message && norm(t.message))
    .map((t) => norm(t.message as string))
    .filter((m) => !replyN.includes(m));
  return { pass: missing.length === 0, missing };
}
