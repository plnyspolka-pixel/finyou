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
  /**
   * Docelowa kwota ostatniej (balonowej) raty. Gdy podana, silnik IGNORUJE
   * `prowizja` i sam dobiera prowizję (do grosza) tak, by raty regularne
   * mieściły się w pułapie, a ostatnia rata wyniosła dokładnie tyle —
   * np. kapitał + pułap przy racie „odsetki + prowizja" w okresie spłaty.
   * Różnica groszowa zawsze trafia do prowizji w ostatniej racie.
   */
  targetFinalPayment?: number | null;
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
  /**
   * Przy `targetFinalPayment`: komunikat, gdy docelowej raty końcowej nie da
   * się osiągnąć przy podanym pułapie (niespójne parametry). null = osiągnięta.
   */
  targetError?: string | null;
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

/**
 * Dobór prowizji pod docelową ratę końcową. Ostatnia rata rośnie monotonicznie
 * z prowizją miesięczną m (większa prowizja → mniej spłaconego kapitału →
 * większy balon), więc szukamy binarnie największego m (w groszach), dla
 * którego rata końcowa nie przekracza celu; resztę (grosze) dokładamy do
 * prowizji w ostatniej racie. Górna granica m: rata regularna nie może
 * przekroczyć pułapu.
 */
function dobierzProwizje(
  K: number,
  r: number,
  N: number,
  maxPay: number,
  targetGr: number,
  first: { y: number; m: number; d: number } | null,
): { rows: EngineScheduleRow[]; error: string | null } {
  const ostatniaGr = (mGr: number) => {
    const { rows } = symuluj(K, r, N, maxPay, mGr, mGr, first);
    return Math.round(rows[rows.length - 1].rata_razem * 100);
  };
  const mMax = Math.max(0, Math.floor(Math.round((maxPay - round2(K * r)) * 100)));
  if (ostatniaGr(0) > targetGr) {
    const { rows } = symuluj(K, r, N, maxPay, 0, 0, first);
    return {
      rows,
      error:
        "Docelowa rata końcowa jest niższa niż rata końcowa bez prowizji — przy tych parametrach nie da się jej osiągnąć.",
    };
  }
  let lo = 0;
  let hi = mMax;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ostatniaGr(mid) <= targetGr) lo = mid;
    else hi = mid - 1;
  }
  const delta = targetGr - ostatniaGr(lo);
  const { rows } = symuluj(K, r, N, maxPay, lo, lo + delta, first);
  // Reszta większa niż krok jednego grosza prowizji w każdej racie oznacza, że
  // cel leży powyżej zasięgu pułapu (m = mMax) — parametry niespójne.
  const error =
    lo === mMax && delta > N
      ? "Docelowa rata końcowa przekracza ratę osiągalną przy podanym pułapie raty — zwiększ pułap albo zmień ratę docelową."
      : null;
  return { rows, error };
}

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

  const first = input.firstPaymentDate ? parseAnyDate(input.firstPaymentDate) : null;

  let rows: EngineScheduleRow[];
  let targetError: string | null | undefined;
  if (input.targetFinalPayment != null && input.targetFinalPayment > 0 && N > 1) {
    const t = dobierzProwizje(K, r, N, maxPay, Math.round(input.targetFinalPayment * 100), first);
    rows = t.rows;
    targetError = t.error;
  } else {
    // prowizja rozłożona równo; ostatnia rata absorbuje zaokrąglenie
    const mGr = Math.round((P / N) * 100);
    const lastGr = Math.round(P * 100) - mGr * (N - 1);
    const sim = symuluj(K, r, N, maxPay, mGr, lastGr, first);
    rows = sim.rows;
    if (sim.capped) {
      warnings.push(
        "Pułap raty nie pokrywa odsetek i prowizji w części rat — rata przekracza deklarowany maksymalny pułap.",
      );
    }
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
    prowizja: prowizjaRazem,
    months: N,
    monthlyCommission,
    regularPayment: maxPay,
    totalInterest,
    totalToRepay,
    balloon: hasBalloon ? last.rata_razem : 0,
    warnings,
    ...(targetError !== undefined ? { targetError } : {}),
  };
}
