/**
 * Ostrzeżenia o kosztach pożyczki (pkt 6 zlecenia „przypadki graniczne").
 *
 * Silnik umów nadal NIE ocenia parametrów i niczego tu nie blokuje — zarząd
 * chce zawsze widzieć ryzyko, ale decyduje sam. Każdy wynik ma poziom
 * OSTRZEZENIE (nigdy BLAD), więc nie ustawia `blocked = true`. Te same
 * ostrzeżenia dołącza kalkulator `calculate_repayment_schedule`.
 */
import type { Problem } from "./validator";
import { maxCapitalRate, formatRatePl } from "./fees";

export interface KosztyWejscie {
  /** Kwota Pożyczki (Kwota Udzielona). */
  kwotaPozyczki: number;
  /** Prowizja inwestora (łącznie, z częścią płatną z ratą końcową). */
  prowizjaInwestora: number;
  /** Prowizja Finance You potrącana z wypłaty (0, gdy brak). */
  prowizjaFY: number;
  /** Suma odsetek z harmonogramu. */
  odsetki: number;
  liczbaRat: number;
  /** Data umowy (ISO albo DD.MM.RRRR); domyślnie dziś. */
  dataUmowy?: string | Date | null;
  /** Data rozpoczęcia działalności (CEIDG) pożyczkobiorcy-JDG, jeśli znana. */
  dataRozpoczeciaDzialalnosci?: string | null;
}

const SCIEZKA = "warunki.koszty";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pct(n: number): string {
  return `${n.toFixed(1).replace(".", ",")} %`;
}

function kwotaPl(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + dec;
}

/** "DD.MM.RRRR" | "YYYY-MM-DD" | Date → znacznik UTC (ms) albo NaN. */
export function naDate(v: string | Date | null | undefined): number {
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return NaN;
}

/** Próg łącznej prowizji: min(10 % + 10 % × lata, 45 %) kwoty netto (w %). */
export function progProwizjiPct(liczbaRat: number): number {
  const lata = Math.max(0, liczbaRat) / 12;
  return Math.min(10 + 10 * lata, 45);
}

/** Ostrzeżenia kosztowe (zawsze poziom OSTRZEZENIE). */
export function ostrzezeniaKosztowe(x: KosztyWejscie): Problem[] {
  const out: Problem[] = [];
  const warn = (komunikat: string) =>
    out.push({ poziom: "OSTRZEZENIE", sciezka: SCIEZKA, komunikat });
  const K = Number(x.kwotaPozyczki) || 0;
  const N = Number(x.liczbaRat) || 0;
  if (K <= 0 || N <= 0) return out;
  const prowFY = Math.max(0, Number(x.prowizjaFY) || 0);
  const prowInw = Math.max(0, Number(x.prowizjaInwestora) || 0);
  const odsetki = Math.max(0, Number(x.odsetki) || 0);
  const lata = N / 12;

  // Kwota netto = część Kwoty Pożyczki faktycznie wypłacona Pożyczkobiorcy
  // (Kwota Pożyczki − Prowizja Finance You potrącana z wypłaty).
  const netto = Math.max(0.01, K - prowFY);
  const prowRazem = round2(prowInw + prowFY);
  const prowPct = (prowRazem / netto) * 100;
  const prog = progProwizjiPct(N);
  const ponadProg = prowPct > prog + 1e-9;
  if (ponadProg) {
    warn(
      `Łączna prowizja (inwestor ${kwotaPl(prowInw)} zł + Finance You ${kwotaPl(prowFY)} zł = ` +
        `${kwotaPl(prowRazem)} zł) wynosi ${pct(prowPct)} kwoty netto ${kwotaPl(netto)} zł — ` +
        `powyżej progu min(10 % + 10 % × ${lata.toFixed(1).replace(".", ",")} lat, 45 %) = ${pct(prog)}.`,
    );
  }

  const pozaodsetkowe = prowRazem;
  const calkowity = round2(pozaodsetkowe + odsetki);
  const pozaPct = (pozaodsetkowe / K) * 100;
  const pozaRocznie = pozaPct / lata;
  const calkRocznie = ((calkowity / K) * 100) / lata;
  warn(
    `Koszty pożyczki: pozaodsetkowe ${kwotaPl(pozaodsetkowe)} zł = ${pct(pozaPct)} Kwoty Pożyczki ` +
      `(${pct(pozaRocznie)} w skali roku); całkowity koszt (odsetki + prowizje) ${kwotaPl(calkowity)} zł = ` +
      `${pct(calkRocznie)} Kwoty Pożyczki w skali roku.`,
  );

  const maxStopa = maxCapitalRate(x.dataUmowy ?? new Date());
  if (ponadProg || pozaRocznie > maxStopa) {
    warn(
      `Ryzyko prawne: koszty pozaodsetkowe (${pct(pozaRocznie)} rocznie) przy odsetkach maksymalnych ` +
        `${formatRatePl(maxStopa)} % mogą zostać uznane za obejście przepisów o odsetkach maksymalnych ` +
        `(art. 359 § 2² k.c. — nadwyżka należna w wysokości odsetek maksymalnych) albo za sprzeczne z zasadami ` +
        `współżycia społecznego (art. 58 § 2 k.c.) / wyzysk (art. 388 k.c.). Decyzja należy do zarządu.`,
    );
  }

  const start = naDate(x.dataRozpoczeciaDzialalnosci ?? null);
  const umowa = naDate(x.dataUmowy ?? new Date());
  if (!Number.isNaN(start) && !Number.isNaN(umowa)) {
    const dni = Math.round((umowa - start) / 86_400_000);
    if (dni >= 0 && dni < 30) {
      warn(
        `Działalność gospodarcza pożyczkobiorcy założona ${dni} ${dni === 1 ? "dzień" : "dni"} przed datą umowy ` +
          `(CEIDG) — ryzyko zakwalifikowania pożyczkobiorcy jako konsumenta (lub osoby fizycznej na prawach ` +
          `konsumenta, art. 385⁵ k.c.) i zastosowania przepisów o kredycie konsumenckim, w tym limitu kosztów ` +
          `pozaodsetkowych.`,
      );
    }
  }
  return out;
}
