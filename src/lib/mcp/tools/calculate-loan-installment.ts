import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ok, fail } from "../_helpers";
import { engineSummary } from "./calculators";

/**
 * Rata pożyczki w modelu Finance You — ten sam silnik co pozostałe
 * kalkulatory (`buildEngineSchedule` + `fees.ts`). Bez zapisu do DB.
 */
export default defineTool({
  name: "calculate_loan_installment",
  title: "Calculate loan installment",
  description:
    "Kalkulator raty pożyczki Finance You (jeden silnik): Kwota Udzielona, prowizja Finance You (7% Kwoty Udzielonej, min 5 000 zł, bez VAT — potrącana z wypłaty), kwota na rękę, rata, balon, do spłaty i koszt całkowity. Oprocentowanie nie może przekraczać odsetek maksymalnych (art. 359 § 2¹ KC).",
  inputSchema: {
    amount: z.number().positive().describe("Kwota Udzielona (kwota pożyczki z umowy) w PLN"),
    period_months: z.number().int().min(1).max(120),
    yearly_rate_pct: z.number().min(0).max(100).describe("Roczne oprocentowanie w %"),
    max_payment: z
      .number()
      .positive()
      .optional()
      .describe("Pułap raty miesięcznej; brak = pełna amortyzacja (rata annuitetowa)."),
    investor_commission_pln: z
      .number()
      .min(0)
      .optional()
      .describe("Stała prowizja inwestora w PLN (w ratach)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({
    amount,
    period_months,
    yearly_rate_pct,
    max_payment,
    investor_commission_pln,
  }) => {
    const r = engineSummary({
      amount,
      period_months,
      yearly_rate_pct,
      max_payment,
      investor_commission_pln,
    });
    if (!r.ok) return fail(r.error);
    return ok(r.summary);
  },
});
