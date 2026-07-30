import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_chat_messages",
  title: "List chat messages",
  description: "Wiadomości w wątku czatu (chronologicznie).",
  inputSchema: {
    thread_id: z.string().uuid(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ thread_id, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("chat_messages")
      .select("id, sender_role, body, blocked, created_at")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(limit ?? 100);
    if (error) return fail(error.message);
    return ok({ messages: data ?? [] });
  },
});
