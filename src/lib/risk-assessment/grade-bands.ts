import type { RiskGrade } from "./types";

/**
 * Skala A–E oceny inwestycyjnej (investmentScore 0–100, wyżej = bezpieczniej).
 * Jedno źródło progów, kolorów i opisów klas dla panelu inwestora (karta
 * wyceny, raport PDF) i strony modułu Analityk AI. Progi muszą zgadzać się
 * z gradeFromScore (types.ts), a kolory ze scoreColor (risk-charts.tsx) —
 * pilnuje tego grade-bands.test.ts.
 *
 * Opisy są neutralną klasyfikacją ryzyka, nie rekomendacją inwestycyjną.
 */
export type GradeBand = {
  grade: RiskGrade;
  /** Najniższy wynik w klasie (włącznie). */
  min: number;
  /** Najwyższy wynik w klasie (włącznie). */
  max: number;
  label: string;
  description: string;
  color: string;
};

export const GRADE_BANDS: readonly GradeBand[] = [
  {
    grade: "A",
    min: 85,
    max: 100,
    label: "Bardzo niskie ryzyko",
    description: "Mocne zabezpieczenie, uporządkowany stan prawny i płynna nieruchomość.",
    color: "#059669",
  },
  {
    grade: "B",
    min: 70,
    max: 84,
    label: "Niskie ryzyko",
    description: "Dobre zabezpieczenie z pojedynczymi zastrzeżeniami do wyjaśnienia.",
    color: "#10b981",
  },
  {
    grade: "C",
    min: 55,
    max: 69,
    label: "Umiarkowane ryzyko",
    description: "Zabezpieczenie do przyjęcia pod warunkami lub po uzupełnieniu dokumentów.",
    color: "#f59e0b",
  },
  {
    grade: "D",
    min: 40,
    max: 54,
    label: "Podwyższone ryzyko",
    description: "Istotne ryzyka — wymaga pogłębionej weryfikacji przed decyzją.",
    color: "#f97316",
  },
  {
    grade: "E",
    min: 0,
    max: 39,
    label: "Wysokie ryzyko",
    description: "Poważne przeszkody, np. egzekucja w toku albo bardzo wysokie ryzyko powodzi.",
    color: "#ef4444",
  },
];

export function gradeBand(grade: RiskGrade): GradeBand {
  return GRADE_BANDS.find((b) => b.grade === grade) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
}

/** „85–100” — zakres punktów klasy do wyświetlenia. */
export function gradeRangeLabel(b: GradeBand): string {
  return `${b.min}–${b.max}`;
}
