import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_training_videos",
  title: "List training videos",
  description: "Katalog szkoleń wideo Finance You (dla inwestorów/pośredników).",
  inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("training_videos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (error) return fail(error.message);
    return ok({ videos: data ?? [] });
  },
});
