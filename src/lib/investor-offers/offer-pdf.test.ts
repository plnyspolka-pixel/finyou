import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildEngineSchedule } from "@/lib/contract-engine/loan-schedule";
import { buildOfferPdf, offerPdfFilename, parseOfferSchedule } from "./offer-pdf";

const DATE = new Date(Date.UTC(2026, 9, 14, 10, 0, 0));

describe("offer-pdf", () => {
  it("czyta harmonogram z oferty (idx/date/rata) i z silnika (nr/termin/rata_razem)", () => {
    expect(parseOfferSchedule(null)).toBeNull();
    expect(parseOfferSchedule([])).toBeNull();
    const rows = parseOfferSchedule([
      { idx: 1, date: "2026-11-15", rata: 100, kapital: 50, odsetki: 30, prowizja: 20, saldo: 950 },
      {
        nr: 2,
        termin: "15.12.2026",
        rata_razem: 100,
        kapital: 50,
        odsetki: 30,
        prowizja: 20,
        saldo: 900,
      },
    ]);
    expect(rows?.map((r) => [r.idx, r.date, r.rata])).toEqual([
      [1, "2026-11-15", 100],
      [2, "15.12.2026", 100],
    ]);
  });

  it("składa wielostronicowy PDF z harmonogramem 36 rat i balonem", async () => {
    const eng = buildEngineSchedule({
      kwotaPozyczki: 40000,
      prowizja: 22600,
      annualRatePercent: 14.5,
      months: 36,
      maxMonthlyPayment: 1111.11,
      firstPaymentDate: "2026-11-15",
      asOf: DATE,
    });
    expect(eng.errors).toEqual([]);
    const bytes = await buildOfferPdf({
      clientLabel: "Zażółć Gęślą",
      preparedFor: "Łukasz Żółkiewski",
      amount: 40000,
      months: 36,
      annualRate: 14.5,
      commission: 22600,
      monthlyPayment: eng.rows[0].rata_razem,
      balloon: eng.balloon,
      totalToRepay: eng.totalToRepay,
      schedule: parseOfferSchedule(eng.rows),
      note: "Uwaga inwestora",
      reference: "ABCD1234",
      generatedAt: DATE,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toBe("Propozycja finansowania");
    expect(offerPdfFilename({ amount: 40000, generatedAt: DATE })).toBe(
      "propozycja-finansowania-40000-zl-2026-10-14.pdf",
    );
  });
});
