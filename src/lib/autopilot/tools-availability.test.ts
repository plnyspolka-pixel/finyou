import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ published: true }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { published: state.published } }) }) }) }) } }));
vi.mock("./state.server", () => ({ logAutopilot: vi.fn() }));
import { getPublicTool } from "./tools.server";
import { STARTER_CALCULATORS } from "./calculators";
import { runCalculator } from "./calculator-engine";

describe("public calculator availability", () => {
  it("retired installment calculator is unavailable", async () => {
    expect(await getPublicTool("kalkulator-raty")).toBeNull();
    expect(STARTER_CALCULATORS.map((c) => c.slug)).toEqual(["ile-pod-nieruchomosc", "kalkulator-ltv"]);
  });
  it("unpublished tools are unavailable", async () => {
    state.published = false;
    expect(await getPublicTool("ile-pod-nieruchomosc")).toBeNull();
    state.published = true;
  });
  it("borrower sees all four outputs without signup", () => {
    const cfg = STARTER_CALCULATORS.find((c) => c.slug === "ile-pod-nieruchomosc");
    if (!cfg) throw new Error("Missing calculator");
    const result = runCalculator(cfg, { property_value: 1000000 });
    expect(result.visible).toHaveLength(4);
    expect(result.gated).toEqual([]);
  });
  it("investor retains two gated outputs until unlocked", () => {
    const cfg = STARTER_CALCULATORS.find((c) => c.slug === "kalkulator-ltv");
    if (!cfg) throw new Error("Missing calculator");
    const input = { property_value: 1000000, loan_amount: 400000 };
    expect(runCalculator(cfg, input).gated).toHaveLength(2);
    expect(runCalculator(cfg, input, { unlocked: true }).visible).toHaveLength(4);
  });
});