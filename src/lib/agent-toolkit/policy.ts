// POLITYKA NARZĘDZI AGENTÓW — szeroki dostęp do danych, ale z bezpiecznikami.
//
// Zasady (każda egzekwowana w kodzie, nie w prompcie):
//  1. Allowlista narzędzi PER POWIERZCHNIA — agent inwestorski nie zapisze
//     danych wniosku pożyczkowego, agent przyjęcia wniosku nie wystawi FV.
//  2. Zakres = rozmówca. Narzędzia czytające sprawę biorą leada wyłącznie ze
//     zmiennych systemowych rozmowy (lead_id / numer dzwoniącego), NIGDY
//     z identyfikatora wymyślonego albo podanego przez model.
//  3. Minimalizacja danych: odczyt zwraca stan („mamy / brakuje"), nie wartości
//     wrażliwe. PESEL, rachunki, tokeny, hasze — wycinane zawsze; telefon
//     i e-mail — maskowane. Numer dzwoniącego da się podrobić, więc rozmowa
//     telefoniczna nie może być furtką do cudzych danych.
//  4. Limity per lead i narzędzie na godzinę (ochrona przed pętlą modelu
//     i przed nadużyciem) + dziennik każdego wywołania (audyt).
//
// Czysty moduł — testowalny bez bazy.

export type ToolSurface =
  | "intake"
  | "investor_info"
  | "investor_panel"
  | "phone"
  | "growth"
  | "unknown";

export type ToolKind = "read" | "write" | "notify";

export interface ToolPolicy {
  surfaces: ToolSurface[];
  kind: ToolKind;
  /** Maks. wywołań na leada (albo numer) na godzinę. */
  maxPerHour: number;
  /** Czy narzędzie działa na danych konkretnego rozmówcy (wymaga leada). */
  scoped: boolean;
}

const ALL: ToolSurface[] = [
  "intake",
  "investor_info",
  "investor_panel",
  "phone",
  "growth",
  "unknown",
];
const BORROWER: ToolSurface[] = ["intake", "phone", "unknown"];
const INVESTOR: ToolSurface[] = ["investor_info", "investor_panel", "unknown"];

export const AGENT_TOOL_POLICY: Record<string, ToolPolicy> = {
  // ── istniejące narzędzia (zachowanie bez zmian, dochodzi limit i audyt) ──
  update_lead_data: {
    surfaces: [...BORROWER, "investor_info"],
    kind: "write",
    maxPerHour: 40,
    scoped: true,
  },
  send_application_link: { surfaces: BORROWER, kind: "notify", maxPerHour: 3, scoped: true },
  mark_ready_for_human: {
    surfaces: [...BORROWER, "investor_info"],
    kind: "write",
    maxPerHour: 5,
    scoped: true,
  },
  request_invoice: { surfaces: INVESTOR, kind: "write", maxPerHour: 3, scoped: true },
  get_application_status: { surfaces: BORROWER, kind: "read", maxPerHour: 30, scoped: true },
  get_missing_info_brief: { surfaces: BORROWER, kind: "read", maxPerHour: 30, scoped: true },
  issue_invoice: { surfaces: INVESTOR, kind: "write", maxPerHour: 3, scoped: false },
  // ── nowe narzędzia ─────────────────────────────────────────────────────
  get_offer_facts: { surfaces: ALL, kind: "read", maxPerHour: 60, scoped: false },
  estimate_cost: { surfaces: ALL, kind: "read", maxPerHour: 60, scoped: false },
  search_knowledge: { surfaces: ALL, kind: "read", maxPerHour: 60, scoped: false },
  get_case_snapshot: { surfaces: BORROWER, kind: "read", maxPerHour: 20, scoped: true },
  get_market_snapshot: {
    surfaces: [...INVESTOR, "growth"],
    kind: "read",
    maxPerHour: 20,
    scoped: false,
  },
  flag_urgent: { surfaces: BORROWER, kind: "notify", maxPerHour: 3, scoped: true },
  log_insight: { surfaces: ALL, kind: "write", maxPerHour: 20, scoped: false },
  request_capability: { surfaces: ALL, kind: "write", maxPerHour: 5, scoped: false },
};

export type ToolDecision = { allowed: true } | { allowed: false; reason: string };

export function decideToolCall(tool: string, surface: ToolSurface): ToolDecision {
  const policy = AGENT_TOOL_POLICY[tool];
  if (!policy) return { allowed: false, reason: `nieznane narzędzie: ${tool}` };
  if (!policy.surfaces.includes(surface)) {
    return {
      allowed: false,
      reason: `narzędzie ${tool} nie jest dostępne dla agenta „${surface}”`,
    };
  }
  return { allowed: true };
}

export function rateLimitExceeded(tool: string, callsLastHour: number): boolean {
  const policy = AGENT_TOOL_POLICY[tool];
  if (!policy) return true;
  return callsLastHour >= policy.maxPerHour;
}

// ── maskowanie ─────────────────────────────────────────────────────────────

export function maskPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `*** *** ${digits.slice(-3)}`;
}

export function maskEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  const at = s.indexOf("@");
  if (at < 1) return null;
  return `${s[0]}***${s.slice(at)}`;
}

/** Klucze, których wartości NIGDY nie wychodzą do agenta. */
const SECRET_KEY_RE =
  /(pesel|bank_?account|nr_?konta|iban|swift|password|haslo|hasło|token|secret|otp|hash|api_?key|card|karta|cvv|dowod|dowód|id_card|passport|paszport|nip_?osob)/i;
const PHONE_KEY_RE = /(phone|telefon|tel(?![a-z])|mobile|komork)/i;
const EMAIL_KEY_RE = /(e-?mail|mail)/i;

/**
 * Głęboka redakcja obiektu przed oddaniem go agentowi: sekrety wycięte,
 * telefony i e-maile zamaskowane, długie teksty przycięte, głębokość
 * ograniczona (żadnych zrzutów całych rekordów).
 */
export function redactForAgent(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (value == null) return value;
  if (typeof value === "string") return value.length > 600 ? `${value.slice(0, 600)}…` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForAgent(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) continue;
    if (PHONE_KEY_RE.test(k) && typeof v === "string") {
      out[k] = maskPhone(v);
      continue;
    }
    if (EMAIL_KEY_RE.test(k) && typeof v === "string") {
      out[k] = maskEmail(v);
      continue;
    }
    out[k] = redactForAgent(v, depth + 1);
  }
  return out;
}

/** Argumenty wywołania do dziennika — bez sekretów i z maskowaniem. */
export function argsForAudit(args: unknown): unknown {
  return redactForAgent(args ?? {});
}
