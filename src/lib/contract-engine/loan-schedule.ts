/**
 * Kanoniczny generator harmonogramu w modelu Finance You (model silnika).
 *
 * JEDNO źródło prawdy dla całej matematyki pożyczkowej w systemie. Zastępuje
 * rozjazd między `client-profile-math` (netto+prowizja, „opłata za ryzyko",
 * osobny wiersz „Balon") a modelem umowy.
 *
 * Zasady modelu (decyzja nadrzędna, pkt 0/2 zlecenia):
 *  - **pełna wypłata**: Pożyczkobiorca otrzymuje pełną Kwotę Pożyczki (K);
 *    prowizja NIE jest potrącana z wypłaty,
 *  - **prowizja rozłożona równo na N rat** jako ułatwienie płatnicze
 *    (klauzula KWO_02) — ostatnia rata absorbuje zaokrąglenie groszowe,
 *  - **odsetki od kapitału pozostającego do spłaty**,
 *  - **pułap „maks. rata" steruje kapitałem** — nadwyżka kapitału trafia do
 *    raty balonowej, którą jest **ostatnia z N rat** (nie osobny wiersz),
 *  - niezmienniki: Σ kapitał = K, Σ prowizja = P, saldo maleje o kapitał,
 *    saldo ostatniej raty = 0, rata_razem = kapitał + odsetki + prowizja.
 *    Dzięki temu wynik przechodzi `walidujHarmonogram`.
 */

export interface EngineScheduleInput {
  /** K — pełna Kwota Pożyczki (kwota wypłacana Pożyczkobiorcy). */
  kwotaPozyczki: number;
  /** P — prowizja, rozkładana równo na N rat. */
  prowizja: number;
  /** Oprocentowanie roczne w %, np. 15.5. */
  annualRatePercent: number;
  /** N — liczba rat. */
  months: number;
  /** Pułap raty klienta; steruje wielkością spłacanego kapitału i balonem. */
  maxMonthlyPayment: number;
  /** Data pierwszej raty — "YYYY-MM-DD" albo "DD.MM.RRRR". */
  firstPaymentDate?: string | null;
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
  kwotaPozyczki: number;
  prowizja: number;
  months: number;
  /** Nominalna prowizja miesięczna (P / N). */
  monthlyCommission: number;
  /** Rata regularna (pułap klienta). */
  regularPayment: number;
  totalInterest: number;
  /** Suma wszystkich rat = należność Pożyczkobiorcy. */
  totalToRepay: number;
  /** Kwota raty balonowej (rata_razem ostatniej raty), 0 gdy brak balonu. */
  balloon: number;
  warnings: string[];
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
 * Buduje harmonogram w modelu silnika. Wynik jest deterministyczny i spełnia
 * niezmienniki weryfikowane przez `walidujHarmonogram`.
 */
export function buildEngineSchedule(input: EngineScheduleInput): EngineSchedule {
  const K = Math.max(0, round2(input.kwotaPozyczki));
  const P = Math.max(0, round2(input.prowizja));
  const N = Math.max(0, Math.floor(input.months));
  const maxPay = Math.max(0, input.maxMonthlyPayment);
  const r = input.annualRatePercent / 100 / 12;
  const warnings: string[] = [];

  if (N <= 0 || K <= 0) {
    return {
      rows: [],
      kwotaPozyczki: K,
      prowizja: P,
      months: N,
      monthlyCommission: 0,
      regularPayment: maxPay,
      totalInterest: 0,
      totalToRepay: 0,
      balloon: 0,
      warnings: ["Brak kwoty pożyczki lub liczby rat — harmonogram pusty."],
    };
  }

  // prowizja rozłożona równo; ostatnia rata absorbuje zaokrąglenie
  const monthlyCommission = round2(P / N);
  const commissionOf = (i: number) =>
    i < N ? monthlyCommission : round2(P - monthlyCommission * (N - 1));

  const first = input.firstPaymentDate ? parseAnyDate(input.firstPaymentDate) : null;

  const rows: EngineScheduleRow[] = [];
  let remaining = K;
  let cappedWarned = false;

  for (let i = 1; i <= N; i++) {
    const odsetki = round2(remaining * r);
    const prowizja = commissionOf(i);

    let kapital: number;
    if (i < N) {
      const capacity = round2(maxPay - odsetki - prowizja);
      kapital = Math.min(Math.max(0, capacity), remaining);
      if (capacity < 0 && !cappedWarned) {
        warnings.push(
          "Pułap raty nie pokrywa odsetek i prowizji w części rat — rata przekracza deklarowany maksymalny pułap.",
        );
        cappedWarned = true;
      }
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
    prowizja: P,
    months: N,
    monthlyCommission,
    regularPayment: maxPay,
    totalInterest,
    totalToRepay,
    balloon: hasBalloon ? last.rata_razem : 0,
    warnings,
  };
}
