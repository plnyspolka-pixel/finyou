import { describe, it, expect } from "vitest";
import { kalkulacjaDoSzkicu, wyglądaJakKalkulacja } from "./calc-to-umowa";
import type { LoanCalcPayload } from "../loan-calc-pdf";

const payload: LoanCalcPayload = {
  v: 1,
  generatedAt: "2026-09-27 10:00:00",
  onHand: 50_000,
  nominal: 55_000,
  months: 3,
  annualRate: 12,
  commissionPct: 10,
  commissionPln: 5_000,
  financeYouFeePct: 3,
  financeYouFeePln: 1_500,
  monthlyPayment: 2_000,
  balloon: 52_000,
  totalInterest: 1_650,
  totalCost: 8_150,
  totalToRepay: 56_000,
  mortgageAmount: 112_000,
  art777Amount: 112_000,
  agreementDate: "01.10.2026",
  clientName: "Jan Kowalski",
  schedule: [
    { idx: 1, date: "01.11.2026", rata: 2_000, kap: 1_000, ods: 550, prow: 450, saldo: 54_000 },
    { idx: 2, date: "01.12.2026", rata: 2_000, kap: 1_000, ods: 550, prow: 450, saldo: 53_000 },
    { idx: 3, date: "01.01.2027", rata: 52_000, kap: 53_000, ods: 550, prow: 450, saldo: 0 },
  ],
};

describe("kalkulacjaDoSzkicu", () => {
  it("przepisuje warunki finansowe i harmonogram deterministycznie", () => {
    const p = kalkulacjaDoSzkicu(payload);
    expect(p.warunki.kwota_pozyczki.cyframi).toBe("55 000,00");
    // prowizja inwestora (w ratach) i prowizja Finance You (potrącana) osobno
    expect(p.warunki.prowizja.kwota.cyframi).toBe("5 000,00");
    expect(p.warunki.prowizja_finance_you.kwota.cyframi).toBe("1 500,00");
    expect(p.warunki.prowizja.model).toBe("nie_potracana_raty");
    expect(p.warunki.oprocentowanie).toBe("12,0");
    expect(p.warunki.harmonogram.liczba_rat).toBe(3);
    expect(p.warunki.harmonogram.typ).toBe("balonowy");
    expect(p.warunki.harmonogram.data_pierwszej_raty).toBe("01.11.2026");
    expect(p.warunki.harmonogram.dzien_miesiaca).toBe(1);
    expect(p.warunki.harmonogram.raty).toHaveLength(3);
    expect(p.warunki.harmonogram.raty[0].termin).toBe("01.11.2026");
    expect(p.warunki.harmonogram.kwota_raty_koncowej.cyframi).toBe("52 000,00");
  });

  it("wpisuje datę umowy i kwotę z art. 777 z datą graniczną ostatniej raty", () => {
    const p = kalkulacjaDoSzkicu(payload);
    expect(p.meta.data_umowy).toBe("01.10.2026");
    expect(p.zabezpieczenia.egzekucja_777.kwota.cyframi).toBe("112 000,00");
    expect(p.zabezpieczenia.egzekucja_777.data_graniczna).toBe("01.01.2027");
    expect(p.zabezpieczenia.egzekucja_777.poddaje_sie).toEqual(["pozyczkobiorca"]);
  });

  it("bez harmonogramu i bez balonu daje równe raty i pomija puste pola", () => {
    const p = kalkulacjaDoSzkicu({
      ...payload,
      schedule: [],
      balloon: 0,
      agreementDate: undefined,
    });
    expect(p.warunki.harmonogram.typ).toBe("rowne_raty");
    expect(p.warunki.harmonogram.liczba_rat).toBe(3);
    expect(p.warunki.harmonogram.raty).toBeUndefined();
    expect(p.warunki.harmonogram.data_pierwszej_raty).toBeUndefined();
    expect(p.meta).toBeUndefined();
  });

  it("rozpoznaje payload kalkulatora", () => {
    expect(wyglądaJakKalkulacja(payload)).toBe(true);
    expect(wyglądaJakKalkulacja({ schedule: "x" })).toBe(false);
    expect(wyglądaJakKalkulacja(null)).toBe(false);
  });
});
