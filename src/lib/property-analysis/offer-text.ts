// Generator tekstów do oferty inwestycyjnej. Czysty, deterministyczny.
import type {
  CollateralScore,
  DataSourceUsage,
  FloodRiskResult,
  InvestmentOfferText,
  LegalRiskResult,
  LocationScoreResult,
  PropertyAnalysisInput,
  PropertyAnalysisResult,
  ValuationBenchmark,
} from "./types";
import { categoryLabel } from "./scoring";
import { floodRiskInvestorText } from "./flood-risk.server";

const FORBIDDEN_WORDS = [
  "operat",
  "oficjalna wycena",
  "gwarantowana wartość",
  "pewna cena sprzedaży",
];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  lokal_uslugowy: "lokal usługowy",
  dzialka_budowlana: "działka budowlana",
  dzialka_zabudowana: "działka zabudowana",
  grunt_rolny: "grunt rolny",
  inna: "nieruchomość",
};

function fmtPln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(v);
}
function fmtArea(input: PropertyAnalysisInput): string {
  if (input.usableAreaM2) return `${input.usableAreaM2} m² powierzchni użytkowej`;
  if (input.buildingAreaM2) return `${input.buildingAreaM2} m² powierzchni zabudowy`;
  if (input.landAreaHa) return `${input.landAreaHa} ha`;
  if (input.landAreaM2) return `${input.landAreaM2} m²`;
  return "nieokreślonej powierzchni";
}
function locationLabel(input: PropertyAnalysisInput): string {
  const parts = [input.city, input.county, input.voivodeship].filter(Boolean);
  return parts.length ? parts.join(", ") : "nieokreślonej lokalizacji";
}
function locationQualityWord(score: number): string {
  if (score >= 75) return "bardzo dobrą";
  if (score >= 55) return "dobrą";
  if (score >= 35) return "przeciętną";
  return "słabą";
}

export interface OfferTextInput {
  input: PropertyAnalysisInput;
  valuation: ValuationBenchmark;
  location: LocationScoreResult;
  legal: LegalRiskResult;
  collateralScore: CollateralScore;
  sourcesUsed: DataSourceUsage[];
  rcnCount: number;
  rcnRadiusKm: number | null;
  weakData: boolean;
  floodRisk?: FloodRiskResult;
  floodAvailable?: boolean;
}

export function generateOfferText(args: OfferTextInput): InvestmentOfferText {
  const {
    input,
    valuation,
    location,
    legal,
    collateralScore,
    sourcesUsed,
    rcnCount,
    rcnRadiusKm,
    weakData,
  } = args;
  const typeLabel = PROPERTY_TYPE_LABELS[input.propertyType as string] ?? "nieruchomość";

  const propertySummary = `Przedmiotem zabezpieczenia jest ${typeLabel} położona w ${locationLabel(input)}, o ${fmtArea(input)}.`;

  const sourceNames =
    sourcesUsed
      .filter((s) => s.used)
      .map((s) => s.source)
      .join(", ") || "dostępne dane wewnętrzne";
  const valuationParts = [
    `Wartość zabezpieczenia została oszacowana pomocniczo na podstawie dostępnych danych transakcyjnych i statystycznych. Program wykorzystał następujące źródła: ${sourceNames}.`,
  ];
  if (valuation.conservativeLowPln != null && valuation.conservativeHighPln != null) {
    valuationParts.push(
      `Orientacyjny zakres ostrożnościowy wartości: ${fmtPln(valuation.conservativeLowPln)} – ${fmtPln(valuation.conservativeHighPln)}.`,
    );
  }
  if (rcnCount > 0 && rcnRadiusKm) {
    valuationParts.push(
      `W okolicy odnaleziono ${rcnCount} transakcji podobnego typu w promieniu ${rcnRadiusKm} km${valuation.pricePerM2Median ? `; mediana ceny: ${fmtPln(valuation.pricePerM2Median)}/m².` : "."}`,
    );
  } else if (rcnCount === 0) {
    valuationParts.push(
      "Brak transakcji porównawczych z RCN dla zadanej lokalizacji — wykorzystano benchmark statystyczny.",
    );
  }
  if (weakData)
    valuationParts.push(
      "Dostępność danych porównawczych jest ograniczona, dlatego wynik wymaga dodatkowej ręcznej weryfikacji.",
    );

  const locationSummary =
    `Analiza lokalizacji wskazuje na ${locationQualityWord(location.score)} dostępność infrastruktury codziennej. ${location.liquidityComment ?? ""}`.trim();
  const legalRiskSummary =
    legal.warnings.length === 0
      ? "Analiza dokumentów nie wykazała istotnych ryzyk prawnych."
      : `Analiza dokumentów wykazała następujące ryzyka: ${legal.warnings.slice(0, 5).join("; ")}.`;
  const collateralScoreSummary = `Łączna ocena zabezpieczenia wyniosła ${collateralScore.total}/100, co odpowiada kategorii: ${categoryLabel(collateralScore.category)}.`;

  const baseInvestor = [
    propertySummary,
    valuation.conservativeLowPln != null && valuation.conservativeHighPln != null
      ? `Orientacyjna wartość: ${fmtPln(valuation.conservativeLowPln)} – ${fmtPln(valuation.conservativeHighPln)}.`
      : "",
    collateralScoreSummary,
  ]
    .filter(Boolean)
    .join(" ");

  const floodText = args.floodRisk
    ? floodRiskInvestorText(args.floodRisk, !!args.floodAvailable)
    : null;

  const result: InvestmentOfferText = {
    propertySummary,
    valuationSummary: valuationParts.join(" "),
    locationSummary,
    legalRiskSummary,
    collateralScoreSummary,
    investorShortSummary: floodText
      ? `${baseInvestor} ${floodText.shortInvestorBullet}`
      : baseInvestor,
    floodRiskSummary: floodText?.floodRiskSummary,
  };
  assertNoForbiddenWords(result);
  return result;
}

export function assertNoForbiddenWords(text: InvestmentOfferText): void {
  const joined = Object.values(text).filter(Boolean).join(" ").toLowerCase();
  for (const w of FORBIDDEN_WORDS) {
    if (joined.includes(w)) throw new Error(`Tekst oferty zawiera zakazane sformułowanie: "${w}"`);
  }
}

export function buildAnalysisResult(args: {
  input: PropertyAnalysisInput;
  valuation: ValuationBenchmark;
  ltv: PropertyAnalysisResult["ltv"];
  location: LocationScoreResult;
  legal: LegalRiskResult;
  market: PropertyAnalysisResult["marketLiquidity"];
  collateralScore: CollateralScore;
  sourcesUsed: DataSourceUsage[];
  warnings: string[];
  offerText: InvestmentOfferText;
  raw: Record<string, any>;
  floodRisk?: FloodRiskResult;
  floodAlerts?: string[];
}): PropertyAnalysisResult {
  const { input } = args;
  return {
    success: true,
    property: {
      type: input.propertyType as string,
      address: [input.address, input.city].filter(Boolean).join(", "),
      kwNumber: input.kwNumber ?? null,
      parcelNumber: input.parcelNumber ?? null,
      county: input.county ?? null,
      voivodeship: input.voivodeship ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      usableAreaM2: input.usableAreaM2 ?? null,
      landAreaM2: input.landAreaM2 ?? null,
      landAreaHa: input.landAreaHa ?? null,
    },
    dataSourcesUsed: args.sourcesUsed,
    valuationBenchmark: args.valuation,
    ltv: args.ltv,
    locationScore: args.location,
    legalRisk: args.legal,
    marketLiquidity: args.market,
    collateralScore: args.collateralScore,
    investmentOfferText: args.offerText,
    floodRisk: args.floodRisk,
    floodAlerts: args.floodAlerts,
    warnings: args.warnings,
    raw: args.raw,
  };
}
