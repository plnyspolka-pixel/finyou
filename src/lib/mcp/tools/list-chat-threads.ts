import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_chat_threads",
  title: "List chat threads",
  description: "Wątki czatu (klient ↔ inwestor) — filtry po loan_application_id lub investor_id.",
  inputSchema: {
    loan_application_id: z.string().uuid().optional(),
    investor_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ loan_application_id, investor_id, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("chat_threads")
      .select("id, loan_application_id, investor_id, client_id, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 25);
    if (loan_application_id) q = q.eq("loan_application_id", loan_application_id);
    if (investor_id) q = q.eq("investor_id", investor_id);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ threads: data ?? [] });
  },
});
