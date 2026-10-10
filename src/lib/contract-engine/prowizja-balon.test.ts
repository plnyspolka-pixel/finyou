/**
 * Pkt 5 i 6 zlecenia „przypadki graniczne": prowizja inwestora częściowo
 * w racie końcowej (balonowej), tryby kalkulatora i ostrzeżenia kosztowe.
 * Wniosek słupski: 50 000 / 36 / 14,5% / rata 1 388,89 / prowizja 41 250
 * z 13 000 w balonie → 35 × 1 388,89 + 64 388,97 = 113 000,12.
 */
import { describe, expect, it } from "vitest";
import fx from "./fixtures/scenariusz_01_podstawowy.json";
import { buildEngineSchedule } from "./loan-schedule";
import { przetworzSzkic, scalPatch } from "./umowa-agent-core";
import { tekstKompletu } from "./komplet";
import { formatujRaty } from "./schedule";
import { obliczHarmonogramKalkulatora, prowizjaZCeluZarobku } from "../mcp/tools/calculators";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PARAM = {
  kwotaPozyczki: 50_000,
  prowizja: 41_250,
  prowizjaWRacieKoncowej: 13_000,
  annualRatePercent: 14.5,
  months: 36,
  maxMonthlyPayment: 1_388.89,
  firstPaymentDate: "10.11.2026",
  asOf: "2026-10-10",
};

function umowaSlupsk(amortyzacja?: "nadwyzka_raty" | "w_balonie"): any {
  const u = structuredClone(fx as any);
  delete u.warunki.harmonogram.kwota_raty_koncowej;
  return scalPatch(u, {
    meta: { data_umowy: "10.10.2026", miejscowosc: "Słupsk" },
    warunki: {
      kwota_pozyczki: { cyframi: "50 000,00", slownie: "" },
      prowizja: {
        kwota: { cyframi: "41 250,00", slownie: "" },
        model: "nie_potracana_raty",
        w_racie_koncowej: { cyframi: "13 000,00", slownie: "" },
      },
      oprocentowanie: "14,5",
      harmonogram: {
        liczba_rat: 36,
        typ: "balonowy",
        data_pierwszej_raty: "10.11.2026",
        dzien_miesiaca: 10,
        kwota_raty: { cyframi: "1 388,89", slownie: "" },
        ...(amortyzacja ? { amortyzacja_kapitalu: amortyzacja } : {}),
      },
    },
  });
}

describe("silnik: prowizja częściowo w racie końcowej", () => {
  for (const amortyzacjaKapitalu of ["nadwyzka_raty", "w_balonie"] as const) {
    it(`${amortyzacjaKapitalu}: 35 × 1 388,89 + 64 388,97 = 113 000,12`, () => {
      const e = buildEngineSchedule({ ...PARAM, amortyzacjaKapitalu });
      expect(e.errors).toEqual([]);
      expect(e.rows).toHaveLength(36);
      expect(e.rows.slice(0, 35).every((r) => r.rata_razem === 1_388.89)).toBe(true);
      expect(e.rows.slice(0, 35).every((r) => r.kapital === 0)).toBe(true);
      const last = e.rows[35];
      expect(last.rata_razem).toBe(64_388.97);
      expect(last.prowizja).toBe(13_784.8);
      expect(last.kapital).toBe(50_000);
      expect(e.totalToRepay).toBe(113_000.12);
      expect(e.prowizjaInwestora).toBe(41_250);
      expect(e.prowizjaWRacieKoncowej).toBe(13_000);
      expect(e.prowizjaRatalna).toBe(28_250);
    });
  }

  it("nadwyzka_raty kieruje nadwyżkę pułapu w kapitał, w_balonie — nie", () => {
    const p = { ...PARAM, maxMonthlyPayment: 1_500 };
    const a = buildEngineSchedule({ ...p, amortyzacjaKapitalu: "nadwyzka_raty" });
    const b = buildEngineSchedule({ ...p, amortyzacjaKapitalu: "w_balonie" });
    expect(a.rows[0].kapital).toBeGreaterThan(0);
    expect(b.rows[0].kapital).toBe(0);
    expect(b.rows[0].rata_razem).toBe(1_388.89);
  });

  it("część w racie końcowej większa niż prowizja → błąd", () => {
    const e = buildEngineSchedule({ ...PARAM, prowizjaWRacieKoncowej: 50_000 });
    expect(e.errors.join(" ")).toMatch(/przekracza łączną prowizję/);
  });
});

describe("kalkulator i silnik umów liczą identycznie (kryterium 3)", () => {
  for (const amortyzacja of ["nadwyzka_raty", "w_balonie"] as const) {
    it(amortyzacja, () => {
      const kalk = obliczHarmonogramKalkulatora({
        amount: 50_000,
        period_months: 36,
        yearly_rate_pct: 14.5,
        max_payment: 1_388.89,
        investor_commission_pln: 41_250,
        investor_commission_balloon_pln: 13_000,
        amortyzacja_kapitalu: amortyzacja,
        include_fy_commission: false,
        first_payment_date: "10.11.2026",
      });
      expect(kalk.ok).toBe(true);
      if (!kalk.ok) return;
      const { umowa } = przetworzSzkic(umowaSlupsk(amortyzacja));
      const zKalk = formatujRaty(
        (kalk.wynik.schedule as any[]).map((r) => ({
          nr: r.month,
          termin: r.date,
          kapital: r.principal,
          odsetki: r.interest,
          prowizja: r.investor_commission,
          rata_razem: r.payment,
          saldo: r.balance,
        })),
      );
      expect(umowa.warunki.harmonogram.raty).toEqual(zKalk);
      expect(umowa.warunki.harmonogram.kwota_raty_koncowej.cyframi).toBe("64 388,97");
    });
  }
});

describe("umowa: § 2 ust. 2, Załącznik nr 1 i nr 2", () => {
  const { umowa, problemy } = przetworzSzkic(umowaSlupsk());
  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  const tekst = tekstKompletu(umowa);

  it("bez błędów blokujących", () => expect(bledy).toEqual([]));
  it("§ 2 ust. 2 opisuje rozbicie prowizji", () => {
    expect(tekst).toContain(
      "rozkłada ją na raty zgodnie z Załącznikiem nr 1, w tym: 28 250,00 zł w 36 ratach miesięcznych oraz 13 000,00 zł płatne wraz z ratą końcową (balonową).",
    );
    expect(tekst).not.toContain("rozkłada ją na raty miesięczne zgodnie z Załącznikiem nr 1.");
  });
  it("Załącznik nr 1: wiersz prowizji z rozbiciem i rata końcowa", () => {
    expect(tekst).toContain(
      "41 250,00 zł (płatna w ratach zgodnie z tabelą rat, w tym 28 250,00 zł w 36 ratach miesięcznych oraz 13 000,00 zł płatne wraz z ratą końcową (balonową))",
    );
    expect(tekst).toContain("64 388,97");
    expect(tekst).toContain("113 000,12");
  });
  it("Załącznik nr 2: prowizja finalna z częścią w racie końcowej", () => {
    expect(tekst).toContain("41 250,00 zł (w tym 13 000,00 zł płatne z ratą końcową)");
  });
  it("miejscowość w mianowniku odmieniona do miejscownika", () => {
    expect(umowa.meta.miejscowosc).toBe("Słupsku");
  });
});

describe("tryb celu zarobku i skalowanie", () => {
  it("3,5 % miesięcznie: prowizja 41 250, w racie końcowej 13 000", () => {
    const c = prowizjaZCeluZarobku({
      amount: 50_000,
      period_months: 36,
      yearly_rate_pct: 14.5,
      target_monthly_yield_pct: 3.5,
      max_payment: 1_388.89,
    });
    expect(c).toEqual({ prowizja: 41_250, wRacieKoncowej: 13_000, odsetki: 21_750, cel: 63_000 });
  });

  it("kalkulator w trybie celu zwraca gotową łatkę do draft_contract", () => {
    const r = obliczHarmonogramKalkulatora({
      amount: 50_000,
      period_months: 36,
      yearly_rate_pct: 14.5,
      max_payment: 1_388.89,
      target_monthly_yield_pct: 3.5,
      include_fy_commission: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wynik.do_splaty).toBe(113_000.12);
    expect(r.wynik.draft_contract_patch).toMatchObject({
      warunki: {
        prowizja: {
          kwota: { cyframi: "41 250,00" },
          w_racie_koncowej: { cyframi: "13 000,00" },
        },
        harmonogram: { kwota_raty: { cyframi: "1 388,89" }, amortyzacja_kapitalu: "w_balonie" },
      },
    });
  });

  it("scale_from: rata i prowizje × nowa/stara kwota", () => {
    const r = obliczHarmonogramKalkulatora({
      amount: 100_000,
      period_months: 36,
      yearly_rate_pct: 14.5,
      amortyzacja_kapitalu: "w_balonie",
      include_fy_commission: false,
      scale_from: {
        amount: 50_000,
        max_payment: 1_388.89,
        investor_commission_pln: 41_250,
        investor_commission_balloon_pln: 13_000,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wynik.prowizja_inwestora).toBe(82_500);
    expect(r.wynik.prowizja_w_racie_koncowej).toBe(26_000);
  });
});

describe("ostrzeżenia kosztowe (pkt 6) nie blokują (kryterium 4)", () => {
  it("prowizja ponad próg, ryzyko art. 359 § 2² / 388 k.c., świeża JDG", () => {
    const u = umowaSlupsk();
    u.pozyczkobiorca.data_rozpoczecia_dzialalnosci = "07.10.2026";
    u.warunki.prowizja_finance_you = { kwota: { cyframi: "5 000,00", slownie: "" } };
    const { problemy } = przetworzSzkic(u);
    const koszty = problemy.filter((p) => p.sciezka === "warunki.koszty");
    expect(koszty.every((p) => p.poziom === "OSTRZEZENIE")).toBe(true);
    const t = koszty.map((p) => p.komunikat).join("\n");
    expect(t).toMatch(/powyżej progu .*= 40,0 %/);
    expect(t).toMatch(/w skali roku/);
    expect(t).toMatch(/art\. 359 § 2² k\.c\..*art\. 388 k\.c\./s);
    expect(t).toMatch(/założona 3 dni przed datą umowy/);
    expect(problemy.some((p) => p.poziom === "BLAD")).toBe(false);
  });

  it("kalkulator dołącza te same ostrzeżenia", () => {
    const r = obliczHarmonogramKalkulatora({
      amount: 50_000,
      period_months: 36,
      yearly_rate_pct: 14.5,
      max_payment: 1_388.89,
      investor_commission_pln: 41_250,
      investor_commission_balloon_pln: 13_000,
      contract_date: "10.10.2026",
      business_start_date: "07.10.2026",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.wynik.ostrzezenia as string[]).join("\n")).toMatch(/powyżej progu/);
  });
});
