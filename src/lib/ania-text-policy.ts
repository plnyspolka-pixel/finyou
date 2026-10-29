import { honorificFor, usableFirstName } from "./ania-lead-context";

export function isTextFiller(text: string): boolean {
  return /^już sprawdzam[.!…]*$/i.test(text.trim());
}

/** Warsaw calendar dates, not elapsed 24-hour intervals. */
export function investorFirstMessage(vars: Record<string, unknown>, now = new Date()): string | undefined {
  if (!String(vars.lead_source ?? "").trim()) return undefined;
  const first = usableFirstName(String(vars.first_name ?? ""));
  const forma = vars.forma === "Pan" || vars.forma === "Pani" ? vars.forma : honorificFor(first);
  // The nominative name cannot follow Panie/Pani (Jan → Janie, Anna → Anno).
  // Keep unknown names intact in a separate neutral line rather than guessing declension.
  const vocatives: Record<string, string> = { Jan: "Janie", Marek: "Marku", Piotr: "Piotrze", Filip: "Filipie", Dawid: "Dawidzie", Kuba: "Kubo", Anna: "Anno", Ewa: "Ewo", Maria: "Mario" };
  const vocative = vocatives[first];
  const greeting = first && vocative && forma ? `, ${forma === "Pan" ? "Panie" : "Pani"} ${vocative}` : "";
  const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
  const created = new Date(String(vars.lead_created_at ?? ""));
  const when = !isNaN(created.getTime()) && day(created) === day(now) ? "dzisiejsze "
    : !isNaN(created.getTime()) && day(created) === day(new Date(now.getTime() - 86400000)) ? "wczorajsze " : "";
  const amount = String(vars.lead_amount ?? "").trim();
  const currency = /zł|pln/i.test(amount) ? amount : `${amount} zł`;
  const amountPart = amount ? forma === "Pan" ? ` — wpisał Pan kwotę ${currency}`
    : forma === "Pani" ? ` — wpisała Pani kwotę ${currency}` : ` — podana kwota to ${currency}` : "";
  const question = forma ? `Jak dziś inwestuje ${forma} wolne środki?` : "Jak obecnie wygląda inwestowanie wolnych środków?";
  return `Dzień dobry${greeting}, tu Ania z Finance You. Dziękuję za ${when}zgłoszenie w formularzu o inwestowaniu${amountPart}. ${question}`;
}
/**
 * Notatka o przekazaniu rozmowy zamiast wiadomości do klienta: „przekazuję
 * go na ścieżkę inwestorów”, „przełączam do…”, echo polecenia „[SYSTEM…”.
 */
export function isInternalRoutingNote(text: string): boolean {
  return /\[SYSTEM|przekazuj[eę]\s+(go|j[aąe]|rozmow|klient|lead)|przełączam|ścieżk[eęiaą]\s+inwestor|transfer_to_agent/i.test(
    text,
  );
}
