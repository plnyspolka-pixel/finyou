import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "get_property_analysis",
  title: "Get property analysis",
  description: "Zwraca analizę AI dla wskazanej nieruchomości (wycena, ryzyka, lokalizacja).",
  inputSchema: { property_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ property_id }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("property_analyses")
      .select("*")
      .eq("property_id", property_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("No analysis found");
    return ok(data);
  },
});
