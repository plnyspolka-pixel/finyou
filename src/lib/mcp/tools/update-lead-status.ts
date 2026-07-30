import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "update_lead_status",
  title: "Update lead status",
  description:
    "Zmienia status leada (np. 'nowy', 'w_kontakcie', 'wniosek', 'zamkniety', 'wymaga_kontaktu').",
  inputSchema: {
    lead_id: z.string().uuid(),
    status: z.string().min(2),
    note: z.string().optional().describe("Opcjonalna notatka dopisana do lead.notes"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ lead_id, status, note }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const s = userClient(ctx);
    const patch: Record<string, unknown> = { status };
    if (note) {
      const { data: cur } = await s.from("leads").select("notes").eq("id", lead_id).maybeSingle();
      patch.notes = [cur?.notes, `[MCP] ${note}`].filter(Boolean).join("\n");
    }
    const { error } = await s.from("leads").update(patch).eq("id", lead_id);
    if (error) return fail(error.message);
    return ok({ ok: true });
  },
});
