import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "search_leads",
  title: "Search leads",
  description:
    "Wyszukuje leady po imieniu/nazwisku, emailu lub telefonie. Zwraca do 25 wyników posortowanych najnowsze na górze.",
  inputSchema: {
    query: z.string().min(2).describe("Fraza szukana w first_name, last_name, email, phone_raw"),
    limit: z.number().int().min(1).max(25).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const s = userClient(ctx);
    const q = query.replace(/[%_]/g, "");
    const { data, error } = await s
      .from("leads")
      .select("id, first_name, last_name, email, phone_raw, status, type, source, created_at")
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone_raw.ilike.%${q}%`,
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 15);
    if (error) return fail(error.message);
    return ok({ results: data ?? [] });
  },
});
