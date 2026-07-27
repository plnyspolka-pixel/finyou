import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_blog",
  title: "Search Finance You blog",
  description:
    "Wyszukuje opublikowane artykuły na blogu Finance You po tytule lub fragmencie treści. Zwraca tytuł, slug, audience i URL.",
  inputSchema: {
    query: z.string().min(2).describe("Fraza do wyszukania w tytule/treści."),
    limit: z.number().int().min(1).max(20).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("ai_seo_articles")
      .select("title, slug, audience, published_at")
      .eq("status", "published")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .order("published_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const results = (data ?? []).map(
      (r: {
        title: string;
        slug: string;
        audience: string | null;
        published_at: string | null;
      }) => ({
        ...r,
        url: `https://financeyou.pl/blog/${r.slug}`,
      }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      structuredContent: { results },
    };
  },
});
