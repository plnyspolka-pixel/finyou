// ════════════════════════════════════════════════════════════════════
// AGENT UMOWY — jądro deterministyczne (bez AI, bez server runtime).
//
// AI zwraca wyłącznie łatkę danych (patch) pod schemat `UmowaData`; wszystko,
// co da się policzyć, liczy kod: scalenie łatki, kwoty słownie, identyfikatory
// nieruchomości, harmonogram rat z silnika (`buildEngineSchedule`), autonaprawa
// rozjazdu groszowego i walidacja. Dzięki temu agent nie może „wyliczyć" umowy
// inaczej niż silnik — jedyne źródło prawdy w /inwestor.
// ════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */
import { amountToWordsPLN } from "../amount-to-words-pl";
import { waliduj, type Problem } from "./validator";
import {
  autonaprawHarmonogram,
  walidujHarmonogram,
  formatujRaty,
  formatKwotaPL,
  parseKwota,
  type KorektaGroszowa,
} from "./schedule";
import { buildEngineSchedule, type EngineSchedule } from "./loan-schedule";
import { validateKwNumber } from "../kw";
import { FINANCE_YOU, jestFinanceYou } from "./finance-you";
import { fyCommission } from "./fees";
import { problemyKosztowe, uzupelnijDomyslne } from "./uzupelnienia";

// ── scalanie łatki danych ────────────────────────────────────────────
/** Deep-merge łatki AI na szkic: obiekty scalane, tablice podmieniane, null czyści. */
export function scalPatch(baza: any, patch: any): any {
  if (patch === null || patch === undefined) return baza;
  if (Array.isArray(patch)) return structuredClone(patch);
  if (typeof patch !== "object") return patch;
  const out: any = baza && typeof baza === "object" && !Array.isArray(baza) ? { ...baza } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      out[k] = null;
    } else if (typeof v === "object" && !Array.isArray(v)) {
      out[k] = scalPatch(out[k], v);
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out;
}

// ── uzupełnienia deterministyczne (nie-AI) ───────────────────────────
/** Rekurencyjnie uzupełnia brakujące `slownie` przy każdej kwocie {cyframi}. */
export function uzupelnijSlownie(node: any): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const el of node) uzupelnijSlownie(el);
    return;
  }
  if (typeof node.cyframi === "string" && (!node.slownie || !String(node.slownie).trim())) {
    const v = parseKwota(node.cyframi);
    if (!Number.isNaN(v)) node.slownie = amountToWordsPLN(v) || "zero złotych 00/100";
  }
  for (const v of Object.values(node)) uzupelnijSlownie(v);
}

/** Nadaje brakujące identyfikatory nieruchomości (N1, N2, …). */
export function uzupelnijIdNieruchomosci(umowa: any): void {
  const nier: any[] = Array.isArray(umowa?.nieruchomosci) ? umowa.nieruchomosci : [];
  nier.forEach((n, i) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.id !== "string" || !/^N[0-9]+$/.test(n.id)) n.id = `N${i + 1}`;
  });
}

/**
 * Dolicza harmonogram rat silnikiem (`buildEngineSchedule`), gdy tabela `raty`
 * jest pusta, a parametry §2 są kompletne. AI nigdy nie liczy rat — to robi
 * wyłącznie silnik (jedno źródło prawdy w /inwestor). Prowizja inwestora
 * (KWO_02) jest STAŁĄ kwotą z umowy — silnik jej nie dobiera. Prowizja
 * Finance You (`warunki.prowizja_finance_you`) jest potrącana z wypłaty
 * i nie wchodzi do rat. Błędy silnika (stopa > odsetki maksymalne, pułap
 * niepokrywający odsetek + prowizji) zwraca `problemySilnika`.
 */
export function uzupelnijHarmonogram(umowa: any): void {
  const eng = policzHarmonogramSilnikiem(umowa);
  if (!eng || eng.rows.length === 0) return;
  const h = umowa.warunki.harmonogram;
  const typ = String(h.typ ?? "");

  h.raty = formatujRaty(
    eng.rows.map((r) => ({
      nr: r.nr,
      termin: r.termin,
      kapital: r.kapital,
      odsetki: r.odsetki,
      prowizja: r.prowizja,
      rata_razem: r.rata_razem,
      saldo: r.saldo,
    })),
  );
  const ostatnia = eng.rows[eng.rows.length - 1];
  if (typ === "balonowy") {
    h.kwota_raty_koncowej = { cyframi: formatKwotaPL(ostatnia.rata_razem), slownie: "" };
  }
  if (!h.kwota_raty && eng.rows.length > 1) {
    h.kwota_raty = { cyframi: formatKwotaPL(eng.rows[0].rata_razem), slownie: "" };
  }
  if (h.dzien_miesiaca == null) {
    const pierwsza = String(h.data_pierwszej_raty ?? "");
    const dzien = Number(pierwsza.slice(0, 2));
    h.dzien_miesiaca = Math.min(28, Math.max(1, Number.isFinite(dzien) ? dzien : 1));
  }
}

/**
 * Parametry §2 → wynik silnika (albo null, gdy dane niekompletne / typ
 * „malejace" bez autouzupełnienia). Używane przez uzupełnianie rat
 * i przez walidację (błędy blokujące silnika).
 */
export function policzHarmonogramSilnikiem(umowa: any): EngineSchedule | null {
  const w = umowa?.warunki;
  const h = w?.harmonogram;
  if (!w || !h) return null;

  const kwota = parseKwota(w.kwota_pozyczki?.cyframi);
  const prowizja = parseKwota(w.prowizja?.kwota?.cyframi);
  const prowizjaFY = parseKwota(w.prowizja_finance_you?.kwota?.cyframi);
  const wRacieKoncowej = parseKwota(w.prowizja?.w_racie_koncowej?.cyframi);
  const oprocentowanie = parseKwota(w.oprocentowanie);
  const liczbaRat = Number(h.liczba_rat);
  const pierwsza = String(h.data_pierwszej_raty ?? "");
  const typ = String(h.typ ?? "");
  if (
    Number.isNaN(kwota) ||
    kwota <= 0 ||
    !Number.isFinite(liczbaRat) ||
    liczbaRat <= 0 ||
    Number.isNaN(oprocentowanie) ||
    !/^\d{2}\.\d{2}\.\d{4}$/.test(pierwsza)
  )
    return null;

  const prow = Number.isNaN(prowizja) ? 0 : prowizja;
  let cap: number;
  if (typ === "balonowy") {
    const pulap = parseKwota(h.kwota_raty?.cyframi);
    if (Number.isNaN(pulap) || pulap <= 0) return null; // balon wymaga pułapu raty
    cap = pulap;
  } else if (typ === "rowne_raty") {
    const r = oprocentowanie / 100 / 12;
    const annuity = r > 0 ? (kwota * r) / (1 - Math.pow(1 + r, -liczbaRat)) : kwota / liczbaRat;
    cap = Math.ceil((annuity + prow / liczbaRat) * 100) / 100;
  } else {
    return null; // typ "malejace" — bez autouzupełnienia
  }

  return buildEngineSchedule({
    kwotaPozyczki: kwota,
    prowizja: prow,
    prowizjaFY: Number.isNaN(prowizjaFY) ? 0 : prowizjaFY,
    prowizjaWRacieKoncowej: Number.isNaN(wRacieKoncowej) ? 0 : wRacieKoncowej,
    amortyzacjaKapitalu: h.amortyzacja_kapitalu === "w_balonie" ? "w_balonie" : "nadwyzka_raty",
    annualRatePercent: oprocentowanie,
    months: liczbaRat,
    maxMonthlyPayment: cap,
    firstPaymentDate: pierwsza,
    asOf: dataUmowyLubDzis(umowa),
  });
}

/** Data umowy (meta.data_umowy, DD.MM.RRRR) → ISO; brak → dziś. */
function dataUmowyLubDzis(umowa: any): string | Date {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(umowa?.meta?.data_umowy ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : new Date();
}

/**
 * Błędy BLOKUJĄCE silnika harmonogramu (jako problemy walidacji):
 *  - pułap raty niepokrywający odsetek + prowizji inwestora,
 *  - prowizja Finance You przekraczająca Kwotę Udzieloną.
 */
export function problemySilnika(umowa: any): Problem[] {
  const out: Problem[] = [];
  const eng = policzHarmonogramSilnikiem(umowa);
  for (const e of eng?.errors ?? []) {
    // stopę > max zgłasza walidator (R29, wg daty umowy) — tu bez duplikatu
    if (/odsetki maksymalne/.test(e)) continue;
    out.push({ poziom: "BLAD", sciezka: "warunki.harmonogram", komunikat: e });
  }
  return out;
}

/**
 * Normalizacja numerów KW na wejściu: dopełnienie numeru do 8 cyfr
 * („KR1P/610770/2” → „KR1P/00610770/2”) i kontrola cyfry kontrolnej.
 * Błędny numer to brak blokujący (BLAD) — nie zgadujemy poprawnej cyfry.
 */
export function normalizujNumeryKw(umowa: any): Problem[] {
  const problemy: Problem[] = [];
  const nier: any[] = Array.isArray(umowa?.nieruchomosci) ? umowa.nieruchomosci : [];
  nier.forEach((n, i) => {
    if (!n || typeof n !== "object" || n.nr_kw == null || n.nr_kw === "") return;
    const kw = validateKwNumber(n.nr_kw);
    if (kw.ok) n.nr_kw = kw.value;
    else {
      if (kw.value) n.nr_kw = kw.value;
      problemy.push({
        poziom: "BLAD",
        sciezka: `nieruchomosci[${i}].nr_kw`,
        komunikat: kw.message,
      });
    }
  });
  return problemy;
}

/**
 * Rachunek spłaty: gdy Pożyczkodawcą jest Finance You, a rachunku nie podano,
 * wstawiamy rachunek Finance You. Podany rachunek nie jest nadpisywany.
 */
export function uzupelnijRachunekSplaty(umowa: any): void {
  if (!umowa?.warunki || !jestFinanceYou(umowa.pozyczkodawca)) return;
  const r = (umowa.warunki.rachunki ??= {});
  if (!String(r.splata ?? "").trim()) r.splata = FINANCE_YOU.rachunek;
}

/** Czy strona ma jakiekolwiek dane identyfikujące (nazwa, NIP, PESEL, KRS…). */
function stronaWskazana(strona: any): boolean {
  if (!strona || typeof strona !== "object") return false;
  return Object.values(strona).some((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * Rozliczenie z Finance You, gdy Pożyczkodawcą jest INNY podmiot niż Finance
 * You — prowizja opisana wprost w § 2 umowy pożyczki (KWO_03e):
 *  • brak `prowizja_finance_you` (pole pominięte) → wyliczamy 5% Kwoty
 *    Udzielonej, nie mniej niż 5 000 zł; jawne `null` = umowa bez prowizji FY,
 *  • rachunek Finance You do przelewu prowizji jest wpisywany ZAWSZE
 *    automatycznie — Finance You ma jeden rachunek (spłaty i prowizja).
 */
export function uzupelnijRozliczenieFinanceYou(umowa: any): void {
  const w = umowa?.warunki;
  if (!w || !stronaWskazana(umowa?.pozyczkodawca) || jestFinanceYou(umowa.pozyczkodawca)) return;
  if (w.prowizja_finance_you === undefined) {
    const kwota = parseKwota(w.kwota_pozyczki?.cyframi);
    if (!Number.isNaN(kwota) && kwota > 0) {
      w.prowizja_finance_you = {
        kwota: { cyframi: formatKwotaPL(fyCommission(kwota)), slownie: "" },
      };
    }
  }
  if (w.prowizja_finance_you) {
    const r = (w.rachunki ??= {});
    r.finance_you = FINANCE_YOU.rachunek;
  }
}

/** Pełne uzupełnienie + autonaprawa + walidacja szkicu umowy. */
export function przetworzSzkic(umowa: any): {
  umowa: any;
  problemy: Problem[];
  autokorekty: KorektaGroszowa[];
} {
  uzupelnijIdNieruchomosci(umowa);
  const problemyKw = normalizujNumeryKw(umowa);
  uzupelnijRachunekSplaty(umowa);
  uzupelnijRozliczenieFinanceYou(umowa);
  uzupelnijHarmonogram(umowa);
  // Wartości domyślne (pkt 7): termin wezwania 777, data graniczna, kwota
  // hipoteki ↔ 777, miejscownik miejscowości, sąd z kodu wydziału KW.
  const domyslne = uzupelnijDomyslne(umowa);
  uzupelnijSlownie(umowa);
  const autokorekty = [
    ...domyslne.autokorekty,
    ...(umowa?.warunki ? autonaprawHarmonogram(umowa.warunki) : []),
  ];
  let problemy: Problem[] = [];
  try {
    problemy = [
      ...problemyKw,
      ...waliduj(umowa),
      ...walidujHarmonogram(umowa?.warunki ?? {}),
      ...problemySilnika(umowa),
      ...domyslne.problemy,
      // Ostrzeżenia kosztowe (pkt 6) — zawsze OSTRZEZENIE, nigdy nie blokują.
      ...problemyKosztowe(umowa),
    ];
  } catch (e: any) {
    problemy = [
      {
        poziom: "BLAD",
        sciezka: "(walidacja)",
        komunikat: `Walidacja nie powiodła się: ${e?.message ?? e}`,
      },
    ];
  }
  return { umowa, problemy, autokorekty };
}
