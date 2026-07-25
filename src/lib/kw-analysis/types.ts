// Moduł „Analiza księgi wieczystej" — model danych.
//
// Cel modułu: odpowiedzieć na dwa pytania biznesowe Finance You:
//   1. Czy inwestor może uzyskać hipotekę na 1. (lub warunkowo 2.) miejscu na
//      CAŁEJ nieruchomości?
//   2. Czy wpisy w KW mogą realnie utrudnić egzekucję / sprzedaż / odzyskanie
//      kapitału?
//
// Warstwa jest provider-agnostyczna: wejściem jest znormalizowany model
// `NormalizedLandRegister` budowany przez adapter `normalize.ts` z sekcji
// pobranych przez istniejące CMD KW Engine (kw_documents). Nie przepisujemy
// pobierania KW.

// ────────────────────────────────────────────────────────────────────────────
// Statusy wyników — jeden spójny enum (spec §„Statusy wyników").
// ────────────────────────────────────────────────────────────────────────────
export type FindingStatus =
  | "STOP" //  Przy obecnym stanie nie zawierać/wypłacać — najpierw usunąć przeszkodę.
  | "WSTRZYMANE" //  Brak informacji/dokumentu — nie można bezpiecznie sklasyfikować.
  | "WARUNKOWO_DOPUSZCZALNE" //  Dopuszczalne po spełnieniu dokładnie określonego warunku.
  | "INFORMACYJNE" //  Nie blokuje hipoteki, ale wpływa na wycenę/sprzedaż/organizację.
  | "KORZYSTNE" //  Okoliczność wspiera zabezpieczenie inwestora.
  | "BRAK_PROBLEMU"; //  Sprawdzono i nie wykryto ryzyka w danym zakresie.

/** Waga statusu do agregacji — najpoważniejszy nierozwiązany status wygrywa. */
export const STATUS_SEVERITY: Record<FindingStatus, number> = {
  STOP: 100,
  WSTRZYMANE: 80,
  WARUNKOWO_DOPUSZCZALNE: 60,
  INFORMACYJNE: 30,
  KORZYSTNE: 10,
  BRAK_PROBLEMU: 0,
};

export const STATUS_LABELS: Record<FindingStatus, string> = {
  STOP: "STOP",
  WSTRZYMANE: "Wstrzymane",
  WARUNKOWO_DOPUSZCZALNE: "Warunkowo dopuszczalne",
  INFORMACYJNE: "Informacyjne",
  KORZYSTNE: "Korzystne",
  BRAK_PROBLEMU: "Brak problemu",
};

export type FindingCategory =
  | "MENTION"
  | "OWNERSHIP"
  | "IDENTITY"
  | "RANK"
  | "MORTGAGE"
  | "ENFORCEMENT"
  | "RIGHT_OR_CLAIM"
  | "PROPERTY_SCOPE"
  | "VALUATION"
  | "DATA_QUALITY";

export type ImpactLevel = "NONE" | "POSSIBLE" | "DIRECT" | "UNKNOWN";

/** Wartość serializowalna (JSON) — bezpieczna dla granicy server function. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ResolutionState =
  | "UNRESOLVED"
  | "DOCUMENTS_REQUESTED"
  | "DOCUMENTS_RECEIVED"
  | "VERIFIED"
  | "REJECTED"
  | "OVERRIDDEN";

// ────────────────────────────────────────────────────────────────────────────
// Dowód źródłowy — każde znalezisko wskazuje konkretne miejsce w KW.
// ────────────────────────────────────────────────────────────────────────────
export type KwSection = "COVER" | "I_O" | "I_SP" | "II" | "III" | "IV";

export interface SourceEvidence {
  section: KwSection;
  /** Kod pola EKW, np. „4.4.1.10", „2.2.5.8", „4.8". */
  fieldCode?: string;
  fieldLabel?: string;
  entryNumber?: string;
  rawValue: string;
  /** Ścieżka/identyfikator w danych dostawcy (np. „dzial_4"). */
  sourcePath?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Strony transakcji — role muszą być rozdzielone (spec §„Dane wejściowe").
// ────────────────────────────────────────────────────────────────────────────
export type PartyRole =
  | "BORROWER" //  pożyczkobiorca
  | "CURRENT_OWNER" //  aktualny właściciel
  | "COLLATERAL_PROVIDER" //  osoba trzecia ustanawiająca hipotekę / dłużnik rzeczowy
  | "GUARANTOR" //  poręczyciel osobisty
  | "FUTURE_BUYER" //  przyszły nabywca
  | "SELLER" //  sprzedający
  | "REPRESENTATIVE" //  pełnomocnik
  | "SPOUSE" //  małżonek
  | "CO_OWNER"; //  współwłaściciel

export interface Party {
  role: PartyRole;
  firstName?: string | null;
  lastName?: string | null;
  /** Pełna nazwa podmiotu (osoba prawna). */
  companyName?: string | null;
  pesel?: string | null;
  krs?: string | null;
  regon?: string | null;
  motherName?: string | null;
  fatherName?: string | null;
  /** Zadeklarowany udział, np. „1/2". */
  declaredShare?: string | null;
  isDeceased?: boolean | null;
  isMinor?: boolean | null;
}

export type TransactionType =
  | "REFINANCING"
  | "CASH_LOAN"
  | "PURCHASE_FINANCING"
  | "BRIDGE"
  | "OTHER";

// ────────────────────────────────────────────────────────────────────────────
// Zaświadczenie wierzyciela z pierwszego miejsca (dla drugiego miejsca).
// ────────────────────────────────────────────────────────────────────────────
export interface SeniorDebtCertificate {
  creditorName: string;
  contractRef?: string | null;
  outstandingPrincipal: number;
  accruedInterestAndCosts?: number | null;
  totalPayoffAmount?: number | null;
  /** Czy zobowiązanie może ponownie wzrosnąć (rewolwing/limit odnawialny)? */
  isRevolving: boolean;
  /** Maksymalna możliwa ekspozycja (limit + niewykorzystana część). */
  maxPossibleExposure?: number | null;
  hasDefaultOrEnforcement?: boolean | null;
  payoffAccount?: string | null;
  issuedAt?: string | null;
}

export interface RequestedDocument {
  code: string;
  label: string;
  /** Pola do wyekstrahowania z dokumentu, wymagane do zamknięcia reguły. */
  requiredFields?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Wejście modułu (spec §„Dane wejściowe").
// ────────────────────────────────────────────────────────────────────────────
export interface KwAnalysisInput {
  caseId: string;
  kwNumber: string;
  fetchedAt: string;
  sourceProvider: string;
  /** Surowe sekcje KW (HTML z kw_documents) albo inny payload dostawcy. */
  rawKwData: unknown;
  borrower: Party;
  declaredCollateralProviders: Party[];
  guarantors?: Party[];
  representatives?: Party[];
  futureBuyer?: Party | null;
  transactionType: TransactionType;
  requestedCashAmount: number;
  newLoanExposure: number;
  requestedMortgageSum: number;
  acceptedPropertyValue?: number | null;
  seniorCreditorCertificate?: SeniorDebtCertificate | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Znormalizowany model KW (provider-agnostic).
// ────────────────────────────────────────────────────────────────────────────
export interface NormalizedField<T = string> {
  value: T | null;
  raw: string | null;
  evidence: SourceEvidence;
  /** 0..1 — pewność parsowania. */
  confidence: number;
}

export interface NormalizedProperty {
  kind: string | null;
  address: string | null;
  parcels: string[];
  areaM2: number | null;
  landUse: string | null;
  isDetached: boolean;
  evidence: SourceEvidence[];
}

export interface NormalizedAssociatedRight {
  kind: "SHARE_IN_COMMON" | "ROAD_ACCESS" | "ROAD_SHARE" | "PERPETUAL_USUFRUCT" | "OTHER";
  description: string;
  evidence: SourceEvidence;
}

export interface NormalizedOwner {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  pesel: string | null;
  krs: string | null;
  regon: string | null;
  fatherName: string | null;
  motherName: string | null;
  /** Udział, np. „1/2"; null gdy pełna własność / nierozpoznany. */
  share: string | null;
  coOwnershipType: string | null;
  evidence: SourceEvidence[];
}

export type SectionThreeKind =
  | "ENFORCEMENT" //  egzekucja / zajęcie
  | "LIFE_ESTATE" //  dożywocie
  | "PERSONAL_EASEMENT_FLAT" //  służebność osobista mieszkania
  | "USUFRUCT" //  użytkowanie przez osobę trzecią
  | "LEASE" //  najem / dzierżawa
  | "LAND_EASEMENT" //  służebność gruntowa
  | "TRANSMISSION_EASEMENT" //  służebność przesyłu
  | "ROAD_EASEMENT" //  służebność drogi koniecznej
  | "OWNERSHIP_CLAIM" //  roszczenie o przeniesienie własności
  | "MORTGAGE_CLAIM" //  roszczenie o ustanowienie hipoteki
  | "PROHIBITION" //  zakaz zbywania/obciążania
  | "WARNING_MISMATCH" //  ostrzeżenie o niezgodności stanu prawnego
  | "INSOLVENCY" //  upadłość / zarządca / syndyk
  | "PREEMPTION" //  prawo pierwokupu / odkupu
  | "CONVERSION_FEE" //  roszczenie o opłatę przekształceniową (uż. wieczyste → własność)
  | "CO_ENCUMBRANCE" //  współobciążenie innej nieruchomości
  | "MIGRATION_COMMENT"
  | "OTHER";

export interface NormalizedSectionThreeEntry {
  entryNumber: string | null;
  kind: SectionThreeKind;
  kindLabel: string;
  rawText: string;
  isActive: boolean;
  /** Osoba/podmiot uprawniony (jeśli rozpoznany). */
  beneficiary: string | null;
  evidence: SourceEvidence;
  /** Niepewny wpis wolnego tekstu — wymaga ręcznej analizy. */
  needsManualReview: boolean;
}

export interface NormalizedMortgage {
  entryNumber: string | null;
  kind: string | null;
  sum: number | null;
  currency: string | null;
  creditor: string | null;
  /** Udział obciążony hipoteką (4.4.1.6); null = całość. */
  encumberedShare: string | null;
  /** Pierwszeństwo z 4.4.1.10–4.4.1.11 (surowy tekst). */
  priority: string | null;
  /** Hipoteka łączna — księgi współobciążone (4.4.1.12). */
  jointBooks: string[];
  /** Inne informacje 4.4.1.13 (np. zajęcie wierzytelności hipotecznej). */
  otherInfo: string | null;
  isRevolvingHint: boolean;
  isActive: boolean;
  rawText: string;
  evidence: SourceEvidence;
}

/** Opróżnione miejsce hipoteczne / uprawnienie do rozporządzania (4.8). */
export interface NormalizedVacantRankRight {
  rawText: string;
  evidence: SourceEvidence;
}

export interface NormalizedMention {
  section: KwSection;
  /** Kod pola wzmianki, np. „4.1.0.1". */
  fieldCode: string;
  rawText: string;
  /** Numer Dz.Kw jeśli obecny w treści. */
  dzKwNumber: string | null;
  /** Wzmianka aktywna = brak chwili wykreślenia (pole *.*.0.3). */
  isActive: boolean;
  evidence: SourceEvidence;
}

export interface NormalizedLandRegister {
  meta: {
    kwNumber: string;
    court: string | null;
    type: string | null;
    fetchedAt: string;
    isClosed: boolean;
    closureReason: string | null;
    /** Czy dane w ogóle dostępne (sekcje niepuste). */
    available: boolean;
  };
  properties: NormalizedProperty[];
  associatedRights: NormalizedAssociatedRight[];
  owners: NormalizedOwner[];
  sectionThreeEntries: NormalizedSectionThreeEntry[];
  mortgages: NormalizedMortgage[];
  vacantRankRights: NormalizedVacantRankRight[];
  mentions: NormalizedMention[];
  migrationComments: SourceEvidence[];
}

// ────────────────────────────────────────────────────────────────────────────
// Pojedyncze znalezisko (spec §„Model pojedynczego znaleziska").
// ────────────────────────────────────────────────────────────────────────────
export interface KwFinding {
  id: string;
  ruleId: string;
  ruleVersion: string;
  category: FindingCategory;
  status: FindingStatus;
  title: string;
  plainLanguageSummary: string;
  source: SourceEvidence[];
  detectedValue?: JsonValue;
  whyItMatters: string;
  rankImpact: ImpactLevel;
  enforcementImpact: ImpactLevel;
  expectedFromClient: string;
  requestedDocuments: RequestedDocument[];
  proposedResolution: string;
  agreementCondition?: string | null;
  payoutCondition?: string | null;
  intermediaryMessage: string;
  clientMessage: string;
  investorMessage: string;
  resolutionState: ResolutionState;
  /** 0..1 */
  confidence: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Wynik obliczenia docelowego miejsca hipoteki.
// ────────────────────────────────────────────────────────────────────────────
export interface EffectivePriorEncumbrance {
  kind: "MORTGAGE" | "MORTGAGE_CLAIM" | "MENTION";
  label: string;
  sum: number | null;
  currency: string | null;
  creditor: string | null;
  evidence: SourceEvidence;
}

export interface MortgagePriorityResult {
  determinable: boolean;
  expectedInvestorRank?: number;
  effectivePriorEncumbrances: EffectivePriorEncumbrance[];
  activeCompetingMentions: NormalizedMention[];
  usesVacantRank: boolean;
  explanation: string;
  evidence: SourceEvidence[];
  requiredConditions: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// LTV / CLTV.
// ────────────────────────────────────────────────────────────────────────────
export interface LtvResult {
  determinable: boolean;
  /** Suma hipotek z KW (nie saldo!). */
  mortgageSumFromKw: number | null;
  /** Saldo z zaświadczenia wierzyciela (jeśli jest). */
  seniorBalanceFromCertificate: number | null;
  /** Przyjęta ekspozycja poprzedzająca do CLTV. */
  priorExposureForCltv: number | null;
  newLoanExposure: number;
  acceptedPropertyValue: number | null;
  cltv: number | null;
  maxCltv: number;
  withinPolicy: boolean | null;
  note: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Pełny wynik analizy.
// ────────────────────────────────────────────────────────────────────────────
export interface KwAnalysisResult {
  kwNumber: string;
  fetchedAt: string;
  rulesetVersion: string;
  /** Najpoważniejszy nierozwiązany status. */
  overallStatus: FindingStatus;
  findings: KwFinding[];
  priority: MortgagePriorityResult;
  ltv: LtvResult;
  activeMentionCount: number;
  unresolvedFindingCount: number;
  disclaimer: string;
  /** Metadane deterministyczne — te same dane + reguły ⇒ ten sam wynik. */
  computedFrom: {
    ownersCount: number;
    mortgagesCount: number;
    sectionThreeCount: number;
  };
}
