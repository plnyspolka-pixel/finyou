import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail, isAdmin } from "../_helpers";

export default defineTool({
  name: "get_platform_stats",
  title: "Get platform stats",
  description:
    "Skrócone statystyki Finance You: liczba leadów, wniosków, klientów, inwestorów (tylko admin/operator).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_i, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!(await isAdmin(ctx))) return fail("Wymagane uprawnienia administrator/operator");
    const s = userClient(ctx);
    const [leads, apps, clients, investors, articles] = await Promise.all([
      s.from("leads").select("id", { count: "exact", head: true }),
      s.from("loan_applications").select("id", { count: "exact", head: true }),
      s.from("clients").select("id", { count: "exact", head: true }),
      s.from("investors").select("id", { count: "exact", head: true }),
      s
        .from("ai_seo_articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    ]);
    return ok({
      leads: leads.count ?? 0,
      loan_applications: apps.count ?? 0,
      clients: clients.count ?? 0,
      investors: investors.count ?? 0,
      published_articles: articles.count ?? 0,
    });
  },
});
