/**
 * Walidacja harmonogramu spłat (§3.2 zlecenia).
 *
 * Silnik NIE liczy harmonogramu — kalkulator w finyou pozostaje źródłem prawdy.
 * Ten moduł go WERYFIKUJE: suma z tabeli musi zgadzać się z kwotami w §2 umowy,
 * inaczej dokument jest wewnętrznie sprzeczny. Rozbieżność ponad tolerancję to
 * błąd blokujący.
 *
 * Model finansowy jest zgodny z silnikiem (nadrzędnym wobec obecnego kalkulatora):
 *  - suma kapitału = pełna Kwota Pożyczki (prowizja NIE potrącana z wypłaty),
 *  - suma prowizji = kwota prowizji z §2 (prowizja rozłożona na raty jako
 *    ułatwienie płatnicze — klauzula KWO_02),
 *  - saldo maleje o kapitał raty, ostatnie saldo = 0,00.
 *
 * UWAGA — element zablokowany: adapter LoanCalcPayload → warunki.harmonogram.raty
 * NIE jest tu zaimplementowany, bo payload kalkulatora nie zawiera pola na
 * prowizję w racie (rozbieżność z pkt 2 zlecenia — do rozstrzygnięcia z Filipem).
 * Ten walidator działa na docelowym kształcie `raty` ze schematu silnika.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Problem } from "./validator-types";

type Dane = Record<string, any>;
export const TOLERANCJA_GROSZOWA = 0.05;

function naLiczbe(s: unknown): number {
  const v = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  if (Number.isNaN(v)) throw new Error(`Nieprawidłowa liczba: ${s}`);
  return v;
}

/** DD.MM.RRRR → porównywalna liczba (RRRRMMDD). */
function dataDoLiczby(s: string): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s));
  if (!m) throw new Error(`Nieprawidłowa data: ${s}`);
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

/**
 * Weryfikuje spójność harmonogramu z warunkami umowy.
 * Zwraca listę problemów (błędy blokujące). Pusta lista = OK.
 * Gdy tabeli rat nie ma, walidator nie ma czego sprawdzać i zwraca [].
 */
export function walidujHarmonogram(dane: Dane, tolerancja = TOLERANCJA_GROSZOWA): Problem[] {
  const P: Problem[] = [];
  const blad = (sc: string, k: string) => P.push(new Problem("BLAD", sc, k));

  const h: Dane = dane?.warunki?.harmonogram ?? {};
  const raty: Dane[] = h.raty ?? [];
  if (raty.length === 0) return P; // brak tabeli — nic do weryfikacji

  const sc = "warunki.harmonogram.raty";

  // liczba wierszy = liczba_rat
  if (typeof h.liczba_rat === "number" && raty.length !== h.liczba_rat) {
    blad(sc, `Tabela zawiera ${raty.length} wierszy, a zadeklarowano ${h.liczba_rat} rat`);
  }

  let sumaKap = 0;
  let sumaOds = 0;
  let sumaProw = 0;
  let sumaRazem = 0;
  let bledneLiczby = false;
  try {
    for (const r of raty) {
      sumaKap += naLiczbe(r.kapital);
      sumaOds += naLiczbe(r.odsetki);
      sumaProw += naLiczbe(r.prowizja);
      sumaRazem += naLiczbe(r.rata_razem);
    }
  } catch {
    bledneLiczby = true;
    blad(sc, "Harmonogram zawiera wartości, których nie da się odczytać jako kwoty");
  }

  if (!bledneLiczby) {
    // suma kapitału = Kwota Pożyczki
    try {
      const kwotaPoz = naLiczbe(dane.warunki.kwota_pozyczki.cyframi);
      if (Math.abs(sumaKap - kwotaPoz) > tolerancja) {
        blad(
          sc,
          `Suma kapitału w harmonogramie (${sumaKap.toFixed(2)}) różni się od Kwoty Pożyczki (${kwotaPoz.toFixed(2)}) o więcej niż ${tolerancja.toFixed(2)} zł`,
        );
      }
    } catch {
      /* brak kwoty pożyczki — łapie warstwa schematu */
    }

    // suma prowizji = kwota prowizji z §2
    try {
      const kwotaProw = naLiczbe(dane.warunki.prowizja.kwota.cyframi);
      if (Math.abs(sumaProw - kwotaProw) > tolerancja) {
        blad(
          sc,
          `Suma prowizji w harmonogramie (${sumaProw.toFixed(2)}) różni się od prowizji z §2 (${kwotaProw.toFixed(2)}) o więcej niż ${tolerancja.toFixed(2)} zł`,
        );
      }
    } catch {
      /* brak prowizji — łapie warstwa schematu */
    }

    // suma rata_razem = kapitał + prowizja + odsetki
    if (Math.abs(sumaRazem - (sumaKap + sumaProw + sumaOds)) > tolerancja) {
      blad(
        sc,
        `Suma rat (${sumaRazem.toFixed(2)}) nie równa się sumie kapitału, prowizji i odsetek (${(sumaKap + sumaProw + sumaOds).toFixed(2)})`,
      );
    }

    // saldo maleje monotonicznie: każde = poprzednie − kapitał; ostatnie = 0
    try {
      const kwotaPoz = naLiczbe(dane.warunki.kwota_pozyczki.cyframi);
      let poprzednieSaldo = kwotaPoz;
      raty.forEach((r, i) => {
        const saldo = naLiczbe(r.saldo);
        const oczekiwane = poprzednieSaldo - naLiczbe(r.kapital);
        if (Math.abs(saldo - oczekiwane) > tolerancja) {
          blad(
            `${sc}[${i}].saldo`,
            `Saldo raty ${i + 1} (${saldo.toFixed(2)}) nie równa się poprzedniemu saldu pomniejszonemu o kapitał (${oczekiwane.toFixed(2)})`,
          );
        }
        poprzednieSaldo = saldo;
      });
      const ostatnie = naLiczbe(raty[raty.length - 1].saldo);
      if (Math.abs(ostatnie) > tolerancja) {
        blad(`${sc}[${raty.length - 1}].saldo`, `Saldo ostatniej raty (${ostatnie.toFixed(2)}) powinno wynosić 0,00`);
      }
    } catch {
      /* brak kwoty pożyczki — pominięto sprawdzenie salda */
    }
  }

  // terminy rosnące; pierwszy = data_pierwszej_raty
  try {
    if (h.data_pierwszej_raty && raty[0].termin !== h.data_pierwszej_raty) {
      blad(`${sc}[0].termin`, `Termin pierwszej raty (${raty[0].termin}) różni się od data_pierwszej_raty (${h.data_pierwszej_raty})`);
    }
    for (let i = 1; i < raty.length; i++) {
      if (dataDoLiczby(raty[i].termin) <= dataDoLiczby(raty[i - 1].termin)) {
        blad(`${sc}[${i}].termin`, `Termin raty ${i + 1} (${raty[i].termin}) nie jest późniejszy niż raty poprzedniej (${raty[i - 1].termin})`);
      }
    }
  } catch {
    blad(sc, "Harmonogram zawiera termin, którego nie da się odczytać jako daty");
  }

  // typ balonowy: ostatnia rata = kwota_raty_koncowej
  if (h.typ === "balonowy" && h.kwota_raty_koncowej) {
    try {
      const koncowa = naLiczbe(h.kwota_raty_koncowej.cyframi);
      const ostatniaRazem = naLiczbe(raty[raty.length - 1].rata_razem);
      if (Math.abs(ostatniaRazem - koncowa) > tolerancja) {
        blad(
          `${sc}[${raty.length - 1}].rata_razem`,
          `Ostatnia rata balonowa (${ostatniaRazem.toFixed(2)}) różni się od kwota_raty_koncowej (${koncowa.toFixed(2)})`,
        );
      }
    } catch {
      /* nieczytelne kwoty — złapane wyżej */
    }
  }

  return P;
}
