// Typy modułu „Analityka" panelu inwestora — bezpieczne do importu po stronie
// klienta i serwera. Pipeline analityczny to TEN SAM silnik, którym posługuje
// się panel admina (lib/analysis-pipeline): pobranie KW → właściciele →
// analiza KW → analiza ryzyka. Tu tylko odczyt wyników i uruchomienie na
// żądanie dla okazji/wniosków wybranych dla inwestora (nie całej puli).
import type { FindingStatus, KwAnalysisResult } from "@/lib/kw-analysis/types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { InvestorValuationSummary } from "@/lib/risk-assessment/risk-assessment.functions";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";

export type AnalyticsStepKey = "kw" | "coowners" | "kw_analysis" | "risk";
export type AnalyticsStepStatus = "pending" | "running" | "done" | "error";

export interface AnalyticsStepState {
  status: AnalyticsStepStatus;
  finished_at?: string;
  error?: string;
}

export interface AnalyticsRun {
  id: string;
  kwNumber: string;
  status: "running" | "done" | "error";
  steps: Partial<Record<AnalyticsStepKey, AnalyticsStepState>>;
  triggerReason: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Skąd inwestor ma dostęp do wniosku. */
export type AnalyticsSource = "okazja" | "oferta" | "przekazany";

export const ANALYTICS_SOURCE_LABELS: Record<AnalyticsSource, string> = {
  okazja: "Okazja z Twojego Zlecenia",
  oferta: "Twoja oferta",
  przekazany: "Wniosek przekazany przez Finance You",
};

export interface AnalyticsResultFlags {
  /** Treść KW pobrana z EKW (krok 1). */
  kwFetched: boolean;
  /** Najnowsza analiza KW — jej status zbiorczy (krok 3). */
  kwAnalysisStatus: FindingStatus | null;
  /** Sprawdzenie właścicieli w CEIDG/KRS (krok 2). */
  coowners: boolean;
  /** Ocena ryzyka inwestycji (krok 4). */
  risk: boolean;
  /** Analiza zabezpieczenia (moduł towarzyszący — nie jest krokiem pipeline'u). */
  collateral: boolean;
}

export interface AnalyticsListItem {
  id: string;
  source: AnalyticsSource;
  /** Numer projektu z cyklu Zlecenia (tylko `okazja`). */
  projectRef: string | null;
  loanAmount: number | null;
  periodMonths: number | null;
  annualRate: number | null;
  ltv: number | null;
  propertyType: string | null;
  city: string | null;
  voivodeship: string | null;
  estimatedValue: number | null;
  areaSqm: number | null;
  /** Numer KW w formacie XX1X/00000000/0 (null = wniosek bez poprawnego numeru). */
  kwNumber: string | null;
  locationScore: number | null;
  /** Czy wniosek jest w puli „dostępne dla inwestorów" (pełny widok /inwestor/wniosek). */
  availableToInvestors: boolean;
  createdAt: string;
  run: AnalyticsRun | null;
  results: AnalyticsResultFlags;
}

export interface AnalyticsKwDocument {
  status: string;
  fetchedAt: string | null;
  lastError: string | null;
  sections: {
    okladka: string | null;
    dzial_1o: string | null;
    dzial_1s: string | null;
    dzial_2: string | null;
    dzial_3: string | null;
    dzial_4: string | null;
  };
}

export interface AnalyticsCoOwner {
  fullName: string | null;
  share: string | null;
  coOwnershipType: string | null;
  isPrimaryClient: boolean;
  /** Działalność gospodarcza (CEIDG): status słowny albo null, gdy nie sprawdzono. */
  businessStatus: string | null;
  /** Podmioty KRS, w których figuruje osoba (nazwa + flagi likwidacji/upadłości). */
  krs: { companyName: string; role: string | null; flags: string[] }[];
  notes: string[];
}

export interface AnalyticsCoOwners {
  totalOwnersInKw: number;
  summary: string;
  warnings: string[];
  generatedAt: string;
  owners: AnalyticsCoOwner[];
}

export interface AnalyticsDetail {
  item: AnalyticsListItem;
  kwDocument: AnalyticsKwDocument | null;
  kwAnalysis: { result: KwAnalysisResult; createdAt: string } | null;
  coowners: AnalyticsCoOwners | null;
  valuation: InvestorValuationSummary | null;
  collateral: PropertyAnalysisResult | null;
  /** Czy inwestor może teraz zlecić (kolejny) przebieg pipeline'u. */
  canRequestRun: boolean;
  /** Powód blokady uruchomienia (brak KW, przebieg w toku, limit 24 h). */
  runBlockedReason: string | null;
}

export interface AnalyticsStepMeta {
  key: AnalyticsStepKey;
  index: number;
  title: string;
  subtitle: string;
  /** Odcień akcentu (oklch hue) — spójny z stepperem pipeline'u inwestora. */
  hue: number;
}

/** Cztery kroki pipeline'u — kolejność i opisy jak w panelu admina. */
export const ANALYTICS_STEPS: AnalyticsStepMeta[] = [
  {
    key: "kw",
    index: 1,
    title: "Pobranie księgi wieczystej",
    subtitle: "Treść KW z EKW: oznaczenie nieruchomości, własność, prawa i roszczenia, hipoteki.",
    hue: 262,
  },
  {
    key: "coowners",
    index: 2,
    title: "Właściciele i rejestry",
    subtitle: "Dział II KW zestawiony z CEIDG i KRS — kto stoi za nieruchomością i w jakiej roli.",
    hue: 217,
  },
  {
    key: "kw_analysis",
    index: 3,
    title: "Analiza KW",
    subtitle: "Silnik reguł: przewidywane miejsce hipoteki, CLTV, obciążenia, wzmianki i blokery.",
    hue: 160,
  },
  {
    key: "risk",
    index: 4,
    title: "Analiza ryzyka i wartość",
    subtitle: "Prognoza wartości, szybka (wymuszona) sprzedaż, zbywalność i otoczenie rynkowe.",
    hue: 48,
  },
];

export const ANALYTICS_STEP_STATUS_LABELS: Record<AnalyticsStepStatus, string> = {
  pending: "Oczekuje",
  running: "W toku",
  done: "Gotowe",
  error: "Błąd",
};

/**
 * Stan kroku dla widoku: wynik w bazie wygrywa (krok „gotowy" nawet bez
 * przebiegu — np. analiza zrobiona ręcznie przez zespół), potem stan z
 * przebiegu, a w trwającym przebiegu pierwszy nierozstrzygnięty krok jest
 * „w toku".
 */
export function analyticsStepStatus(
  item: AnalyticsListItem,
  key: AnalyticsStepKey,
): AnalyticsStepStatus {
  const has: Record<AnalyticsStepKey, boolean> = {
    kw: item.results.kwFetched,
    coowners: item.results.coowners,
    kw_analysis: item.results.kwAnalysisStatus != null,
    risk: item.results.risk,
  };
  if (has[key]) return "done";
  const st = item.run?.steps?.[key]?.status;
  if (st === "error") return "error";
  if (st === "running") return "running";
  if (item.run?.status === "running") {
    // Pierwszy krok bez wyniku i bez błędu w trwającym przebiegu = w toku.
    const order: AnalyticsStepKey[] = ["kw", "coowners", "kw_analysis", "risk"];
    const firstOpen = order.find((k) => {
      const s = item.run?.steps?.[k]?.status;
      return !has[k] && s !== "error" && s !== "done";
    });
    return firstOpen === key ? "running" : "pending";
  }
  return "pending";
}

export function analyticsDoneCount(item: AnalyticsListItem): number {
  return ANALYTICS_STEPS.filter((s) => analyticsStepStatus(item, s.key) === "done").length;
}

// ── Szybka analiza KW (wniosek spoza Finance You) ───────────────────────────
// Inwestor podaje numer KW własnego tematu i rodzaj nieruchomości — wszystkie
// cztery kroki pipeline'u, łącznie z pełną oceną ryzyka. Nie tworzy wniosku w CRM.

export type KwCheckStepKey = AnalyticsStepKey;

export const KW_CHECK_STEPS = ANALYTICS_STEPS;

/** Rodzaje nieruchomości (klucze propertyTypeLabels) — podstawa wyceny w kroku 4. */
export const KW_CHECK_PROPERTY_TYPES = [
  "mieszkanie",
  "dom",
  "lokal_uslugowy",
  "dzialka_budowlana",
  "grunt_rolny",
  "udzial_w_nieruchomosci",
  "inna",
] as const;

export type KwCheckPropertyType = (typeof KW_CHECK_PROPERTY_TYPES)[number];

/** Ile nowych sprawdzeń inwestor może zlecić w ciągu 24 h (każde to pobranie KW). */
export const KW_CHECK_DAILY_LIMIT = 5;

export interface KwCheckItem {
  id: string;
  /** Numer KW w formacie XX1X/00000000/0. */
  kwNumber: string;
  label: string | null;
  /** Rodzaj nieruchomości (klucz propertyTypeLabels) — podstawa wyceny w kroku 4. */
  propertyType: string | null;
  loanAmount: number | null;
  propertyValue: number | null;
  periodMonths: number | null;
  status: "running" | "done" | "error";
  steps: Partial<Record<KwCheckStepKey, AnalyticsStepState>>;
  error: string | null;
  kwAnalysisStatus: FindingStatus | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface KwCheckDetail {
  item: KwCheckItem;
  kwDocument: AnalyticsKwDocument | null;
  coowners: AnalyticsCoOwners | null;
  kwAnalysis: { result: KwAnalysisResult; createdAt: string } | null;
  /** Pełna ocena ryzyka (krok 4) — ten sam raport co w panelu zespołu. */
  risk: InvestmentRiskAssessment | null;
}

/** Stan kroku sprawdzenia: zapis w przebiegu, a w trwającym — pierwszy otwarty krok „w toku". */
export function kwCheckStepStatus(item: KwCheckItem, key: KwCheckStepKey): AnalyticsStepStatus {
  const st = item.steps[key]?.status;
  if (st === "done" || st === "error") return st;
  if (item.status !== "running") return "pending";
  const order: KwCheckStepKey[] = ["kw", "coowners", "kw_analysis", "risk"];
  const firstOpen = order.find((k) => {
    const s = item.steps[k]?.status;
    return s !== "done" && s !== "error";
  });
  return firstOpen === key ? "running" : "pending";
}
