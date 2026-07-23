// Typy i etykiety PL zamkniętego modułu projektów inwestycyjnych.
// Współdzielone przez server functions, UI inwestora i panel administratora.

/** Status użytkownika w module (project_module_access.status). */
export type ModuleAccessStatus =
  | "course_user"
  | "module_application_pending"
  | "module_application_rejected"
  | "kyc_pending"
  | "compliance_review"
  | "approved_investor"
  | "access_suspended"
  | "access_revoked";

export const MODULE_ACCESS_STATUS_LABELS: Record<ModuleAccessStatus, string> = {
  course_user: "Użytkownik szkolenia",
  module_application_pending: "Aplikacja złożona",
  module_application_rejected: "Aplikacja odrzucona",
  kyc_pending: "Weryfikacja tożsamości (KYC)",
  compliance_review: "Analiza compliance",
  approved_investor: "Aktywny dostęp do modułu",
  access_suspended: "Dostęp zawieszony",
  access_revoked: "Dostęp cofnięty",
};

/** Status KYC (Didit) w module. */
export type ModuleKycStatus =
  | "not_started"
  | "pending"
  | "approved"
  | "manual_review"
  | "rejected"
  | "expired";

export const MODULE_KYC_STATUS_LABELS: Record<ModuleKycStatus, string> = {
  not_started: "Nierozpoczęte",
  pending: "W toku",
  approved: "Pozytywne",
  manual_review: "Ręczna analiza",
  rejected: "Negatywne",
  expired: "Wygasłe",
};

/** Wynik screeningu Dilisense. */
export type ModuleScreeningResult =
  | "clear"
  | "possible_match"
  | "manual_review"
  | "confirmed_sanctions_match"
  | "pep_review_required";

export const SCREENING_RESULT_LABELS: Record<ModuleScreeningResult, string> = {
  clear: "Czysty",
  possible_match: "Możliwe trafienie",
  manual_review: "Ręczna analiza",
  confirmed_sanctions_match: "Potwierdzone trafienie sankcyjne",
  pep_review_required: "PEP — wymagana analiza",
};

/** Status aplikacji o dostęp. */
export type ModuleApplicationStatus =
  | "pending"
  | "conditionally_qualified"
  | "needs_more_info"
  | "additional_review"
  | "rejected";

export const APPLICATION_STATUS_LABELS: Record<ModuleApplicationStatus, string> = {
  pending: "Złożona — czeka na przegląd",
  conditionally_qualified: "Zakwalifikowana warunkowo",
  needs_more_info: "Prośba o uzupełnienie",
  additional_review: "Dodatkowa analiza",
  rejected: "Odrzucona",
};

/** Status projektu w wewnętrznej puli. */
export type ProjectPoolStatus =
  | "draft"
  | "under_review"
  | "available_internal_pool"
  | "temporarily_assigned"
  | "initial_interest"
  | "full_offer_review"
  | "offer_submitted"
  | "paused"
  | "withdrawn"
  | "financed"
  | "closed";

export const PROJECT_STATUS_LABELS: Record<ProjectPoolStatus, string> = {
  draft: "Szkic",
  under_review: "Do przeglądu",
  available_internal_pool: "W puli wewnętrznej",
  temporarily_assigned: "Czasowo przypisany",
  initial_interest: "Wstępne zainteresowanie",
  full_offer_review: "Analiza pełnej oferty",
  offer_submitted: "Złożono propozycję",
  paused: "Wstrzymany",
  withdrawn: "Wycofany",
  financed: "Sfinansowany",
  closed: "Zamknięty",
};

/** Status przypisania (project_assignments.status). */
export type AssignmentStatus =
  | "created"
  | "opened"
  | "extended"
  | "interested"
  | "rejected"
  | "expired"
  | "cancelled_by_admin"
  | "cancelled_project_update";

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  created: "Utworzone",
  opened: "Otwarte",
  extended: "Przedłużone",
  interested: "Zainteresowanie",
  rejected: "Odrzucone",
  expired: "Wygasłe",
  cancelled_by_admin: "Anulowane przez administratora",
  cancelled_project_update: "Anulowane — zmiana projektu",
};

/** Statusy przypisania traktowane jako aktywna karta (przed decyzją). */
export const ACTIVE_CARD_STATUSES: AssignmentStatus[] = ["created", "opened", "extended"];

/** Status propozycji finansowania. */
export type ProposalStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "additional_information_required"
  | "presented_to_borrower"
  | "accepted_for_negotiation"
  | "counteroffer"
  | "rejected"
  | "withdrawn"
  | "expired"
  | "accepted"
  | "converted_to_transaction";

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Szkic",
  submitted: "Złożona",
  under_review: "W analizie",
  additional_information_required: "Wymagane dodatkowe informacje",
  presented_to_borrower: "Przedstawiona pożyczkobiorcy",
  accepted_for_negotiation: "Skierowana do negocjacji",
  counteroffer: "Kontrpropozycja",
  rejected: "Odrzucona",
  withdrawn: "Wycofana",
  expired: "Wygasła",
  accepted: "Zaakceptowana",
  converted_to_transaction: "Przekształcona w transakcję",
};

/** Rodzaje dokumentów akceptowanych przed aktywacją dostępu. */
export type AcceptanceKind =
  | "access_agreement"
  | "nda"
  | "confidentiality"
  | "data_processing"
  | "risk_warning"
  | "independent_decision"
  | "no_account_sharing";

export const ACCEPTANCE_KINDS: { kind: AcceptanceKind; label: string }[] = [
  { kind: "access_agreement", label: "Umowa dostępu do zamkniętego modułu" },
  { kind: "nda", label: "Umowa o zachowaniu poufności (NDA)" },
  { kind: "confidentiality", label: "Zasady poufności" },
  {
    kind: "data_processing",
    label: "Zasady przetwarzania i wykorzystywania udostępnionych informacji",
  },
  { kind: "risk_warning", label: "Ostrzeżenie o ryzyku inwestycyjnym" },
  {
    kind: "independent_decision",
    label: "Oświadczenie o samodzielnym podejmowaniu decyzji inwestycyjnych",
  },
  { kind: "no_account_sharing", label: "Zakaz udostępniania konta osobom trzecim" },
];

/** Bieżące wersje dokumentów modułu — podbijamy przy każdej zmianie treści. */
export const MODULE_DOCUMENT_VERSION = "2026-07-22.v1";

/** Rodzaje nieruchomości (spójne z enum property_type w bazie). */
export const PROPERTY_TYPES = [
  "mieszkanie",
  "dom",
  "lokal_uslugowy",
  "dzialka_budowlana",
  "grunt_rolny",
  "udzial_w_nieruchomosci",
  "inna",
] as const;
export type ProjectPropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<ProjectPropertyType, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom jednorodzinny",
  lokal_uslugowy: "Lokal usługowy",
  dzialka_budowlana: "Działka budowlana",
  grunt_rolny: "Grunt rolny",
  udzial_w_nieruchomosci: "Udział w nieruchomości",
  inna: "Inna nieruchomość",
};

/** Rodzaje zabezpieczeń akceptowane w preferencjach/propozycjach. */
export const SECURITY_OPTIONS = [
  { value: "hipoteka_1", label: "Hipoteka na 1. miejscu" },
  { value: "hipoteka_dalsza", label: "Hipoteka na dalszym miejscu" },
  { value: "art_777", label: "Akt notarialny — art. 777 k.p.c." },
  { value: "poreczenie", label: "Poręczenie" },
  { value: "weksel", label: "Weksel" },
  { value: "ubezpieczenie", label: "Ubezpieczenie" },
  { value: "przewlaszczenie", label: "Przewłaszczenie na zabezpieczenie" },
] as const;

/** Teaser karty — JEDYNE dane projektu widoczne przed wyrażeniem zainteresowania. */
export interface ProjectTeaser {
  assignmentId: string;
  status: AssignmentStatus;
  photoUrl: string | null;
  amount: number;
  propertyType: string;
  propertyTypeLabel: string;
  city: string;
  assignedAt: string;
  expiresAt: string;
  extendedAt: string | null;
  /** Czas serwera w chwili odpowiedzi — liczniki liczymy od niego, nie od zegara urządzenia. */
  serverNow: string;
}

/** Poziom ryzyka analizy. */
export type RiskLevel = "niski" | "umiarkowany" | "podwyzszony" | "wysoki";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  niski: "Niski",
  umiarkowany: "Umiarkowany",
  podwyzszony: "Podwyższony",
  wysoki: "Wysoki",
};

export interface RiskFactor {
  area: string;
  label: string;
  score: number; // 0-100 (wyżej = bezpieczniej)
  comment: string;
}

export interface RiskFlag {
  code: string;
  label: string;
  explanation: string;
}

export interface RiskAnalysis {
  score: number; // 0-100
  level: RiskLevel;
  summary: string;
  factors: RiskFactor[];
  redFlags: RiskFlag[];
  missingInformation: string[];
  ltvBands: { conservative: number; acceptable: number; elevated: number };
  disclaimer: string;
}

export const RISK_DISCLAIMER =
  "Wynik analizy ma charakter pomocniczy i nie zastępuje samodzielnej decyzji inwestora.";
