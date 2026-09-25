import { describe, expect, it } from "vitest";
import {
  accountingTools,
  aging,
  buildInvoiceLines,
  periodRange,
  summarizeVat,
  vatPct,
} from "./accounting";

describe("vatPct", () => {
  it("zw i 0 to zero, reszta procent", () => {
    expect(vatPct("zw")).toBe(0);
    expect(vatPct("0")).toBe(0);
    expect(vatPct("23")).toBe(23);
    expect(() => vatPct("abc")).toThrow(/stawka/);
  });
});

describe("buildInvoiceLines", () => {
  it("liczy od netto", () => {
    const r = buildInvoiceLines([{ name: "Usługa", quantity: 2, unit_net: 100 }], "23");
    expect(r).toMatchObject({ net_amount: 200, vat_amount: 46, gross_amount: 246, vat_rate: "23" });
    expect(r.items).toEqual([
      { name: "Usługa", quantity: 2, unit: "szt.", unitNet: 100, vatRate: "23", net: 200, vat: 46 },
    ]);
  });

  it("liczy od brutto — brutto dokładne", () => {
    const r = buildInvoiceLines([{ name: "Dostęp", unit_gross: 99 }], "23");
    expect(r.gross_amount).toBe(99);
    expect(r.net_amount).toBe(80.49);
    expect(r.vat_amount).toBe(18.51);
  });

  it("mieszane stawki i zwolnienie", () => {
    const r = buildInvoiceLines(
      [
        { name: "A", unit_net: 100, vat_rate: "8" },
        { name: "B", unit_net: 50, vat_rate: "zw" },
      ],
      "23",
    );
    expect(r).toMatchObject({ net_amount: 150, vat_amount: 8, gross_amount: 158, vat_rate: "mix" });
  });

  it("wymaga dokładnie jednej ceny i dodatniej ilości", () => {
    expect(() => buildInvoiceLines([{ name: "X" }], "23")).toThrow(/unit_net albo unit_gross/);
    expect(() => buildInvoiceLines([{ name: "X", unit_net: 1, unit_gross: 1 }], "23")).toThrow();
    expect(() => buildInvoiceLines([{ name: "X", unit_net: 1, quantity: 0 }], "23")).toThrow(
      /ilość/,
    );
    expect(() => buildInvoiceLines([], "23")).toThrow(/pozycję/);
  });
});

describe("periodRange", () => {
  it("miesiąc, grudzień, kwartał, rok", () => {
    expect(periodRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-03-01" });
    expect(periodRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(periodRange("2026-Q3")).toEqual({ from: "2026-07-01", to: "2026-10-01" });
    expect(periodRange("2026-Q4")).toEqual({ from: "2026-10-01", to: "2027-01-01" });
    expect(periodRange("2026")).toEqual({ from: "2026-01-01", to: "2027-01-01" });
    expect(() => periodRange("2026-13")).toThrow();
    expect(() => periodRange("wrzesień")).toThrow();
  });
});

describe("aging", () => {
  it("koszyki wiekowania", () => {
    expect(aging(null, "2026-09-25")).toEqual({ days_overdue: null, bucket: "no_due_date" });
    expect(aging("2026-09-30", "2026-09-25").bucket).toBe("not_due");
    expect(aging("2026-09-25", "2026-09-25").bucket).toBe("not_due");
    expect(aging("2026-09-01", "2026-09-25")).toEqual({ days_overdue: 24, bucket: "1-30" });
    expect(aging("2026-08-01", "2026-09-25").bucket).toBe("31-60");
    expect(aging("2026-07-01", "2026-09-25").bucket).toBe("61-90");
    expect(aging("2026-01-01", "2026-09-25").bucket).toBe("90+");
  });
});

describe("summarizeVat", () => {
  it("sumuje po kierunku i stawce, liczy VAT do zapłaty", () => {
    const r = summarizeVat([
      { direction: "sales", vat_rate: "23", net_amount: 1000, vat_amount: 230, gross_amount: 1230 },
      {
        direction: "sales",
        vat_rate: "8",
        net_amount: "100",
        vat_amount: "8",
        gross_amount: "108",
      },
      { direction: "purchase", vat_rate: "23", net_amount: 200, vat_amount: 46, gross_amount: 246 },
    ]);
    expect(r.sales).toEqual({ count: 2, net: 1100, vat: 238, gross: 1338 });
    expect(r.purchase).toEqual({ count: 1, net: 200, vat: 46, gross: 246 });
    expect(r.sales_by_rate["8"]).toEqual({ count: 1, net: 100, vat: 8, gross: 108 });
    expect(r.vat_due).toBe(192);
  });
});

describe("accounting tools", () => {
  it("mają unikalne nazwy", () => {
    const names = accountingTools.map((t: any) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("wymagają logowania", async () => {
    const ctx = { isAuthenticated: () => false } as any;
    for (const t of accountingTools as any[]) {
      const r = await t.handler({ invoice_id: "00000000-0000-0000-0000-000000000000" }, ctx);
      expect(r.isError).toBe(true);
    }
  });
});
