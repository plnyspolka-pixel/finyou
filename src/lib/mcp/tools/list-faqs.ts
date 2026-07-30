import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { publicClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_faqs",
  title: "List FAQ / avatar questions",
  description:
    "Publiczna lista pytań i odpowiedzi FAQ Finance You (te same, które prezentuje awatar).",
  inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ limit }) => {
    const { data, error } = await publicClient()
      .from("avatar_faqs")
      .select("id, question, answer_text, sort_order, is_intro")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .limit(limit ?? 50);
    if (error) return fail(error.message);
    return ok({ faqs: data ?? [] });
  },
});
