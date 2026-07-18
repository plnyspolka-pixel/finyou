// Nadrzędna wycena i opinia o ryzyku (Perplexity sonar-pro) „naładowana" pełnym
// dossier: nieruchomość + KW + właściciel + korespondencja + dane rządowe + OCR.
// To ostateczna warstwa, która domyka wycenę.

import type { MasterValuation, OwnerProfile, KwLegalAnalysis, CorrespondenceIntel, OcrSummary, GovBenchmark, MarketComparablesResult } from "./types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import { valuationBasisLabel, buyerPoolLabel, plotCategoryLabel, type PlotBuildabilityResult } from "./plot-buildability";


export interface MasterValuationInput {
  propertyType: string;
  address: string | null;
  city: string | null;
  voivodeship: string | null;
  areaM2: number | null;
  landAreaHa: number | null;
  /** Rodzaj/przeznaczenie nieruchomości z KW (dział I-O). */
  kwKind?: string | null;
  /** Liczba izb/pokoi z KW. */
  roomCount?: number | null;
  /** Piętro (0 = parter) z KW. */
  floorPietro?: number | null;
  /** Sposób korzystania z gruntu z KW. */
  landUse?: string | null;
  /** Parametry i lokalizacja pochodzą z księgi wieczystej. */
  parametersFromKw?: boolean;
  declaredValuePln: number | null;
  requestedLoanPln: number | null;
  collateral: PropertyAnalysisResult | null;
  owner: OwnerProfile;
  kwLegal: KwLegalAnalysis;
  correspondence: CorrespondenceIntel;
  ocr: OcrSummary;
  plotBuildability?: PlotBuildabilityResult | null;
  govBenchmark?: GovBenchmark | null;
  marketComparables?: MarketComparablesResult | null;
}


function fmt(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? n.toLocaleString("pl-PL") + " PLN" : "brak";
}

function buildDossier(i: MasterValuationInput): string {
  const loc = [i.address, i.city, i.voivodeship].filter(Boolean).join(", ") || "Polska";
  const area = i.areaM2 ? `${i.areaM2} m²` : i.landAreaHa ? `${i.landAreaHa} ha` : "nieznana";
  const cv = i.collateral?.perplexityValuation;
  const ocrFindings = i.ocr.documents
    .filter((d) => d.status === "success")
    .flatMap((d) => (Array.isArray((d.fields as any).keyFindings) ? (d.fields as any).keyFindings : []))
    .slice(0, 8);

  const gov = i.govBenchmark;
  const rcnLine = gov?.rcnAvailable
    ? `\n- RCN (rzeczywiste transakcje, PRIORYTET): ${[gov.rcnPricePerHa != null ? `${gov.rcnPricePerHa.toLocaleString("pl-PL")} zł/ha` : null, gov.rcnPricePerM2 != null ? `${gov.rcnPricePerM2.toLocaleString("pl-PL")} zł/m²` : null].filter(Boolean).join(", ")} z ${gov.rcnTransactions} transakcji${gov.rcnRadiusKm ? ` w promieniu ${gov.rcnRadiusKm} km` : ""}`
    : "";
  const govBlock = gov?.available
    ? `\n0) DANE RZĄDOWE — KOTWICA WYCENY (priorytet: ${gov.primarySource}):${rcnLine}${gov.pricePerHa != null ? `\n- Cena gruntu rolnego (przyjęta): ${gov.pricePerHa.toLocaleString("pl-PL")} zł/ha (klasa: ${gov.soilCategory})${gov.landValuePln ? `, wartość działki ≈ ${gov.landValuePln.toLocaleString("pl-PL")} zł` : ""}` : ""}${gov.pricePerM2Median != null ? `\n- Cena lokali (przyjęta): ${gov.pricePerM2Median.toLocaleString("pl-PL")} zł/m²${gov.dwellingValuePln ? `, wartość ≈ ${gov.dwellingValuePln.toLocaleString("pl-PL")} zł` : ""}` : ""}${gov.gusPricePerHa != null && gov.primarySource === "RCN" ? `\n- (GUS porównawczo: ${gov.gusPricePerHa.toLocaleString("pl-PL")} zł/ha)` : ""}\n- Jednostka: ${gov.unitName ?? "—"} (${gov.unitLevel ?? "—"}), okres ${gov.period ?? "—"}${gov.fallbackUsed ? " [dane zastępcze wyższego poziomu]" : ""}\n`
    : `\n0) DANE RZĄDOWE (RCN/GUS): brak danych (RCN: ${gov?.rcnStatusMessage ?? "—"}).\n`;

  const kwParamsLine = [
    i.kwKind ? `rodzaj: ${i.kwKind}` : null,
    i.landUse ? `sposób korzystania: ${i.landUse}` : null,
    i.roomCount != null ? `liczba izb/pokoi: ${i.roomCount}` : null,
    i.floorPietro != null ? `kondygnacja: ${i.floorPietro === 0 ? "parter" : i.floorPietro + ". piętro"}` : null,
  ].filter(Boolean).join(", ");

  const mc = i.marketComparables;
  const mcBlock = mc && (mc.status === "success" || mc.status === "partial")
    ? `\n0b) RYNEK PORÓWNAWCZY (deweloperuch.pl transakcje + otodom.pl oferty):\n- Mediana: ${mc.pricePerM2Median ? mc.pricePerM2Median.toLocaleString("pl-PL") + " zł/m²" : "—"} (zakres ${mc.pricePerM2Min ?? "—"}–${mc.pricePerM2Max ?? "—"})\n- Transakcji: ${mc.transactionsCount}, ofert: ${mc.offersCount}${mc.street ? `, rejon: ${mc.street}, ${mc.city}` : mc.city ? `, ${mc.city}` : ""}\n- Próbki: ${mc.sample.slice(0, 5).map((s) => `${s.source}${s.date ? ` ${s.date}` : ""} ${s.address ?? s.title ?? ""} ${s.pricePerM2 ?? "—"} zł/m²`).join(" | ") || "—"}\n`
    : mc ? `\n0b) RYNEK PORÓWNAWCZY: brak danych (${mc.message}).\n` : "";

  return `DOSSIER NIERUCHOMOŚCI I RYZYKA:
${govBlock}${mcBlock}
1) NIERUCHOMOŚĆ${i.parametersFromKw ? " (parametry i lokalizacja odczytane z księgi wieczystej — dział I-O)" : ""}
- Typ: ${i.propertyType}
- Lokalizacja: ${loc}
- Powierzchnia: ${area}${kwParamsLine ? `\n- Parametry z KW: ${kwParamsLine}` : ""}
- Wartość deklarowana: ${fmt(i.declaredValuePln)}
- Wnioskowana kwota pożyczki: ${fmt(i.requestedLoanPln)}

2) WYCENA WSTĘPNA (analiza zabezpieczenia)
- Mediana ceny/m²: ${cv?.pricePerM2Median ? cv.pricePerM2Median.toLocaleString("pl-PL") + " PLN/m²" : "brak"}
- Zakres wartości: ${fmt(cv?.estimatedValueLowPln)} – ${fmt(cv?.estimatedValueHighPln)}
- Trend rynku: ${cv?.marketTrend ?? "nieznany"}
- Ocena zabezpieczenia: ${i.collateral?.collateralScore?.total ?? "brak"}/100
- Ryzyko powodziowe: ${i.collateral?.floodRisk?.riskLevel ?? "nieznane"}

3) STAN PRAWNY (KW)
- Właściciele (dział II): ${i.kwLegal.owners.length ? i.kwLegal.owners.join("; ") : "nierozpoznani"}
- Hipoteki (dział IV): ${i.kwLegal.mortgages.length ? i.kwLegal.mortgages.length + " wpisów, łącznie " + fmt(i.kwLegal.totalMortgageAmountPln) : "brak"}
- Egzekucja/zajęcie: ${i.kwLegal.hasEnforcement ? "TAK" : "nie"}
- Służebność/dożywocie: ${i.kwLegal.hasUsufruct ? "TAK" : "nie"}
- Ostrzeżenia prawne: ${i.kwLegal.warnings.join("; ") || "brak"}

4) WŁAŚCICIEL / KREDYTOBIORCA
- Wiek: ${i.owner.age ?? "nieznany"}, płeć: ${i.owner.sex ?? "nieznana"}
- Dalsze trwanie życia (GUS): ${i.owner.lifeExpectancy.remainingYears ?? "brak"} lat, ryzyko sukcesji: ${i.owner.lifeExpectancy.longevityRiskBand}
- Dożycie dla pożyczek 1–5 lat (P przeżycia okresu): ${i.owner.lifeExpectancy.survivalByLoanYear.length ? i.owner.lifeExpectancy.survivalByLoanYear.map((s) => `${s.years}l: ${Math.round(s.probability * 100)}%`).join(", ") : "brak danych"}
- Działalność gospodarcza (CEIDG): ${i.owner.businessActivity?.isEntrepreneur ? `TAK — przedsiębiorca${i.owner.businessActivity.company?.startDate ? `, od ${i.owner.businessActivity.company.startDate}` : ""} (czynnik obniżający ryzyko)` : i.owner.businessActivity?.available ? "nie znaleziono aktywnej działalności" : "nie sprawdzono"}
- Zgodność z właścicielem w KW: ${i.owner.matchesKwOwner === null ? "nieustalona" : i.owner.matchesKwOwner ? "zgodny" : "NIEZGODNY"}

5) KORESPONDENCJA Z KLIENTEM — TWARDE FAKTY (bez oceny zaangażowania/sentymentu)
- Przeanalizowano wiadomości: ${i.correspondence.messagesAnalyzed} (${i.correspondence.channels.join(", ") || "brak"})
- Fakty podane przez klienta: ${i.correspondence.statedFacts.join("; ") || "brak"}
- Twarde sygnały ryzyka: ${i.correspondence.redFlags.join("; ") || "brak"}
- Niespójności z wnioskiem/KW: ${i.correspondence.inconsistencies.join("; ") || "brak"}

6) OCR DOKUMENTÓW
- Kluczowe ustalenia: ${ocrFindings.join("; ") || "brak przetworzonych dokumentów"}

7) PRAWO ZABUDOWY DZIAŁKI${i.plotBuildability?.applicable
  ? `\n- Kategoria: ${plotCategoryLabel(i.plotBuildability.category)}\n- Krąg nabywców: ${buyerPoolLabel(i.plotBuildability.buyerPool)}${i.plotBuildability.onlyFarmerCanBuild ? " (budowa zasadniczo tylko dla rolnika indywidualnego)" : ""}\n- Zalecana podstawa wyceny: ${valuationBasisLabel(i.plotBuildability.valuationBasis)}`
  : "\n- nie dotyczy (nie jest działką/gruntem)"}`;
}

function buildPrompt(i: MasterValuationInput): string {
  return `Jesteś doświadczonym rzeczoznawcą i analitykiem ryzyka kredytowego zabezpieczonego nieruchomością w Polsce. Otrzymujesz kompletne dossier. Wykonaj NADRZĘDNĄ wycenę i ocenę ryzyka inwestycji, uwzględniając WSZYSTKIE przekazane dane (stan prawny KW, ryzyko dożycia właściciela dla pożyczek 1–5 lat, twarde fakty z korespondencji, wyniki OCR) oraz aktualne dane rynkowe, które sam wyszukasz.

${buildDossier(i)}

ZADANIE:
1. Ustal nadrzędną wycenę rynkową (low/mid/high w PLN), korygując wartość deklarowaną o realia rynku oraz obciążenia prawne (hipoteki, egzekucje, służebności obniżają wartość zabezpieczenia netto).
2. Zaproponuj maksymalną bezpieczną kwotę pożyczki i pułap LTV, uwzględniając ryzyko prawne, płynność i ryzyko dożycia/sukcesji właściciela.
3. Wypunktuj kluczowe ryzyka i mocne strony.
4. Sklasyfikuj poziom ryzyka (klasyfikacja analityczna, NIE rekomendacja ani porada): "rekomendowana" (=niskie ryzyko) | "warunkowa" (=umiarkowane) | "do_weryfikacji" | "odradzana" (=wysokie ryzyko).

WYMAGANIA: liczby realistyczne dla polskiego rynku 2025/2026; jeśli występuje egzekucja lub niezgodność właściciela z KW — rekomendacja nie może być "rekomendowana".
- PRIORYTET DANYCH RZĄDOWYCH: jeżeli w sekcji (0) podano dane RCN (rzeczywiste transakcje) lub GUS BDL, przyjmij je jako KOTWICĘ wyceny (RCN ma pierwszeństwo przed GUS) i nie odchylaj się od nich istotnie bez uzasadnienia w danych rynkowych.
- Grunt rolny: wyceniaj wg CEN GRUNTÓW ROLNYCH GUS (za hektar, wg klasy bonitacyjnej i województwa; posiłkowo KOWR/agronet), NIE jak działkę budowlaną. Rynek gruntów rolnych jest relatywnie płynny — nie zaniżaj sztucznie płynności z powodu małej miejscowości czy oddalenia od miasta.
- Zabudowa zagrodowa/siedliskowa (RM): wycena mieszana (rolno-budowlana) i uwzględnij wąski krąg nabywców pod zabudowę (budowa zasadniczo tylko dla rolnika).

ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown:
{
  "estimatedValueLowPln": <liczba lub null>,
  "estimatedValueMidPln": <liczba lub null>,
  "estimatedValueHighPln": <liczba lub null>,
  "suggestedMaxLoanAmountPln": <liczba lub null>,
  "suggestedLtvCapPercent": <liczba lub null>,
  "marketTrend": "rosnacy|stabilny|spadkowy|nieznany",
  "liquidityComment": "<1-2 zdania>",
  "keyRisks": ["..."],
  "keyStrengths": ["..."],
  "recommendation": "rekomendowana|warunkowa|do_weryfikacji|odradzana",
  "rationale": "<2-4 zdania uzasadnienia>"
}`;
}

function tryParseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function empty(status: "no_data" | "error", msg: string): MasterValuation {
  return {
    status,
    estimatedValueLowPln: null, estimatedValueMidPln: null, estimatedValueHighPln: null,
    suggestedMaxLoanAmountPln: null, suggestedLtvCapPercent: null,
    marketTrend: "nieznany", liquidityComment: "", keyRisks: [], keyStrengths: [],
    recommendation: "do_weryfikacji", rationale: "", citations: [], errorMessage: msg,
  };
}

const VALID_RECS = ["rekomendowana", "warunkowa", "do_weryfikacji", "odradzana"];

export async function perplexityMasterValuation(input: MasterValuationInput): Promise<MasterValuation> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return empty("error", "Brak PERPLEXITY_API_KEY w środowisku.");

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: "Jesteś analitykiem ryzyka nieruchomości w Polsce. Dostarczasz wyłącznie analizę i klasyfikację ryzyka — NIE udzielasz rekomendacji, porad inwestycyjnych ani prawnych. Odpowiadasz wyłącznie poprawnym JSON-em." },
          { role: "user", content: buildPrompt(input) },
        ],
        temperature: 0.2,
        search_recency_filter: "year",
        search_domain_filter: [
          "otodom.pl", "olx.pl", "domiporta.pl", "gratka.pl", "morizon.pl",
          "nieruchomosci-online.pl", "rynekpierwotny.pl", "bankier.pl",
          "gethome.pl", "kowr.gov.pl", "stat.gov.pl",
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return empty("error", `Perplexity HTTP ${res.status}: ${txt.slice(0, 160)}`);
    }
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];
    const parsed = tryParseJson(content);
    if (!parsed) return { ...empty("no_data", "Nie udało się sparsować odpowiedzi Perplexity."), citations };

    let recommendation = VALID_RECS.includes(parsed.recommendation) ? parsed.recommendation : "do_weryfikacji";
    // Twarde reguły bezpieczeństwa niezależne od modelu.
    if (input.kwLegal.hasEnforcement || input.owner.matchesKwOwner === false) {
      if (recommendation === "rekomendowana") recommendation = "warunkowa";
    }

    return {
      status: "success",
      estimatedValueLowPln: numOrNull(parsed.estimatedValueLowPln),
      estimatedValueMidPln: numOrNull(parsed.estimatedValueMidPln),
      estimatedValueHighPln: numOrNull(parsed.estimatedValueHighPln),
      suggestedMaxLoanAmountPln: numOrNull(parsed.suggestedMaxLoanAmountPln),
      suggestedLtvCapPercent: numOrNull(parsed.suggestedLtvCapPercent),
      marketTrend: ["rosnacy", "stabilny", "spadkowy", "nieznany"].includes(parsed.marketTrend) ? parsed.marketTrend : "nieznany",
      liquidityComment: String(parsed.liquidityComment ?? ""),
      keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks.map(String).slice(0, 10) : [],
      keyStrengths: Array.isArray(parsed.keyStrengths) ? parsed.keyStrengths.map(String).slice(0, 10) : [],
      recommendation: recommendation as MasterValuation["recommendation"],
      rationale: String(parsed.rationale ?? ""),
      citations,
    };
  } catch (e: any) {
    return empty("error", e?.message ?? "Nieznany błąd Perplexity.");
  }
}
