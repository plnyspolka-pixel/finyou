import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_marketing_materials",
  title: "List marketing materials",
  description: "Lista materiałów marketingowych dostępnych dla pośredników/inwestorów.",
  inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("marketing_materials")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return fail(error.message);
    return ok({ materials: data ?? [] });
  },
});
