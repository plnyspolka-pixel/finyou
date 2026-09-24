/**
 * Zaokrąglenia rat balonowych i docelowa rata końcowa.
 *
 * Przypadek z produkcji: pułap 900 zł, 36 rat, 25 000 zł, 14,5% — przy
 * prowizji dzielonej równo (P / N) rata końcowa wychodziła 25 899,88 zł
 * zamiast 25 900,00 zł. Z `targetFinalPayment` silnik dobiera prowizję do
 * grosza; różnice groszowe zawsze trafiają do ostatniej raty.
 */
import { describe, expect, it } from "vitest";
import { buildEngineSchedule } from "./loan-schedule";
import { przetworzSzkic } from "./umowa-agent-core";
import { walidujHarmonogram } from "./schedule";
import { przypadekA } from "./fixtures/komplet-przypadki";

const bazowe = {
  kwotaPozyczki: 25_000,
  annualRatePercent: 14.5,
  months: 36,
  maxMonthlyPayment: 900,
  firstPaymentDate: "24.10.2026",
};

describe("docelowa rata końcowa (kwota_raty_koncowej_docelowa)", () => {
  it("bez celu: prowizja dzielona równo daje groszową różnicę w racie końcowej", () => {
    const s = buildEngineSchedule({ ...bazowe, prowizja: 21_525 });
    expect(s.rows.at(-1)!.rata_razem).toBe(25_899.88);
  });

  it("z celem 25 900,00: prowizja 21 525,12, raty 1–35 = 900,00, rata 36 = 25 900,00", () => {
    const s = buildEngineSchedule({ ...bazowe, prowizja: 0, targetFinalPayment: 25_900 });
    expect(s.targetError).toBeNull();
    expect(s.prowizja).toBe(21_525.12);
    expect(s.rows).toHaveLength(36);
    for (const r of s.rows.slice(0, -1)) {
      expect(r.rata_razem).toBe(900);
      expect(r.kapital).toBe(0);
    }
    const ost = s.rows.at(-1)!;
    expect(ost.rata_razem).toBe(25_900);
    expect(ost.kapital).toBe(25_000);
    expect(ost.saldo).toBe(0);
  });

  it("cel nieosiągalny co do grosza równym podziałem — reszta w prowizji ostatniej raty", () => {
    const s = buildEngineSchedule({
      kwotaPozyczki: 10_000,
      annualRatePercent: 13.3,
      months: 12,
      maxMonthlyPayment: 1_000,
      prowizja: 0,
      targetFinalPayment: 5_000.01,
      firstPaymentDate: "01.01.2027",
    });
    expect(s.targetError).toBeNull();
    expect(s.rows.at(-1)!.rata_razem).toBe(5_000.01);
    const regularne = s.rows.slice(0, -1);
    // raty regularne mają jedną, wspólną prowizję; różnica siedzi w ostatniej
    expect(new Set(regularne.map((r) => r.prowizja)).size).toBe(1);
    for (const r of regularne) expect(r.rata_razem).toBeLessThanOrEqual(1_000);
    const suma = regularne.reduce((a, r) => a + r.prowizja, 0) + s.rows.at(-1)!.prowizja;
    expect(Math.round(suma * 100) / 100).toBe(s.prowizja);
  });

  it("cel powyżej zasięgu pułapu → targetError, bez cichego zgadywania", () => {
    const s = buildEngineSchedule({ ...bazowe, prowizja: 0, targetFinalPayment: 40_000 });
    expect(s.targetError).toMatch(/przekracza ratę osiągalną/);
  });

  it("cel poniżej raty końcowej bez prowizji → targetError", () => {
    // pułap 400 zł spłaca ok. 100 zł kapitału miesięcznie — balon > 20 000 zł nawet bez prowizji
    const s = buildEngineSchedule({
      ...bazowe,
      maxMonthlyPayment: 400,
      prowizja: 0,
      targetFinalPayment: 10_000,
    });
    expect(s.targetError).toMatch(/niższa niż rata końcowa bez prowizji/);
  });

  it("szkic umowy: silnik nadpisuje prowizję w §2 i harmonogram przechodzi walidację", () => {
    const { umowa, problemy } = przetworzSzkic(przypadekA());
    expect(problemy.filter((p) => p.poziom === "BLAD")).toEqual([]);
    expect(umowa.warunki.prowizja.kwota.cyframi).toBe("21 525,12");
    expect(umowa.warunki.prowizja.kwota.slownie).toBe(
      "dwadzieścia jeden tysięcy pięćset dwadzieścia pięć złotych 12/100",
    );
    expect(umowa.warunki.harmonogram.raty.at(-1).rata_razem).toBe("25 900,00");
    expect(umowa.warunki.harmonogram.kwota_raty_koncowej.cyframi).toBe("25 900,00");
    expect(walidujHarmonogram(umowa.warunki)).toEqual([]);
  });

  it("walidator: ostatnia rata różna od docelowej → BLAD (R29)", () => {
    const { umowa } = przetworzSzkic(przypadekA());
    umowa.warunki.harmonogram.kwota_raty_koncowej_docelowa = { cyframi: "25 901,00", slownie: "x" };
    const { problemy } = przetworzSzkic(umowa);
    expect(
      problemy.some((p) => p.poziom === "BLAD" && /docelowej raty końcowej/.test(p.komunikat)),
    ).toBe(true);
  });
});

describe("normalizacja numeru KW w szkicu umowy (draft_contract / kreator / agent)", () => {
  it("KR1P/610770/2 → KR1P/00610770/2", () => {
    const { umowa, problemy } = przetworzSzkic(przypadekA());
    expect(umowa.nieruchomosci[0].nr_kw).toBe("KR1P/00610770/2");
    expect(problemy.some((p) => p.sciezka.endsWith("nr_kw"))).toBe(false);
  });

  it("błędna cyfra kontrolna → BLAD z oczekiwaną cyfrą, numer znormalizowany", () => {
    const d = przypadekA();
    d.nieruchomosci[0].nr_kw = "KR1P/610770/3";
    const { umowa, problemy } = przetworzSzkic(d);
    expect(umowa.nieruchomosci[0].nr_kw).toBe("KR1P/00610770/3");
    const p = problemy.find((x) => x.sciezka === "nieruchomosci[0].nr_kw");
    expect(p?.poziom).toBe("BLAD");
    expect(p?.komunikat).toContain("powinna być 2");
  });
});
