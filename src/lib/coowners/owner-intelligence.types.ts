// Wynik dodatkowego wywiadu gospodarczego. Bez pełnych identyfikatorów PESEL.
// Trafienia giełd długów są niezweryfikowanymi ogłoszeniami, nie ustaleniem sądowym.
export type OwnerIntelligenceSubjectKind = "person" | "company";
export type OwnerIntelligenceSourceStatus = "checked" | "unavailable" | "partial";
export type OwnerIntelligenceMatch = "identifier" | "name_only";

export interface OwnerIntelligenceHit {
  source: string;
  category: "court_notice" | "debt_exchange";
  title: string;
  detail: string | null;
  publicationDate: string | null;
  caseSignature: string | null;
  url: string;
  match: OwnerIntelligenceMatch;
  /**
   * Pogłębiony raport postępowania — tylko gdy tożsamość potwierdzono
   * identyfikatorem (PESEL/NIP/KRS) w treści ogłoszenia MSiG.
   */
  proceeding?: CourtProceedingReport;
}

/** Jedno ogłoszenie w osi czasu postępowania (bez numerów PESEL). */
export interface CourtProceedingNotice {
  publicationDate: string;
  monitorNumber: string;
  position: string | null;
  /** Rodzaj ogłoszenia z rozdziału MSiG, np. „Postanowienie o ogłoszeniu upadłości”. */
  chapter: string | null;
  /** Fragment treści (PESEL ukryty). */
  summary: string | null;
  /** PDF numeru Monitora zawierającego ogłoszenie. */
  pdfUrl: string;
}

export type CourtProceedingStatus = "in_progress" | "repayment_plan" | "closed" | "discontinued" | "unknown";

export interface CourtProceedingReport {
  court: string | null;
  signatures: string[];
  /** Rodzaj postępowania, np. „upadłość osoby fizycznej nieprowadzącej działalności gospodarczej”. */
  kind: string;
  /** Data postanowienia otwierającego (tekst z ogłoszenia). */
  decisionDate: string | null;
  /** Syndyk / nadzorca / zarządca / sędzia komisarz — osoby urzędowe z ogłoszenia. */
  officials: string[];
  /** Miejscowość zamieszkania / siedziby z ogłoszenia. */
  residence: string | null;
  /** Jak potwierdzono tożsamość, np. „PESEL zgodny w ogłoszeniu z 2015-06-29”. */
  identityBasis: string;
  firstPublication: string;
  lastPublication: string;
  /** Ostatni znany etap (rozdział ostatniego ogłoszenia). */
  stage: string | null;
  status: CourtProceedingStatus;
  statusNote: string;
  noticesCount: number;
  /** Oś czasu — najstarsze pierwsze (maks. kilkanaście pozycji). */
  timeline: CourtProceedingNotice[];
  /** Raport niepełny (limit zapytań / błędy pobrania części ogłoszeń). */
  incomplete: boolean;
}

export interface OwnerIntelligenceSubject {
  name: string;
  kind: OwnerIntelligenceSubjectKind;
  /** "client" = pożyczkobiorca z wniosku (sprawdzany zawsze, także spoza działu II KW). */
  role?: "client" | "owner";
  courtStatus: OwnerIntelligenceSourceStatus;
  courtNote: string;
  exchangesStatus: OwnerIntelligenceSourceStatus;
  exchangesNote: string;
  hits: OwnerIntelligenceHit[];
}

export interface OwnerIntelligenceReport {
  checkedAt: string;
  subjects: OwnerIntelligenceSubject[];
  note: string;
}
