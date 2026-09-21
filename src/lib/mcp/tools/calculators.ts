// Kalkulatory czyste (bez bazy): harmonogram spłat, LTV.
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, ok } from "../_helpers";

const round2 = (v: number) => Math.round(v * 100) / 100;

export const calculateRepaymentSchedule = defineTool({
  name: "calculate_repayment_schedule",
  title: "Calculate repayment schedule",
  description:
    "Harmonogram spłat pożyczki: raty równe (annuitetowe), malejące albo odsetkowe z balonem kapitału na końcu. Zwraca listę rat (kapitał, odsetki, saldo), sumę odsetek, koszt całkowity, opcjonalnie prowizję. Czysta matematyka, bez bazy.",
  inputSchema: {
    amount: z.number().positive().describe("Kwota pożyczki w PLN."),
    period_months: z.number().int().min(1).max(360),
    yearly_rate_pct: z.number().min(0).max(100).describe("Roczne oprocentowanie w %."),
    type: z
      .enum(["equal", "decreasing", "balloon"])
      .default("equal")
      .describe(
        "equal = raty równe, decreasing = malejące, balloon = same odsetki + kapitał na końcu.",
      ),
    commission_pct: z
      .number()
      .min(0)
      .max(30)
      .optional()
      .describe("Prowizja w % kwoty (doliczana do kosztu)."),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(360)
      .optional()
      .describe("Ile rat zwrócić w liście (domyślnie wszystkie, maks. 360)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ amount, period_months, yearly_rate_pct, type, commission_pct, max_rows }) => {
    const r = yearly_rate_pct / 100 / 12;
    const rows: Array<{
      month: number;
      payment: number;
      interest: number;
      principal: number;
      balance: number;
    }> = [];
    let balance = amount;
    let totalInterest = 0;
    if (type === "equal") {
      const payment =
        r === 0 ? amount / period_months : (amount * r) / (1 - Math.pow(1 + r, -period_months));
      for (let m = 1; m <= period_months; m += 1) {
        const interest = balance * r;
        const principal = m === period_months ? balance : payment - interest;
        balance = Math.max(0, balance - principal);
        totalInterest += interest;
        rows.push({
          month: m,
          payment: round2(principal + interest),
          interest: round2(interest),
          principal: round2(principal),
          balance: round2(balance),
        });
      }
    } else if (type === "decreasing") {
      const principal = amount / period_months;
      for (let m = 1; m <= period_months; m += 1) {
        const interest = balance * r;
        balance = Math.max(0, balance - principal);
        totalInterest += interest;
        rows.push({
          month: m,
          payment: round2(principal + interest),
          interest: round2(interest),
          principal: round2(principal),
          balance: round2(balance),
        });
      }
    } else {
      for (let m = 1; m <= period_months; m += 1) {
        const interest = amount * r;
        const principal = m === period_months ? amount : 0;
        balance = m === period_months ? 0 : amount;
        totalInterest += interest;
        rows.push({
          month: m,
          payment: round2(principal + interest),
          interest: round2(interest),
          principal: round2(principal),
          balance: round2(balance),
        });
      }
    }
    const commission = commission_pct ? (amount * commission_pct) / 100 : 0;
    if (rows.length === 0) return fail("Pusty harmonogram.");
    return ok({
      type,
      amount,
      period_months,
      yearly_rate_pct,
      first_payment: rows[0].payment,
      last_payment: rows[rows.length - 1].payment,
      max_payment: round2(Math.max(...rows.map((x) => x.payment))),
      total_interest: round2(totalInterest),
      commission: round2(commission),
      total_cost: round2(totalInterest + commission),
      total_to_repay: round2(amount + totalInterest),
      schedule: rows.slice(0, max_rows ?? rows.length),
      schedule_truncated: max_rows !== undefined && max_rows < rows.length,
    });
  },
});

export const calculateLtv = defineTool({
  name: "calculate_ltv",
  title: "Calculate LTV",
  description:
    "LTV (loan-to-value) dla zabezpieczenia hipotecznego: kwota pożyczki (plus istniejące obciążenia) do wartości nieruchomości. Zwraca LTV w %, orientacyjny przedział i maksymalną kwotę przy zadanym limicie LTV. Czysta matematyka.",
  inputSchema: {
    loan_amount: z.number().positive().describe("Wnioskowana kwota pożyczki (PLN)."),
    property_value: z.number().positive().describe("Wartość nieruchomości (PLN)."),
    existing_encumbrances: z
      .number()
      .min(0)
      .default(0)
      .describe("Istniejące hipoteki / obciążenia (PLN)."),
    max_ltv_pct: z
      .number()
      .min(1)
      .max(100)
      .default(60)
      .describe("Limit LTV do wyliczenia maks. kwoty (domyślnie 60%)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ loan_amount, property_value, existing_encumbrances, max_ltv_pct }) => {
    const exposure = loan_amount + existing_encumbrances;
    const ltv = (exposure / property_value) * 100;
    const band =
      ltv <= 40 ? "niskie" : ltv <= 60 ? "umiarkowane" : ltv <= 75 ? "podwyższone" : "wysokie";
    const maxLoan = Math.max(0, (property_value * max_ltv_pct) / 100 - existing_encumbrances);
    return ok({
      ltv_pct: round2(ltv),
      band,
      exposure,
      property_value,
      max_ltv_pct,
      max_loan_at_limit: round2(maxLoan),
      headroom: round2(maxLoan - loan_amount),
      within_limit: ltv <= max_ltv_pct,
    });
  },
});

export const calculatorTools = [calculateRepaymentSchedule, calculateLtv];
