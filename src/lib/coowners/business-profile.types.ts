// Profil gospodarczy klienta / właścicieli: dane z rejestrów publicznych
// (KRS — odpis aktualny i pełny, wykaz podatników VAT, CEIDG, CRBR) oraz
// z oficjalnej strony firmy wskazanej w rejestrze. Bez pełnych numerów PESEL.
// Bezpieczne do importu po stronie klienta i serwera.

export type BusinessFlagLevel = "alert" | "warning" | "info";

export interface BusinessFlag {
  level: BusinessFlagLevel;
  text: string;
  /** Źródło sygnału, np. „KRS dział 4”, „Wykaz VAT”. */
  source: string;
}

/** Szczegóły wpisu CEIDG (jednoosobowa działalność). */
export interface CeidgDetails {
  name: string | null;
  nip: string | null;
  regon: string | null;
  status: string | null;
  startDate: string | null;
  suspendedOn: string | null;
  resumedOn: string | null;
  endedOn: string | null;
  deletedOn: string | null;
  mainPkd: string | null;
  pkd: string[];
  /** Wspólność majątkowa małżeńska wg CEIDG (tekst / tak / nie). */
  maritalCommunity: string | null;
  businessCity: string | null;
  correspondenceCity: string | null;
  hasEDeliveryAddress: boolean;
  website: string | null;
  /** NIP-y spółek cywilnych, w których przedsiębiorca jest wspólnikiem. */
  civilPartnershipNips: string[];
}

/** Wykaz podatników VAT MF („biała lista”). */
export interface VatRegistryInfo {
  name: string;
  nip: string;
  regon: string | null;
  krs: string | null;
  statusVat: string | null;
  registeredOn: string | null;
  removedOn: string | null;
  removalBasis: string | null;
  restoredOn: string | null;
  restorationBasis: string | null;
  deniedOn: string | null;
  denialBasis: string | null;
  bankAccounts: number;
  hasVirtualAccounts: boolean;
  /** Imiona i nazwiska / nazwy (dane jawne wykazu). */
  representatives: string[];
  authorizedClerks: string[];
  partners: string[];
}

export interface KrsFinancialFiling {
  filedOn: string | null;
  /** Okres w formacie „2024-01-01 – 2024-12-31”. */
  period: string;
  periodEnd: string | null;
}

export interface KrsHistorySummary {
  entriesTotal: number;
  entriesLast24m: number;
  lastEntryDate: string | null;
  nameChanges: number;
  addressChanges: number;
  capitalChanges: number;
  /** Powołania + odwołania w organach (zarząd, prokura) w ostatnich 24 mies. */
  boardChangesLast24m: number;
  /** Zmiany wspólników w ostatnich 24 mies. */
  shareholderChangesLast24m: number;
}

export interface CrbrBeneficiarySummary {
  /** Imię i nazwisko z CRBR (dane jawne rejestru). */
  name: string;
  sharePercent: number | null;
  role: string | null;
  /** PESEL beneficjenta zgodny z PESEL sprawdzanej osoby. */
  matchesSubject: boolean;
}

export interface KrsCompanyProfile {
  krs: string;
  name: string;
  legalForm: string | null;
  nip: string | null;
  regon: string | null;
  registeredOn: string | null;
  seat: string | null;
  website: string | null;
  email: string | null;
  capital: string | null;
  mainPkd: string | null;
  pkdCount: number;
  representationRule: string | null;
  /** Wspólnicy (osoby fizyczne w KRS są zamaskowane). */
  shareholders: Array<{ name: string; shares: string | null }>;
  filings: KrsFinancialFiling[];
  lastFiledPeriodEnd: string | null;
  /** Opis zaległego sprawozdania (null = brak zaległości lub nie dotyczy). */
  overdueFiling: string | null;
  /** Wpisy działu 4 (zaległości, wierzytelności, oddalenie wniosku o upadłość). */
  dzial4: string[];
  /** Wpisy działu 6 (likwidacja, upadłość, restrukturyzacja, rozwiązanie). */
  dzial6: string[];
  deleted: boolean;
  history: KrsHistorySummary | null;
  /** Rola sprawdzanej osoby w spółce (z wyszukiwania KRS). */
  subjectRole: string | null;
  beneficiaries: CrbrBeneficiarySummary[];
  crbrNote: string | null;
}

export interface WebsiteDocumentLink {
  label: string;
  url: string;
}

export interface WebsiteCheck {
  url: string;
  /** Skąd adres: „KRS”, „CEIDG”. */
  declaredIn: string;
  reachable: boolean;
  httpStatus: number | null;
  https: boolean;
  title: string | null;
  robotsAllowed: boolean;
  nipOnSite: string[];
  krsOnSite: string[];
  /** true = identyfikator na stronie zgodny z rejestrem; false = inny; null = brak na stronie. */
  identifiersMatch: boolean | null;
  financialDocs: WebsiteDocumentLink[];
  pagesFetched: number;
  note: string;
}

export interface BusinessProfile {
  subject: string;
  role: "client" | "owner";
  kind: "person" | "company";
  ceidg: CeidgDetails | null;
  vat: VatRegistryInfo | null;
  companies: KrsCompanyProfile[];
  websites: WebsiteCheck[];
  flags: BusinessFlag[];
  notes: string[];
}
