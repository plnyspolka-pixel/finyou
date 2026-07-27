import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function callAI(apiKey: string, model: string, system: string, user: string, tools?: any) {
  const body: any = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (tools) {
    body.tools = tools;
    body.tool_choice = { type: "function", function: { name: tools[0].function.name } };
  }
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
  if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
  if (!res.ok) throw new Error(`AI gateway: ${res.status}`);
  return res.json();
}

// 1. Generate topics pipeline
export const planSeoTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        seed: z.string().min(3).max(500),
        count: z.number().min(3).max(20).default(8),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak LOVABLE_API_KEY");
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("ai_growth_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    const model = settings?.default_model ?? "google/gemini-2.5-flash";
    const brand = settings?.brand_name ?? "Finance You";

    const tools = [
      {
        type: "function",
        function: {
          name: "plan_topics",
          description: "Propozycje tematów blogowych pod SEO",
          parameters: {
            type: "object",
            properties: {
              topics: {
                type: "array",
                minItems: data.count,
                maxItems: data.count,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    primary_keyword: { type: "string" },
                    secondary_keywords: { type: "array", items: { type: "string" } },
                    search_intent: {
                      type: "string",
                      enum: ["informational", "commercial", "transactional", "navigational"],
                    },
                    difficulty: { type: "integer", minimum: 1, maximum: 100 },
                    priority: { type: "integer", minimum: 1, maximum: 100 },
                    notes: { type: "string" },
                  },
                  required: ["title", "primary_keyword", "search_intent", "priority"],
                  additionalProperties: false,
                },
              },
            },
            required: ["topics"],
            additionalProperties: false,
          },
        },
      },
    ];

    const json: any = await callAI(
      apiKey,
      model,
      `Jesteś strategiem SEO dla ${brand} (pożyczki pod zastaw nieruchomości w PL). Proponuj realistyczne tematy z polskim językiem, długim ogonem, mieszanką intencji (info+commercial). Priorytet 1-100, gdzie 100 = najwyższy potencjał konwersji.`,
      `Zaplanuj ${data.count} tematów blogowych pod hasło/obszar: ${data.seed}`,
      tools,
    );
    const args = JSON.parse(json.choices[0].message.tool_calls[0].function.arguments);
    const rows = args.topics.map((t: any) => ({
      title: t.title,
      primary_keyword: t.primary_keyword,
      secondary_keywords: t.secondary_keywords ?? [],
      search_intent: t.search_intent,
      difficulty: t.difficulty ?? null,
      priority: t.priority,
      notes: t.notes ?? null,
      created_by: userId,
    }));
    const { data: inserted, error } = await supabase.from("ai_seo_topics").insert(rows).select();
    if (error) throw new Error(error.message);
    await supabase.from("ai_growth_action_log").insert({
      module: "seo_content_engine",
      action: "plan_topics",
      status: "ok",
      summary: `Zaplanowano ${rows.length} tematów`,
      payload: { seed: data.seed },
      actor: userId,
    });
    return { topics: inserted };
  });

// 2. Generate article from topic
export const generateSeoArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        topicId: z.string().uuid(),
        autoPublish: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak LOVABLE_API_KEY");
    const { supabase, userId } = context;
    const { data: topic } = await supabase
      .from("ai_seo_topics")
      .select("*")
      .eq("id", data.topicId)
      .maybeSingle();
    if (!topic) throw new Error("Nie ma takiego tematu");
    const { data: settings } = await supabase
      .from("ai_growth_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    const model = settings?.default_model ?? "google/gemini-2.5-flash";
    const brand = settings?.brand_name ?? "Finance You";
    const ctaUrl = settings?.primary_cta_url ?? "https://app.financeyou.pl/embed/wniosek";

    await supabase.from("ai_seo_topics").update({ status: "generating" }).eq("id", topic.id);

    const tools = [
      {
        type: "function",
        function: {
          name: "write_article",
          description: "Pełny artykuł SEO w markdown",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "max 65 znaków, atrakcyjny H1" },
              meta_title: { type: "string", description: "max 60 znaków" },
              meta_description: {
                type: "string",
                description: "max 160 znaków, z keywordem i CTA",
              },
              excerpt: { type: "string", description: "1-2 zdania zajawki" },
              content_md: {
                type: "string",
                description: "Treść w markdown: 800-1500 słów, H2/H3, listy, FAQ na końcu",
              },
              keywords: { type: "array", items: { type: "string" } },
            },
            required: ["title", "meta_title", "meta_description", "excerpt", "content_md"],
            additionalProperties: false,
          },
        },
      },
    ];

    const json: any = await callAI(
      apiKey,
      model,
      `Jesteś senior copywriterem SEO dla ${brand}. Piszesz po polsku, naturalnie, bez "AI-słów", konkretnie. Używaj nagłówków H2/H3, list, krótkich akapitów. Naturalnie umieść słowo kluczowe (3-6 razy). NIE wymyślaj liczb statystycznych — używaj ogólnych sformułowań. NA KOŃCU artykułu dodaj sekcję "FAQ" z 4-6 Q&A oraz CTA: linkuj słowem "[złóż wniosek online](${ctaUrl})".`,
      `Napisz artykuł SEO:
Temat (H1 punkt wyjścia): ${topic.title}
Słowo kluczowe główne: ${topic.primary_keyword}
Słowa kluczowe drugorzędne: ${(topic.secondary_keywords ?? []).join(", ") || "(brak)"}
Intencja: ${topic.search_intent}
Dodatkowe notatki: ${topic.notes ?? "brak"}`,
      tools,
    );
    const a = JSON.parse(json.choices[0].message.tool_calls[0].function.arguments);

    let slug = slugify(a.title);
    let suffix = 0;
    while (true) {
      const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
      const { data: ex } = await supabase
        .from("ai_seo_articles")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!ex) {
        slug = candidate;
        break;
      }
      suffix++;
      if (suffix > 50) throw new Error("Nie mogę nadać unikalnego slug");
    }

    const wordCount = (a.content_md.match(/\S+/g) ?? []).length;
    const status = data.autoPublish ? "published" : "draft";
    const { data: article, error } = await supabase
      .from("ai_seo_articles")
      .insert({
        topic_id: topic.id,
        slug,
        title: a.title,
        meta_title: a.meta_title,
        meta_description: a.meta_description,
        excerpt: a.excerpt,
        content_md: a.content_md,
        keywords: a.keywords ?? [],
        primary_keyword: topic.primary_keyword,
        word_count: wordCount,
        reading_minutes: Math.max(1, Math.round(wordCount / 200)),
        status,
        cta_url: ctaUrl,
        source: "ai_autopilot",
        raw_ai_output: a,
        created_by: userId,
        published_at: status === "published" ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("ai_seo_topics")
      .update({
        status: status === "published" ? "published" : "generated",
        article_id: article.id,
      })
      .eq("id", topic.id);
    await supabase.from("ai_growth_action_log").insert({
      module: "seo_content_engine",
      action: status === "published" ? "generate_and_publish" : "generate_article",
      status: "ok",
      summary: `Artykuł: ${a.title}`,
      payload: { article_id: article.id, slug },
      actor: userId,
    });
    return { article };
  });

export const setArticleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = { status: data.status };
    if (data.status === "published") patch.published_at = new Date().toISOString();
    const { error } = await supabase.from("ai_seo_articles").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("ai_growth_action_log").insert({
      module: "seo_content_engine",
      action: `status_${data.status}`,
      status: "ok",
      summary: `Status artykułu → ${data.status}`,
      payload: { article_id: data.id },
      actor: userId,
    });
    return { ok: true };
  });

export const deleteSeoArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ai_seo_articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSeoTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ai_seo_topics").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
