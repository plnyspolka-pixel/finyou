import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/investor-agreements/finance-you-investor.server", () => ({
  isFinanceYouInvestorUser: vi.fn(async (userId: string) => userId === "fy-user"),
}));

import {
  assertInvestorOffersOpenFor,
  investorOffersPausedFor,
} from "./investor-offers-pause.server";

describe("wstrzymanie ofert — tylko inwestorzy zewnętrzni", () => {
  it("Finance You jako inwestor działa jak dotąd", async () => {
    expect(await investorOffersPausedFor("fy-user")).toBe(false);
    await expect(assertInvestorOffersOpenFor("fy-user")).resolves.toBeUndefined();
  });

  it("inwestor zewnętrzny i brak użytkownika — wstrzymane", async () => {
    expect(await investorOffersPausedFor("external-user")).toBe(true);
    expect(await investorOffersPausedFor(null)).toBe(true);
    await expect(assertInvestorOffersOpenFor("external-user")).rejects.toThrow(/wstrzymane/);
  });
});
