// Budowniczy znalezisk + katalog dokumentów. Zmniejsza boilerplate reguł i
// zapewnia, że KAŻDE znalezisko ma domyślny stan rozwiązania i pełny komplet
// pól (w tym trzy komunikaty). Reguła nadpisuje tylko to, co istotne.

import type {
  FindingCategory,
  FindingStatus,
  ImpactLevel,
  JsonValue,
  KwFinding,
  RequestedDocument,
  SourceEvidence,
} from "./types";

// ── Wersjonowany katalog dokumentów (spec §„Dokumenty i rozwiązywanie alertów"). ─
export const DOCS: Record<string, RequestedDocument> = {
  MARRIAGE_CERT: {
    code: "MARRIAGE_CERT",
    label: "Akt małżeństwa / dokument USC / decyzja o zmianie nazwiska",
    requiredFields: ["poprzednie nazwisko", "aktualne nazwisko", "data zmiany"],
  },
  ID_DOC: {
    code: "ID_DOC",
    label: "Dokument tożsamości + dokument źródłowy (do sprostowania)",
    requiredFields: ["imię", "nazwisko", "PESEL"],
  },
  INHERITANCE: {
    code: "INHERITANCE",
    label:
      "Akt poświadczenia dziedziczenia (APD) albo prawomocne postanowienie o stwierdzeniu nabycia spadku",
    requiredFields: ["spadkobiercy", "udziały", "prawomocność"],
  },
  ESTATE_DIVISION: {
    code: "ESTATE_DIVISION",
    label: "Dział spadku / zniesienie współwłasności / podział majątku",
    requiredFields: ["nabywca całości", "podstawa"],
  },
  MENTION_APPLICATION: {
    code: "MENTION_APPLICATION",
    label: "Wniosek KW + potwierdzenie złożenia (Dz.Kw) + wszystkie załączniki i podstawa żądania",
    requiredFields: ["numer Dz.Kw", "przedmiot wniosku", "podstawa (akt/orzeczenie/zgoda)"],
  },
  SENIOR_CERT: {
    code: "SENIOR_CERT",
    label: "Aktualne zaświadczenie wierzyciela z pierwszego miejsca",
    requiredFields: [
      "wierzyciel",
      "kapitał pozostały",
      "odsetki/koszty",
      "całkowita kwota spłaty",
      "opóźnienia/wypowiedzenie/egzekucja",
      "charakter odnawialny",
      "niewykorzystany limit / maks. ekspozycja",
      "rachunek do spłaty",
      "warunki zgody na wykreślenie",
    ],
  },
  PAYOFF_TERMS: {
    code: "PAYOFF_TERMS",
    label: "Saldo + rachunek do spłaty + promesa/zgoda na wykreślenie hipoteki",
    requiredFields: ["saldo", "rachunek", "warunki zwolnienia zabezpieczenia"],
  },
  LEASE_AGREEMENT: {
    code: "LEASE_AGREEMENT",
    label: "Pełna umowa najmu/dzierżawy z aneksami",
    requiredFields: ["termin", "czynsz", "możliwość wypowiedzenia", "wydanie nieruchomości"],
  },
  POWER_OF_ATTORNEY: {
    code: "POWER_OF_ATTORNEY",
    label: "Pełnomocnictwo w wymaganej formie",
    requiredFields: ["forma", "zakres umocowania", "data"],
  },
  COMPANY_KRS: {
    code: "COMPANY_KRS",
    label: "Pełny i aktualny odpis KRS + dokumenty sukcesji/przekształcenia",
    requiredFields: ["ciągłość podmiotu", "reprezentacja"],
  },
  ENFORCEMENT_CLOSURE: {
    code: "ENFORCEMENT_CLOSURE",
    label: "Prawomocny dokument o zakończeniu egzekucji + podstawa wykreślenia",
    requiredFields: ["prawomocność", "podstawa wykreślenia"],
  },
  EASEMENT_DOC: {
    code: "EASEMENT_DOC",
    label:
      "Dokument ustanawiający służebność/dożywocie/użytkowanie + wycena uwzględniająca obciążenie",
    requiredFields: ["zakres obciążenia", "wpływ na wartość"],
  },
  VACANT_RANK_STATEMENT: {
    code: "VACANT_RANK_STATEMENT",
    label: "Oświadczenie o rozporządzeniu opróżnionym miejscem + prawidłowy wniosek",
    requiredFields: ["treść rozporządzenia", "na rzecz hipoteki inwestora"],
  },
  VALUATION: {
    code: "VALUATION",
    label: "Operat/wycena uwzględniająca obciążenie",
    requiredFields: ["wartość", "uwzględnione obciążenia"],
  },
  CORRECT_KW: {
    code: "CORRECT_KW",
    label: "Wskazanie prawidłowego numeru KW",
    requiredFields: ["numer KW"],
  },
  GUARDIAN_CONSENT: {
    code: "GUARDIAN_CONSENT",
    label: "Zgoda sądu opiekuńczego / dokumenty przedstawiciela ustawowego",
    requiredFields: ["zgoda", "zakres"],
  },
  ACQUISITION_BASIS: {
    code: "ACQUISITION_BASIS",
    label: "Podstawa nabycia (akt notarialny / orzeczenie / decyzja)",
    requiredFields: ["podstawa", "data"],
  },
  CREDITOR_ASSIGNMENT: {
    code: "CREDITOR_ASSIGNMENT",
    label:
      "Dokument potwierdzający aktualnego uprawnionego (cesja/przelew/podział hipoteki/zajęcie)",
    requiredFields: ["aktualny wierzyciel", "podstawa"],
  },
};

export const NEUTRAL_MESSAGE =
  "System wykrył wpis, który może wpływać na zabezpieczenie. Przed podjęciem decyzji potrzebne jest wyjaśnienie lub dokument.";

interface FindingSpec {
  ruleId: string;
  ruleVersion: string;
  category: FindingCategory;
  status: FindingStatus;
  title: string;
  plainLanguageSummary: string;
  source: SourceEvidence[];
  whyItMatters: string;
  rankImpact?: ImpactLevel;
  enforcementImpact?: ImpactLevel;
  expectedFromClient: string;
  requestedDocuments?: RequestedDocument[];
  proposedResolution: string;
  agreementCondition?: string | null;
  payoutCondition?: string | null;
  intermediaryMessage: string;
  clientMessage: string;
  investorMessage: string;
  detectedValue?: JsonValue;
  confidence?: number;
}

let seq = 0;
/** Deterministyczny identyfikator znaleziska (bez Date/Random). */
export function resetFindingSeq(): void {
  seq = 0;
}

export function mkFinding(spec: FindingSpec): KwFinding {
  seq += 1;
  return {
    id: `${spec.ruleId}#${seq}`,
    ruleId: spec.ruleId,
    ruleVersion: spec.ruleVersion,
    category: spec.category,
    status: spec.status,
    title: spec.title,
    plainLanguageSummary: spec.plainLanguageSummary,
    source: spec.source,
    detectedValue: spec.detectedValue,
    whyItMatters: spec.whyItMatters,
    rankImpact: spec.rankImpact ?? "NONE",
    enforcementImpact: spec.enforcementImpact ?? "NONE",
    expectedFromClient: spec.expectedFromClient,
    requestedDocuments: spec.requestedDocuments ?? [],
    proposedResolution: spec.proposedResolution,
    agreementCondition: spec.agreementCondition ?? null,
    payoutCondition: spec.payoutCondition ?? null,
    intermediaryMessage: spec.intermediaryMessage,
    clientMessage: spec.clientMessage,
    investorMessage: spec.investorMessage,
    resolutionState: "UNRESOLVED",
    confidence: spec.confidence ?? 0.9,
  };
}
