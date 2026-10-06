// ════════════════════════════════════════════════════════════════════
// ZALEGŁOŚĆ Z HARMONOGRAMU RAT — czyste, deterministyczne funkcje.
//
// Pożyczki spłacane są w ratach (Zał. 1 do umowy — Harmonogram spłat).
// „Kwota zaległa" to suma rat, których termin już minął, a które nie
// zostały zapłacone — NIE całe saldo pożyczki ani nie rata ostatnia.
// Opóźnienie liczymy od najstarszej niezapłaconej raty, a odsetki za
// opóźnienie — od każdej raty osobno, od dnia po jej terminie.
//
// Zasady:
//   • art. 115 k.c. — termin przypadający w sobotę albo dzień ustawowo
//     wolny od pracy upływa w najbliższym dniu roboczym;
//   • art. 481 § 1 i § 2¹ k.c. — odsetki za opóźnienie wg stopy z umowy
//     (WIN_01: dwukrotność odsetek ustawowych za opóźnienie), ale w każdym
//     dniu nie wyższe niż odsetki maksymalne za opóźnienie obowiązujące
//     w tym dniu (tabela MAX_INTEREST_TABLE w contract-engine/fees.ts);
//   • zaliczanie wpłat (WIN_04 / art. 451 k.c.): najpierw koszty
//     windykacyjne, potem odsetki za opóźnienie, potem raty od najstarszej
//     (rata zawiera prowizję, odsetki umowne i kapitał w proporcjach
//     z harmonogramu — kolejność wewnątrz raty nie zmienia jej salda);
//   • wypowiedzenie umowy przyspiesza wymagalność rat przyszłych (bez
//     przyszłych odsetek umownych, gdy harmonogram je wyszczególnia).
// ════════════════════════════════════════════════════════════════════

import { maxDelayRate } from "@/lib/contract-engine/fees";

/** Jedna rata harmonogramu. Kwoty w złotych. */
export interface WindRata {
  nr: number;
  /** Termin płatności (RRRR-MM-DD). */
  termin: string;
  /** Kwota raty łącznie. */
  kwota: number;
  /** Część odsetkowa raty (gdy harmonogram ją podaje) — po wypowiedzeniu nienależna za przyszłość. */
  odsetki?: number | null;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.005;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function utcNoon(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}
function addDays(iso: string, days: number): string {
  const d = utcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((utcNoon(b).getTime() - utcNoon(a).getTime()) / 86_400_000);
}

/** Data z „RRRR-MM-DD", „DD.MM.RRRR" albo „DD-MM-RRRR" → RRRR-MM-DD (lub null). */
export function parseDataISO(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validIso(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(s);
  if (m) return validIso(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  return null;
}
function validIso(iso: string): string | null {
  const d = utcNoon(iso);
  return !isNaN(d.getTime()) && isoDay(d) === iso ? iso : null;
}

/** Kwota z liczby albo tekstu („7 868,48", „7868.48 zł") — null, gdy nie da się odczytać. */
export function parseKwota(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v)
    .replace(/[\s\u00a0]/g, "")
    .replace(/zł|pln/gi, "");
  if (!s) return null;
  // „1.234,56" → 1234.56; „1234,56" → 1234.56; „1234.56" → 1234.56
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalizuje harmonogram z dowolnego źródła (OCR, formularz, baza):
 * odrzuca wiersze bez poprawnej daty lub dodatniej kwoty, sortuje po
 * terminie i numeruje od 1. Brak wierszy → null.
 */
export function normalizeHarmonogram(raw: unknown): WindRata[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: WindRata[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const termin = parseDataISO(o.termin ?? o.data ?? o.termin_platnosci);
    const kwota = parseKwota(o.kwota ?? o.rata ?? o.rata_razem);
    if (!termin || kwota == null || kwota <= 0) continue;
    const odsetki = parseKwota(o.odsetki);
    rows.push({
      nr: 0,
      termin,
      kwota: round2(kwota),
      ...(odsetki != null && odsetki >= 0 ? { odsetki: round2(odsetki) } : {}),
    });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.termin.localeCompare(b.termin));
  return rows.map((r, i) => ({ ...r, nr: i + 1 }));
}

/**
 * Harmonogram miesięczny z parametrów umowy: pierwsza rata, liczba rat,
 * kwota raty i (opcjonalnie) inna kwota ostatniej raty (np. rata balonowa).
 * Dzień płatności jak w pierwszej racie; w krótszym miesiącu — ostatni dzień.
 */
export function generateHarmonogram(p: {
  pierwszaRata: string;
  liczbaRat: number;
  kwotaRaty: number;
  kwotaOstatniejRaty?: number | null;
}): WindRata[] {
  const first = parseDataISO(p.pierwszaRata);
  const n = Math.floor(Number(p.liczbaRat) || 0);
  const kwota = Number(p.kwotaRaty) || 0;
  if (!first || n <= 0 || n > 600 || kwota <= 0) return [];
  const [y, m, d] = first.split("-").map(Number);
  const out: WindRata[] = [];
  for (let i = 0; i < n; i++) {
    const month0 = m - 1 + i;
    const year = y + Math.floor(month0 / 12);
    const month = (month0 % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(d, lastDay);
    const termin = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const last = i === n - 1 && p.kwotaOstatniejRaty != null && p.kwotaOstatniejRaty > 0;
    out.push({ nr: i + 1, termin, kwota: round2(last ? Number(p.kwotaOstatniejRaty) : kwota) });
  }
  return out;
}

// ── art. 115 k.c. — dni ustawowo wolne od pracy ─────────────────────

/** Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera) jako RRRR-MM-DD. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const holidayCache = new Map<number, Set<string>>();

/**
 * Dni ustawowo wolne od pracy w Polsce (ustawa z 18.01.1951 r.) w danym
 * roku — stałe święta i ruchome (Wielkanoc, Zielone Świątki, Boże Ciało).
 * Wigilia (24 grudnia) jest dniem wolnym od 2025 r.
 */
export function polishHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const y = String(year);
  const fixed = ["01-01", "01-06", "05-01", "05-03", "08-15", "11-01", "11-11", "12-25", "12-26"];
  if (year >= 2025) fixed.push("12-24");
  const easter = easterSunday(year);
  const set = new Set<string>([
    ...fixed.map((md) => `${y}-${md}`),
    easter,
    addDays(easter, 1), // Poniedziałek Wielkanocny
    addDays(easter, 49), // Zielone Świątki (niedziela)
    addDays(easter, 60), // Boże Ciało
  ]);
  holidayCache.set(year, set);
  return set;
}

/** Czy dzień jest sobotą, niedzielą albo dniem ustawowo wolnym od pracy. */
export function isNonWorkingDay(iso: string): boolean {
  const dow = utcNoon(iso).getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return polishHolidays(Number(iso.slice(0, 4))).has(iso.slice(0, 10));
}

/** Termin skuteczny wg art. 115 k.c. — przesunięty na najbliższy dzień roboczy. */
export function effectiveDueDate(iso: string): string {
  let d = iso.slice(0, 10);
  for (let i = 0; i < 10 && isNonWorkingDay(d); i++) d = addDays(d, 1);
  return d;
}

// ── Zaległość na dzień ───────────────────────────────────────────────

export interface RataStan {
  nr: number;
  termin: string;
  /** Termin po przesunięciu z art. 115 k.c. */
  terminSkuteczny: string;
  kwota: number;
  /** Kwota wymagana z tej raty (po wypowiedzeniu: bez przyszłych odsetek umownych). */
  kwotaWymagana: number;
  zaplacono: number;
  pozostalo: number;
  wymagalna: boolean;
  /** Dni opóźnienia na dzień `asOf` (0, gdy rata zapłacona albo niewymagalna). */
  dniOpoznienia: number;
  /** Odsetki za opóźnienie naliczone od tej raty (łącznie, przed zaliczeniem wpłat). */
  odsetkiNaliczone: number;
}

export interface ZalegloscWynik {
  asOf: string;
  raty: RataStan[];
  liczbaRatWymagalnych: number;
  /** Suma rat wymagalnych na `asOf`. */
  sumaWymagalna: number;
  /** Ile z wpłat trafiło na raty (po kosztach i odsetkach za opóźnienie). */
  zaplaconoNaRaty: number;
  /** Niezapłacona część rat wymagalnych — „kwota zaległa". */
  zaleglosc: number;
  /** Niezapłacone odsetki za opóźnienie. */
  odsetkiZaOpoznienie: number;
  /** Niezapłacone koszty czynności windykacyjnych. */
  koszty: number;
  /** Zaległość + odsetki za opóźnienie + koszty — kwota do zapłaty teraz. */
  doZaplatyTeraz: number;
  /** Najstarsza niezapłacona rata wymagalna (termin z harmonogramu). */
  najstarszaZalegla: string | null;
  /** Dni opóźnienia liczone od skutecznego terminu najstarszej zaległej raty. */
  dniOpoznienia: number;
  /** Raty jeszcze niewymagalne (pozostało do zapłaty w przyszłości). */
  pozostaleRatyPrzyszle: number;
  /** Najbliższa niewymagalna rata (termin). */
  najblizszaRata: string | null;
  /** Wpłaty ponad wszystkie raty i należności. */
  nadplata: number;
}

export interface ZalegloscInput {
  harmonogram: WindRata[];
  payments: Array<{ paid_on: string; amount: number }>;
  fees?: Array<{ action_date: string; fee: number }>;
  /** Dzień, na który liczymy (RRRR-MM-DD). */
  asOf: string;
  /**
   * Stopa odsetek za opóźnienie z umowy (% rocznie). 0 / brak = odsetki
   * maksymalne za opóźnienie z danego dnia.
   */
  stopaUmowna?: number | null;
  /** Odsetki maksymalne za opóźnienie w danym dniu (domyślnie tabela z fees.ts). */
  stopaMaksymalna?: (iso: string) => number;
  /** Data skutecznego wypowiedzenia — od następnego dnia wymagalne są wszystkie raty. */
  dataWypowiedzenia?: string | null;
}

/**
 * Stan zaległości na dzień `asOf`: symulacja dzień po dniu od pierwszego
 * terminu (albo pierwszej wpłaty) — naliczanie odsetek za opóźnienie od
 * każdej zaległej raty, doliczanie kosztów, zaliczanie wpłat.
 */
export function computeZaleglosc(input: ZalegloscInput): ZalegloscWynik {
  const asOf = parseDataISO(input.asOf) ?? isoDay(new Date());
  const rateCap = input.stopaMaksymalna ?? ((iso: string) => maxDelayRate(iso));
  const contractRate = Number(input.stopaUmowna) > 0 ? Number(input.stopaUmowna) : null;
  const termination = input.dataWypowiedzenia ? parseDataISO(input.dataWypowiedzenia) : null;

  const raty = [...(normalizeHarmonogram(input.harmonogram) ?? [])].map((r) => {
    const skuteczny = effectiveDueDate(r.termin);
    // Wypowiedzenie: raty o terminie późniejszym stają się wymagalne
    // w dniu wypowiedzenia, bez odsetek umownych za okres przyszły.
    const przyspieszona = termination != null && skuteczny > termination;
    const kwotaWymagana = przyspieszona
      ? round2(Math.max(0, r.kwota - (Number(r.odsetki) || 0)))
      : r.kwota;
    return {
      ...r,
      terminSkuteczny: przyspieszona ? (termination as string) : skuteczny,
      kwotaWymagana,
      pozostalo: kwotaWymagana,
      odsetki: 0,
    };
  });

  const payments = (input.payments ?? [])
    .map((p) => ({ day: parseDataISO(p.paid_on), amount: Number(p.amount) || 0 }))
    .filter((p): p is { day: string; amount: number } => !!p.day && p.amount > 0);
  const fees = (input.fees ?? [])
    .map((f) => ({ day: parseDataISO(f.action_date), fee: Number(f.fee) || 0 }))
    .filter((f): f is { day: string; fee: number } => !!f.day && f.fee > 0);

  const byDay = <T extends { day: string }>(list: T[], val: (x: T) => number) => {
    const m = new Map<string, number>();
    for (const x of list) m.set(x.day, (m.get(x.day) ?? 0) + val(x));
    return m;
  };
  const payByDay = byDay(payments, (p) => p.amount);
  const feeByDay = byDay(fees, (f) => f.fee);

  const starts = [
    ...raty.map((r) => r.terminSkuteczny),
    ...payments.map((p) => p.day),
    ...fees.map((f) => f.day),
  ].sort();
  let delayBal = 0;
  let costsBal = 0;
  let naRaty = 0;
  let nadplata = 0;

  if (starts.length > 0 && starts[0] <= asOf) {
    const total = Math.min(daysBetween(starts[0], asOf), 366 * 60);
    for (let i = 0; i <= total; i++) {
      const day = addDays(starts[0], i);

      // 1. Odsetki za opóźnienie za ten dzień — od rat po skutecznym terminie.
      const cap = rateCap(day);
      const rate = contractRate != null ? Math.min(contractRate, cap) : cap;
      if (rate > 0) {
        for (const r of raty) {
          if (r.pozostalo > EPS && day > r.terminSkuteczny) {
            const inc = (r.pozostalo * rate) / 100 / 365;
            r.odsetki += inc;
            delayBal += inc;
          }
        }
      }

      // 2. Koszty czynności windykacyjnych z tego dnia.
      costsBal += feeByDay.get(day) ?? 0;

      // 3. Wpłaty z tego dnia: koszty → odsetki za opóźnienie → raty od najstarszej.
      let pay = payByDay.get(day) ?? 0;
      if (pay > 0) {
        const toCosts = Math.min(pay, costsBal);
        costsBal -= toCosts;
        pay -= toCosts;
        const toDelay = Math.min(pay, delayBal);
        delayBal -= toDelay;
        pay -= toDelay;
        for (const r of raty) {
          if (pay <= EPS) break;
          const x = Math.min(pay, r.pozostalo);
          r.pozostalo -= x;
          naRaty += x;
          pay -= x;
        }
        if (pay > EPS) nadplata += pay;
      }
    }
  }

  const stan: RataStan[] = raty.map((r) => {
    const wymagalna = r.terminSkuteczny <= asOf;
    const pozostalo = round2(Math.max(0, r.pozostalo));
    return {
      nr: r.nr,
      termin: r.termin,
      terminSkuteczny: r.terminSkuteczny,
      kwota: r.kwota,
      kwotaWymagana: r.kwotaWymagana,
      zaplacono: round2(r.kwotaWymagana - pozostalo),
      pozostalo,
      wymagalna,
      dniOpoznienia:
        wymagalna && pozostalo > 0 ? Math.max(0, daysBetween(r.terminSkuteczny, asOf)) : 0,
      odsetkiNaliczone: round2(r.odsetki),
    };
  });

  const wymagalne = stan.filter((r) => r.wymagalna);
  const zalegle = wymagalne.filter((r) => r.pozostalo > 0);
  const przyszle = stan.filter((r) => !r.wymagalna);
  const zaleglosc = round2(zalegle.reduce((s, r) => s + r.pozostalo, 0));
  const odsetkiZaOpoznienie = round2(Math.max(0, delayBal));
  const koszty = round2(Math.max(0, costsBal));
  const najstarsza = zalegle[0] ?? null;

  return {
    asOf,
    raty: stan,
    liczbaRatWymagalnych: wymagalne.length,
    sumaWymagalna: round2(wymagalne.reduce((s, r) => s + r.kwotaWymagana, 0)),
    zaplaconoNaRaty: round2(naRaty),
    zaleglosc,
    odsetkiZaOpoznienie,
    koszty,
    doZaplatyTeraz: round2(zaleglosc + odsetkiZaOpoznienie + koszty),
    najstarszaZalegla: najstarsza?.termin ?? null,
    dniOpoznienia: najstarsza ? najstarsza.dniOpoznienia : 0,
    pozostaleRatyPrzyszle: round2(przyszle.reduce((s, r) => s + r.pozostalo, 0)),
    najblizszaRata: przyszle[0]?.termin ?? null,
    nadplata: round2(nadplata),
  };
}
