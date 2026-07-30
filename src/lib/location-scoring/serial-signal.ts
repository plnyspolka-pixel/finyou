// Sygnał z numeru repertoryjnego (środkowe cyfry KW) — spec §11.
//
// Nie zakładamy, że sąsiednie numery = sąsiednie nieruchomości. Sygnał włączamy
// TYLKO gdy: (a) próba jest dostatecznie duża, (b) offline przeszedł walidację
// (poprawia wynik na danych walidacyjnych, stabilny w walidacji czasowej, nie
// psuje kalibracji). Flaga `validatedOffline` pochodzi z ETL/backtestu i jest
// zapisywana w kw_number_range_statistics. Dla małych prób sygnał = pominięty.

import type { SerialRangeSignal } from "./types";

export type RawRangeStat = {
  sampleCount: number;
  meanAttractiveness: number; // 0–100
  positiveShare: number; // 0–1
  validatedOffline: boolean;
} | null;

/** Buduje sygnał repertoryjny z surowych statystyk zakresu wg progu próby. */
export function buildSerialSignal(stat: RawRangeStat, minSample: number): SerialRangeSignal {
  if (!stat) return null;
  const applied = stat.sampleCount >= minSample && stat.validatedOffline === true;
  return {
    sampleCount: stat.sampleCount,
    meanAttractiveness: stat.meanAttractiveness,
    positiveShare: stat.positiveShare,
    applied,
  };
}
