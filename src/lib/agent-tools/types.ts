// Kontrakt narzędzi agentów ElevenLabs (recepcja, intake, presale inwestora,
// windykacja). Jedno miejsce prawdy dla: kto woła, w jakim zakresie, co wolno.
//
// Zasada nadrzędna: MODEL NICZEGO NIE AUTORYZUJE. Wszystko, co przychodzi
// w body (lead_id, case_id, „jestem Janem Kowalskim”), to TWIERDZENIE.
// Serwer je weryfikuje względem sesji rozmowy (`agent_tool_sessions`) i
// zawęża zapytania do podmiotu, którego tożsamość potwierdził kod — nie prompt.

/** Powierzchnia/agent, który woła narzędzie. Steruje tym, co w ogóle wolno. */
export type AgentKey =
  | "recepcja" // A0 — triage, rozpoznanie potrzeb, transfer
  | "intake" // A1 — klient pożyczkowy (istniejący)
  | "inwestor_presale" // A2P — przedsprzedaż inwestora
  | "inwestor_panel" // A3 — panel inwestora (zalogowany)
  | "windykacja" // A4 — telefon windykacyjny
  | "windykacja_tekst" // A4T — SMS / e-mail / czat windykacyjny
  | "unknown";

export const AGENT_KEYS: readonly AgentKey[] = [
  "recepcja",
  "intake",
  "inwestor_presale",
  "inwestor_panel",
  "windykacja",
  "windykacja_tekst",
  "unknown",
];

export type SubjectKind = "lead" | "client" | "investor" | "borrower" | "unknown";

/** Stan sesji rozmowy — JEDYNE źródło prawdy o tym, z kim agent rozmawia. */
export interface ToolSession {
  conversation_id: string;
  agent_key: AgentKey;
  channel: string;
  subject_kind: SubjectKind;
  subject_id: string | null;
  lead_id: string | null;
  case_id: string | null;
  loan_id: string | null;
  investor_user_id: string | null;
  identity_verified: boolean;
  identity_method: string | null;
  identity_verified_at: string | null;
  identity_attempts: number;
  /** Kod jednorazowy (SMS na numer z akt): skrót HMAC, ważność, próby, podmiot. */
  otp_hash?: string | null;
  otp_expires_at?: string | null;
  otp_attempts?: number;
  otp_subject?: OtpSubject | null;
  recording_consent: boolean | null;
  do_not_contact: boolean;
  needs: Record<string, unknown>;
}

/** Podmiot, do którego wysłano kod — weryfikacja kodem potwierdza właśnie jego. */
export interface OtpSubject {
  kind: SubjectKind;
  id: string;
  lead_id?: string | null;
  case_id?: string | null;
  loan_id?: string | null;
  investor_user_id?: string | null;
}

/** Surowe body z webhooka ElevenLabs. Wszystko opcjonalne, nic nie zaufane. */
export interface ToolRequestBody {
  tool?: string;
  conversation_id?: string;
  /** Podpisany klucz wątku (kanały asynchroniczne) — patrz thread-key.server.ts. */
  thread_key?: string;
  agent_key?: string;
  channel?: string;
  lead_id?: string;
  phone?: string;
  email?: string;
  application_id?: string;
  case_id?: string;
  args?: Record<string, unknown>;
}

export interface ToolContext {
  /** Nazwa narzędzia po normalizacji (bez prefiksu `fy_`). */
  tool: string;
  body: ToolRequestBody;
  args: Record<string, unknown>;
  session: ToolSession;
  /**
   * Kontakt POTWIERDZONY przez kanał (caller-id rozmowy albo nadawca z
   * podpisanego klucza wątku), znormalizowany. Nigdy z `args` — to, co
   * rozmówca powiedział lub napisał, jest tylko deklaracją.
   */
  callerPhone: string | null;
  callerEmail: string | null;
  now: Date;
  /** Ślad do audytu — handler może dopisać, co zredagował. */
  redactions: string[];
}

export type ToolResult =
  | { ok: true; result: unknown; rows?: number }
  | { ok: false; error: string; status?: number };

/**
 * Deklaracja narzędzia. Rejestr sprawdza ją PRZED wywołaniem handlera:
 * agent spoza `agents` → odmowa, brak potwierdzonej tożsamości przy
 * `requiresIdentity` → odmowa, przekroczony limit → odmowa.
 */
export interface ToolSpec {
  name: string;
  /** Kto może wołać. Pusty = każdy znany agent (ale nie `unknown`). */
  agents: readonly AgentKey[];
  /** Dane podmiotu (sprawa, zadłużenie, wniosek) dopiero po weryfikacji tożsamości. */
  requiresIdentity: boolean;
  /** Zapis do bazy — tylko nagłówek, nigdy ?token=, i zawsze audyt pełny. */
  writes: boolean;
  /** Maks. wywołań na rozmowę w oknie `windowMinutes`. */
  rateLimit: { perConversation: number; windowMinutes: number };
  description: string;
  handler: (ctx: ToolContext) => Promise<ToolResult>;
}

export type ToolDecision = "ok" | "denied" | "error";
