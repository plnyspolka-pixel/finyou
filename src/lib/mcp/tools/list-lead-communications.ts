import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_lead_communications",
  title: "List lead communications",
  description:
    "Zwraca historię komunikacji (SMS, email, messenger, telefon) dla konkretnego leada.",
  inputSchema: {
    lead_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("lead_communications")
      .select("id, channel, direction, status, subject, content, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true })
      .limit(limit ?? 50);
    if (error) return fail(error.message);
    return ok({ messages: data ?? [] });
  },
});
