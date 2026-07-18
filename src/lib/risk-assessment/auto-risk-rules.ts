// Reguły automatycznej analizy ryzyka: kiedy wniosek jest kompletny oraz
// kiedy brakuje mu WYŁĄCZNIE imienia i nazwiska klienta (do dociągnięcia
// z działu II księgi wieczystej). Kryteria odzwierciedlają DB-owe
// compute_loan_auto_status, z jedną różnicą: placeholdery nazwisk nie liczą
// się jako prawdziwe dane. Plik bez importów serwerowych — testowalny
// jednostkowo i bezpieczny do importu po obu stronach.
import { containsValidKw } from "@/lib/kw";

// Placeholdery wpisywane automatycznie, gdy klient powstał z leada bez danych
// (maybePromoteLeadToApplication: "Klient" / "(brak nazwiska)") — patrz też
// PLACEHOLDER_NAMES w admin.wnioski-niekompletne.tsx.
export const NAME_PLACEHOLDERS = new Set(["klient", "z leada", "(brak nazwiska)", "—", "-", "brak"]);

export function isRealNamePart(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;
  return !NAME_PLACEHOLDERS.has(s.toLowerCase());
}

export type CompletenessInput = {
  loanAmount: number | null;
  lead: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone_normalized?: string | null;
    phone_raw?: string | null;
    kw_number?: string | null;
    application_data?: Record<string, unknown> | null;
  } | null;
  client: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  properties: { land_register_number: string | null; photos?: string[] | null }[];
  documentsCount: number;
};

export type CompletenessResult = {
  hasFirstName: boolean;
  hasLastName: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasAmount: boolean;
  hasKw: boolean;
  hasMedia: boolean;
  /** Surowe numery KW z wniosku i leada (poprawne formalnie, bez duplikatów). */
  kwCandidates: string[];
  /** Komplet danych łącznie z prawdziwym imieniem i nazwiskiem. */
  complete: boolean;
  /** Wszystko poza imieniem/nazwiskiem jest — kandydat na dociągnięcie z KW. */
  onlyNameMissing: boolean;
  missing: string[];
};

const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

function toAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v)) && Number(v) > 0) return Number(v);
  return null;
}

export function assessWnioskCompleteness(input: CompletenessInput): CompletenessResult {
  const { lead, client } = input;
  const appData = (lead?.application_data ?? {}) as Record<string, unknown>;

  const hasFirstName = isRealNamePart(lead?.first_name) || isRealNamePart(client?.first_name);
  const hasLastName = isRealNamePart(lead?.last_name) || isRealNamePart(client?.last_name);
  const hasPhone = nonEmpty(lead?.phone_normalized) || nonEmpty(lead?.phone_raw) || nonEmpty(client?.phone);
  const hasEmail = nonEmpty(lead?.email) || nonEmpty(client?.email);
  const hasAmount = toAmount(input.loanAmount) != null || toAmount(appData.loan_amount) != null;

  const kwCandidates: string[] = [];
  const pushKw = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t && containsValidKw(t) && !kwCandidates.includes(t)) kwCandidates.push(t);
  };
  for (const p of input.properties) pushKw(p.land_register_number);
  pushKw(lead?.kw_number);
  pushKw(appData.land_register_number);
  pushKw(appData.kw_number);
  if (Array.isArray(appData.kw_numbers)) for (const k of appData.kw_numbers) pushKw(k);
  const hasKw = kwCandidates.length > 0;

  const hasMedia =
    input.properties.some((p) => Array.isArray(p.photos) && p.photos.length > 0) ||
    input.documentsCount > 0;

  const missing: string[] = [];
  if (!hasFirstName) missing.push("imię");
  if (!hasLastName) missing.push("nazwisko");
  if (!hasPhone) missing.push("telefon");
  if (!hasEmail) missing.push("e-mail");
  if (!hasAmount) missing.push("kwota");
  if (!hasKw) missing.push("KW");
  if (!hasMedia) missing.push("zdjęcia/dokumenty");

  const restComplete = hasPhone && hasEmail && hasAmount && hasKw && hasMedia;
  const complete = restComplete && hasFirstName && hasLastName;
  const onlyNameMissing = restComplete && !(hasFirstName && hasLastName);

  return {
    hasFirstName,
    hasLastName,
    hasPhone,
    hasEmail,
    hasAmount,
    hasKw,
    hasMedia,
    kwCandidates,
    complete,
    onlyNameMissing,
    missing,
  };
}
