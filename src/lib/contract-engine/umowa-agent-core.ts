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
import { buildEngineSchedule } from "./loan-schedule";
import { validateKwNumber } from "../kw";

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
 * wyłącznie silnik (jedno źródło prawdy w /inwestor).
 */
export function uzupelnijHarmonogram(umowa: any): void {
  const w = umowa?.warunki;
  const h = w?.harmonogram;
  if (!w || !h) return;
  if (Array.isArray(h.raty) && h.raty.length > 0) return;

  const kwota = parseKwota(w.kwota_pozyczki?.cyframi);
  const prowizja = parseKwota(w.prowizja?.kwota?.cyframi);
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
    return;

  const prow = Number.isNaN(prowizja) ? 0 : prowizja;
  const docelowa = parseKwota(h.kwota_raty_koncowej_docelowa?.cyframi);
  const zCelem = typ === "balonowy" && !Number.isNaN(docelowa) && docelowa > 0;
  let cap: number;
  if (typ === "balonowy") {
    const pulap = parseKwota(h.kwota_raty?.cyframi);
    if (Number.isNaN(pulap) || pulap <= 0) return; // balon wymaga pułapu raty
    cap = pulap;
  } else if (typ === "rowne_raty") {
    const r = oprocentowanie / 100 / 12;
    const annuity = r > 0 ? (kwota * r) / (1 - Math.pow(1 + r, -liczbaRat)) : kwota / liczbaRat;
    cap = Math.ceil((annuity + prow / liczbaRat) * 100) / 100;
  } else {
    return; // typ "malejace" — bez autouzupełnienia
  }

  const eng = buildEngineSchedule({
    kwotaPozyczki: kwota,
    prowizja: prow,
    annualRatePercent: oprocentowanie,
    months: liczbaRat,
    maxMonthlyPayment: cap,
    firstPaymentDate: pierwsza,
    targetFinalPayment: zCelem ? docelowa : null,
  });
  if (eng.rows.length === 0) return;
  if (zCelem) {
    if (eng.targetError) return; // walidator zgłosi niespójność (R29)
    // Silnik dobrał prowizję pod docelową ratę końcową — prowizja w §2 musi
    // być sumą prowizji z harmonogramu (kwotę słownie doliczy uzupelnijSlownie).
    w.prowizja = {
      ...(w.prowizja ?? {}),
      kwota: { cyframi: formatKwotaPL(eng.prowizja), slownie: "" },
    };
  }

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
    const dzien = Number(pierwsza.slice(0, 2));
    h.dzien_miesiaca = Math.min(28, Math.max(1, Number.isFinite(dzien) ? dzien : 1));
  }
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

/** Pełne uzupełnienie + autonaprawa + walidacja szkicu umowy. */
export function przetworzSzkic(umowa: any): {
  umowa: any;
  problemy: Problem[];
  autokorekty: KorektaGroszowa[];
} {
  uzupelnijIdNieruchomosci(umowa);
  const problemyKw = normalizujNumeryKw(umowa);
  uzupelnijHarmonogram(umowa);
  uzupelnijSlownie(umowa);
  const autokorekty = umowa?.warunki ? autonaprawHarmonogram(umowa.warunki) : [];
  let problemy: Problem[] = [];
  try {
    problemy = [...problemyKw, ...waliduj(umowa), ...walidujHarmonogram(umowa?.warunki ?? {})];
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
