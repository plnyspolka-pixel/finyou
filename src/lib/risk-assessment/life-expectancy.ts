// Aktuarialne szacowanie dalszego trwania życia w oparciu o Tablice trwania
// życia GUS (Polska, 2022 r.). Dane statystyczne, populacyjne — NIE jest to
// prognoza indywidualna ani ocena medyczna. Wykorzystywane wyłącznie do oceny
// ryzyka zabezpieczenia (horyzont pożyczki, ryzyko sukcesji/spadkobrania).
//
// Źródło: GUS, „Trwanie życia w 2022 r." — dalsze przeciętne trwanie życia e(x).

import type { Sex } from "./pesel";

// Punkty węzłowe e(x) — dalsze przeciętne trwanie życia [lata] wg wieku i płci.
// Wartości pomiędzy węzłami interpolujemy liniowo.
const EX_MEN: Array<[age: number, ex: number]> = [
  [0, 73.4],
  [1, 72.8],
  [5, 68.9],
  [10, 63.9],
  [15, 59.0],
  [20, 54.3],
  [25, 49.7],
  [30, 45.2],
  [35, 40.6],
  [40, 36.0],
  [45, 31.5],
  [50, 27.3],
  [55, 23.2],
  [60, 19.4],
  [65, 15.8],
  [70, 12.5],
  [75, 9.5],
  [80, 7.0],
  [85, 5.1],
  [90, 3.7],
  [95, 2.8],
  [100, 2.1],
];

const EX_WOMEN: Array<[age: number, ex: number]> = [
  [0, 81.1],
  [1, 80.4],
  [5, 76.5],
  [10, 71.5],
  [15, 66.6],
  [20, 61.7],
  [25, 56.8],
  [30, 51.9],
  [35, 47.0],
  [40, 42.1],
  [45, 37.4],
  [50, 32.7],
  [55, 28.2],
  [60, 23.9],
  [65, 19.7],
  [70, 15.7],
  [75, 11.9],
  [80, 8.6],
  [85, 5.9],
  [90, 4.1],
  [95, 3.0],
  [100, 2.2],
];

// Pożyczki udzielamy na 1–5 lat — dożycie (prawdopodobieństwo przeżycia okresu)
// liczymy dla całego tego zakresu, żeby analityk widział ryzyko dla każdego tenoru.
export const LOAN_TERM_YEARS = [1, 2, 3, 4, 5] as const;
export const MIN_LOAN_TERM_YEARS = 1;
export const MAX_LOAN_TERM_YEARS = 5;

/** Ogranicza okres pożyczki do oferowanego zakresu 1–5 lat (domyślnie 5 = najostrożniej). */
export function clampLoanTermYears(years: number | null | undefined): number {
  if (years == null || !Number.isFinite(years)) return MAX_LOAN_TERM_YEARS;
  return Math.min(MAX_LOAN_TERM_YEARS, Math.max(MIN_LOAN_TERM_YEARS, Math.round(years * 10) / 10));
}

function interpolateEx(table: Array<[number, number]>, age: number): number {
  if (age <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (age >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [a0, e0] = table[i];
    const [a1, e1] = table[i + 1];
    if (age >= a0 && age <= a1) {
      const t = (age - a0) / (a1 - a0);
      return e0 + t * (e1 - e0);
    }
  }
  return last[1];
}

export type LongevityBand = "niskie" | "umiarkowane" | "podwyzszone" | "wysokie" | "nieznane";

export interface LifeExpectancyResult {
  available: boolean;
  age: number | null;
  sex: Sex | null;
  /** Dalsze przeciętne trwanie życia e(x) [lata]. */
  remainingYears: number | null;
  /** Przewidywany (statystycznie) wiek dożycia = age + e(x). */
  projectedAgeAtDeath: number | null;
  /** Ryzyko dożycia względem horyzontu pożyczki (jeśli podano loanTermYears). */
  loanTermYears: number | null;
  /** Prawdopodobieństwo przeżycia całego okresu pożyczki (szacunek). */
  survivalProbabilityOverTerm: number | null;
  /** Dożycie dla oferowanego zakresu pożyczek 1–5 lat: P(przeżycia) dla każdego tenoru. */
  survivalByLoanYear: Array<{ years: number; probability: number }>;
  /** Pasmo ryzyka sukcesji/dożycia dla oceny zabezpieczenia. */
  longevityRiskBand: LongevityBand;
  /** Krótki opis dla analityka/oferty. */
  summary: string;
  source: string;
  /** Zastrzeżenie prawne/etyczne. */
  disclaimer: string;
}

const DISCLAIMER =
  "Szacunek statystyczny (populacyjny) na bazie tablic trwania życia GUS. Nie stanowi prognozy indywidualnej ani oceny stanu zdrowia; służy wyłącznie ocenie horyzontu ryzyka zabezpieczenia.";

/**
 * Szacuje prawdopodobieństwo przeżycia `termYears` przez osobę w wieku `age`.
 * Model wykładniczy z chwilową intensywnością zgonu μ ≈ 1/e(x) — przybliżenie
 * wystarczające do bandingu ryzyka (nie do celów ubezpieczeniowych).
 */
function survivalProbability(remainingYears: number, termYears: number): number {
  if (termYears <= 0) return 1;
  if (remainingYears <= 0) return 0;
  const mu = 1 / remainingYears;
  return Math.max(0, Math.min(1, Math.exp(-mu * termYears)));
}

function classifyBand(
  remainingYears: number | null,
  termYears: number | null,
  age: number | null,
): LongevityBand {
  if (remainingYears == null) return "nieznane";
  // Gdy znamy horyzont pożyczki — oceniamy zapas trwania życia względem tenoru.
  if (termYears != null && termYears > 0) {
    const ratio = remainingYears / termYears;
    if (ratio >= 3) return "niskie";
    if (ratio >= 1.8) return "umiarkowane";
    if (ratio >= 1.1) return "podwyzszone";
    return "wysokie";
  }
  // Bez horyzontu — banding wg wieku (ryzyko sukcesji na zabezpieczeniu).
  if (age == null) return "nieznane";
  if (age < 60) return "niskie";
  if (age < 70) return "umiarkowane";
  if (age < 80) return "podwyzszone";
  return "wysokie";
}

export function bandLabel(b: LongevityBand): string {
  switch (b) {
    case "niskie":
      return "niskie ryzyko dożycia/sukcesji";
    case "umiarkowane":
      return "umiarkowane ryzyko dożycia/sukcesji";
    case "podwyzszone":
      return "podwyższone ryzyko dożycia/sukcesji";
    case "wysokie":
      return "wysokie ryzyko dożycia/sukcesji";
    case "nieznane":
      return "nieznane ryzyko dożycia/sukcesji";
  }
}

export interface EstimateLifeExpectancyInput {
  age: number | null;
  sex: Sex | null;
  /** Okres pożyczki w latach — opcjonalny; wpływa na banding i prawdopodobieństwo. */
  loanTermYears?: number | null;
}

export function estimateLifeExpectancy(input: EstimateLifeExpectancyInput): LifeExpectancyResult {
  const { age, sex } = input;
  const termYears = input.loanTermYears ?? null;
  const base: Omit<LifeExpectancyResult, "longevityRiskBand" | "summary"> = {
    available: false,
    age,
    sex,
    remainingYears: null,
    projectedAgeAtDeath: null,
    loanTermYears: termYears,
    survivalProbabilityOverTerm: null,
    survivalByLoanYear: [],
    source: "GUS — Tablice trwania życia 2022",
    disclaimer: DISCLAIMER,
  };

  if (age == null || sex == null) {
    return {
      ...base,
      longevityRiskBand: "nieznane",
      summary:
        "Brak danych (wiek/płeć) do oszacowania trwania życia — wymagane dane właściciela (np. PESEL).",
    };
  }

  const table = sex === "M" ? EX_MEN : EX_WOMEN;
  const remainingYears = Math.round(interpolateEx(table, Math.max(0, age)) * 10) / 10;
  const projectedAgeAtDeath = Math.round((age + remainingYears) * 10) / 10;
  const survival =
    termYears != null
      ? Math.round(survivalProbability(remainingYears, termYears) * 100) / 100
      : null;
  const band = classifyBand(remainingYears, termYears, age);

  // Dożycie dla oferowanego zakresu pożyczek 1–5 lat.
  const survivalByLoanYear = LOAN_TERM_YEARS.map((years) => ({
    years,
    probability: Math.round(survivalProbability(remainingYears, years) * 100) / 100,
  }));
  const survival5y = survivalByLoanYear[survivalByLoanYear.length - 1].probability;
  const survival1y = survivalByLoanYear[0].probability;

  const termPart =
    termYears != null
      ? ` Dla horyzontu pożyczki ${termYears} lat szacunkowe prawdopodobieństwo przeżycia całego okresu wynosi ~${Math.round((survival ?? 0) * 100)}%.`
      : "";
  const rangePart = ` Dożycie dla pożyczek 1–5 lat: P(1 rok) ≈ ${Math.round(survival1y * 100)}%, P(5 lat) ≈ ${Math.round(survival5y * 100)}%.`;
  const summary =
    `Właściciel: ${sex === "M" ? "mężczyzna" : "kobieta"}, wiek ${age} lat. ` +
    `Dalsze przeciętne trwanie życia wg GUS ≈ ${remainingYears} lat (przewidywany wiek dożycia ≈ ${projectedAgeAtDeath}).` +
    termPart +
    rangePart;

  return {
    ...base,
    available: true,
    remainingYears,
    projectedAgeAtDeath,
    survivalProbabilityOverTerm: survival,
    survivalByLoanYear,
    longevityRiskBand: band,
    summary,
  };
}
