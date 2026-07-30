// Czynnik kondygnacji dla mieszkań — wpływ piętra na sprzedawalność.
// Zasada: 1. piętro najlepiej (w KW to kondygnacja 2, bo parter = kondygnacja 1);
// najgorzej ostatnie piętro w niskim budynku bez windy (np. 4. piętro w 4-piętrowym).
// Czysta, testowalna logika.

export interface FloorFactorInput {
  /** Numeracja z KW: parter = 1, 1. piętro = 2, itd. */
  kondygnacja?: number | null;
  /** Piętro nad parterem: parter = 0, 1. piętro = 1 (alternatywa dla kondygnacji). */
  floorPietro?: number | null;
  /** Liczba pięter budynku nad parterem (jeśli znana). */
  totalFloors?: number | null;
  /** Winda — jeśli znana; gdy null, szacujemy z wysokości budynku. */
  hasElevator?: boolean | null;
}

export interface FloorFactorResult {
  available: boolean;
  floorPietro: number | null;
  totalFloors: number | null;
  kondygnacja: number | null;
  hasElevatorAssumed: boolean | null;
  /** 0–100, wyżej = lepsza sprzedawalność ze względu na piętro. */
  score: number;
  label: string;
  note: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function baseByPietro(pietro: number): number {
  switch (pietro) {
    case 0:
      return 58; // parter
    case 1:
      return 100; // 1. piętro — optymalne
    case 2:
      return 88;
    case 3:
      return 76;
    case 4:
      return 64;
    default:
      return 60; // 5+ (wymaga windy)
  }
}

function labelFromScore(score: number): string {
  if (score >= 85) return "optymalna kondygnacja";
  if (score >= 70) return "dobra kondygnacja";
  if (score >= 50) return "przeciętna kondygnacja";
  if (score >= 35) return "utrudniona sprzedaż (kondygnacja)";
  return "najgorsza kondygnacja";
}

export function assessFloor(input: FloorFactorInput): FloorFactorResult {
  const empty: FloorFactorResult = {
    available: false,
    floorPietro: null,
    totalFloors: input.totalFloors ?? null,
    kondygnacja: input.kondygnacja ?? null,
    hasElevatorAssumed: null,
    score: 60,
    label: "brak danych o kondygnacji",
    note: "Brak informacji o piętrze — czynnik pominięty.",
  };

  // Wyznacz piętro (nad parterem).
  let pietro: number | null = null;
  if (input.floorPietro != null && Number.isFinite(input.floorPietro))
    pietro = Math.max(0, Math.round(input.floorPietro));
  else if (input.kondygnacja != null && Number.isFinite(input.kondygnacja))
    pietro = Math.max(0, Math.round(input.kondygnacja) - 1);
  if (pietro == null) return empty;

  const totalFloors =
    input.totalFloors != null && Number.isFinite(input.totalFloors)
      ? Math.max(0, Math.round(input.totalFloors))
      : null;

  // Winda: znana lub szacowana (budynki > 4 pięter zwykle z windą; do 4 pięter — bez).
  const hasElevatorAssumed = input.hasElevator ?? (totalFloors != null ? totalFloors >= 5 : null);
  const noLift =
    hasElevatorAssumed === false ||
    (hasElevatorAssumed === null && totalFloors != null && totalFloors <= 4);

  let score = baseByPietro(pietro);
  const notes: string[] = [];

  if (pietro === 1) notes.push("1. piętro — optymalna kondygnacja dla sprzedaży");
  if (pietro === 0) notes.push("parter — przeciętna sprzedawalność (hałas/bezpieczeństwo)");

  if (noLift) {
    if (pietro >= 2) {
      score -= (pietro - 1) * 10; // 2p:-10, 3p:-20, 4p:-30
      notes.push("budynek bez windy — utrudniona sprzedaż wyższych pięter");
    }
    if (totalFloors != null && pietro >= totalFloors && totalFloors <= 4 && pietro >= 2) {
      score -= 8;
      notes.push("ostatnie piętro w niskim budynku bez windy — najniższa sprzedawalność");
    }
  } else if (hasElevatorAssumed === true) {
    if (totalFloors != null && pietro >= totalFloors) {
      score -= 6;
      notes.push("ostatnie piętro (dach) — lekko niższa sprzedawalność");
    }
  } else if (pietro >= 4) {
    // nieznana wysokość budynku, wysokie piętro — ostrożny odpis
    score -= 6;
  }

  score = clamp(Math.round(score), 0, 100);
  return {
    available: true,
    floorPietro: pietro,
    totalFloors,
    kondygnacja: input.kondygnacja ?? pietro + 1,
    hasElevatorAssumed,
    score,
    label: labelFromScore(score),
    note: notes.join("; ") || `Kondygnacja ${pietro === 0 ? "parter" : pietro + ". piętro"}.`,
  };
}
