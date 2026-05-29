// Typy współdzielone modułu Analiza Zabezpieczenia.
// Plik bezpieczny do importu zarówno po stronie klienta, jak i serwera.

export type PropertyType =
  | "mieszkanie"
  | "dom"
  | "lokal_uslugowy"
  | "dzialka_budowlana"
  | "dzialka_zabudowana"
  | "grunt_rolny"
  | "inna";

export type CollateralCategory =
  | "bardzo_dobre"
  | "dobre"
  | "akceptowalne"
  | "podwyzszone_ryzyko"
  | "nieakceptowalne";

export type LtvCategory = "safe" | "moderate" | "high" | "very_high" | "unknown";

export type SourceStatus = "success" | "no_data" | "error" | "partial" | "skipped";

export interface PropertyAnalysisInput {
  applicationId: string;
  propertyType: PropertyType | string;
  kwNumber?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  voivodeship?: string | null;
  parcelNumber?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  usableAreaM2?: number | null;
  buildingAreaM2?: number | null;
  landAreaM2?: number | null;
  landAreaHa?: number | null;
  soilClass?: string | null;
  declaredPropertyValuePln?: number | null;
  requestedLoanAmountPln?: number | null;
  documents?: Array<{ id: string; url?: string | null; type?: string | null; name?: string | null }>;
  photos?: string[];
}

export interface DataSourceUsage {
  source: string;
  used: boolean;
  purpose: string;
  dataLevel: string;
  period: string;
  status: SourceStatus;
  note?: string;
}

export interface ValuationBenchmark {
  mainSource: string;
  supportingSources: string[];
  pricePerM2Median: number | null;
  pricePerM2Average: number | null;
  pricePerHa: number | null;
  estimatedValueMedianPln: number | null;
  estimatedValueAveragePln: number | null;
  conservativeLowPln: number | null;
  conservativeHighPln: number | null;
  declaredValuePln: number | null;
  varianceFromDeclaredValuePercent: number | null;
}

export interface LtvResult {
  requestedLoanAmountPln: number | null;
  estimatedValuePln: number | null;
  ltvPercent: number | null;
  ltvCategory: LtvCategory;
}

export interface LocationScoreResult {
  score: number;
  summary: string;
  liquidityComment: string;
  poiCounts?: Record<string, number>;
}

export interface LegalRiskResult {
  score: number;
  warnings: string[];
}

export interface MarketLiquidityResult {
  score: number;
  summary: string;
  transactionsCount: number;
}

export interface CollateralScoreComponents {
  legalAndDocuments: number;
  valueAndLtv: number;
  marketLiquidity: number;
  technicalAndUseRisks: number;
  dataQuality: number;
}

export type FloodRiskLevel = "none" | "low" | "medium" | "high" | "very_high" | "unknown";

export interface FloodRiskResult {
  riskLevel: FloodRiskLevel;
  scenario10Percent: boolean;
  scenario1Percent: boolean;
  scenario02Percent: boolean;
  specialFloodHazardArea: boolean;
  waterDepth: number | null;
  flowVelocity: number | null;
  riskMapIntersection: boolean;
  score: number;
  geometryUsed?: "point" | "parcel_geometry" | "address_geocoding";
  available: boolean;
}

export interface CollateralScore {
  total: number;
  category: CollateralCategory;
  components: CollateralScoreComponents;
  summary: string;
  mainRisks: string[];
  mainStrengths: string[];
}

export interface InvestmentOfferText {
  propertySummary: string;
  valuationSummary: string;
  locationSummary: string;
  legalRiskSummary: string;
  collateralScoreSummary: string;
  investorShortSummary: string;
  floodRiskSummary?: string;
}


export interface PropertyAnalysisResult {
  success: boolean;
  property: {
    type: string;
    address: string;
    kwNumber: string | null;
    parcelNumber: string | null;
    county: string | null;
    voivodeship: string | null;
    latitude: number | null;
    longitude: number | null;
    usableAreaM2: number | null;
    landAreaM2: number | null;
    landAreaHa: number | null;
  };
  dataSourcesUsed: DataSourceUsage[];
  valuationBenchmark: ValuationBenchmark;
  ltv: LtvResult;
  locationScore: LocationScoreResult;
  legalRisk: LegalRiskResult;
  marketLiquidity: MarketLiquidityResult;
  collateralScore: CollateralScore;
  investmentOfferText: InvestmentOfferText;
  floodRisk?: FloodRiskResult;
  floodAlerts?: string[];
  gusDiagnostics?: GusBenchmarkDiagnostics | null;
  listingsBenchmark?: ListingsBenchmarkSummary | null;
  warnings: string[];
  raw: Record<string, any>;
}

export type BdlLevelLabel =
  | "powiat / miasto na prawach powiatu"
  | "województwo"
  | "region NUTS"
  | "Polska"
  | "nieznany";

export type GusSanityStatus = "ok" | "suspicious" | "rejected";

export interface GusBenchmarkDiagnostics {
  inputLocation: { city: string | null; county: string | null; voivodeship: string | null };
  resolvedLocation: {
    bdlUnitId: string;
    bdlUnitName: string;
    bdlUnitLevel: BdlLevelLabel;
    source: "known_city" | "known_voivodeship" | "search" | "country_fallback";
  };
  bdlVariable: { variableId: string; variableName: string; unit: string | null } | null;
  period: { year: string | null; quarter: string | null; label: string };
  value: number | null;
  fallbackUsed: boolean;
  fallbackLevel: BdlLevelLabel | null;
  sanityCheckStatus: GusSanityStatus;
  sanityCheckReason: string | null;
  warnings: string[];
  summaryLine: string;
}


export interface RcnStats {
  count: number;
  median: number | null;
  average: number | null;
  q1: number | null;
  q3: number | null;
  unit: "pln_per_m2" | "pln_per_ha";
  radiusM: number;
  periodMonths: number;
  freshness: "good" | "limited" | "weak";
}


export interface GusStats {
  pricePerM2Median: number | null;
  pricePerM2Average: number | null;
  transactionsCount: number | null;
  period: string;
  level: "powiat" | "wojewodztwo" | "krajowy";
  pricePerHaByClass?: Record<"dobre" | "srednie" | "slabe" | "ogolem", number | null>;
}

export interface NbpTrend {
  market: string;
  trend: "rosnacy" | "stabilny" | "spadkowy" | "nieznany";
  quarterlyChangePercent: number | null;
  yearlyChangePercent: number | null;
  comment: string;
}

export interface DocumentExtraction {
  documentId: string;
  docKind: string;
  data: Record<string, unknown>;
}

export interface ScrapedListingSummary {
  source: string;
  url: string;
  title: string;
  pricePln: number | null;
  areaM2: number | null;
  pricePerM2: number | null;
  snippet?: string;
}

export interface ListingsBenchmarkSummary {
  status: "success" | "no_data" | "error" | "partial";
  query: string;
  portals: string[];
  totalFound: number;
  used: number;
  pricePerM2Median: number | null;
  pricePerM2Average: number | null;
  pricePerM2Min: number | null;
  pricePerM2Max: number | null;
  listings: ScrapedListingSummary[];
  errorMessage?: string;
}
