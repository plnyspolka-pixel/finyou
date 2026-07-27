import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "get_application",
  title: "Get loan application",
  description: "Zwraca pełne dane wniosku pożyczkowego wraz z listą ofert od inwestorów.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const s = userClient(ctx);
    const { data: app, error } = await s
      .from("loan_applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!app) return fail("Application not found");
    const { data: offers } = await s
      .from("investor_offers")
      .select(
        "id, investor_id, offer_status, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, created_at",
      )
      .eq("loan_application_id", id);
    return ok({ application: app, offers: offers ?? [] });
  },
});
