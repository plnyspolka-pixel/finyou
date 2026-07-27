import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_investors",
  title: "List investors",
  description: "Lista inwestorów zarejestrowanych na platformie Finance You.",
  inputSchema: {
    subscription_status: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ subscription_status, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("investors")
      .select(
        "id, first_name, last_name, email, investor_type, company_name, subscription_plan, subscription_status, is_active, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (subscription_status) q = q.eq("subscription_status", subscription_status);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ investors: data ?? [] });
  },
});
