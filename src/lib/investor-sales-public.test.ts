import { describe, it, expect } from "vitest";
import { publicCase } from "./investor-sales-public";
describe("public investor proof", () => {
  it("projects only safe fields, rounds to 5 000 and removes city, KW and identity", () => {
    const result = publicCase({ project_ref: "FY-P-12", status: "teaser", created_at: "2026-10-25", teaser: { loan_amount: 113000, period_months: 36, property_type: "mieszkanie", voivodeship: "lubelskie", city: "Puławy", kw: "SECRET", client_name: "Person" } }, new Date("2026-10-26").getTime());
    expect(result?.amount).toBe(115000);
    expect(result?.daysAgo).toBe(1);
    expect(Object.keys(result ?? {}).sort()).toEqual(["amount", "daysAgo", "months", "propertyType", "ref", "status", "voivodeship"].sort());
  });
});