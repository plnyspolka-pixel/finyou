// Zbiorczy scoring inwestycji — łączy oceny cząstkowe w jeden wynik 0–100
// (wyżej = bezpieczniej) i wyprowadza rekomendację. Czysta, testowalna logika.

import type {
  RiskComponentScores,
  Recommendation,
  RiskGrade,
  OwnerProfile,
  KwLegalAnalysis,
  CorrespondenceIntel,
  OcrSummary,
  MasterValuation,
  SaleabilityForecast,
} from "./types";
import { plotCategoryLabel, type PlotBuildabilityResult } from "./plot-buildability";
import { gradeFromScore } from "./types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { LongevityBand } from "./life-expectancy";

// Wagi komponentów (suma = 1). GŁÓWNYM komponentem jest płynność wyjścia
// (exitLiquidity) — kategoria zbywalności A–E z liczby mieszkańców i typu
// nieruchomości (mieszkanie w wielkim mieście = A, dom pod dużym miastem = B…):
// to, jak szybko da się zabezpieczenie sprzedać, decyduje o ryzyku inwestycji.
const WEIGHTS: Record<keyof RiskComponentScores, number> = {
  exitLiquidity: 0.3,
  legal: 0.2,
  collateral: 0.18,
  valuationConfidence: 0.1,
  borrowerLongevity: 0.09,
  correspondence: 0.07,
  documentCompleteness: 0.06,
};

function longevityToScore(band: LongevityBand): number {
  switch (band) {
    case "niskie":
      return 90;
    case "umiarkowane":
      return 72;
    case "podwyzszone":
      return 50;
    case "wysokie":
      return 28;
    case "nieznane":
      return 60;
  }
}

function valuationConfidenceScore(
  collateral: PropertyAnalysisResult | null,
  master: MasterValuation,
): number {
  let score = 40;
  const cv = collateral?.perplexityValuation;
  if (cv?.status === "success") {
    score += 20;
    if (cv.comparablesFound >= 8) score += 15;
    else if (cv.comparablesFound >= 3) score += 8;
    if (cv.citations.length >= 3) score += 5;
  }
  if (master.status === "success" && master.estimatedValueMidPln) score += 20;
  // Sygnały obniżające wiarygodność wyceny rynkowej: brak transakcji (same
  // ceny ofertowe) i ekstrapolacja cen małych działek na duży areał.
  if (master.offersOnly) score -= 15;
  if (master.sizeAdjusted) score -= 15;
  return Math.max(0, Math.min(100, score));
}

// Ocena komponentu korespondencji WYŁĄCZNIE z twardych faktów — bez oceny
// zaangażowania/sentymentu. Startujemy wysoko i odejmujemy za twarde sygnały
// ryzyka i rozbieżności z wnioskiem/KW.
function correspondenceFactsScore(c: CorrespondenceIntel): number {
  if (!c.available) return 60; // brak korespondencji — neutralnie
  let score = 85;
  score -= Math.min(45, c.redFlags.length * 15); // twarde sygnały ryzyka
  score -= Math.min(30, c.inconsistencies.length * 12); // rozbieżności z wnioskiem/KW
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
  plotBuildability?: PlotBuildabilityResult | null;
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
  // Dożycie: przy kilku właścicielach z PESEL w KW liczy się NAJKORZYSTNIEJSZE
  // pasmo — sukcesja zagraża zabezpieczeniu dopiero, gdy dotknie wszystkich
  // majątków osobistych naraz.
  const longevityBands = [
    i.owner.lifeExpectancy.longevityRiskBand,
    ...i.owner.kwOwnerProfiles.map((p) => p.lifeExpectancy.longevityRiskBand),
  ];
  let borrowerLongevity = Math.max(...longevityBands.map(longevityToScore));
  // Brak PESEL gdziekolwiek (dział II KW i rekord klienta) to defekt danych,
  // nie stan neutralny — PESEL w dziale II KW powinien być zawsze; jego brak
  // oznacza niekompletny odczyt treści KW i nieznany wiek właściciela.
  const noPeselAnywhere = !i.owner.peselValid && i.owner.kwOwnerProfiles.length === 0;
  if (noPeselAnywhere) borrowerLongevity = Math.min(borrowerLongevity, 45);

  const componentScores: RiskComponentScores = {
    collateral: i.collateral?.collateralScore?.total ?? 40,
    valuationConfidence: valuationConfidenceScore(i.collateral, i.master),
    legal: i.kwLegal.available ? i.kwLegal.legalRiskScore : 55,
    borrowerLongevity,
    correspondence: correspondenceFactsScore(i.correspondence),
    documentCompleteness: documentCompletenessScore(i.ocr),
    exitLiquidity: i.saleability.available ? i.saleability.score : 45,
  };

  const weighted = (Object.keys(WEIGHTS) as Array<keyof RiskComponentScores>).reduce(
    (acc, k) => acc + componentScores[k] * WEIGHTS[k],
    0,
  );
  let investmentScore = Math.round(weighted);

  // Właściciel-przedsiębiorca (aktywny wpis w CEIDG) obniża ryzyko — premia zależna
  // od pewności dopasowania (NIP > imię+nazwisko+miasto > samo nazwisko).
  const biz = i.owner.businessActivity;
  if (biz?.isEntrepreneur) {
    const bonus = biz.matchConfidence === "high" ? 8 : biz.matchConfidence === "medium" ? 5 : 3;
    investmentScore = Math.min(100, investmentScore + bonus);
  }

  // Dwoje (lub więcej) współwłaścicieli z PESEL odczytanym z działu II KW —
  // dwa majątki osobiste, na których można się zaspokoić: istotny plus.
  if (i.owner.multipleEstates) {
    investmentScore = Math.min(100, investmentScore + 5);
  }

  // Twarde ograniczenia (hard caps) niezależne od średniej ważonej.
  const hardCaps: string[] = [];
  if (i.kwLegal.hasEnforcement) {
    investmentScore = Math.min(investmentScore, 39);
    hardCaps.push("egzekucja w KW");
  }
  if (i.owner.matchesKwOwner === false) {
    investmentScore = Math.min(investmentScore, 49);
    hardCaps.push("niezgodność właściciela z KW");
  }
  if (i.collateral?.floodRisk?.available && i.collateral.floodRisk.riskLevel === "very_high") {
    investmentScore = Math.min(investmentScore, 39);
    hardCaps.push("bardzo wysokie ryzyko powodziowe");
  }
  if (i.correspondence.redFlags.length >= 3) {
    investmentScore = Math.min(investmentScore, 55);
    hardCaps.push("liczne sygnały ostrzegawcze w korespondencji");
  }

  investmentScore = Math.max(0, Math.min(100, investmentScore));
  const riskGrade = gradeFromScore(investmentScore);

  // Rekomendacja: łączy score, master-recommendation i twarde reguły.
  let recommendation: Recommendation;
  if (investmentScore >= 72) recommendation = "rekomendowana";
  else if (investmentScore >= 55) recommendation = "warunkowa";
  else if (investmentScore >= 40) recommendation = "do_weryfikacji";
  else recommendation = "odradzana";

  // Wycena rynkowa (master) może tylko zaostrzyć, nie złagodzić.
  const order: Recommendation[] = ["rekomendowana", "warunkowa", "do_weryfikacji", "odradzana"];
  if (
    i.master.status === "success" &&
    order.indexOf(i.master.recommendation) > order.indexOf(recommendation)
  ) {
    recommendation = i.master.recommendation;
  }
  if (hardCaps.length && recommendation === "rekomendowana") recommendation = "warunkowa";

  // Ryzyka i mocne strony.
  const keyRisks: string[] = [];
  const keyStrengths: string[] = [];
  keyRisks.push(...i.kwLegal.warnings);
  if (noPeselAnywhere)
    keyRisks.push(
      "Brak PESEL właściciela w dziale II KW i w rekordzie klienta — nieznany wiek/dożycie; treść działu II wygląda na niekompletną (PESEL w KW powinien być zawsze) — zamów ponowny odczyt KW.",
    );
  if (
    i.owner.lifeExpectancy.longevityRiskBand === "wysokie" ||
    i.owner.lifeExpectancy.longevityRiskBand === "podwyzszone"
  )
    keyRisks.push(
      `Ryzyko dożycia/sukcesji właściciela: ${i.owner.lifeExpectancy.longevityRiskBand}.`,
    );
  keyRisks.push(...i.correspondence.redFlags.map((r) => `Korespondencja (fakt): ${r}`));
  keyRisks.push(...i.correspondence.inconsistencies.map((r) => `Niespójność: ${r}`));
  const cat = i.saleability.sellabilityCategory;
  if (cat && (cat.category === "D" || cat.category === "E"))
    keyRisks.push(`Kategoria zbywalności ${cat.category} (${cat.label}) — ${cat.rationale}`);
  if (i.saleability.available) {
    if (i.saleability.band === "bardzo_trudna" || i.saleability.band === "trudna")
      keyRisks.push(
        `Ograniczona łatwość sprzedaży (${i.saleability.band.replace(/_/g, " ")}) — ryzyko długiego wyjścia z inwestycji.`,
      );
    if (!i.saleability.localMarketOffers.available)
      keyRisks.push(
        `Brak aktywnych ofert sprzedaży wystawionych przez biura w okolicy (~${i.saleability.localMarketOffers.radiusKm} km) — płytki rynek.`,
      );
    if (i.saleability.populationTrend === "malejaca")
      keyRisks.push("Malejąca liczba mieszkańców w okolicy — presja na płynność i ceny.");
    if (!i.saleability.reasonableMarket)
      keyRisks.push(
        "Miejscowość poniżej 20 tys. mieszkańców — poza gruntami rolnymi rynek uznawany za trudno sprzedawalny.",
      );
    const ff = i.saleability.floorFactor;
    if (ff?.available && ff.score < 45)
      keyRisks.push(`Niekorzystna kondygnacja (${ff.label}) — ${ff.note}.`);
  }
  const pb = i.plotBuildability;
  if (pb?.applicable && pb.category === "zagrodowa_siedliskowa")
    keyRisks.push(
      `Zabudowa zagrodowa/siedliskowa (RM) — budowa zasadniczo tylko dla rolnika, wąski krąg nabywców pod zabudowę; wycena mieszana.`,
    );
  else if (pb?.applicable && pb.category === "rolna_bez_zabudowy")
    keyStrengths.push("Grunt rolny — wyceniany wg cen gruntów GUS; rynek rolny relatywnie płynny.");
  else if (pb?.applicable && pb.category === "budowlana" && pb.buyerPool === "szeroki")
    keyStrengths.push("Działka budowlana — szeroki krąg nabywców.");
  if (i.collateral?.collateralScore?.mainRisks)
    keyRisks.push(...i.collateral.collateralScore.mainRisks);
  keyRisks.push(...i.master.keyRisks);

  if (cat && (cat.category === "A" || cat.category === "B"))
    keyStrengths.push(`Kategoria zbywalności ${cat.category} (${cat.label}) — ${cat.rationale}`);
  if (componentScores.legal >= 80) keyStrengths.push("Czysty stan prawny nieruchomości (KW).");
  if (componentScores.collateral >= 70) keyStrengths.push("Dobra jakość zabezpieczenia.");
  if (i.owner.lifeExpectancy.longevityRiskBand === "niskie")
    keyStrengths.push("Niskie ryzyko dożycia/sukcesji właściciela.");
  if (i.owner.multipleEstates)
    keyStrengths.push(
      `PESEL ${i.owner.kwOwnerProfiles.length === 2 ? "obojga współwłaścicieli" : `${i.owner.kwOwnerProfiles.length} współwłaścicieli`} odczytany z działu II KW — zaspokojenie możliwe z ${i.owner.kwOwnerProfiles.length} majątków osobistych.`,
    );
  if (i.owner.businessActivity?.isEntrepreneur) {
    const c = i.owner.businessActivity.company;
    keyStrengths.push(
      `Właściciel jest przedsiębiorcą — aktywna działalność w CEIDG${c?.name ? ` (${c.name})` : ""}${c?.startDate ? `, od ${c.startDate}` : ""}; obniża ryzyko.`,
    );
  }
  if (
    i.correspondence.available &&
    i.correspondence.redFlags.length === 0 &&
    i.correspondence.inconsistencies.length === 0
  )
    keyStrengths.push("Korespondencja bez twardych sygnałów ryzyka i rozbieżności z wnioskiem/KW.");
  if (
    i.saleability.available &&
    (i.saleability.band === "bardzo_latwa" || i.saleability.band === "latwa")
  )
    keyStrengths.push(
      `Dobra prognozowana łatwość sprzedaży (${i.saleability.band.replace(/_/g, " ")}) — sprawne wyjście z inwestycji.`,
    );
  if (i.saleability.localMarketOffers.agencyListings >= 4)
    keyStrengths.push(
      `Aktywny rynek: ${i.saleability.localMarketOffers.agencyListings} ofert biur nieruchomości w okolicy (~${i.saleability.localMarketOffers.radiusKm} km).`,
    );
  if (i.saleability.reasonableMarket && (i.saleability.localityPopulation ?? 0) >= 20000)
    keyStrengths.push(
      `Miasto powyżej 20 tys. mieszkańców — rynek uznany za rozsądny/sprzedawalny.`,
    );
  if (i.saleability.floorFactor?.available && i.saleability.floorFactor.score >= 85)
    keyStrengths.push(`Korzystna kondygnacja (${i.saleability.floorFactor.label}).`);
  if (i.collateral?.collateralScore?.mainStrengths)
    keyStrengths.push(...i.collateral.collateralScore.mainStrengths);
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
