import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const overridesSchema = z
  .object({
    hero_headline: z.string().max(200).optional(),
    hero_subheadline: z.string().max(500).optional(),
    cta_label: z.string().max(80).optional(),
    cta_url: z.string().url().optional(),
    sections: z.array(z.any()).optional(),
  })
  .strict();

export const createVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        landing_id: z.string().uuid(),
        label: z.string().min(1).max(60),
        weight: z.number().int().min(0).max(100).default(50),
        overrides: overridesSchema.default({}),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_landing_variants")
      .insert({
        landing_id: data.landing_id,
        label: data.label,
        weight: data.weight,
        overrides: data.overrides,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("ai_growth_action_log").insert({
      module: "ab_testing",
      action: "create_variant",
      status: "ok",
      summary: `Nowy wariant „${data.label}"`,
      payload: { landing_id: data.landing_id, variant_id: row.id },
      actor: userId,
    });
    return { variant: row };
  });

export const updateVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().min(1).max(60).optional(),
        weight: z.number().int().min(0).max(100).optional(),
        is_active: z.boolean().optional(),
        overrides: overridesSchema.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("ai_landing_variants").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_landing_variants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateVariantWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        landing_id: z.string().uuid(),
        label: z.string().min(1).max(60),
        angle: z.string().min(3).max(500),
        weight: z.number().int().min(0).max(100).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");
    const { supabase, userId } = context;

    const { data: landing, error: lErr } = await supabase
      .from("ai_landings")
      .select("*")
      .eq("id", data.landing_id)
      .maybeSingle();
    if (lErr || !landing) throw new Error("Landing nie istnieje");

    const { data: settings } = await supabase
      .from("ai_growth_settings")
      .select("default_model, brand_name")
      .limit(1)
      .maybeSingle();
    const model = settings?.default_model ?? "google/gemini-2.5-flash";

    const system =
      "Jesteś strategiem konwersji. Tworzysz alternatywny wariant landingu pod test A/B. " +
      "Zachowujesz cel i grupę docelową, ale zmieniasz kąt komunikacji, hook i nagłówki. " +
      "Zwracasz wyłącznie wywołanie funkcji create_variant.";

    const userMsg = [
      `Marka: ${settings?.brand_name ?? "Finance You"}`,
      `Oryginalny hero_headline: ${landing.hero_headline}`,
      `Oryginalny hero_subheadline: ${landing.hero_subheadline}`,
      `Oryginalny CTA: ${landing.cta_label}`,
      `Cel: ${landing.goal ?? ""}`,
      `Grupa: ${landing.audience ?? ""}`,
      `Nowy kąt komunikacji do testu: ${data.angle}`,
    ].join("\n");

    const tools = [
      {
        type: "function",
        function: {
          name: "create_variant",
          description: "Generuje overrides dla wariantu A/B",
          parameters: {
            type: "object",
            properties: {
              hero_headline: { type: "string" },
              hero_subheadline: { type: "string" },
              cta_label: { type: "string" },
            },
            required: ["hero_headline", "hero_subheadline", "cta_label"],
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
        tool_choice: { type: "function", function: { name: "create_variant" } },
      }),
    });
    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);
    const json: any = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI nie zwróciło wariantu");
    const parsed = JSON.parse(call.function.arguments);

    const overrides = overridesSchema.parse({
      hero_headline: parsed.hero_headline,
      hero_subheadline: parsed.hero_subheadline,
      cta_label: parsed.cta_label,
    });

    const { data: row, error } = await supabase
      .from("ai_landing_variants")
      .insert({
        landing_id: data.landing_id,
        label: data.label,
        weight: data.weight,
        overrides,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("ai_growth_action_log").insert({
      module: "ab_testing",
      action: "ai_generate_variant",
      status: "ok",
      summary: `AI wygenerowało wariant „${data.label}"`,
      payload: { landing_id: data.landing_id, variant_id: row.id, angle: data.angle },
      actor: userId,
    });
    return { variant: row };
  });
