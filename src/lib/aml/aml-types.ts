// Wspólne typy i etykiety modułu AML — plik bez importów serwerowych,
// używany zarówno w UI, jak i w server functions.

// ── Statusy screeningu ───────────────────────────────────────────────
export type AmlScreeningStatus =
  | "not_started"
  | "in_progress"
  | "clear"
  | "review_required"
  | "approved_after_review"
  | "blocked"
  | "error"
  | "invalidated";

export const SCREENING_STATUS_LABELS: Record<AmlScreeningStatus, string> = {
  not_started: "Nie rozpoczęto",
  in_progress: "W toku",
  clear: "Brak trafień",
  review_required: "Wymaga oceny",
  approved_after_review: "Zaakceptowano po ocenie",
  blocked: "Zablokowano",
  error: "Błąd",
  invalidated: "Unieważniono",
};

export type AmlHitResolution =
  "false_positive" | "confirmed_pep" | "confirmed_sanction" | "confirmed_criminal" | "unresolved";

export const HIT_RESOLUTION_LABELS: Record<AmlHitResolution, string> = {
  false_positive: "Fałszywe trafienie",
  confirmed_pep: "Potwierdzony PEP",
  confirmed_sanction: "Potwierdzona sankcja",
  confirmed_criminal: "Potwierdzona karalność",
  unresolved: "Nierozstrzygnięte",
};

// Potwierdzona sankcja albo nierozstrzygnięte trafienie blokuje umowę.
export const BLOCKING_RESOLUTIONS: AmlHitResolution[] = ["confirmed_sanction", "unresolved"];

// ── Ryzyko ───────────────────────────────────────────────────────────
export type AmlRiskLevel = "low" | "standard" | "high" | "unacceptable";

export const RISK_LEVEL_LABELS: Record<AmlRiskLevel, string> = {
  low: "Niskie",
  standard: "Standardowe",
  high: "Wysokie",
  unacceptable: "Nieakceptowalne",
};

// ── Transakcje ───────────────────────────────────────────────────────
export type AmlTransactionType =
  | "wyplata_finansowania"
  | "splata_kapitalu"
  | "odsetki"
  | "oplaty"
  | "wplata_gotowkowa"
  | "wyplata_gotowkowa"
  | "przelew_przychodzacy"
  | "przelew_wychodzacy"
  | "inna_operacja";

export const TRANSACTION_TYPE_LABELS: Record<AmlTransactionType, string> = {
  wyplata_finansowania: "Wypłata finansowania",
  splata_kapitalu: "Spłata kapitału",
  odsetki: "Odsetki",
  oplaty: "Opłaty",
  wplata_gotowkowa: "Wpłata gotówkowa",
  wyplata_gotowkowa: "Wypłata gotówkowa",
  przelew_przychodzacy: "Przelew przychodzący",
  przelew_wychodzacy: "Przelew wychodzący",
  inna_operacja: "Inna operacja",
};

/** Typy gotówkowe — powyżej progu domyślna decyzja: reportable. */
export const CASH_TRANSACTION_TYPES: AmlTransactionType[] = [
  "wplata_gotowkowa",
  "wyplata_gotowkowa",
];

/** Typy przelewowe — może raportować bank / dostawca usług płatniczych. */
export const TRANSFER_TRANSACTION_TYPES: AmlTransactionType[] = [
  "przelew_przychodzacy",
  "przelew_wychodzacy",
  "wyplata_finansowania",
  "splata_kapitalu",
];

/** Próg rejestru ponadprogowego (art. 72 ustawy AML). */
export const AML_THRESHOLD_EUR = 15000;

export type AmlThresholdDecision =
  | "reportable"
  | "not_reportable"
  | "verification_required"
  | "report_prepared"
  | "submitted"
  | "accepted"
  | "correction_required";

export const THRESHOLD_DECISION_LABELS: Record<AmlThresholdDecision, string> = {
  reportable: "Do zgłoszenia",
  not_reportable: "Nie podlega zgłoszeniu",
  verification_required: "Wymaga weryfikacji",
  report_prepared: "Zgłoszenie przygotowane",
  submitted: "Wysłane",
  accepted: "Przyjęte",
  correction_required: "Wymaga korekty",
};

// ── Sprawy AML ───────────────────────────────────────────────────────
export type AmlCaseStatus =
  | "new"
  | "in_analysis"
  | "awaiting_information"
  | "no_basis_for_report"
  | "suspicion_confirmed"
  | "report_in_preparation"
  | "ready_for_signature"
  | "signed"
  | "submitted"
  | "upo_received"
  | "rejected"
  | "correction_required"
  | "closed";

export const CASE_STATUS_LABELS: Record<AmlCaseStatus, string> = {
  new: "Nowa",
  in_analysis: "W analizie",
  awaiting_information: "Oczekuje na informacje",
  no_basis_for_report: "Brak podstaw do zgłoszenia",
  suspicion_confirmed: "Podejrzenie potwierdzone",
  report_in_preparation: "Zgłoszenie w przygotowaniu",
  ready_for_signature: "Zgłoszenie gotowe do wysyłki",
  signed: "Podpisana",
  submitted: "Wysłana",
  upo_received: "Wysyłka potwierdzona (UPO / ZPO)",
  rejected: "Odrzucona",
  correction_required: "Wymaga korekty",
  closed: "Zamknięta",
};

export type AmlCaseOrigin =
  | "customer"
  | "screening"
  | "crbr_discrepancy"
  | "risk_assessment"
  | "transaction"
  | "threshold_register"
  | "manual";

export const CASE_ORIGIN_LABELS: Record<AmlCaseOrigin, string> = {
  customer: "Z klienta",
  screening: "Ze screeningu Dilisense",
  crbr_discrepancy: "Z rozbieżności CRBR",
  risk_assessment: "Z oceny ryzyka",
  transaction: "Z transakcji",
  threshold_register: "Z rejestru ponadprogowego",
  manual: "Ręcznie",
};

// ── Zgłoszenia GIIF ──────────────────────────────────────────────────
export type AmlReportType =
  | "transakcja_ponadprogowa"
  | "okolicznosci_podejrzane"
  | "planowana_transakcja_podejrzana"
  | "transakcja_przeprowadzona";

export const REPORT_TYPE_LABELS: Record<AmlReportType, string> = {
  transakcja_ponadprogowa: "Transakcja ponadprogowa (art. 72)",
  okolicznosci_podejrzane: "Okoliczności podejrzane (art. 74)",
  planowana_transakcja_podejrzana: "Planowana transakcja podejrzana (art. 86)",
  transakcja_przeprowadzona: "Transakcja już przeprowadzona (art. 89/90)",
};

export type AmlReportStatus =
  | "draft"
  | "complete"
  | "content_approved"
  | "awaiting_signature"
  | "signed"
  | "encrypted"
  | "queued"
  | "submitted"
  | "status_pending"
  | "accepted"
  | "upo_received"
  | "rejected"
  | "correction_required"
  | "error";

export const REPORT_STATUS_LABELS: Record<AmlReportStatus, string> = {
  draft: "W przygotowaniu",
  complete: "Gotowe do wysyłki (XML/PDF)",
  content_approved: "Treść zatwierdzona",
  awaiting_signature: "Oczekuje na podpis kwalifikowany",
  signed: "Podpisane",
  encrypted: "Zaszyfrowane",
  queued: "W kolejce wysyłki",
  submitted: "Wysłane — brak potwierdzenia",
  status_pending: "Oczekiwanie na status",
  accepted: "Przyjęte przez GIIF",
  upo_received: "Potwierdzone (UPO / ZPO)",
  rejected: "Odrzucone",
  correction_required: "Wymaga korekty",
  error: "Błąd",
};

// ── Gotowość do wysyłki w SI*GIIF ───────────────────────────────────
export const SI_GIIF_URL = "https://giif.mofnet.gov.pl";
/** Rejestr kwalifikowanych dostawców usług zaufania (Narodowe Centrum Certyfikacji). */
export const NCCERT_URL = "https://www.nccert.pl";

/**
 * Gotowość inwestora do wysyłki zgłoszeń przez SI*GIIF (wariant: każdy
 * inwestor wysyła sam, własnym podpisem kwalifikowanym). Deklaracje
 * inwestora trzymamy w istniejącej kolumnie aml_settings.giif_connection_status:
 * not_connected → brak, documents_signed → ma podpis, active → ma podpis
 * i instytucja jest zarejestrowana w SI*GIIF.
 */
export interface AmlGiifReadiness {
  hasQualifiedSignature: boolean;
  registeredInSiGiif: boolean;
}

export function readinessFromStatus(status: string | null | undefined): AmlGiifReadiness {
  const registered = status === "active";
  return {
    hasQualifiedSignature: registered || status === "documents_signed",
    registeredInSiGiif: registered,
  };
}

export function statusFromReadiness(
  r: AmlGiifReadiness,
): "not_connected" | "documents_signed" | "active" {
  if (r.hasQualifiedSignature && r.registeredInSiGiif) return "active";
  return r.hasQualifiedSignature ? "documents_signed" : "not_connected";
}

// ── Osoby / instytucja ───────────────────────────────────────────────
export interface AmlPerson {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  email: string;
  phone: string;
}

export interface AmlInstitution {
  name: string;
  nip: string;
  address: string;
  city?: string;
  postalCode?: string;
  country?: string;
  krs?: string;
  regon?: string;
}

/** Braki w danych wymaganych do finalnego zgłoszenia (ostrzeżenie, nie blokada). */
export interface AmlProfileGaps {
  missing: string[];
  ready: boolean;
}

// ── Payload zgłoszenia GIIF ──────────────────────────────────────────
export interface GiifReportParty {
  role: string; // np. 'nadawca','odbiorca','klient','beneficjent'
  name: string;
  entityType?: "osoba_fizyczna" | "firma";
  pesel?: string;
  nip?: string;
  dob?: string;
  address?: string;
  country?: string;
  account?: string;
}

export interface GiifReportTransaction {
  date: string;
  type: string;
  amount: number;
  currency: string;
  eurEquivalent?: number;
  nbpRate?: number;
  nbpTableNo?: string;
  senderAccount?: string;
  receiverAccount?: string;
  description?: string;
}

export interface GiifReportPayload {
  reportType: AmlReportType;
  institution: AmlInstitution;
  responsiblePerson: AmlPerson;
  signerPerson?: AmlPerson;
  customer?: {
    name: string;
    entityType: "osoba_fizyczna" | "firma";
    pesel?: string;
    nip?: string;
    dob?: string;
    address?: string;
    countryResidence?: string;
    representatives?: { name: string; role?: string }[];
    beneficialOwners?: { name: string; sharePct?: number }[];
  };
  parties: GiifReportParty[];
  transactions: GiifReportTransaction[];
  contract?: { ref?: string; date?: string; amount?: number; currency?: string };
  justification?: string;
  attachments?: { fileName: string; sha256?: string }[];
}

/** Wynik sprawdzenia kompletności zgłoszenia. */
export interface GiifCompleteness {
  complete: boolean;
  missing: string[];
}
