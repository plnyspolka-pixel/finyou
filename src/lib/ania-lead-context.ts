// Routing leadów Ani (klient vs inwestor) i wspólne zmienne kontekstu leada.
// Czyste funkcje — testowane w ania-lead-context.test.ts.

/** A2P — inwestor prywatny, głos (telefon wychodzący do leadów inwestorskich). */
export const A2P_VOICE_AGENT_ID = "agent_3001m4n787csf1bt1k9km30288cj";
/** A2P — inwestor prywatny, tekst (Messenger). */
export const A2P_TEXT_AGENT_ID = "agent_5001m4n7b2qqf1m89xetjmzpjhzj";
/** A0 — recepcja, tekst (Messenger, nierozpoznany rozmówca). */
export const A0_TEXT_AGENT_ID = "agent_3601m4n7nwm2e8htr6vcpap8rx9q";
/** Agenci, którym przysługuje narzędzie schedule_investor_callback. */
export const INVESTOR_CALLBACK_AGENT_IDS = [A2P_VOICE_AGENT_ID, A2P_TEXT_AGENT_ID] as const;

export const INVESTOR_LANDING_URL = "https://financeyou.pl/dla-inwestora";
/** Źródło wpisów kolejki/SMS dla ścieżki inwestorskiej. */
export const INVESTOR_LEAD_SOURCE = "meta_lead_inwestor";

export type LeadRole = "klient" | "inwestor";

/**
 * Rola leada z formularza Meta: jawne ustawienie w panelu (`lead_role`) →
 * kategoria konta „inwestor” (`assigned_role`) → nazwa formularza zawiera
 * „inwest” → w pozostałych przypadkach klient.
 */
export function resolveLeadRole(form: {
  lead_role?: string | null;
  assigned_role?: string | null;
  form_name?: string | null;
} | null | undefined): LeadRole {
  const explicit = form?.lead_role;
  if (explicit === "klient" || explicit === "inwestor") return explicit;
  if (form?.assigned_role === "inwestor") return "inwestor";
  if (/inwest/i.test(form?.form_name ?? "")) return "inwestor";
  return "klient";
}

const MALE_A_NAMES = new Set(["kuba", "barnaba", "bonawentura", "kosma", "jarema"]);

/** „Pan”/„Pani” z imienia; puste lub nieznane → pusty string. */
export function honorificFor(firstName: string | null | undefined): "" | "Pan" | "Pani" {
  const n = String(firstName ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!n || !/^[a-ząćęłńóśźż-]{2,}$/i.test(n) || n === "lead") return "";
  if (MALE_A_NAMES.has(n)) return "Pan";
  return n.endsWith("a") ? "Pani" : "Pan";
}

/** Imię nadające się do zwrotu (bez placeholderów typu „Lead”). */
export function usableFirstName(firstName: string | null | undefined): string {
  const n = String(firstName ?? "").trim();
  if (!n || n.toLowerCase() === "lead") return "";
  return n;
}

export interface LeadContextInput {
  firstName?: string | null;
  source?: string | null;
  role?: LeadRole | null;
  amount?: string | number | null;
  createdAt?: string | null;
  callDirection?: "outbound" | "inbound" | "" | null;
  investorId?: string | null;
}

/** Zmienne dynamiczne kontekstu leada — brakujące wartości jako pusty string. */
export function leadDynamicVariables(c: LeadContextInput): Record<string, string> {
  const first = usableFirstName(c.firstName);
  return {
    first_name: first,
    forma: honorificFor(first),
    lead_source: c.source ? String(c.source) : "",
    lead_role: c.role ?? "",
    lead_amount:
      c.amount === null || c.amount === undefined || c.amount === ""
        ? ""
        : String(c.amount),
    lead_created_at: c.createdAt ? String(c.createdAt) : "",
    call_direction: c.callDirection ?? "",
    investor_id: c.investorId ?? "",
  };
}

/** SMS powitalny dla leada inwestorskiego (treść zatwierdzona przez właściciela). */
export function investorWelcomeSmsBody(firstName: string | null | undefined): string {
  const first = usableFirstName(firstName);
  const greet = first ? `Dzień dobry, ${first}` : "Dzień dobry";
  return `${greet}, tu Ania z Finance You — dziękuję za zostawienie danych w sprawie inwestowania w pożyczki pod hipotekę. Zadzwonię wkrótce; wcześniej więcej tu: ${INVESTOR_LANDING_URL}`;
}

/**
 * Agent tekstowy dla Messengera: inwestor → A2P, nierozpoznany → A0,
 * rozpoznany pożyczkobiorca → null (dotychczasowa obsługa).
 */
export function messengerAgentFor(lead: {
  type?: string | null;
  loan_application_id?: string | null;
  client_id?: string | null;
  meta_lead_id?: string | null;
}): string | null {
  if (lead.type === "inwestorski") return A2P_TEXT_AGENT_ID;
  if (lead.loan_application_id || lead.client_id || lead.meta_lead_id) return null;
  return A0_TEXT_AGENT_ID;
}
