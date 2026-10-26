import { describe, it, expect } from "vitest";
import { cleanInvestorPrompt } from "./investor-prompt-policy";
describe("investor prompt policy", () => {
  it("removes old price, return thresholds and callbacks while preserving account protections", () => {
    const cleaned = cleanInvestorPrompt("30% realne\n50% trudne\n1 500 zł miesięcznie\nUmów rozmowę\nschedule_investor_callback\nNie pokazuj danych innych inwestorów");
    expect(cleaned).toBe("Nie pokazuj danych innych inwestorów");
  });
});