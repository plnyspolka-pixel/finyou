// Klient Didit (KYC / KYB — weryfikacja tożsamości).
// Wywołania WYŁĄCZNIE po stronie serwera — klucz DIDIT_API_KEY żyje w
// sekretach środowiska i nigdy nie trafia do frontendu. Sesję weryfikacji
// tworzy backend, użytkownik przechodzi weryfikację pod zwróconym `url`,
// a wynik dostarcza webhook Didit (podpis HMAC) albo odpytanie decyzji.
//
// Dokumentacja: https://docs.didit.me (Create Session / Webhooks).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DiditWorkflowKind } from "@/lib/didit-shared";

export type { DiditWorkflowKind } from "@/lib/didit-shared";
export {
  DIDIT_STATUS_LABELS,
  diditStatusLabel,
  diditStatusTone,
  type DiditStatusTone,
} from "@/lib/didit-shared";

const DEFAULT_BASE = "https://verification.didit.me";

// Domyślny publiczny adres aplikacji (callback po weryfikacji). Można nadpisać
// przez env DIDIT_APP_URL albo przekazać z frontendu (window.location.origin).
const DEFAULT_APP_URL = "https://app.financeyou.pl";

export interface DiditSessionResult {
  sessionId: string;
  sessionNumber: number | null;
  url: string;
  status: string;
  workflowId: string;
  raw: unknown;
}

export interface DiditDecision {
  sessionId: string;
  status: string;
  vendorData: string | null;
  workflowId: string | null;
  decision: unknown;
  warnings: unknown[];
  raw: unknown;
}

function apiBase(): string {
  return (process.env.DIDIT_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

export function diditAppUrl(): string {
  return (process.env.DIDIT_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, "");
}

/** Czy integracja jest skonfigurowana (klucz API obecny w sekretach). */
export function hasDiditConfig(): boolean {
  return Boolean(process.env.DIDIT_API_KEY);
}

/**
 * Wybiera workflow Didit dla danego typu podmiotu. ID workflow-ów pochodzą z
 * konsoli Didit i są wstrzykiwane przez sekrety środowiska:
 *  - DIDIT_WORKFLOW_ID_KYC — osoba fizyczna (OCR + LIVENESS + FACE_MATCH + AML),
 *  - DIDIT_WORKFLOW_ID_KYB — firma (KYB_REGISTRY + AML + KYB_DOCUMENTS + …).
 * DIDIT_WORKFLOW_ID działa jako wspólny fallback.
 */
export function selectWorkflowId(kind: DiditWorkflowKind): string | null {
  const fallback = process.env.DIDIT_WORKFLOW_ID || null;
  if (kind === "kyb") return process.env.DIDIT_WORKFLOW_ID_KYB || fallback;
  return process.env.DIDIT_WORKFLOW_ID_KYC || fallback;
}

function requireApiKey(): string {
  const key = process.env.DIDIT_API_KEY;
  if (!key) throw new Error("Brak konfiguracji Didit (DIDIT_API_KEY).");
  return key;
}

/** Tworzy sesję weryfikacji Didit i zwraca link, pod którym użytkownik ją przejdzie. */
/** Płaskie dane osobowe wyciągnięte z decyzji Didit (KYC) — do komparycji
 *  umów i snapshotów akceptacji. Wszystkie pola opcjonalne (różne workflowy
 *  zwracają różne sekcje); ekstrakcja toleruje oba układy decision
 *  (decision.id_verification oraz decision.kyc / top-level). */
export interface DiditPersonalData {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  personalNumber: string | null; // PESEL / personal identification number
  dateOfBirth: string | null;
  address: string | null;
  issuingCountry: string | null;
}

export function extractDiditPersonalData(decision: unknown): DiditPersonalData {
  const d = (decision ?? {}) as Record<string, any>;
  const idv = d.id_verification ?? d.kyc ?? d.id_verifications?.[0] ?? d;
  const pick = (...vals: unknown[]): string | null => {
    for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
    return null;
  };
  const first = pick(idv.first_name, idv.given_names, d.first_name);
  const last = pick(idv.last_name, idv.surname, d.last_name);
  return {
    fullName: pick(idv.full_name, d.full_name, [first, last].filter(Boolean).join(" ") || null),
    firstName: first,
    lastName: last,
    documentType: pick(idv.document_type, d.document_type),
    documentNumber: pick(idv.document_number, d.document_number),
    personalNumber: pick(idv.personal_number, idv.personal_identification_number, d.personal_number),
    dateOfBirth: pick(idv.date_of_birth, d.date_of_birth, idv.birth_date),
    address: pick(
      idv.address,
      idv.formatted_address,
      d.address,
      typeof idv.parsed_address === "object" && idv.parsed_address
        ? Object.values(idv.parsed_address).filter(Boolean).join(", ")
        : null,
    ),
    issuingCountry: pick(idv.issuing_state_name, idv.issuing_state, d.issuing_state_name),
  };
}

export async function createDiditSession(input: {
  workflowId: string;
  vendorData?: string;
  callback?: string;
  language?: string;
  contactDetails?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<DiditSessionResult> {
  const apiKey = requireApiKey();
  const body: Record<string, unknown> = { workflow_id: input.workflowId };
  if (input.vendorData) body.vendor_data = input.vendorData;
  if (input.callback) body.callback = input.callback;
  if (input.language) body.language = input.language;
  if (input.contactDetails) body.contact_details = input.contactDetails;
  if (input.metadata) body.metadata = input.metadata;

  const res = await fetch(`${apiBase()}/v2/session/`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // zostawiamy puste — obsłużymy niżej
  }
  if (!res.ok) {
    const msg =
      (json.detail as string) ||
      (json.message as string) ||
      (json.error as string) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(`Didit: nie udało się utworzyć sesji (${msg})`);
  }

  const sessionId = (json.session_id as string) ?? "";
  const url = (json.url as string) ?? "";
  if (!sessionId || !url) {
    throw new Error("Didit: odpowiedź bez session_id/url.");
  }
  return {
    sessionId,
    sessionNumber: typeof json.session_number === "number" ? (json.session_number as number) : null,
    url,
    status: (json.status as string) ?? "Not Started",
    workflowId: (json.workflow_id as string) ?? input.workflowId,
    raw: json,
  };
}

/** Odpytuje decyzję sesji (fallback dla webhooka). */
export async function getDiditDecision(sessionId: string): Promise<DiditDecision> {
  const apiKey = requireApiKey();
  const res = await fetch(`${apiBase()}/v2/session/${encodeURIComponent(sessionId)}/decision/`, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = (json.detail as string) || (json.message as string) || text || `HTTP ${res.status}`;
    throw new Error(`Didit: nie udało się pobrać decyzji (${msg})`);
  }
  return normalizeDecision(json);
}

/** Normalizuje payload decyzji/webhooka Didit do wspólnego kształtu. */
export function normalizeDecision(json: Record<string, unknown>): DiditDecision {
  return {
    sessionId: (json.session_id as string) ?? "",
    status: (json.status as string) ?? "Unknown",
    vendorData: (json.vendor_data as string) ?? null,
    workflowId: (json.workflow_id as string) ?? null,
    decision: json.decision ?? json,
    warnings: Array.isArray(json.warnings) ? (json.warnings as unknown[]) : [],
    raw: json,
  };
}

/**
 * Weryfikuje podpis webhooka Didit.
 * Didit podpisuje surowe ciało HMAC-SHA256 kluczem współdzielonym webhooka
 * (nagłówek `x-signature`, wariant `x-signature-v2`) oraz dokłada `x-timestamp`
 * (epoch sekundy) do ochrony przed replayem. Dodatkowo obsługujemy uproszczony
 * wariant `x-signature-simple` = HMAC("{ts}:{session_id}:{status}:{type}").
 */
export function verifyDiditSignature(params: {
  rawBody: string;
  secret: string;
  signature?: string | null;
  signatureV2?: string | null;
  signatureSimple?: string | null;
  timestamp?: string | null;
  maxSkewSec?: number;
  simpleFields?: { sessionId?: string; status?: string; webhookType?: string };
}): boolean {
  const {
    rawBody,
    secret,
    signature,
    signatureV2,
    signatureSimple,
    timestamp,
    maxSkewSec = 300,
    simpleFields,
  } = params;
  if (!secret) return false;

  // Okno czasowe (ochrona przed replayem). Brak nagłówka = nie odrzucamy tu,
  // decyduje sam podpis; obecny, ale przeterminowany → odrzucamy.
  if (timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > maxSkewSec) return false;
  }

  const bodyHmac = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  for (const candidate of [signatureV2, signature]) {
    if (candidate && safeEqualHex(candidate, bodyHmac)) return true;
  }

  if (signatureSimple && simpleFields && timestamp) {
    const base = `${timestamp}:${simpleFields.sessionId ?? ""}:${simpleFields.status ?? ""}:${simpleFields.webhookType ?? ""}`;
    const simpleHmac = createHmac("sha256", secret).update(base, "utf8").digest("hex");
    if (safeEqualHex(signatureSimple, simpleHmac)) return true;
  }
  return false;
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a.trim().toLowerCase(), "hex");
  const bb = Buffer.from(b.trim().toLowerCase(), "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
