import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_applications",
  title: "List loan applications",
  description:
    "Zwraca wnioski pożyczkowe widoczne dla użytkownika (klient widzi swoje, admin/operator widzi wszystkie).",
  inputSchema: {
    status: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("loan_applications")
      .select(
        "id, client_id, status, loan_amount, preferred_period_months, current_form_step, completeness_percent, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ applications: data ?? [] });
  },
});
