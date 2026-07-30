import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_blog_topics",
  title: "List blog topics",
  description: "Kolejka tematów SEO dla bloga Finance You (planowane / w trakcie / gotowe).",
  inputSchema: {
    status: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("ai_seo_topics")
      .select("id, title, primary_keyword, status, priority, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ topics: data ?? [] });
  },
});
