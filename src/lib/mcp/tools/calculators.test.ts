/**
 * Kalkulatory MCP zwracają zawsze ten sam zestaw pól z jednego silnika
 * i blokują oprocentowanie ponad odsetki maksymalne.
 */
import { describe, expect, it } from "vitest";
import { engineSummary } from "./calculators";

describe("engineSummary (MCP)", () => {
  it("zwraca kwotę udzieloną, prowizję FY, na rękę, ratę, balon, do spłaty i koszt", () => {
    const r = engineSummary({ amount: 100_000, period_months: 24, yearly_rate_pct: 12 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.summary;
    expect(s.kwota_udzielona).toBe(100_000);
    expect(s.prowizja_fy).toBe(5_000);
    expect(s.kwota_na_reke).toBe(95_000);
    expect(s.prowizja_fy_opis).toContain("bez VAT");
    expect(s.prowizja_fy_opis).not.toMatch(/netto|brutto/);
    for (const k of ["rata", "balon", "do_splaty", "koszt_calkowity", "odsetki_razem"] as const) {
      expect(typeof s[k]).toBe("number");
    }
    expect(s.do_splaty).toBeGreaterThan(100_000);
    expect(s.koszt_calkowity).toBeCloseTo(s.odsetki_razem + 5_000, 2);
  });

  it("stopa ponad odsetki maksymalne → błąd, bez wyniku", () => {
    const r = engineSummary({ amount: 100_000, period_months: 24, yearly_rate_pct: 25 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/odsetki maksymalne/);
  });

  it("prowizję FY można wyłączyć (np. pożyczka poza modelem)", () => {
    const r = engineSummary({
      amount: 100_000,
      period_months: 12,
      yearly_rate_pct: 10,
      include_fy_commission: false,
    });
    expect(r.ok && r.summary.prowizja_fy).toBe(0);
  });
});
