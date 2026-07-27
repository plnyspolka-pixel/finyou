import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { publicClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_landing_pages",
  title: "List landing pages",
  description:
    "Publikowane landing page'e Finance You (slug, tytuł, hero image, statystyki wizyt/konwersji).",
  inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ limit }) => {
    const { data, error } = await publicClient()
      .from("landing_pages")
      .select(
        "id, slug, title, headline, meta_description, hero_image_url, view_count, conversion_count, created_at",
      )
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (error) return fail(error.message);
    const rows = (data ?? []).map((r) => ({ ...r, url: `https://financeyou.pl/l/${r.slug}` }));
    return ok({ landing_pages: rows });
  },
});
