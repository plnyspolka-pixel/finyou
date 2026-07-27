// Czysta logika scoringu nieruchomości (0–100) — łatwo testowalna.
import type {
  CollateralCategory,
  CollateralScore,
  CollateralScoreComponents,
  DocumentExtraction,
  GusStats,
  LegalRiskResult,
  LocationScoreResult,
  LtvCategory,
  LtvResult,
  MarketLiquidityResult,
  NbpTrend,
  PropertyAnalysisInput,
  RcnStats,
  ValuationBenchmark,
} from "./types";

export function classifyCategory(total: number): CollateralCategory {
  if (total >= 85) return "bardzo_dobre";
  if (total >= 70) return "dobre";
  if (total >= 55) return "akceptowalne";
  if (total >= 40) return "podwyzszone_ryzyko";
  return "nieakceptowalne";
}

export function categoryLabel(c: CollateralCategory): string {
  switch (c) {
    case "bardzo_dobre":
      return "bardzo dobre zabezpieczenie";
    case "dobre":
      return "dobre zabezpieczenie";
    case "akceptowalne":
      return "akceptowalne zabezpieczenie";
    case "podwyzszone_ryzyko":
      return "podwyższone ryzyko";
    case "nieakceptowalne":
      return "zabezpieczenie wysokiego ryzyka";
  }
}

export function classifyLtv(ltvPercent: number | null): LtvCategory {
  if (ltvPercent == null) return "unknown";
  if (ltvPercent <= 50) return "safe";
  if (ltvPercent <= 65) return "moderate";
  if (ltvPercent <= 80) return "high";
  return "very_high";
}

export interface ScoringInput {
  input: PropertyAnalysisInput;
  valuation: ValuationBenchmark;
  ltv: LtvResult;
  location: LocationScoreResult;
  legal: LegalRiskResult;
  market: MarketLiquidityResult;
  rcn: RcnStats | null;
  gus: GusStats | null;
  nbp: NbpTrend | null;
  documents: DocumentExtraction[];
  documentsPresent: {
    kw: boolean;
    mpzpOrWz: boolean;
    landRegistry: boolean;
    appraisal: boolean;
    photos: boolean;
  };
  floodRisk?: {
    riskLevel: "none" | "low" | "medium" | "high" | "very_high" | "unknown";
    available: boolean;
  };
}
export function calculateCollateralScore(s: ScoringInput): CollateralScore {
  const components: CollateralScoreComponents = {
    legalAndDocuments: legalAndDocumentsScore(s),
    valueAndLtv: valueAndLtvScore(s),
    marketLiquidity: marketLiquidityScore(s),
    technicalAndUseRisks: technicalAndUseRisksScore(s),
    dataQuality: dataQualityScore(s),
  };
  let total = Math.round(
    components.legalAndDocuments +
      components.valueAndLtv +
      components.marketLiquidity +
      components.technicalAndUseRisks +
      components.dataQuality,
  );
  // very_high flood => oznaczenie nieakceptowalne niezależnie od reszty
  let category = classifyCategory(total);
  if (s.floodRisk?.available && s.floodRisk.riskLevel === "very_high") {
    category = "nieakceptowalne";
    total = Math.min(total, 39);
  }
  const { strengths, risks } = enumerateStrengthsRisks(s, components);
  return {
    total,
    category,
    components,
    summary: `Łączna ocena zabezpieczenia: ${total}/100 — ${categoryLabel(category)}.`,
    mainStrengths: strengths.slice(0, 5),
    mainRisks: risks.slice(0, 5),
  };
}

// A. Stan prawny i kompletność dokumentów — 25 pkt
function legalAndDocumentsScore(s: ScoringInput): number {
  let pts = 0;
  const warningsCount = s.legal.warnings.length;
  if (s.input.kwNumber || s.documentsPresent.kw) pts += 5;
  if (warningsCount === 0) pts += 5;
  // właściciel/wnioskodawca: brak twardych danych → 3 z 5 jako neutralne
  pts += 3;
  if (requiredDocsCompleteFor(s)) pts += 5;
  if (warningsCount <= 1) pts += 5;
  else if (warningsCount <= 3) pts += 2;
  return Math.min(25, pts);
}

function requiredDocsCompleteFor(s: ScoringInput): boolean {
  const type = s.input.propertyType;
  if (type === "mieszkanie" || type === "lokal_uslugowy") return s.documentsPresent.kw;
  if (type === "dom" || type === "dzialka_zabudowana")
    return s.documentsPresent.kw && s.documentsPresent.landRegistry;
  if (type === "dzialka_budowlana") return s.documentsPresent.kw && s.documentsPresent.mpzpOrWz;
  if (type === "grunt_rolny") return s.documentsPresent.kw && s.documentsPresent.landRegistry;
  return s.documentsPresent.kw;
}

// B. Wartość i LTV — 25 pkt
function valueAndLtvScore(s: ScoringInput): number {
  let pts = 0;
  const ltv = s.ltv.ltvPercent;
  if (ltv != null) {
    if (ltv <= 50) pts += 10;
    else if (ltv <= 65) pts += 7;
    else if (ltv <= 80) pts += 4;
    else pts += 1;
  }
  const supporting = s.valuation.supportingSources.length;
  if (supporting >= 2) pts += 5;
  else if (supporting === 1) pts += 3;
  if (s.rcn && (s.rcn.median ?? 0) > 0) pts += 5;
  if (s.gus || s.nbp) pts += 3;
  const variance = s.valuation.varianceFromDeclaredValuePercent;
  if (variance != null && Math.abs(variance) <= 15) pts += 2;
  return Math.min(25, pts);
}

// C. Płynność rynkowa — 20 pkt
function marketLiquidityScore(s: ScoringInput): number {
  let pts = 0;
  const liquidTypes = ["mieszkanie", "dom", "dzialka_budowlana", "lokal_uslugowy"];
  if (liquidTypes.includes(s.input.propertyType as string)) pts += 5;
  else pts += 2;
  if (s.location.score >= 60) pts += 5;
  else if (s.location.score >= 40) pts += 3;
  if (s.location.score >= 50) pts += 5;
  else if (s.location.score >= 30) pts += 3;
  const tx = s.market.transactionsCount;
  if (tx >= 5) pts += 5;
  else if (tx >= 3) pts += 3;
  else if (tx >= 1) pts += 1;
  return Math.min(20, pts);
}

// D. Ryzyka techniczne, użytkowe i środowiskowe — 15 pkt
// stan techniczny: 3, dostęp do drogi: 2, media: 2, brak istotnych ograniczeń: 3, brak ryzyk powodziowych: 5
function technicalAndUseRisksScore(s: ScoringInput): number {
  let pts = 0;
  pts += s.documentsPresent.photos ? 3 : 2; // stan techniczny
  pts += 2; // dostęp do drogi
  pts += 2; // media
  pts += s.documentsPresent.mpzpOrWz ? 3 : 2; // ograniczenia planistyczne
  // ryzyko powodziowe (max 5)
  const fr = s.floodRisk;
  if (!fr || !fr.available || fr.riskLevel === "unknown") pts += 3;
  else if (fr.riskLevel === "none") pts += 5;
  else if (fr.riskLevel === "low") pts += 3;
  else if (fr.riskLevel === "medium") pts += 1;
  else pts += 0;
  return Math.min(15, pts);
}

// E. Jakość danych — 15 pkt
function dataQualityScore(s: ScoringInput): number {
  let pts = 0;
  if (s.documents.length >= 3) pts += 5;
  else if (s.documents.length >= 1) pts += 3;
  let registries = 0;
  if (s.rcn) registries += 1;
  if (s.gus) registries += 1;
  if (s.nbp) registries += 1;
  pts += Math.min(4, registries * 2);
  if (s.rcn && s.rcn.freshness === "good") pts += 3;
  else if (s.rcn && s.rcn.freshness === "limited") pts += 2;
  else if (s.gus || s.nbp) pts += 1;
  const manualAssumptions = s.input.declaredPropertyValuePln == null ? 1 : 3;
  pts += manualAssumptions;
  return Math.min(15, pts);
}

function enumerateStrengthsRisks(
  s: ScoringInput,
  c: CollateralScoreComponents,
): { strengths: string[]; risks: string[] } {
  const strengths: string[] = [];
  const risks: string[] = [];
  if (s.ltv.ltvCategory === "safe") strengths.push("Bezpieczny poziom LTV.");
  if (s.ltv.ltvCategory === "very_high")
    risks.push("Wysoki poziom LTV — ograniczony bufor wartości.");
  if (s.rcn && (s.rcn.count ?? 0) >= 5)
    strengths.push("Wystarczająca liczba transakcji porównawczych w RCN.");
  if (s.rcn && s.rcn.count === 0)
    risks.push("Brak transakcji porównawczych w RCN dla danej lokalizacji.");
  if (s.location.score >= 70) strengths.push("Dobra lokalizacja i dostępność infrastruktury.");
  if (s.location.score < 40) risks.push("Słaba lokalizacja — możliwa ograniczona płynność.");
  if (s.legal.warnings.length > 0)
    risks.push(`Ostrzeżenia prawne: ${s.legal.warnings.slice(0, 3).join("; ")}.`);
  if (c.dataQuality >= 11) strengths.push("Dobra jakość i pokrycie danych.");
  if (c.dataQuality <= 6)
    risks.push("Słaba jakość/pokrycie danych — wynik wymaga ręcznej weryfikacji.");
  const fr = s.floodRisk;
  if (fr?.available) {
    if (fr.riskLevel === "none")
      strengths.push("Brak stwierdzonego ryzyka powodziowego (ISOK/Wody Polskie).");
    else if (fr.riskLevel === "low")
      risks.push("Lokalizacja w obszarze niskiego ryzyka powodziowego (scenariusz 0,2%).");
    else if (fr.riskLevel === "medium")
      risks.push("Lokalizacja w obszarze średniego ryzyka powodziowego (scenariusz 1%).");
    else if (fr.riskLevel === "high")
      risks.push("Lokalizacja w obszarze wysokiego ryzyka powodziowego (scenariusz 10%).");
    else if (fr.riskLevel === "very_high")
      risks.push("Lokalizacja w obszarze bardzo wysokiego ryzyka powodziowego.");
  }
  return { strengths, risks };
}
