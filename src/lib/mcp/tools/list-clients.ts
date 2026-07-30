import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description:
    "Zwraca listę klientów Finance You (dostęp wg RLS: administrator/operator widzą wszystkich).",
  inputSchema: {
    query: z.string().optional().describe("Fraza szukana w imieniu/emailu/telefonie"),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("clients")
      .select("id, first_name, last_name, email, phone, city, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (query) {
      const s2 = query.replace(/[%_]/g, "");
      q = q.or(
        `first_name.ilike.%${s2}%,last_name.ilike.%${s2}%,email.ilike.%${s2}%,phone.ilike.%${s2}%`,
      );
    }
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ clients: data ?? [] });
  },
});
