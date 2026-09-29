/**
 * Kanoniczny generator harmonogramu w modelu Finance You (model silnika).
 *
 * JEDNO źródło prawdy dla całej matematyki pożyczkowej w systemie: kalkulatory
 * (landing, wniosek, kreator, panel inwestora), silnik umów i narzędzia MCP.
 *
 * Zasady modelu (decyzje nadrzędne 2, 4 i 5 sprzątania spójności 2026-09):
 *  - **Kwota Udzielona (K)** = kwota pożyczki z umowy; od niej liczy się
 *    odsetki i ją spłaca Pożyczkobiorca,
 *  - **Prowizja Klientowska Finance You (`prowizjaFY`)** jest POTRĄCANA
 *    z wypłaty i NIE wchodzi do rat: inwestor przelewa ją na rachunek FY,
 *    resztę (`kwotaWyplaconaKlientowi`) Klientowi (Zał. 6) — patrz `fees.ts`,
 *  - **prowizja inwestora (`prowizja`, klauzula KWO_02)** to stała kwota
 *    z umowy rozłożona równo na N rat; ostatnia rata absorbuje zaokrąglenie,
 *  - **odsetki od kapitału pozostającego do spłaty**, stopa roczna nie może
 *    przekraczać odsetek maksymalnych (art. 359 § 2¹ KC) — inaczej BŁĄD,
 *  - **pułap „maks. rata" steruje kapitałem** — nadwyżka kapitału trafia do
 *    raty balonowej, którą jest **ostatnia z N rat** (nie osobny wiersz);
 *    pułap niepokrywający odsetek + prowizji w racie to BŁĄD blokujący,
 *  - niezmienniki: Σ kapitał = K, Σ prowizja = P, saldo maleje o kapitał,
 *    saldo ostatniej raty = 0, rata_razem = kapitał + odsetki + prowizja.
 *    Dzięki temu wynik przechodzi `walidujHarmonogram`.
 *  - całkowity koszt = odsetki + prowizja inwestora + prowizja FY.
 */

import { fyCommission, maxCapitalRate, maxRateMessage, rateExceedsMax } from "./fees";

export interface EngineScheduleInput {
  /** K — Kwota Udzielona (kwota pożyczki z umowy). */
  kwotaPozyczki: number;
  /** P — prowizja INWESTORA (KWO_02), rozkładana równo na N rat. */
  prowizja: number;
  /**
   * Prowizja Klientowska Finance You — potrącana z wypłaty, poza ratami.
   * Domyślnie 0 (kontekst bez pośrednictwa FY); kalkulatory FY podają
   * `fyCommission(kwotaPozyczki)`.
   */
  prowizjaFY?: number;
  /** Oprocentowanie roczne w %, np. 14.5 (≤ odsetki maksymalne). */
  annualRatePercent: number;
  /** N — liczba rat. */
  months: number;
  /** Pułap raty klienta; steruje wielkością spłacanego kapitału i balonem. */
  maxMonthlyPayment: number;
  /** Data pierwszej raty — "YYYY-MM-DD" albo "DD.MM.RRRR". */
  firstPaymentDate?: string | null;
  /** Dzień, na który ocenia się odsetki maksymalne (domyślnie dziś). */
  asOf?: Date | string;
}

export interface EngineScheduleRow {
  nr: number;
  /** DD.MM.RRRR (format schematu umowy). */
  termin: string;
  kapital: number;
  odsetki: number;
  prowizja: number;
  rata_razem: number;
  saldo: number;
  /** true dla ostatniej raty, gdy jest wyższa niż rata regularna (balon). */
  isBalloon: boolean;
}

export interface EngineSchedule {
  rows: EngineScheduleRow[];
  /** Alias `kwotaUdzielona` (zgodność wsteczna). */
  kwotaPozyczki: number;
  /** K — Kwota Udzielona. */
  kwotaUdzielona: number;
  /** Prowizja Klientowska FY potrącana z wypłaty (poza ratami). */
  prowizjaFY: number;
  /** K − prowizjaFY — „na rękę". */
  kwotaWyplaconaKlientowi: number;
  /** Alias `prowizjaInwestora` (zgodność wsteczna). */
  prowizja: number;
  /** Prowizja inwestora rozłożona w ratach (suma z harmonogramu). */
  prowizjaInwestora: number;
  months: number;
  /** Nominalna prowizja inwestora miesięczna (P / N). */
  monthlyCommission: number;
  /** Rata regularna (pułap klienta). */
  regularPayment: number;
  totalInterest: number;
  /** Suma wszystkich rat = należność Pożyczkobiorcy wobec inwestora. */
  totalToRepay: number;
  /** Całkowity koszt = odsetki + prowizja inwestora + prowizja FY. */
  calkowityKoszt: number;
  /** Kwota raty balonowej (rata_razem ostatniej raty), 0 gdy brak balonu. */
  balloon: number;
  warnings: string[];
  /** Błędy BLOKUJĄCE (stopa > max, pułap niepokrywający odsetek + prowizji). */
  errors: string[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── daty ───────────────────────────────────────────────────────
function parseAnyDate(s: string): { y: number; m: number; d: number } | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}

function addMonthsClamped(
  base: { y: number; m: number; d: number },
  add: number,
): { y: number; m: number; d: number } {
  const total = base.y * 12 + (base.m - 1) + add;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(base.d, daysInMonth);
  return { y, m, d };
}

function formatDataPl(d: { y: number; m: number; d: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.d)}.${pad(d.m)}.${d.y}`;
}

/**
 * Rdzeń harmonogramu: raty 1..N-1 z prowizją `m` (grosze), ostatnia rata
 * z prowizją `last` (grosze) i całym pozostałym kapitałem.
 */
function symuluj(
  K: number,
  r: number,
  N: number,
  maxPay: number,
  mGr: number,
  lastGr: number,
  first: { y: number; m: number; d: number } | null,
): { rows: EngineScheduleRow[]; capped: boolean } {
  const rows: EngineScheduleRow[] = [];
  let remaining = K;
  let capped = false;
  for (let i = 1; i <= N; i++) {
    const odsetki = round2(remaining * r);
    const prowizja = (i < N ? mGr : lastGr) / 100;

    let kapital: number;
    if (i < N) {
      const capacity = round2(maxPay - odsetki - prowizja);
      kapital = Math.min(Math.max(0, capacity), remaining);
      if (capacity < 0) capped = true;
    } else {
      kapital = remaining; // ostatnia rata: cały pozostały kapitał (balon)
    }
    kapital = round2(kapital);

    const rata_razem = round2(odsetki + prowizja + kapital);
    remaining = round2(remaining - kapital);

    rows.push({
      nr: i,
      termin: first ? formatDataPl(addMonthsClamped(first, i - 1)) : "",
      kapital,
      odsetki,
      prowizja,
      rata_razem,
      saldo: remaining < 0 ? 0 : remaining,
      isBalloon: false,
    });
  }
  return { rows, capped };
}

/** Pusty wynik (brak kwoty / rat) — bez wierszy, z komunikatem. */
function pusty(
  K: number,
  P: number,
  fee: number,
  N: number,
  maxPay: number,
  msg: string,
  errors: string[],
): EngineSchedule {
  return {
    rows: [],
    kwotaPozyczki: K,
    kwotaUdzielona: K,
    prowizjaFY: fee,
    kwotaWyplaconaKlientowi: round2(Math.max(0, K - fee)),
    prowizja: P,
    prowizjaInwestora: P,
    months: N,
    monthlyCommission: 0,
    regularPayment: maxPay,
    totalInterest: 0,
    totalToRepay: 0,
    calkowityKoszt: round2(P + fee),
    balloon: 0,
    warnings: [msg],
    errors,
  };
}

/**
 * Buduje harmonogram w modelu silnika. Wynik jest deterministyczny i spełnia
 * niezmienniki weryfikowane przez `walidujHarmonogram`. Naruszenia reguł
 * (stopa > max, pułap za niski) trafiają do `errors` — wiersze są nadal
 * liczone do podglądu, ale konsument MUSI zablokować zapis/umowę.
 */
export function buildEngineSchedule(input: EngineScheduleInput): EngineSchedule {
  const K = Math.max(0, round2(input.kwotaPozyczki));
  const P = Math.max(0, round2(input.prowizja));
  const fee = Math.max(0, round2(input.prowizjaFY ?? 0));
  const N = Math.max(0, Math.floor(input.months));
  const maxPay = Math.max(0, input.maxMonthlyPayment);
  const asOf = input.asOf ?? new Date();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rateExceedsMax(input.annualRatePercent, asOf)) errors.push(maxRateMessage(asOf));
  if (fee > K && K > 0) {
    errors.push("Prowizja Finance You przekracza Kwotę Udzieloną — kwota na rękę byłaby ujemna.");
  }

  if (N <= 0 || K <= 0) {
    return pusty(
      K,
      P,
      fee,
      N,
      maxPay,
      "Brak kwoty pożyczki lub liczby rat — harmonogram pusty.",
      errors,
    );
  }

  const r = input.annualRatePercent / 100 / 12;
  const first = input.firstPaymentDate ? parseAnyDate(input.firstPaymentDate) : null;

  // prowizja inwestora rozłożona równo; ostatnia rata absorbuje zaokrąglenie
  const mGr = Math.round((P / N) * 100);
  const lastGr = Math.round(P * 100) - mGr * (N - 1);
  const sim = symuluj(K, r, N, maxPay, mGr, lastGr, first);
  const rows = sim.rows;
  if (sim.capped) {
    errors.push(
      "Pułap raty nie pokrywa odsetek i prowizji w części rat — zwiększ maksymalną ratę albo zmniejsz prowizję.",
    );
  }
  const prowizjaRazem = round2(rows.reduce((a, r0) => a + r0.prowizja, 0));
  const monthlyCommission = rows[0]?.prowizja ?? 0;

  const last = rows[rows.length - 1];
  // Balon istnieje, gdy ostatnia rata wyraźnie przekracza pułap — margines 2 zł
  // pochłania groszowe reszty z zaokrągleń przy pełnej amortyzacji (bez pułapu).
  const hasBalloon = last.rata_razem > maxPay + 2;
  last.isBalloon = hasBalloon;

  const totalInterest = round2(rows.reduce((a, r0) => a + r0.odsetki, 0));
  const totalToRepay = round2(rows.reduce((a, r0) => a + r0.rata_razem, 0));

  return {
    rows,
    kwotaPozyczki: K,
    kwotaUdzielona: K,
    prowizjaFY: fee,
    kwotaWyplaconaKlientowi: round2(Math.max(0, K - fee)),
    prowizja: prowizjaRazem,
    prowizjaInwestora: prowizjaRazem,
    months: N,
    monthlyCommission,
    regularPayment: maxPay,
    totalInterest,
    totalToRepay,
    calkowityKoszt: round2(totalInterest + prowizjaRazem + fee),
    balloon: hasBalloon ? last.rata_razem : 0,
    warnings,
    errors,
  };
}

/** Skrót: harmonogram z domyślną Prowizją Klientowską FY (7 %, min 5 000 zł). */
export function buildFyEngineSchedule(
  input: Omit<EngineScheduleInput, "prowizjaFY"> & { prowizjaFY?: number },
): EngineSchedule {
  return buildEngineSchedule({
    ...input,
    prowizjaFY: input.prowizjaFY ?? fyCommission(input.kwotaPozyczki),
  });
}

/** Najwyższa dopuszczalna stopa (do suwaków / walidacji formularzy). */
export function engineMaxRate(asOf: Date | string = new Date()): number {
  return maxCapitalRate(asOf);
}
