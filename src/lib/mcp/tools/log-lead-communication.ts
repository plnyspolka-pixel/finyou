import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "log_lead_communication",
  title: "Log lead communication",
  description:
    "Dodaje wpis w historii komunikacji leada (np. notatka z rozmowy, wysłany email, wiadomość SMS).",
  inputSchema: {
    lead_id: z.string().uuid(),
    channel: z.enum(["phone", "sms", "email", "messenger", "instagram", "other"]),
    direction: z.enum(["inbound", "outbound"]),
    subject: z.string().optional(),
    content: z.string().min(1),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("lead_communications")
      .insert({
        lead_id: input.lead_id,
        channel: input.channel,
        direction: input.direction,
        subject: input.subject ?? null,
        content: input.content,
        status: "sent",
        created_by: ctx.getUserId(),
      })
      .select("id")
      .single();
    if (error) return fail(error.message);
    return ok({ ok: true, id: data.id });
  },
});
