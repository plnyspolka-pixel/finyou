import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ok, fail } from "../_helpers";

/**
 * Prosta rata równa (annuity) – bez zapisu do DB.
 * rate roczne w %, okres w miesiącach.
 */
export default defineTool({
  name: "calculate_loan_installment",
  title: "Calculate loan installment",
  description:
    "Kalkulator raty równej pożyczki Finance You. Zwraca miesięczną ratę i całkowity koszt na podstawie kwoty, okresu i oprocentowania.",
  inputSchema: {
    amount: z.number().positive().describe("Kwota pożyczki w PLN"),
    period_months: z.number().int().min(1).max(120),
    yearly_rate_pct: z.number().min(0).max(100).describe("Roczne oprocentowanie w %"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ amount, period_months, yearly_rate_pct }) => {
    if (period_months <= 0) return fail("period_months must be > 0");
    const r = yearly_rate_pct / 100 / 12;
    const installment =
      r === 0 ? amount / period_months : (amount * r) / (1 - Math.pow(1 + r, -period_months));
    const total = installment * period_months;
    return ok({
      amount,
      period_months,
      yearly_rate_pct,
      monthly_installment: Math.round(installment * 100) / 100,
      total_repayment: Math.round(total * 100) / 100,
      total_interest: Math.round((total - amount) * 100) / 100,
    });
  },
});
