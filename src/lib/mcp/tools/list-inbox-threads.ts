import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, ok, fail, isAdmin } from "../_helpers";

export default defineTool({
  name: "list_inbox_threads",
  title: "List inbox threads",
  description:
    "Skrzynka zespołu Finance You: wątki korespondencji z klientami i inwestorami (e-mail, Messenger/Instagram, czat na stronie, czat inwestora, SMS, WhatsApp), najświeższe pierwsze — jeden wątek = jedna osoba, niezależnie od kanału. `only_awaiting_reply` zwraca tylko wątki, w których ostatnie słowo ma klient. Zwraca `lead_id` potrzebny do `read_inbox_thread`. Tylko administrator/operator.",
  inputSchema: {
    channel: z
      .enum(["email", "messenger", "chat", "chat_inwestor", "sms", "whatsapp"])
      .optional()
      .describe("Filtr kanału. Pomiń, by dostać wszystkie."),
    query: z
      .string()
      .min(2)
      .optional()
      .describe("Fraza: imię, nazwisko, e-mail, telefon albo treść wiadomości."),
    only_awaiting_reply: z
      .boolean()
      .optional()
      .describe("Tylko wątki czekające na odpowiedź zespołu (domyślnie false)."),
    days: z.number().int().min(1).max(365).optional().describe("Ile dni wstecz (domyślnie 30)."),
    limit: z.number().int().min(1).max(60).optional().describe("Ile wątków (domyślnie 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ channel, query, only_awaiting_reply, days, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!(await isAdmin(ctx))) return fail("Wymagane uprawnienia administrator/operator");
    try {
      const { listCommsThreads } = await import("@/lib/comms-agent.server");
      const result = await listCommsThreads({
        channel,
        query,
        onlyAwaitingReply: only_awaiting_reply === true,
        days: days ?? 30,
        limit: limit ?? 25,
      });
      return ok({
        threads: result.threads.map((t) => ({
          ...t,
          url: t.lead_id ? `/operator/leady/${t.lead_id}` : "/operator/skrzynka",
        })),
        scanned: result.scanned,
      });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
});
