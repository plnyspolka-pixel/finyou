import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, ok, fail, isAdmin } from "../_helpers";

export default defineTool({
  name: "read_inbox_thread",
  title: "Read inbox thread",
  description:
    "Cała historia korespondencji z jedną osobą (klientem lub inwestorem) ze wszystkich kanałów, chronologicznie: e-maile, Messenger/Instagram, czat, SMS, notatki z rozmów. Zwraca też dane leada (kto, e-mail, telefon, typ, status). `lead_id` bierz z `list_inbox_threads` albo `get_updates_since`. Tylko administrator/operator.",
  inputSchema: {
    lead_id: z.string().uuid().describe("Id leada (uuid)."),
    channel: z
      .enum(["email", "messenger", "chat", "chat_inwestor", "sms", "whatsapp"])
      .optional()
      .describe("Filtr kanału (opcjonalnie)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Ile ostatnich wiadomości (domyślnie 60)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id, channel, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!(await isAdmin(ctx))) return fail("Wymagane uprawnienia administrator/operator");
    try {
      const { readCommsThread } = await import("@/lib/comms-agent.server");
      const result = await readCommsThread({ leadId: lead_id, channel, limit: limit ?? 60 });
      if (!result.lead && result.messages.length === 0) {
        return fail("Nie znaleziono leada ani korespondencji o tym id.");
      }
      return ok({
        lead: result.lead ? { ...result.lead, url: `/operator/leady/${result.lead.id}` } : null,
        messages: result.messages,
      });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
});
