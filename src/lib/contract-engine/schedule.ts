/**
 * Harmonogram spłat — WALIDACJA (nie liczenie) + adapter z kalkulatora.
 *
 * Zgodnie z pkt 3.2 zlecenia: silnik **nie liczy** harmonogramu — kalkulator
 * pozostaje źródłem prawdy. Silnik ma go zweryfikować pod kątem wewnętrznej
 * spójności z kwotami z §2 umowy. Rozbieżność ponad tolerancję groszową jest
 * **błędem blokującym** — inaczej suma z tabeli nie zgadza się z kwotą w umowie
 * i dokument jest wewnętrznie sprzeczny.
 *
 * Model finansowy: przyjęto model silnika (decyzja nadrzędna, pkt 0/2) —
 * pełna wypłata Kwoty Pożyczki, prowizja **nie potrącana**, rozłożona na raty
 * jako ułatwienie płatnicze; odsetki od kapitału pozostającego do spłaty; rata
 * balonowa jako ostatnia z N rat (nie osobny wiersz).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Problem } from "./validator";
import type { LoanCalcPayload } from "../loan-calc-pdf";
import { amountToWordsPLN } from "../amount-to-words-pl";

export const TOLERANCJA_GROSZOWA = 0.05;

// ── parsowanie / formatowanie kwot ─────────────────────────────
/** Parsuje kwotę zapisaną po polsku ("1 234,56") albo dziesiętnie ("1234.56"). */
export function parseKwota(s: string | number | null | undefined): number {
  if (typeof s === "number") return s;
  const v = parseFloat(
    String(s ?? "")
      .replace(/\s/g, "")
      .replace(",", "."),
  );
  return Number.isNaN(v) ? NaN : v;
}

/** Formatuje liczbę jako kwotę polską zgodną z wzorcem schematu: "1 234,56". */
export function formatKwotaPL(n: number): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + grouped + "," + dec;
}

function parseDataPl(s: string): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s ?? ""));
  if (!m) return NaN;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

// ── typ raty w modelu silnika (liczbowy, przed formatowaniem) ──
export interface RataLiczbowa {
  nr: number;
  /** DD.MM.RRRR */
  termin: string;
  kapital: number;
  odsetki: number;
  prowizja: number;
  rata_razem: number;
  saldo: number;
  uwagi?: string | null;
}

/** Rata w formacie schematu (`warunki.harmonogram.raty[]`) — kwoty jako stringi. */
export interface RataSchema {
  nr: number;
  termin: string;
  kapital: string;
  odsetki: string;
  prowizja: string;
  rata_razem: string;
  saldo: string;
  uwagi?: string | null;
}

/** Formatuje liczbowe wiersze do postaci wymaganej przez schemat. */
export function formatujRaty(rows: RataLiczbowa[]): RataSchema[] {
  return rows.map((r) => ({
    nr: r.nr,
    termin: r.termin,
    kapital: formatKwotaPL(r.kapital),
    odsetki: formatKwotaPL(r.odsetki),
    prowizja: formatKwotaPL(r.prowizja),
    rata_razem: formatKwotaPL(r.rata_razem),
    saldo: formatKwotaPL(r.saldo),
    ...(r.uwagi !== undefined ? { uwagi: r.uwagi } : {}),
  }));
}

/**
 * Adapter `LoanCalcPayload` → `warunki.harmonogram.raty`.
 *
 * Mapowanie pól `{idx, date, rata, kap, ods, saldo}` → `{nr, termin, kapital,
 * odsetki, prowizja, rata_razem, saldo}`.
 *
 * UWAGA (rozbieżność z pkt 2): w `LoanCalcPayload` **nie ma pola na prowizję
 * w racie** — w modelu silnika prowizja jest częścią raty. Dlatego prowizję
 * per rata trzeba podać jawnie (`prowizjaRaty`): tablica równej długości co
 * harmonogram albo pojedyncza kwota łączna do rozłożenia równo na wszystkie
 * raty (z korektą grosza w ostatniej racie). `rata_razem` jest przeliczana
 * jako `kapitał + odsetki + prowizja` — spójnie z niezmiennikiem walidatora.
 */
export function payloadDoRaty(
  payload: Pick<LoanCalcPayload, "schedule">,
  prowizjaRaty: number[] | number,
): RataSchema[] {
  const sched = payload.schedule ?? [];
  const prow = rozlozProwizje(prowizjaRaty, sched.length);
  const rows: RataLiczbowa[] = sched.map((r, i) => {
    const kapital = Number(r.kap) || 0;
    const odsetki = Number(r.ods) || 0;
    const prowizja = prow[i] ?? 0;
    return {
      nr: r.idx,
      termin: r.date,
      kapital,
      odsetki,
      prowizja,
      rata_razem: round2(kapital + odsetki + prowizja),
      saldo: Number(r.saldo) || 0,
    };
  });
  return formatujRaty(rows);
}

function rozlozProwizje(prowizja: number[] | number, n: number): number[] {
  if (Array.isArray(prowizja)) return prowizja;
  if (n <= 0) return [];
  const rata = round2(prowizja / n);
  const out = new Array(n).fill(rata);
  // korekta grosza w ostatniej racie, żeby suma = prowizja co do grosza
  out[n - 1] = round2(prowizja - rata * (n - 1));
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── autonaprawa rozjazdu groszowego (zmiana 4 po Kańkowskich) ──
/**
 * Wpis o dokonanej autokorekcie — informacja techniczna dla operatora,
 * NIE trafia do treści umowy.
 */
export interface KorektaGroszowa {
  sciezka: string;
  komunikat: string;
  /** O ile skorygowano ratę balonową (zł; dodatnia = podwyższono). */
  kwota: number;
}

/**
 * Tolerancja autonaprawy: do kilku groszy na ratę, łącznie 1–2 zł.
 * (Rozjazd większy niż to pozostaje błędem konstrukcyjnym.)
 */
export function tolerancjaAutonaprawy(liczbaRat: number): number {
  return Math.min(2, Math.max(1, liczbaRat * TOLERANCJA_GROSZOWA));
}

/**
 * Autonaprawa rozjazdu groszowego (zmiana 4): gdy suma rat różni się od sumy
 * składników (kapitał + odsetki + prowizja) o kwotę w granicach tolerancji
 * zaokrągleń, silnik domyka różnicę na racie OSTATNIEJ (balonowej) — koryguje
 * jej `rata_razem` (i `kwota_raty_koncowej` przy typie balonowym) tak, by suma
 * zgadzała się co do grosza.
 *
 * Dotyczy WYŁĄCZNIE domknięcia zaokrągleń: jeśli rozjazd przekracza tolerancję
 * albo rozjeżdżają się także raty wcześniejsze, niczego nie zmienia — realny
 * błąd w danych ma zostać zgłoszony przez `walidujHarmonogram` (fundament
 * „suma rat = suma składników" zostaje nienaruszony i po autonaprawie
 * przechodzi).
 *
 * Mutuje `warunki` w miejscu. Zwraca listę dokonanych korekt (informacja
 * techniczna dla operatora — nie klauzula, nie treść umowy).
 */
export function autonaprawHarmonogram(warunki: any, tolerancja?: number): KorektaGroszowa[] {
  const h = warunki?.harmonogram ?? {};
  const raty: any[] = h.raty ?? [];
  if (raty.length === 0) return [];

  const tol = tolerancja ?? tolerancjaAutonaprawy(raty.length);

  // Rozjazd per rata: rata_razem − (kapitał + odsetki + prowizja).
  const rozjazd = raty.map((r) => {
    const skladniki = parseKwota(r.kapital) + parseKwota(r.odsetki) + parseKwota(r.prowizja);
    const razem = parseKwota(r.rata_razem);
    return Number.isNaN(skladniki) || Number.isNaN(razem) ? NaN : razem - skladniki;
  });
  if (rozjazd.some((x) => Number.isNaN(x))) return []; // niekompletne dane — nie ruszamy

  // Raty wcześniejsze muszą się spinać same z siebie — inaczej to nie jest
  // kwestia zaokrągleń, tylko błąd konstrukcyjny (zostawiamy walidatorowi).
  const wczesniejszeOk = rozjazd
    .slice(0, -1)
    .every((x) => Math.abs(x) <= TOLERANCJA_GROSZOWA + 1e-9);
  const rozjazdOstatnia = rozjazd[rozjazd.length - 1];
  if (!wczesniejszeOk) return [];
  if (Math.abs(rozjazdOstatnia) <= TOLERANCJA_GROSZOWA + 1e-9) return []; // nie ma czego domykać
  if (Math.abs(rozjazdOstatnia) > tol + 1e-9) return []; // za dużo na zaokrąglenie — błąd zostaje

  const ostatnia = raty[raty.length - 1];
  const przed = parseKwota(ostatnia.rata_razem);
  const po = round2(
    parseKwota(ostatnia.kapital) + parseKwota(ostatnia.odsetki) + parseKwota(ostatnia.prowizja),
  );
  ostatnia.rata_razem = formatKwotaPL(po);

  const korekty: KorektaGroszowa[] = [
    {
      sciezka: `warunki.harmonogram.raty[${raty.length - 1}].rata_razem`,
      komunikat:
        `Autonaprawa zaokrągleń: rata ostatnia (balonowa) skorygowana z ` +
        `${formatKwotaPL(przed)} zł na ${formatKwotaPL(po)} zł ` +
        `(różnica ${formatKwotaPL(po - przed)} zł), aby suma rat zgadzała się ` +
        `z sumą składników co do grosza.`,
      kwota: round2(po - przed),
    },
  ];

  // Przy harmonogramie balonowym kwota raty końcowej z §2 musi podążyć za
  // skorygowaną ratą — inaczej dokument byłby wewnętrznie sprzeczny.
  if (h.typ === "balonowy" && h.kwota_raty_koncowej) {
    const koncowa = parseKwota(h.kwota_raty_koncowej.cyframi);
    if (!Number.isNaN(koncowa) && Math.abs(koncowa - po) > TOLERANCJA_GROSZOWA + 1e-9) {
      h.kwota_raty_koncowej = {
        cyframi: formatKwotaPL(po),
        slownie: amountToWordsPLN(po) || h.kwota_raty_koncowej.slownie,
      };
      korekty.push({
        sciezka: "warunki.harmonogram.kwota_raty_koncowej",
        komunikat: `Autonaprawa zaokrągleń: kwota_raty_koncowej skorygowana z ${formatKwotaPL(koncowa)} zł na ${formatKwotaPL(po)} zł (spójnie z ratą balonową).`,
        kwota: round2(po - koncowa),
      });
    }
  }

  return korekty;
}

// ── walidacja spójności harmonogramu (pkt 3.2) ─────────────────
/**
 * Weryfikuje harmonogram z `warunki` względem kwot z §2 umowy.
 * Każda rozbieżność ponad `tolerancja` jest **błędem blokującym**.
 * Zwraca pustą listę, gdy harmonogram nie został jeszcze wypełniony
 * (`raty` puste) — wtedy sprawdzać nie ma czego.
 */
export function walidujHarmonogram(warunki: any, tolerancja = TOLERANCJA_GROSZOWA): Problem[] {
  const P: Problem[] = [];
  const blad = (k: string) =>
    P.push({ poziom: "BLAD", sciezka: "warunki.harmonogram", komunikat: k });

  const h = warunki?.harmonogram ?? {};
  const raty: any[] = h.raty ?? [];
  if (raty.length === 0) return P;

  const kwotaPozyczki = parseKwota(warunki?.kwota_pozyczki?.cyframi);
  const kwotaProwizji = parseKwota(warunki?.prowizja?.kwota?.cyframi);
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerancja;

  // 1) liczba wierszy = liczba_rat
  if (typeof h.liczba_rat === "number" && raty.length !== h.liczba_rat)
    blad(`Liczba wierszy harmonogramu (${raty.length}) różni się od liczba_rat (${h.liczba_rat})`);

  const kap = raty.map((r) => parseKwota(r.kapital));
  const ods = raty.map((r) => parseKwota(r.odsetki));
  const prow = raty.map((r) => parseKwota(r.prowizja));
  const razem = raty.map((r) => parseKwota(r.rata_razem));
  const saldo = raty.map((r) => parseKwota(r.saldo));

  const suma = (a: number[]) => a.reduce((x, y) => x + (Number.isNaN(y) ? 0 : y), 0);

  // 2) suma kapitału = Kwota Pożyczki
  if (!Number.isNaN(kwotaPozyczki) && !near(suma(kap), kwotaPozyczki))
    blad(
      `Suma kapitału z harmonogramu (${formatKwotaPL(suma(kap))}) różni się od Kwoty Pożyczki (${formatKwotaPL(kwotaPozyczki)})`,
    );

  // 3) suma prowizji = kwota prowizji z §2
  if (!Number.isNaN(kwotaProwizji) && !near(suma(prow), kwotaProwizji))
    blad(
      `Suma prowizji z harmonogramu (${formatKwotaPL(suma(prow))}) różni się od kwoty prowizji z §2 (${formatKwotaPL(kwotaProwizji)})`,
    );

  // 4) rata_razem = kapitał + odsetki + prowizja (per wiersz)
  for (let i = 0; i < raty.length; i++) {
    const oczek = kap[i] + ods[i] + prow[i];
    if (!near(razem[i], oczek))
      blad(
        `Rata nr ${raty[i].nr ?? i + 1}: rata_razem (${formatKwotaPL(razem[i])}) ≠ kapitał+odsetki+prowizja (${formatKwotaPL(oczek)})`,
      );
  }

  // 5) saldo ostatniej raty = 0,00
  if (!near(saldo[saldo.length - 1], 0))
    blad(`Saldo po ostatniej racie (${formatKwotaPL(saldo[saldo.length - 1])}) ≠ 0,00`);

  // 6) saldo maleje monotonicznie: każde = poprzednie − kapitał
  let poprzednie = Number.isNaN(kwotaPozyczki) ? suma(kap) : kwotaPozyczki;
  for (let i = 0; i < raty.length; i++) {
    const oczek = poprzednie - kap[i];
    if (!near(saldo[i], oczek))
      blad(
        `Rata nr ${raty[i].nr ?? i + 1}: saldo (${formatKwotaPL(saldo[i])}) ≠ poprzednie saldo − kapitał (${formatKwotaPL(oczek)})`,
      );
    poprzednie = saldo[i];
  }

  // 7) terminy rosnące, pierwszy = data_pierwszej_raty
  if (h.data_pierwszej_raty && raty[0]?.termin !== h.data_pierwszej_raty)
    blad(
      `Termin pierwszej raty (${raty[0]?.termin}) ≠ data_pierwszej_raty (${h.data_pierwszej_raty})`,
    );
  for (let i = 1; i < raty.length; i++) {
    const a = parseDataPl(raty[i - 1].termin);
    const b = parseDataPl(raty[i].termin);
    if (!Number.isNaN(a) && !Number.isNaN(b) && !(b > a))
      blad(
        `Terminy rat nie rosną: rata ${raty[i - 1].nr ?? i} (${raty[i - 1].termin}) ≥ rata ${raty[i].nr ?? i + 1} (${raty[i].termin})`,
      );
  }

  // 8) harmonogram balonowy: ostatnia rata = kwota_raty_koncowej
  if (h.typ === "balonowy" && h.kwota_raty_koncowej) {
    const koncowa = parseKwota(h.kwota_raty_koncowej.cyframi);
    if (!Number.isNaN(koncowa) && !near(razem[razem.length - 1], koncowa))
      blad(
        `Rata końcowa harmonogramu (${formatKwotaPL(razem[razem.length - 1])}) ≠ kwota_raty_koncowej (${formatKwotaPL(koncowa)})`,
      );
  }

  return P;
}
