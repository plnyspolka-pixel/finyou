import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sectionSchema = z.object({
  kind: z.enum(["benefits", "how_it_works", "social_proof", "faq", "cta"]),
  heading: z.string(),
  body: z.string().optional().default(""),
  items: z
    .array(z.object({ title: z.string(), text: z.string().optional().default("") }))
    .optional()
    .default([]),
});

const landingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  meta_title: z.string(),
  meta_description: z.string(),
  hero_headline: z.string(),
  hero_subheadline: z.string(),
  cta_label: z.string(),
  keywords: z.array(z.string()).default([]),
  sections: z.array(sectionSchema).min(3).max(8),
});

export const generateAiLanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        goal: z.string().min(3).max(500),
        audience: z.string().max(500).optional().default(""),
        keywords: z.string().max(500).optional().default(""),
        brief: z.string().max(3000).optional().default(""),
        ctaUrl: z.string().url().optional().nullable(),
        autoPublish: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("ai_growth_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    const brand = settings?.brand_name ?? "Finance You";
    const brandDesc = settings?.brand_description ?? "";
    const ctaUrl =
      data.ctaUrl ?? settings?.primary_cta_url ?? "https://app.financeyou.pl/embed/wniosek";
    const model = settings?.default_model ?? "google/gemini-2.5-flash";

    const system =
      `Jesteś senior copywriterem i strategiem konwersji dla marki ${brand} (${brandDesc}). ` +
      "Twórz landingi po polsku, konkretne, bez lania wody, z mocnym hookiem i jasnym CTA. " +
      "Zwracasz WYŁĄCZNIE wywołanie funkcji create_landing — żadnego dodatkowego tekstu.";

    const userMsg = [
      `Cel kampanii: ${data.goal}`,
      data.audience ? `Grupa docelowa: ${data.audience}` : "",
      data.keywords ? `Słowa kluczowe SEO: ${data.keywords}` : "",
      data.brief ? `Dodatkowy brief: ${data.brief}` : "",
      `CTA URL: ${ctaUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    const tools = [
      {
        type: "function",
        function: {
          name: "create_landing",
          description: "Generuje kompletny landing page (meta, hero, sekcje).",
          parameters: {
            type: "object",
            properties: {
              slug: {
                type: "string",
                description: "URL slug, małe litery, myślniki, max 60 znaków",
              },
              title: { type: "string" },
              meta_title: { type: "string", description: "max 60 znaków" },
              meta_description: { type: "string", description: "max 160 znaków" },
              hero_headline: { type: "string" },
              hero_subheadline: { type: "string" },
              cta_label: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              sections: {
                type: "array",
                minItems: 3,
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["benefits", "how_it_works", "social_proof", "faq", "cta"],
                    },
                    heading: { type: "string" },
                    body: { type: "string" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { title: { type: "string" }, text: { type: "string" } },
                        required: ["title"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["kind", "heading"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "slug",
              "title",
              "meta_title",
              "meta_description",
              "hero_headline",
              "hero_subheadline",
              "cta_label",
              "sections",
            ],
            additionalProperties: false,
          },
        },
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "create_landing" } },
      }),
    });

    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);

    const json: any = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI nie zwróciło landingu");
    const parsed = landingSchema.parse(JSON.parse(call.function.arguments));

    // Ensure unique slug
    let slug = parsed.slug.slice(0, 60);
    let suffix = 0;

    while (true) {
      const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
      const { data: existing } = await supabase
        .from("ai_landings")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!existing) {
        slug = candidate;
        break;
      }
      suffix++;
      if (suffix > 50) throw new Error("Nie mogę nadać unikalnego slug");
    }

    const status = data.autoPublish ? "published" : "draft";
    const { data: inserted, error } = await supabase
      .from("ai_landings")
      .insert({
        slug,
        title: parsed.title,
        status,
        goal: data.goal,
        audience: data.audience || null,
        keywords: parsed.keywords ?? [],
        brief: data.brief || null,
        meta_title: parsed.meta_title,
        meta_description: parsed.meta_description,
        hero_headline: parsed.hero_headline,
        hero_subheadline: parsed.hero_subheadline,
        cta_label: parsed.cta_label,
        cta_url: ctaUrl,
        sections: parsed.sections,
        raw_ai_output: parsed,
        source: "ai_autopilot",
        created_by: userId,
        published_at: status === "published" ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("ai_growth_action_log").insert({
      module: "landing_generator",
      action: status === "published" ? "create_and_publish" : "create_draft",
      status: "ok",
      summary: `Wygenerowano landing: ${parsed.title}`,
      payload: { landing_id: inserted.id, slug },
      actor: userId,
    });

    return { landing: inserted };
  });

export const setLandingStatus = createServerFn({ method: "POST" })
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
    const { error } = await supabase.from("ai_landings").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("ai_growth_action_log").insert({
      module: "landing_generator",
      action: `status_${data.status}`,
      status: "ok",
      summary: `Zmiana statusu landingu na ${data.status}`,
      payload: { landing_id: data.id },
      actor: userId,
    });
    return { ok: true };
  });

export const deleteLanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("ai_landings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("ai_growth_action_log").insert({
      module: "landing_generator",
      action: "delete",
      status: "ok",
      summary: "Usunięcie landingu",
      payload: { landing_id: data.id },
      actor: userId,
    });
    return { ok: true };
  });

export const updateGrowthSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        automation_mode: z.enum(["off", "manual_review", "semi_auto", "full_autopilot"]).optional(),
        daily_ai_budget_pln: z.number().min(0).max(10000).optional(),
        brand_name: z.string().max(120).optional(),
        brand_description: z.string().max(500).optional(),
        target_audience: z.string().max(500).optional(),
        primary_cta_url: z.string().url().optional(),
        default_model: z.string().max(80).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("ai_growth_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!row) throw new Error("Brak rekordu ustawień");
    const { error } = await supabase
      .from("ai_growth_settings")
      .update({ ...data, updated_by: userId })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
