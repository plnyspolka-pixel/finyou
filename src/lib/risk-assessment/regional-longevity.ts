// Regionalny współczynnik dożycia — czysta logika (bez zależności serwerowych).
// Źródło: GUS BDL, temat P2730 „Przeciętne dalsze trwanie życia" — e(x) dla
// wieku 0/15/30/45/60/65, płci, na poziomie podregionu (NUTS3) i Polski.
// Współczynnik = e(x) podregionu / e(x) Polski dla tego samego wieku i płci;
// mnożymy nim krajową tablicę jednorocznych wieków (life-expectancy.ts).

export type LongevitySex = "M" | "K";

/** Zmienne BDL (ogółem: miasto + wieś) — wiek → id zmiennej. */
export const BDL_EX_VARIABLES: Record<LongevitySex, Record<number, number>> = {
  M: { 0: 101554, 15: 105836, 30: 105845, 45: 105854, 60: 105863, 65: 101563 },
  K: { 0: 101555, 15: 105837, 30: 105846, 45: 105855, 60: 105864, 65: 101564 },
};

export const BDL_POLAND_UNIT = "000000000000";

/** Najbliższy wiek z siatki BDL nie większy niż wiek właściciela. */
export function ageBucket(age: number): number {
  const grid = [0, 15, 30, 45, 60, 65];
  let b = 0;
  for (const g of grid) if (age >= g) b = g;
  return b;
}

export interface RegionalLongevity {
  available: boolean;
  /** Np. „PODREGION POZNAŃSKI” albo województwo. */
  unitName: string | null;
  unitLevel: "podregion" | "województwo" | null;
  ageBucket: number | null;
  sex: LongevitySex | null;
  year: string | null;
  regionalEx: number | null;
  nationalEx: number | null;
  /** e(x) regionu / e(x) Polski (np. 1,03 = dłuższe trwanie życia niż średnio w kraju). */
  factor: number | null;
  note: string;
}

export function regionalLongevityFrom(args: {
  unitName: string;
  unitLevel: "podregion" | "województwo";
  ageBucket: number;
  sex: LongevitySex;
  regional: { year: string; val: number } | null;
  national: { year: string; val: number } | null;
}): RegionalLongevity {
  const { regional, national } = args;
  if (!regional || !national || !(regional.val > 0) || !(national.val > 0)) {
    return unavailableLongevity("Brak danych GUS BDL o trwaniu życia dla regionu nieruchomości.");
  }
  const factor = Math.round((regional.val / national.val) * 1000) / 1000;
  const diff = Math.round((regional.val - national.val) * 10) / 10;
  return {
    available: true,
    unitName: args.unitName,
    unitLevel: args.unitLevel,
    ageBucket: args.ageBucket,
    sex: args.sex,
    year: regional.year,
    regionalEx: regional.val,
    nationalEx: national.val,
    factor,
    note:
      `${args.unitName} (${regional.year}): e(${args.ageBucket}) ${args.sex === "M" ? "mężczyzn" : "kobiet"} ` +
      `${String(regional.val).replace(".", ",")} lat wobec ${String(national.val).replace(".", ",")} w Polsce ` +
      `(${diff >= 0 ? "+" : ""}${String(diff).replace(".", ",")} r.; współczynnik ${String(factor).replace(".", ",")}).`,
  };
}

export function unavailableLongevity(note: string): RegionalLongevity {
  return {
    available: false,
    unitName: null,
    unitLevel: null,
    ageBucket: null,
    sex: null,
    year: null,
    regionalEx: null,
    nationalEx: null,
    factor: null,
    note,
  };
}
