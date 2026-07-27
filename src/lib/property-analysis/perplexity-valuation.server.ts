// Wycena nieruchomości w oparciu o Perplexity (sonar-pro) z przeszukiwaniem aktualnych źródeł.
// Zwraca strukturalne dane cenowe + krótkie uzasadnienie i listę cytowań.
import type { PropertyType, RcnStats } from "./types";

export interface PerplexityValuationInput {
  propertyType: PropertyType | string;
  address?: string | null;
  city?: string | null;
  voivodeship?: string | null;
  usableAreaM2?: number | null;
  buildingAreaM2?: number | null;
  landAreaM2?: number | null;
  landAreaHa?: number | null;
  /** Liczba izb/pokoi (z KW). */
  roomCount?: number | null;
  /** Piętro (0 = parter) — z KW. */
  floorPietro?: number | null;
  /** Sposób korzystania / rodzaj nieruchomości opisany w KW. */
  landUse?: string | null;
  /** Parametry i lokalizacja odczytane z księgi wieczystej. */
  parametersFromKw?: boolean;
  declaredPropertyValuePln?: number | null;
}

export interface PerplexityValuation {
  status: "success" | "no_data" | "error";
  pricePerM2Median: number | null;
  pricePerM2Average: number | null;
  pricePerM2Min: number | null;
  pricePerM2Max: number | null;
  pricePerHa: number | null;
  estimatedValueLowPln: number | null;
  estimatedValueHighPln: number | null;
  marketTrend: "rosnacy" | "stabilny" | "spadkowy" | "nieznany";
  liquidityComment: string;
  rationale: string;
  comparablesFound: number;
  citations: string[];
  rawAnswer: string;
  errorMessage?: string;
}

const PROPERTY_LABELS: Record<string, string> = {
  mieszkanie: "mieszkanie na rynku wtórnym",
  dom: "dom jednorodzinny",
  lokal_uslugowy: "lokal użytkowy / usługowy",
  dzialka_budowlana: "działka budowlana",
  dzialka_zabudowana: "działka zabudowana",
  grunt_rolny: "grunt rolny",
  inna: "nieruchomość",
};

function buildPrompt(input: PerplexityValuationInput): string {
  const typeLabel = PROPERTY_LABELS[String(input.propertyType)] ?? "nieruchomość";
  const loc = [input.address, input.city, input.voivodeship].filter(Boolean).join(", ") || "Polska";
  const area = input.usableAreaM2
    ? `${input.usableAreaM2} m² pow. użytkowej`
    : input.buildingAreaM2
      ? `${input.buildingAreaM2} m² pow. zabudowy`
      : input.landAreaHa
        ? `${input.landAreaHa} ha`
        : input.landAreaM2
          ? `${input.landAreaM2} m² działki`
          : "powierzchnia nieznana";
  const declared = input.declaredPropertyValuePln
    ? `Wartość deklarowana przez właściciela: ${input.declaredPropertyValuePln.toLocaleString("pl-PL")} PLN.`
    : "";
  const extraParams = [
    input.landUse ? `- Rodzaj/sposób korzystania: ${input.landUse}` : null,
    input.roomCount != null ? `- Liczba izb/pokoi: ${input.roomCount}` : null,
    input.floorPietro != null
      ? `- Kondygnacja: ${input.floorPietro === 0 ? "parter" : input.floorPietro + ". piętro"}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const sourceNote = input.parametersFromKw
    ? "\n\nParametry nieruchomości oraz lokalizacja pochodzą z księgi wieczystej (dział I-O — oznaczenie nieruchomości). Wyceniaj DOKŁADNIE taką nieruchomość o tych parametrach, położoną w podanej lokalizacji."
    : "";

  return `Jesteś rzeczoznawcą i analitykiem rynku nieruchomości w Polsce. Odpowiedz na pytanie: ile może kosztować za m² (a dla gruntów rolnych — za hektar) nieruchomość o poniższych parametrach, położona w podanej lokalizacji. Wykonaj analizę porównawczą.

NIERUCHOMOŚĆ:
- Typ: ${typeLabel}
- Lokalizacja: ${loc}
- Powierzchnia: ${area}
${extraParams ? extraParams + "\n" : ""}${declared}${sourceNote}

ZADANIE:
Przeszukaj aktualne (ostatnie 6–12 miesięcy) publicznie dostępne źródła i ustal:
1. Cenę za m² (dla gruntów rolnych — cenę za hektar) — medianę, średnią, min, max.
2. Krótkie uzasadnienie wraz z aktualnym trendem rynkowym (rosnący / stabilny / spadkowy).
3. Komentarz o płynności rynku w tej lokalizacji dla tego typu nieruchomości.
4. Szacowana liczba znalezionych ogłoszeń/transakcji porównawczych (comparablesFound).
5. Estymacja ostrożnościowa wartości całej nieruchomości (zakres low–high w PLN) — pomnóż średnią cenę przez powierzchnię i zastosuj +/- 10–15% dla ostrożności.

ŹRÓDŁA do priorytetowego przeszukania:
- otodom.pl, olx.pl/nieruchomosci, domiporta.pl, gratka.pl, morizon.pl, nieruchomosci-online.pl
- raporty rynkowe: Otodom Analytics, Otodom Research, RynekPierwotny.pl, Bankier.pl, GetHome.pl
- dla gruntów rolnych: KOWR, agronet.pl, agronomist.pl, ceny gruntów GUS

WYMAGANIA:
- Bądź konkretny dla danej dzielnicy / miasta — nie podawaj średniej krajowej, jeżeli da się znaleźć dane lokalne.
- Jeżeli lokalizacja jest mało popularna, użyj danych z najbliższego porównywalnego rynku i ZAZNACZ to w uzasadnieniu.
- Liczby muszą być realistyczne dla polskiego rynku 2025/2026.

ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown, bez komentarzy, bez backticków:
{
  "pricePerM2Median": <liczba PLN/m² lub null>,
  "pricePerM2Average": <liczba PLN/m² lub null>,
  "pricePerM2Min": <liczba PLN/m² lub null>,
  "pricePerM2Max": <liczba PLN/m² lub null>,
  "pricePerHa": <liczba PLN/ha tylko dla gruntów rolnych, w innym wypadku null>,
  "estimatedValueLowPln": <liczba PLN lub null>,
  "estimatedValueHighPln": <liczba PLN lub null>,
  "marketTrend": "rosnacy" | "stabilny" | "spadkowy" | "nieznany",
  "liquidityComment": "<1–2 zdania o płynności rynku>",
  "rationale": "<2–4 zdania uzasadnienia z odniesieniem do typu źródeł>",
  "comparablesFound": <liczba całkowita>
}`;
}

function tryParseJson(s: string): any | null {
  // wyciągnij pierwszy obiekt JSON z tekstu (na wypadek otoczki ```json ... ```)
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function perplexityValuation(
  input: PerplexityValuationInput,
): Promise<PerplexityValuation> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return emptyResult("error", "Brak PERPLEXITY_API_KEY w środowisku.");
  }

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "Jesteś analitykiem rynku nieruchomości w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em, bez dodatkowych komentarzy ani backticków.",
          },
          { role: "user", content: buildPrompt(input) },
        ],
        temperature: 0.2,
        search_recency_filter: "year",
        search_domain_filter: [
          "otodom.pl",
          "olx.pl",
          "domiporta.pl",
          "gratka.pl",
          "morizon.pl",
          "nieruchomosci-online.pl",
          "rynekpierwotny.pl",
          "bankier.pl",
          "gethome.pl",
          "kowr.gov.pl",
          "stat.gov.pl",
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return emptyResult("error", `Perplexity HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];
    const parsed = tryParseJson(content);

    if (!parsed) {
      return {
        ...emptyResult("no_data", "Nie udało się sparsować odpowiedzi Perplexity."),
        rawAnswer: content,
        citations,
      };
    }

    return {
      status: "success",
      pricePerM2Median: numOrNull(parsed.pricePerM2Median),
      pricePerM2Average: numOrNull(parsed.pricePerM2Average),
      pricePerM2Min: numOrNull(parsed.pricePerM2Min),
      pricePerM2Max: numOrNull(parsed.pricePerM2Max),
      pricePerHa: numOrNull(parsed.pricePerHa),
      estimatedValueLowPln: numOrNull(parsed.estimatedValueLowPln),
      estimatedValueHighPln: numOrNull(parsed.estimatedValueHighPln),
      marketTrend: ["rosnacy", "stabilny", "spadkowy", "nieznany"].includes(parsed.marketTrend)
        ? parsed.marketTrend
        : "nieznany",
      liquidityComment: String(parsed.liquidityComment ?? ""),
      rationale: String(parsed.rationale ?? ""),
      comparablesFound: Number.isFinite(Number(parsed.comparablesFound))
        ? Math.max(0, Math.round(Number(parsed.comparablesFound)))
        : 0,
      citations,
      rawAnswer: content,
    };
  } catch (e: any) {
    return emptyResult("error", e?.message ?? "Nieznany błąd Perplexity.");
  }
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function emptyResult(status: "no_data" | "error", message: string): PerplexityValuation {
  return {
    status,
    pricePerM2Median: null,
    pricePerM2Average: null,
    pricePerM2Min: null,
    pricePerM2Max: null,
    pricePerHa: null,
    estimatedValueLowPln: null,
    estimatedValueHighPln: null,
    marketTrend: "nieznany",
    liquidityComment: "",
    rationale: "",
    comparablesFound: 0,
    citations: [],
    rawAnswer: "",
    errorMessage: message,
  };
}

// Konwertuje wynik Perplexity do RcnStats — żeby scoring i offer-text mogły działać bez zmian.
export function perplexityToRcnStats(p: PerplexityValuation, isLand: boolean): RcnStats | null {
  if (p.status !== "success") return null;
  if (isLand) {
    if (!p.pricePerHa) return null;
    return {
      count: p.comparablesFound,
      median: p.pricePerHa,
      average: p.pricePerHa,
      q1: null,
      q3: null,
      unit: "pln_per_ha",
      radiusM: 0,
      periodMonths: 12,
      freshness: p.comparablesFound >= 8 ? "good" : p.comparablesFound >= 3 ? "limited" : "weak",
    };
  }
  if (!p.pricePerM2Median && !p.pricePerM2Average) return null;
  return {
    count: p.comparablesFound,
    median: p.pricePerM2Median ?? p.pricePerM2Average,
    average: p.pricePerM2Average ?? p.pricePerM2Median,
    q1: p.pricePerM2Min,
    q3: p.pricePerM2Max,
    unit: "pln_per_m2",
    radiusM: 0,
    periodMonths: 12,
    freshness: p.comparablesFound >= 8 ? "good" : p.comparablesFound >= 3 ? "limited" : "weak",
  };
}
