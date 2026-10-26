import { describe, it, expect } from "vitest";
import { COMPLETE_APPLICATION_STATUSES, publicCase } from "./investor-sales-public";
describe("public investor proof", () => {
  it("counts complete and later stages, not leads or incomplete applications", () => {
    expect(COMPLETE_APPLICATION_STATUSES).toContain("wniosek_kompletny");
    expect(COMPLETE_APPLICATION_STATUSES).toContain("wyplacony");
    expect(COMPLETE_APPLICATION_STATUSES).not.toContain("braki_w_dokumentach");
    expect(COMPLETE_APPLICATION_STATUSES).not.toContain("nowy_lead");
    expect(COMPLETE_APPLICATION_STATUSES).not.toContain("archiwalny");
  });
  it("projects only safe fields, rounds to 5 000 and removes city, KW and identity", () => {
    const result = publicCase({ project_ref: "FY-P-12", status: "teaser", created_at: "2026-10-25", teaser: { loan_amount: 113000, period_months: 36, property_type: "mieszkanie", voivodeship: "lubelskie", city: "Puławy", kw: "SECRET", client_name: "Person" } }, new Date("2026-10-26").getTime());
    expect(result?.amount).toBe(115000);
    expect(result?.daysAgo).toBe(1);
    expect(Object.keys(result ?? {}).sort()).toEqual(["amount", "daysAgo", "months", "propertyType", "ref", "status", "voivodeship"].sort());
  });
});