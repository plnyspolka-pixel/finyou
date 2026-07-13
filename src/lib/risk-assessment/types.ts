// Typy modułu „Wycena i ocena ryzyka inwestycji".
// Bezpieczne do importu po stronie klienta i serwera (brak zależności serwerowych).

import type { SourceStatus, DataSourceUsage, PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { LifeExpectancyResult } from "./life-expectancy";
import type { FloorFactorResult } from "./floor-factor";
import type { PlotBuildabilityResult } from "./plot-buildability";

export type RiskGrade = "A" | "B" | "C" | "D" | "E";

export type Recommendation =
  | "rekomendowana"
  | "warunkowa"
  | "do_weryfikacji"
  | "odradzana";

// ---- Właściciel / kredytobiorca ----
export interface OwnerProfile {
  fullName: string | null;
  /** Wyznaczone z PESEL (nie przechowujemy samego numeru). */
  birthDate: string | null;
  sex: "M" | "K" | null;
  age: number | null;
  peselValid: boolean;
  peselError?: string;
  lifeExpectancy: LifeExpectancyResult;
  /** Zgodność właściciela z wpisem w dziale II KW. */
  matchesKwOwner: boolean | null;
  notes: string[];
}

// ---- KW: analiza prawna ----
export interface KwLegalAnalysis {
  available: boolean;
  kwNumber: string | null;
  owners: string[];
  /** Dział III — prawa, roszczenia, ograniczenia. */
  encumbrances: string[];
  /** Dział IV — hipoteki. */
  mortgages: Array<{ text: string; amount: number | null; currency: string | null; creditor: string | null }>;
  totalMortgageAmountPln: number | null;
  hasEnforcement: boolean; // egzekucja / komornik
  hasUsufruct: boolean; // służebność / dożywocie
  /** Dział I-O — kondygnacja lokalu (numeracja KW: parter = 1). */
  kondygnacja: number | null;
  /** Liczba pięter budynku nad parterem (z KW, jeśli dostępna). */
  floorsInBuilding: number | null;
  /** Klasa bonitacyjna gruntu (np. „R IVa") z działu I-O, jeśli dostępna. */
  soilClass: string | null;
  legalRiskScore: number; // 0–100 (wyżej = bezpieczniej)
  warnings: string[];
  summary: string;
}

// ---- Korespondencja: analiza behawioralna ----
export interface CorrespondenceIntel {
  available: boolean;
  messagesAnalyzed: number;
  channels: string[];
  sentiment: "pozytywny" | "neutralny" | "negatywny" | "mieszany" | "nieznany";
  cooperationLevel: "wysoki" | "sredni" | "niski" | "nieznany";
  urgency: "niska" | "srednia" | "wysoka" | "nieznana";
  /** Sygnały ostrzegawcze (nacisk czasowy, presja, niespójności, przymus, oznaki oszustwa). */
  redFlags: string[];
  /** Fakty o nieruchomości/sytuacji podane przez klienta. */
  statedFacts: string[];
  /** Niespójności względem danych z wniosku / KW. */
  inconsistencies: string[];
  behavioralRiskScore: number; // 0–100 (wyżej = bezpieczniej)
  summary: string;
}

// ---- OCR dokumentów ----
export interface OcrDocumentResult {
  documentId: string;
  fileName: string | null;
  docKind: string;
  status: SourceStatus;
  fields: Record<string, unknown>;
  rawTextSnippet: string | null;
}
export interface OcrSummary {
  status: SourceStatus;
  documentsProcessed: number;
  documents: OcrDocumentResult[];
}

// ---- Perplexity: nadrzędna wycena i opinia ----
export interface MasterValuation {
  status: "success" | "no_data" | "error";
  estimatedValueLowPln: number | null;
  estimatedValueMidPln: number | null;
  estimatedValueHighPln: number | null;
  suggestedMaxLoanAmountPln: number | null;
  suggestedLtvCapPercent: number | null;
  marketTrend: "rosnacy" | "stabilny" | "spadkowy" | "nieznany";
  liquidityComment: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendation: Recommendation;
  rationale: string;
  citations: string[];
  errorMessage?: string;
}

// ---- Prognozowana łatwość sprzedaży (popyt z otoczenia) ----
export type SaleabilityBand =
  | "bardzo_latwa"
  | "latwa"
  | "umiarkowana"
  | "trudna"
  | "bardzo_trudna"
  | "nieznana";

export interface SaleabilityForecast {
  available: boolean;
  score: number; // 0–100, wyżej = łatwiej sprzedać
  band: SaleabilityBand;
  estimatedDaysOnMarket: number | null;
  localityPopulation: number | null;
  populationTrend: "rosnaca" | "stabilna" | "malejaca" | "nieznana";
  /** Rozsądny/sprzedawalny rynek: miasto >20 tys. mieszk. lub grunt rolny (bez ograniczeń). */
  reasonableMarket: boolean;
  /** Czynnik kondygnacji (tylko dla mieszkań; null dla pozostałych typów). */
  floorFactor: FloorFactorResult | null;
  nearestLargeCity: { name: string | null; population: number | null; distanceKm: number | null };
  // Czynniki popytu w otoczeniu (20/50 km).
  demandDrivers: {
    largeCityWithin50km: boolean;
    waterBodyWithin20km: boolean;      // jezioro / zbiornik / zalew
    spaResortWithin20km: boolean;      // kurort / miejscowość uzdrowiskowa
    sanatoriumWithin20km: boolean;
    touristAttractionWithin20km: boolean;
    majorRoadWithin10km: boolean;      // dostępność komunikacyjna (S/A/DK)
  };
  rentalDemand: "wysoki" | "sredni" | "niski" | "nieznany";
  purchasingPowerComment: string | null;
  // Aktywne oferty sprzedaży w okolicy wystawione przez biura nieruchomości.
  localMarketOffers: {
    available: boolean;          // czy rynek jest zaopatrzony w oferty biur
    totalActiveListings: number; // wszystkie znalezione oferty w okolicy
    agencyListings: number;      // wystawione przez biura nieruchomości
    privateListings: number;     // oferty prywatne
    medianPricePerM2: number | null;
    radiusKm: number;
    source: string;
    sample: Array<{ title: string; url: string; source: string; postedBy: string; pricePln: number | null; pricePerM2: number | null }>;
  };
  rationale: string;
  citations: string[];
  summary: string;
}

// ---- Wycena wymuszonej sprzedaży (licytacja komornicza) ----
export type AuctionOutcome =
  | "pierwsza_licytacja"
  | "druga_licytacja"
  | "przejecie_wierzyciela"
  | "nieznany";

// Ryzyko blokady licytacji nieruchomości mieszkalnej (art. 952¹ § 2 KPC).
export interface ResidentialAuctionBlock {
  applicable: boolean;
  blocked: boolean;
  loanToValuePercent: number | null;
  thresholdPln: number | null; // 5% wartości = minimalna należność główna
  message: string;
  legalBasis: string;
}

export interface ForcedSaleEstimate {
  basisValuePln: number | null;   // suma oszacowania przyjęta do wyliczeń
  basisSource: string;
  marketSalePriceLowPln: number | null;
  marketSalePriceMidPln: number | null;
  marketSalePriceHighPln: number | null;
  firstAuctionOpeningPln: number | null;   // 3/4 sumy oszacowania (art. 965 KPC)
  secondAuctionOpeningPln: number | null;  // 2/3 sumy oszacowania (art. 983 KPC)
  expectedForcedSaleLowPln: number | null;
  expectedForcedSaleHighPln: number | null;
  likelyAuctionOutcome: AuctionOutcome;
  loanToForcedSalePercent: number | null;  // pokrycie kwoty pożyczki z wymuszonej sprzedaży
  residentialAuctionBlock: ResidentialAuctionBlock;
  recoveryComment: string;
  legalBasis: string;
}

// ---- Dane rządowe: GUS BDL (przeciętne ceny) + RCN/Geoportal (rzeczywiste transakcje) ----
export interface GovBenchmark {
  source: "GUS BDL" | "RCN + GUS BDL";
  available: boolean;
  propertyType: string;
  // Wybrane (priorytet: RCN transakcyjne > GUS przeciętne):
  primarySource: "RCN" | "GUS BDL" | "brak";
  pricePerHa: number | null;
  pricePerM2Median: number | null;
  pricePerM2Average: number | null; // GUS (informacyjnie)
  soilClass: string | null;
  soilCategory: "dobre" | "srednie" | "slabe" | "ogolem";
  areaHa: number | null;
  landValuePln: number | null;
  dwellingValuePln: number | null;
  // GUS (dla porównania):
  gusPricePerHa: number | null;
  gusPricePerM2Median: number | null;
  // RCN — rzeczywiste transakcje z Rejestru Cen Nieruchomości:
  rcnAvailable: boolean;
  rcnPricePerHa: number | null;
  rcnPricePerM2: number | null;
  rcnTransactions: number;
  rcnRadiusKm: number | null;
  rcnStatus: string;
  rcnStatusMessage: string;
  // wspólne:
  unitName: string | null;
  unitLevel: string | null; // powiat / wojewodztwo / krajowy
  period: string | null;
  fallbackUsed: boolean;
  summaryLine: string;
  warnings: string[];
}

// ---- Wynik zbiorczy ----
export interface RiskComponentScores {
  collateral: number; // z analizy zabezpieczenia
  valuationConfidence: number;
  legal: number;
  borrowerLongevity: number;
  correspondence: number;
  documentCompleteness: number;
  exitLiquidity: number; // prognozowana łatwość sprzedaży / wyjścia z inwestycji
}

export interface InvestmentRiskAssessment {
  success: boolean;
  applicationId: string;
  generatedAt: string;
  /** 0–100, wyżej = bezpieczniejsza inwestycja. */
  investmentScore: number;
  riskGrade: RiskGrade;
  recommendation: Recommendation;

  owner: OwnerProfile;
  kwLegal: KwLegalAnalysis;
  correspondence: CorrespondenceIntel;
  ocr: OcrSummary;
  saleability: SaleabilityForecast;
  plotBuildability: PlotBuildabilityResult;
  govBenchmark: GovBenchmark;
  forcedSale: ForcedSaleEstimate;
  masterValuation: MasterValuation;

  /** Wynik istniejącej analizy zabezpieczenia (wycena Perplexity + lokalizacja + powódź). */
  collateralAnalysis: PropertyAnalysisResult | null;

  componentScores: RiskComponentScores;
  keyRisks: string[];
  keyStrengths: string[];
  warnings: string[];

  /** Komplet źródeł danych wykorzystanych w ocenie (deliverable „wszystkie źródła"). */
  dataSources: DataSourceUsage[];

  executiveSummary: string;
}

export function gradeFromScore(score: number): RiskGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "E";
}

// Neutralna klasyfikacja ryzyka (NIE rekomendacja/porada inwestycyjna).
export function recommendationLabel(r: Recommendation): string {
  switch (r) {
    case "rekomendowana": return "Profil niskiego ryzyka";
    case "warunkowa": return "Profil ryzyka umiarkowanego (warunkowy)";
    case "do_weryfikacji": return "Wymaga dodatkowej weryfikacji";
    case "odradzana": return "Profil wysokiego ryzyka";
  }
}
