/**
 * Silnik harmonogramu po sprzątaniu 2026-09: stała prowizja inwestora (bez
 * dobierania pod ratę końcową), Prowizja Finance You potrącana z wypłaty,
 * twarda blokada odsetek maksymalnych i pułapu raty jako BŁĘDY.
 *
 * Przypadek z produkcji: pułap 900 zł, 36 rat, 25 000 zł, 14,5 %, prowizja
 * inwestora 21 525,12 zł → raty 1–35 po 900,00 zł (same odsetki + prowizja),
 * rata 36 = 25 900,00 zł (kapitał + pułap).
 */
import { describe, expect, it } from "vitest";
import { buildEngineSchedule, buildFyEngineSchedule } from "./loan-schedule";
import { przetworzSzkic } from "./umowa-agent-core";
import { walidujHarmonogram } from "./schedule";
import { przypadekA } from "./fixtures/komplet-przypadki";

const bazowe = {
  kwotaPozyczki: 25_000,
  annualRatePercent: 14.5,
  months: 36,
  maxMonthlyPayment: 900,
  firstPaymentDate: "24.10.2026",
  asOf: "2026-09-29",
};

describe("stała prowizja inwestora w ratach", () => {
  it("21 525,12: raty 1–35 = 900,00, rata 36 = 25 900,00, bez błędów", () => {
    const s = buildEngineSchedule({ ...bazowe, prowizja: 21_525.12 });
    expect(s.errors).toEqual([]);
    expect(s.prowizjaInwestora).toBe(21_525.12);
    expect(s.rows).toHaveLength(36);
    for (const r of s.rows.slice(0, -1)) {
      expect(r.rata_razem).toBe(900);
      expect(r.kapital).toBe(0);
    }
    const ost = s.rows.at(-1)!;
    expect(ost.rata_razem).toBe(25_900);
    expect(ost.kapital).toBe(25_000);
    expect(ost.saldo).toBe(0);
    expect(s.balloon).toBe(25_900);
  });

  it("silnik nie ma już trybu docelowej raty końcowej (pole ignorowane)", () => {
    const s = buildEngineSchedule({ ...bazowe, prowizja: 0, targetFinalPayment: 25_900 } as any);
    expect("targetError" in s).toBe(false);
    expect(s.prowizjaInwestora).toBe(0);
  });

  it("pułap niepokrywający odsetek + prowizji → BŁĄD blokujący (nie ostrzeżenie)", () => {
    const s = buildEngineSchedule({ ...bazowe, maxMonthlyPayment: 300, prowizja: 21_525.12 });
    expect(s.errors.some((e) => /Pułap raty nie pokrywa/.test(e))).toBe(true);
    expect(s.warnings).toEqual([]);
    expect(s.rows).toHaveLength(36); // podgląd nadal liczony
  });
});

describe("prowizja Finance You potrącana z wypłaty", () => {
  it("100 000 zł: 5 000 zł do FY, 95 000 zł na rękę, raty od pełnej Kwoty Udzielonej", () => {
    const s = buildFyEngineSchedule({
      kwotaPozyczki: 100_000,
      prowizja: 0,
      annualRatePercent: 14.5,
      months: 12,
      maxMonthlyPayment: 1_500,
      asOf: "2026-09-29",
    });
    expect(s.kwotaUdzielona).toBe(100_000);
    expect(s.prowizjaFY).toBe(5_000);
    expect(s.kwotaWyplaconaKlientowi).toBe(95_000);
    // prowizja FY NIE wchodzi do rat
    expect(s.rows.reduce((a, r) => a + r.prowizja, 0)).toBe(0);
    expect(s.rows.reduce((a, r) => a + r.kapital, 0)).toBeCloseTo(100_000, 2);
    expect(s.calkowityKoszt).toBe(Math.round((s.totalInterest + 5_000) * 100) / 100);
    expect(s.totalToRepay).toBeCloseTo(100_000 + s.totalInterest, 2);
  });

  it("minimum 5 000 zł: 50 000 zł → 5 000 zł do FY, 45 000 zł na rękę", () => {
    const s = buildFyEngineSchedule({
      kwotaPozyczki: 50_000,
      prowizja: 0,
      annualRatePercent: 10,
      months: 6,
      maxMonthlyPayment: 10_000,
    });
    expect(s.prowizjaFY).toBe(5_000);
    expect(s.kwotaWyplaconaKlientowi).toBe(45_000);
  });

  it("koszt całkowity = odsetki + prowizja inwestora + prowizja FY", () => {
    const s = buildEngineSchedule({
      ...bazowe,
      prowizja: 1_200,
      prowizjaFY: 5_000,
      maxMonthlyPayment: 1_000,
    });
    expect(s.errors).toEqual([]);
    expect(s.calkowityKoszt).toBe(
      Math.round((s.totalInterest + s.prowizjaInwestora + 5_000) * 100) / 100,
    );
    expect(s.prowizjaInwestora).toBe(1_200);
  });
});

describe("blokada odsetek maksymalnych", () => {
  it("14,6 % w 2026-09 → błąd „Oprocentowanie przekracza odsetki maksymalne (14,5%)”", () => {
    const s = buildEngineSchedule({ ...bazowe, prowizja: 0, annualRatePercent: 14.6 });
    expect(s.errors).toContain("Oprocentowanie przekracza odsetki maksymalne (14,5%)");
  });

  it("14,5 % przechodzi; 15 % przechodziło przed 5.03.2026", () => {
    expect(buildEngineSchedule({ ...bazowe, prowizja: 0 }).errors).toEqual([]);
    expect(
      buildEngineSchedule({ ...bazowe, prowizja: 0, annualRatePercent: 15, asOf: "2026-01-15" })
        .errors,
    ).toEqual([]);
    expect(
      buildEngineSchedule({ ...bazowe, prowizja: 0, annualRatePercent: 15, asOf: "2026-03-05" })
        .errors,
    ).toHaveLength(1);
  });

  it("szkic umowy: stopa 15,0 % → BLAD walidatora na warunki.oprocentowanie", () => {
    const d = przypadekA();
    d.warunki.oprocentowanie = "15,0";
    d.meta.data_umowy = "29.09.2026";
    const { problemy } = przetworzSzkic(d);
    expect(
      problemy.some(
        (p) =>
          p.poziom === "BLAD" &&
          p.sciezka === "warunki.oprocentowanie" &&
          /odsetki maksymalne/.test(p.komunikat),
      ),
    ).toBe(true);
  });
});

describe("szkic umowy (przypadek A)", () => {
  it("silnik liczy harmonogram ze stałej prowizji; walidacja bez błędów", () => {
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

  it("pułap raty za niski w szkicu → BLAD blokujący z silnika", () => {
    const d = przypadekA();
    d.warunki.harmonogram.kwota_raty = { cyframi: "300,00" };
    const { problemy } = przetworzSzkic(d);
    expect(
      problemy.some((p) => p.poziom === "BLAD" && /Pułap raty nie pokrywa/.test(p.komunikat)),
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
