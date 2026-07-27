import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_investor_offers",
  title: "List investor offers",
  description: "Zwraca oferty inwestorów – można filtrować po statusie lub konkretnym wniosku.",
  inputSchema: {
    loan_application_id: z.string().uuid().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ loan_application_id, status, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("investor_offers")
      .select(
        "id, loan_application_id, investor_id, offer_status, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, submitted_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (loan_application_id) q = q.eq("loan_application_id", loan_application_id);
    if (status) q = q.eq("offer_status", status);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ offers: data ?? [] });
  },
});
