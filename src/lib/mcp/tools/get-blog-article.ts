import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { publicClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "get_blog_article",
  title: "Get blog article",
  description: "Zwraca pełną treść (markdown) opublikowanego artykułu bloga Finance You po slugu.",
  inputSchema: { slug: z.string().min(1) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ slug }) => {
    const { data, error } = await publicClient()
      .from("ai_seo_articles")
      .select(
        "title, slug, audience, meta_description, content_md, published_at, keywords, reading_minutes",
      )
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Article not found");
    return ok({ ...data, url: `https://financeyou.pl/blog/${data.slug}` });
  },
});
