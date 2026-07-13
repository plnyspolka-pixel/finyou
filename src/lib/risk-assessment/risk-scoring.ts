// Zbiorczy scoring inwestycji — łączy oceny cząstkowe w jeden wynik 0–100
// (wyżej = bezpieczniej) i wyprowadza rekomendację. Czysta, testowalna logika.

import type {
  RiskComponentScores, Recommendation, RiskGrade,
  OwnerProfile, KwLegalAnalysis, CorrespondenceIntel, OcrSummary, MasterValuation,
  SaleabilityForecast,
} from "./types";
import { gradeFromScore } from "./types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { LongevityBand } from "./life-expectancy";

// Wagi komponentów (suma = 1).
const WEIGHTS: Record<keyof RiskComponentScores, number> = {
  collateral: 0.24,
  valuationConfidence: 0.12,
  legal: 0.22,
  borrowerLongevity: 0.10,
  correspondence: 0.09,
  documentCompleteness: 0.06,
  exitLiquidity: 0.17,
};

function longevityToScore(band: LongevityBand): number {
  switch (band) {
    case "niskie": return 90;
    case "umiarkowane": return 72;
    case "podwyzszone": return 50;
    case "wysokie": return 28;
    case "nieznane": return 60;
  }
}

function valuationConfidenceScore(collateral: PropertyAnalysisResult | null, master: MasterValuation): number {
  let score = 40;
  const cv = collateral?.perplexityValuation;
  if (cv?.status === "success") {
    score += 20;
    if (cv.comparablesFound >= 8) score += 15;
    else if (cv.comparablesFound >= 3) score += 8;
    if (cv.citations.length >= 3) score += 5;
  }
  if (master.status === "success" && master.estimatedValueMidPln) score += 20;
  return Math.max(0, Math.min(100, score));
}

function documentCompletenessScore(ocr: OcrSummary): number {
  if (ocr.documentsProcessed === 0) return 30;
  const ok = ocr.documents.filter((d) => d.status === "success").length;
  const ratio = ok / ocr.documentsProcessed;
  return Math.round(40 + ratio * 55 + Math.min(5, ok));
}

export interface CombineInput {
  collateral: PropertyAnalysisResult | null;
  owner: OwnerProfile;
  kwLegal: KwLegalAnalysis;
  correspondence: CorrespondenceIntel;
  ocr: OcrSummary;
  saleability: SaleabilityForecast;
  master: MasterValuation;
}

export interface CombinedResult {
  investmentScore: number;
  riskGrade: RiskGrade;
  recommendation: Recommendation;
  componentScores: RiskComponentScores;
  keyRisks: string[];
  keyStrengths: string[];
}

export function combineRiskAssessment(i: CombineInput): CombinedResult {
  const componentScores: RiskComponentScores = {
    collateral: i.collateral?.collateralScore?.total ?? 40,
    valuationConfidence: valuationConfidenceScore(i.collateral, i.master),
    legal: i.kwLegal.available ? i.kwLegal.legalRiskScore : 55,
    borrowerLongevity: longevityToScore(i.owner.lifeExpectancy.longevityRiskBand),
    correspondence: i.correspondence.available ? i.correspondence.behavioralRiskScore : 60,
    documentCompleteness: documentCompletenessScore(i.ocr),
    exitLiquidity: i.saleability.available ? i.saleability.score : 45,
  };

  const weighted =
    (Object.keys(WEIGHTS) as Array<keyof RiskComponentScores>).reduce(
      (acc, k) => acc + componentScores[k] * WEIGHTS[k],
      0,
    );
  let investmentScore = Math.round(weighted);

  // Twarde ograniczenia (hard caps) niezależne od średniej ważonej.
  const hardCaps: string[] = [];
  if (i.kwLegal.hasEnforcement) { investmentScore = Math.min(investmentScore, 39); hardCaps.push("egzekucja w KW"); }
  if (i.owner.matchesKwOwner === false) { investmentScore = Math.min(investmentScore, 49); hardCaps.push("niezgodność właściciela z KW"); }
  if (i.collateral?.floodRisk?.available && i.collateral.floodRisk.riskLevel === "very_high") {
    investmentScore = Math.min(investmentScore, 39); hardCaps.push("bardzo wysokie ryzyko powodziowe");
  }
  if (i.correspondence.redFlags.length >= 3) { investmentScore = Math.min(investmentScore, 55); hardCaps.push("liczne sygnały ostrzegawcze w korespondencji"); }

  investmentScore = Math.max(0, Math.min(100, investmentScore));
  const riskGrade = gradeFromScore(investmentScore);

  // Rekomendacja: łączy score, master-recommendation i twarde reguły.
  let recommendation: Recommendation;
  if (investmentScore >= 72) recommendation = "rekomendowana";
  else if (investmentScore >= 55) recommendation = "warunkowa";
  else if (investmentScore >= 40) recommendation = "do_weryfikacji";
  else recommendation = "odradzana";

  // Master (Perplexity) może tylko zaostrzyć, nie złagodzić.
  const order: Recommendation[] = ["rekomendowana", "warunkowa", "do_weryfikacji", "odradzana"];
  if (i.master.status === "success" && order.indexOf(i.master.recommendation) > order.indexOf(recommendation)) {
    recommendation = i.master.recommendation;
  }
  if (hardCaps.length && recommendation === "rekomendowana") recommendation = "warunkowa";

  // Ryzyka i mocne strony.
  const keyRisks: string[] = [];
  const keyStrengths: string[] = [];
  keyRisks.push(...i.kwLegal.warnings);
  if (i.owner.lifeExpectancy.longevityRiskBand === "wysokie" || i.owner.lifeExpectancy.longevityRiskBand === "podwyzszone")
    keyRisks.push(`Ryzyko dożycia/sukcesji właściciela: ${i.owner.lifeExpectancy.longevityRiskBand}.`);
  keyRisks.push(...i.correspondence.redFlags.map((r) => `Korespondencja: ${r}`));
  keyRisks.push(...i.correspondence.inconsistencies.map((r) => `Niespójność: ${r}`));
  if (i.saleability.available) {
    if (i.saleability.band === "bardzo_trudna" || i.saleability.band === "trudna")
      keyRisks.push(`Ograniczona łatwość sprzedaży (${i.saleability.band.replace(/_/g, " ")}) — ryzyko długiego wyjścia z inwestycji.`);
    if (!i.saleability.localMarketOffers.available)
      keyRisks.push(`Brak aktywnych ofert sprzedaży wystawionych przez biura w okolicy (~${i.saleability.localMarketOffers.radiusKm} km) — płytki rynek.`);
    if (i.saleability.populationTrend === "malejaca")
      keyRisks.push("Malejąca liczba mieszkańców w okolicy — presja na płynność i ceny.");
  }
  if (i.collateral?.collateralScore?.mainRisks) keyRisks.push(...i.collateral.collateralScore.mainRisks);
  keyRisks.push(...i.master.keyRisks);

  if (componentScores.legal >= 80) keyStrengths.push("Czysty stan prawny nieruchomości (KW).");
  if (componentScores.collateral >= 70) keyStrengths.push("Dobra jakość zabezpieczenia.");
  if (i.owner.lifeExpectancy.longevityRiskBand === "niskie") keyStrengths.push("Niskie ryzyko dożycia/sukcesji właściciela.");
  if (i.correspondence.cooperationLevel === "wysoki") keyStrengths.push("Wysoki poziom współpracy klienta.");
  if (i.saleability.available && (i.saleability.band === "bardzo_latwa" || i.saleability.band === "latwa"))
    keyStrengths.push(`Dobra prognozowana łatwość sprzedaży (${i.saleability.band.replace(/_/g, " ")}) — sprawne wyjście z inwestycji.`);
  if (i.saleability.localMarketOffers.agencyListings >= 4)
    keyStrengths.push(`Aktywny rynek: ${i.saleability.localMarketOffers.agencyListings} ofert biur nieruchomości w okolicy (~${i.saleability.localMarketOffers.radiusKm} km).`);
  if (i.collateral?.collateralScore?.mainStrengths) keyStrengths.push(...i.collateral.collateralScore.mainStrengths);
  keyStrengths.push(...i.master.keyStrengths);

  return {
    investmentScore,
    riskGrade,
    recommendation,
    componentScores,
    keyRisks: dedupe(keyRisks).slice(0, 12),
    keyStrengths: dedupe(keyStrengths).slice(0, 10),
  };
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = s.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}
