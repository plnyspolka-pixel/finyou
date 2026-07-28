// JEDYNE źródło prawdy dla „kompletności" wniosku pożyczkowego.
//
// Dotąd „kompletność" była rozproszona: raz oznaczał ją status
// (COMPLETE_STATUSES), raz warunek logiczny auto-promocji w
// admin.wnioski-niekompletne.tsx, raz bulk-migracja w SQL. Efekt: w „kompletnych
// wnioskach" (u inwestorów, na liście admina) lądowały sprawy bez nazwiska,
// bez kontaktu albo ze śmieciem w polu KW.
//
// Ten moduł ustala JEDNĄ definicję „podstawowych wymaganych danych" i jest
// używany wszędzie tam, gdzie wniosek jest promowany do inwestorów lub liczony
// jako kompletny (admin, panel klienta, marketplace inwestora). Odpowiednik
// tej logiki w SQL znajduje się w migracji czyszczącej dane.

import { containsValidKw } from "./kw";
import { normalizeLoanStatus } from "./loan-status";

/**
 * Placeholdery, którymi system wypełnia dane klienta powstałego ze stuba leada
 * (patrz `ensureLoanApplicationForLead`: first_name „Lead", last_name „—").
 * Żaden z nich nie jest prawdziwym imieniem/nazwiskiem.
 */
export const PLACEHOLDER_NAMES = new Set([
  "z leada",
  "lead",
  "(brak nazwiska)",
  "(brak imienia)",
  "brak nazwiska",
  "brak imienia",
  "—",
  "-",
  "brak",
]);

export type CompletenessClient =
  | {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
    }
  | null
  | undefined;

export type CompletenessProperty =
  | {
      land_register_number?: string | null;
      photos?: unknown;
    }
  | null
  | undefined;

export type CompletenessInput = {
  loan_amount?: number | string | null;
  client?: CompletenessClient;
  properties?: CompletenessProperty[] | null;
  /** Liczba dokumentów przypiętych do wniosku (z tabeli `documents`). */
  docCount?: number | null;
};

/** Czy klient ma prawdziwe imię i nazwisko (a nie placeholder ze stuba leada)? */
export function hasRealClientName(c: CompletenessClient): boolean {
  const first = (c?.first_name ?? "").trim();
  const last = (c?.last_name ?? "").trim();
  if (!first || !last) return false;
  return !PLACEHOLDER_NAMES.has(last.toLowerCase()) && !PLACEHOLDER_NAMES.has(first.toLowerCase());
}

/** Czy da się skontaktować z klientem — telefon LUB e-mail? */
export function hasClientContact(c: CompletenessClient): boolean {
  return !!(c?.phone?.trim() || c?.email?.trim());
}

/** Czy którakolwiek nieruchomość ma POPRAWNY numer KW? */
export function hasValidKw(props: CompletenessInput["properties"]): boolean {
  return (props ?? []).some((p) => containsValidKw(p?.land_register_number));
}

/** Czy wniosek ma jakiekolwiek media — zdjęcia nieruchomości ALBO dokumenty? */
export function hasAnyMedia(input: CompletenessInput): boolean {
  const hasPhotos = (input.properties ?? []).some(
    (p) => Array.isArray(p?.photos) && p.photos.length > 0,
  );
  return hasPhotos || (input.docCount ?? 0) > 0;
}

/** Czy podano sensowną kwotę pożyczki (> 0)? */
export function hasLoanAmount(loanAmount: CompletenessInput["loan_amount"]): boolean {
  const n = loanAmount == null ? NaN : Number(loanAmount);
  return Number.isFinite(n) && n > 0;
}

/** Kanoniczne klucze braków — kolejność = kolejność uzupełniania. */
export type MissingKey = "name" | "contact" | "amount" | "kw" | "media";

export const MISSING_KEYS: readonly MissingKey[] = ["name", "contact", "amount", "kw", "media"];

/** Krótkie etykiety braków (badge, toast). */
export const MISSING_LABELS: Record<MissingKey, string> = {
  name: "imię i nazwisko",
  contact: "telefon lub e-mail",
  amount: "kwota pożyczki",
  kw: "poprawny numer KW",
  media: "zdjęcia lub dokumenty",
};

export type CompletenessResult = {
  /** Wniosek ma KOMPLET podstawowych danych wymaganych, by trafić do inwestora. */
  complete: boolean;
  /** Lista brakujących pól (pusta, gdy `complete`). */
  missing: MissingKey[];
};

/**
 * Ocena kompletności podstawowych danych wniosku. Wniosek jest „kompletny"
 * (gotowy dla inwestora), gdy ma: prawdziwe imię i nazwisko klienta, kontakt
 * (telefon lub e-mail), kwotę pożyczki, poprawny numer KW oraz jakiekolwiek
 * media (zdjęcia lub dokumenty). Brak choćby jednego → wniosek NIE jest
 * kompletny i nie powinien być pokazywany jako „kompletny wniosek".
 */
export function evaluateApplicationCore(input: CompletenessInput): CompletenessResult {
  const missing: MissingKey[] = [];
  if (!hasRealClientName(input.client)) missing.push("name");
  if (!hasClientContact(input.client)) missing.push("contact");
  if (!hasLoanAmount(input.loan_amount)) missing.push("amount");
  if (!hasValidKw(input.properties)) missing.push("kw");
  if (!hasAnyMedia(input)) missing.push("media");
  return { complete: missing.length === 0, missing };
}

/** Skrót: sam boolean. */
export function isApplicationCoreComplete(input: CompletenessInput): boolean {
  return evaluateApplicationCore(input).complete;
}

/** Zamienia klucze braków na czytelne etykiety. */
export function missingLabels(missing: MissingKey[]): string[] {
  return missing.map((k) => MISSING_LABELS[k]);
}

/** Statusy, w których wniosek procesowo uchodzi za skompletowany
 *  (jest dalej niż kompletowanie danych). */
export const COMPLETE_STATUSES: readonly string[] = [
  "szukamy_inwestora",
  "warunki_zaakceptowane",
  "dokumenty_przygotowanie_umowy",
  "notariusz",
  "zamkniete",
];

export type ApplicationClass = "complete" | "attention" | "incomplete";

/** Etykiety klasyfikacji do badge'y na listach wniosków. */
export const APPLICATION_CLASS_LABELS: Record<ApplicationClass, string> = {
  complete: "Kompletny",
  attention: "Do korekty",
  incomplete: "Niekompletny",
};

/**
 * Klasyfikacja wniosku wg DANYCH, nie tylko statusu (jak w panelu admina):
 *  - "complete"   — status kompletny I komplet podstawowych danych,
 *  - "attention"  — status kompletny, ale BRAKUJE danych (do korekty),
 *  - "incomplete" — wniosek jeszcze w kompletowaniu.
 */
export function classifyApplication(
  status: string | null | undefined,
  input: CompletenessInput,
): ApplicationClass {
  if (!COMPLETE_STATUSES.includes(normalizeLoanStatus(status))) return "incomplete";
  return isApplicationCoreComplete(input) ? "complete" : "attention";
}
