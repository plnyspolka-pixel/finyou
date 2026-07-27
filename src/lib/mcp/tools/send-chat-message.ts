import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "send_chat_message",
  title: "Send chat message",
  description:
    "Wysyła wiadomość do wątku czatu (klient ↔ inwestor) w imieniu zalogowanego użytkownika.",
  inputSchema: {
    thread_id: z.string().uuid(),
    body: z.string().min(1).max(4000),
    sender_role: z
      .enum(["client", "investor", "admin"])
      .describe("Rola nadawcy w kontekście wątku"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ thread_id, body, sender_role }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("chat_messages")
      .insert({
        thread_id,
        body,
        sender_role,
        sender_user_id: ctx.getUserId(),
      })
      .select("id, created_at")
      .single();
    if (error) return fail(error.message);
    return ok({ ok: true, message: data });
  },
});
