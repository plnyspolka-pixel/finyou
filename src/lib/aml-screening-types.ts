// Typy screeningu AML: CRBR (beneficjenci rzeczywiści) + PEP/sankcje (OpenSanctions/yente).
// Plik bez importów serwerowych — bezpieczny do użycia w komponentach klienckich.

export type AmlStageName =
  | "Pobranie profilu"
  | "CRBR — beneficjenci rzeczywiści"
  | "KRS — reprezentacja i wspólnicy"
  | "Porównanie CRBR ↔ KRS"
  | "Screening PEP/sankcje"
  | "Zapis wyniku";

export type AmlStageStatus = "oczekuje" | "trwa" | "sukces" | "brak danych" | "błąd" | "pominięto";

export interface AmlStage {
  name: AmlStageName;
  status: AmlStageStatus;
  message?: string;
}

// ─── CRBR ─────────────────────────────────────────────────────────────

export type CrbrStatus =
  | "found" // wpis znaleziony, lista beneficjentów pobrana
  | "not_found" // spółka podlega wpisowi, ale brak wpisu w CRBR (rozbieżność!)
  | "not_applicable" // podmiot nie podlega wpisowi do CRBR (JDG, spółka cywilna)
  | "not_configured" // brak konfiguracji CRBR_SEARCH_URL
  | "error";

export interface CrbrBeneficiary {
  firstName?: string;
  middleNames?: string;
  lastName?: string;
  pesel?: string;
  birthDate?: string;
  citizenship?: string;
  residenceCountry?: string;
  /** Nazwa beneficjenta grupowego (gdy zgłoszono grupę zamiast osoby). */
  groupName?: string;
  /** Opis udziału lub uprawnień (charakter kontroli). */
  rights?: string;
  /** Uprawnienia w ramach trustu, jeśli dotyczy. */
  trustRights?: string;
}

export type CrbrDiscrepancyLevel = "info" | "warning" | "critical";

export interface CrbrDiscrepancy {
  level: CrbrDiscrepancyLevel;
  code:
    | "BRAK_WPISU_CRBR"
    | "BENEFICJENT_SPOZA_KRS"
    | "WSPOLNIK_KRS_POZA_CRBR"
    | "ROZBIEZNY_PESEL"
    | "BRAK_BENEFICJENTOW";
  message: string;
}

export interface CrbrResult {
  status: CrbrStatus;
  beneficiaries: CrbrBeneficiary[];
  message?: string;
}

// ─── Screening PEP / sankcje ──────────────────────────────────────────

/** Skąd pochodzi osoba poddana screeningowi. */
export type ScreenedPersonSource =
  | "profil" // pożyczkobiorca JDG / dane osobowe z profilu
  | "reprezentant"
  | "KRS_zarzad"
  | "KRS_prokurent"
  | "KRS_wspolnik"
  | "CRBR_beneficjent"
  | "poreczyciel"
  | "wlasciciel_nieruchomosci"
  | "spolka"; // sam podmiot (screening firmy)

export const screenedPersonSourceLabels: Record<ScreenedPersonSource, string> = {
  profil: "Pożyczkobiorca",
  reprezentant: "Reprezentant",
  KRS_zarzad: "Zarząd (KRS)",
  KRS_prokurent: "Prokurent (KRS)",
  KRS_wspolnik: "Wspólnik (KRS)",
  CRBR_beneficjent: "Beneficjent rzeczywisty (CRBR)",
  poreczyciel: "Poręczyciel",
  wlasciciel_nieruchomosci: "Właściciel nieruchomości",
  spolka: "Podmiot (spółka)",
};

export interface ScreeningCandidate {
  /** Id encji w bazie OpenSanctions (np. Q-id / NK-id). */
  entityId: string;
  caption: string;
  score: number; // 0–1
  /** Czy algorytm dopasowujący uznał trafienie za pewne. */
  match: boolean;
  topics: string[];
  datasets: string[];
  isPep: boolean;
  isRca: boolean; // krewny lub bliski współpracownik osoby PEP
  isSanctioned: boolean;
}

export type PersonScreeningStatus = "hit" | "review" | "clear" | "error";

export interface PersonScreeningResult {
  name: string;
  birthDate?: string;
  sources: ScreenedPersonSource[];
  status: PersonScreeningStatus;
  candidates: ScreeningCandidate[];
  message?: string;
}

// ─── Raport zbiorczy ──────────────────────────────────────────────────

export type AmlOverallStatus = "hits" | "review" | "clear" | "incomplete";

export interface AmlScreeningReport {
  id?: string;
  profileId: string;
  nip?: string;
  borrowerType: string;
  createdAt?: string;
  stages: AmlStage[];
  crbr: CrbrResult;
  crbrDiscrepancies: CrbrDiscrepancy[];
  screening: PersonScreeningResult[];
  screeningProvider?: string;
  overallStatus: AmlOverallStatus;
  warnings: string[];
}

export const amlOverallStatusLabels: Record<AmlOverallStatus, string> = {
  hits: "Trafienia — wymaga decyzji",
  review: "Do weryfikacji",
  clear: "Brak trafień",
  incomplete: "Niekompletny",
};
