import { describe, it, expect } from "vitest";
import { applicationAmountFromSearch } from "./application-amount";
describe("application amount", () => {
  it("prefills the requested 500 000 zł and rejects invalid URL values", () => {
    expect(applicationAmountFromSearch("500000")).toBe(500000);
    expect(applicationAmountFromSearch("not-a-number")).toBeUndefined();
    expect(applicationAmountFromSearch("1000001")).toBeUndefined();
  });
});