import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Recommendation = {
  kind: "variant" | "copy" | "settings" | "seo";
  title: string;
  rationale: string;
  expected_lift_pct?: number | null;
  payload: Record<string, any>;
};

export const analyzeLandingPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ landing_id: z.string().uuid() }).parse(i))
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

    const [{ data: variants }, { data: events }, { data: settings }] = await Promise.all([
      supabase.from("ai_landing_variants").select("*").eq("landing_id", data.landing_id),
      supabase
        .from("ai_landing_events")
        .select("event_type, variant_id, metadata, created_at")
        .eq("landing_id", data.landing_id)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("ai_growth_settings")
        .select("default_model, brand_name")
        .limit(1)
        .maybeSingle(),
    ]);

    // Aggregate stats
    const stats = aggregateStats(events ?? [], variants ?? []);

    const model = settings?.default_model ?? "google/gemini-2.5-flash";
    const system =
      "Jesteś senior CRO/growth strategiem. Analizujesz dane landing page'a (heatmapa, scroll, CTR, A/B) " +
      "i proponujesz konkretne, wykonalne optymalizacje. Zwracasz WYŁĄCZNIE wywołanie funkcji propose_optimizations. " +
      "Po polsku, zero ogólników.";

    const userMsg = JSON.stringify(
      {
        landing: {
          title: landing.title,
          hero_headline: landing.hero_headline,
          hero_subheadline: landing.hero_subheadline,
          cta_label: landing.cta_label,
          meta_title: landing.meta_title,
          meta_description: landing.meta_description,
        },
        performance: stats,
        existing_variants: (variants ?? []).map((v: any) => ({
          label: v.label,
          weight: v.weight,
          is_active: v.is_active,
        })),
      },
      null,
      2,
    );

    const tools = [
      {
        type: "function",
        function: {
          name: "propose_optimizations",
          description: "Zwraca 3-6 rekomendacji optymalizacyjnych dla landingu.",
          parameters: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["variant", "copy", "settings", "seo"] },
                    title: {
                      type: "string",
                      description: "Krótki tytuł rekomendacji (max 80 zn.).",
                    },
                    rationale: { type: "string", description: "Dlaczego — w oparciu o dane." },
                    expected_lift_pct: {
                      type: "number",
                      description: "Spodziewany wzrost CR w % (estymacja).",
                    },
                    payload: {
                      type: "object",
                      description:
                        "Konkretna zmiana. Dla 'variant' i 'copy': { hero_headline?, hero_subheadline?, cta_label? }. Dla 'seo': { meta_title?, meta_description? }. Dla 'settings': { note }.",
                      properties: {
                        hero_headline: { type: "string" },
                        hero_subheadline: { type: "string" },
                        cta_label: { type: "string" },
                        meta_title: { type: "string" },
                        meta_description: { type: "string" },
                        note: { type: "string" },
                      },
                    },
                  },
                  required: ["kind", "title", "rationale", "payload"],
                },
              },
            },
            required: ["recommendations"],
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
        tool_choice: { type: "function", function: { name: "propose_optimizations" } },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI Gateway: ${res.status} ${t}`);
    }
    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("AI nie zwróciło rekomendacji");
    const parsed = JSON.parse(call.function.arguments) as { recommendations: Recommendation[] };

    // Mark previous pending as superseded
    await supabase
      .from("ai_landing_optimizations")
      .update({ status: "superseded" })
      .eq("landing_id", data.landing_id)
      .eq("status", "pending");

    const rows = parsed.recommendations.map((r) => ({
      landing_id: data.landing_id,
      kind: r.kind,
      title: r.title.slice(0, 200),
      rationale: r.rationale ?? "",
      expected_lift_pct: r.expected_lift_pct ?? null,
      payload: r.payload ?? {},
      status: "pending",
      created_by: userId,
    }));
    const { data: inserted, error: insErr } = await supabase
      .from("ai_landing_optimizations")
      .insert(rows)
      .select();
    if (insErr) throw new Error(insErr.message);

    await supabase.from("ai_growth_action_log").insert({
      module: "micro_optimizer",
      action: "analyze",
      status: "ok",
      summary: `Wygenerowano ${rows.length} rekomendacji dla „${landing.title}"`,
      payload: { landing_id: data.landing_id, stats },
      actor: userId,
    });

    return { recommendations: inserted, stats };
  });

export const applyOptimization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: opt, error } = await supabase
      .from("ai_landing_optimizations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !opt) throw new Error("Rekomendacja nie istnieje");
    if (opt.status !== "pending") throw new Error("Rekomendacja już rozpatrzona");

    let appliedVariantId: string | null = null;

    try {
      const payload = (opt.payload ?? {}) as Record<string, any>;
      if (opt.kind === "variant" || opt.kind === "copy") {
        const overrides: Record<string, any> = {};
        for (const k of ["hero_headline", "hero_subheadline", "cta_label"]) {
          if (payload[k]) overrides[k] = payload[k];
        }
        if (Object.keys(overrides).length === 0) throw new Error("Brak nadpisań do zastosowania");

        const label = opt.title.slice(0, 60);
        const { data: v, error: vErr } = await supabase
          .from("ai_landing_variants")
          .insert({
            landing_id: opt.landing_id,
            label,
            weight: 50,
            overrides,
            is_active: true,
          })
          .select()
          .single();
        if (vErr) throw new Error(vErr.message);
        appliedVariantId = v.id;
      } else if (opt.kind === "seo") {
        const patch: { meta_title?: string; meta_description?: string } = {};
        if (payload.meta_title) patch.meta_title = String(payload.meta_title);
        if (payload.meta_description) patch.meta_description = String(payload.meta_description);
        if (Object.keys(patch).length === 0) throw new Error("Brak zmian SEO");
        const { error: uErr } = await supabase
          .from("ai_landings")
          .update(patch)
          .eq("id", opt.landing_id);
        if (uErr) throw new Error(uErr.message);
      } else {
        // settings - just mark as applied (informational)
      }

      const { error: stErr } = await supabase
        .from("ai_landing_optimizations")
        .update({ status: "applied", applied_variant_id: appliedVariantId, error_message: null })
        .eq("id", data.id);
      if (stErr) throw new Error(stErr.message);

      await supabase.from("ai_growth_action_log").insert({
        module: "micro_optimizer",
        action: "apply",
        status: "ok",
        summary: `Zastosowano: ${opt.title}`,
        payload: { optimization_id: data.id, variant_id: appliedVariantId },
        actor: userId,
      });
      return { ok: true, variant_id: appliedVariantId };
    } catch (e: any) {
      await supabase
        .from("ai_landing_optimizations")
        .update({ error_message: e.message })
        .eq("id", data.id);
      throw e;
    }
  });

export const rejectOptimization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_landing_optimizations")
      .update({ status: "rejected" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function aggregateStats(events: any[], variants: any[]) {
  const variantStats: Record<string, { views: number; clicks: number; cr: number; label: string }> =
    {};
  const ctrl = { views: 0, clicks: 0 };
  let scroll25 = 0,
    scroll50 = 0,
    scroll75 = 0,
    scroll100 = 0;
  const clickTargets: Record<string, number> = {};
  const times: number[] = [];

  for (const e of events) {
    if (e.event_type === "view") {
      if (e.variant_id) {
        const v = variants.find((x) => x.id === e.variant_id);
        const label = v?.label ?? "?";
        variantStats[e.variant_id] ??= { views: 0, clicks: 0, cr: 0, label };
        variantStats[e.variant_id].views++;
      } else ctrl.views++;
    } else if (e.event_type === "cta_click" || e.event_type === "lead") {
      if (e.variant_id) {
        const v = variants.find((x) => x.id === e.variant_id);
        const label = v?.label ?? "?";
        variantStats[e.variant_id] ??= { views: 0, clicks: 0, cr: 0, label };
        variantStats[e.variant_id].clicks++;
      } else ctrl.clicks++;
    } else if (e.event_type === "scroll_25") scroll25++;
    else if (e.event_type === "scroll_50") scroll50++;
    else if (e.event_type === "scroll_75") scroll75++;
    else if (e.event_type === "scroll_100") scroll100++;
    else if (e.event_type === "click") {
      const t = e.metadata?.text || e.metadata?.id || e.metadata?.tag || "?";
      clickTargets[t] = (clickTargets[t] ?? 0) + 1;
    } else if (e.event_type === "time_on_page") {
      const s = Number(e.metadata?.seconds);
      if (Number.isFinite(s) && s > 0 && s < 3600) times.push(s);
    }
  }

  for (const k of Object.keys(variantStats)) {
    const v = variantStats[k];
    v.cr = v.views ? v.clicks / v.views : 0;
  }
  const ctrlCr = ctrl.views ? ctrl.clicks / ctrl.views : 0;
  const totalViews = ctrl.views + Object.values(variantStats).reduce((a, b) => a + b.views, 0);
  const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  return {
    total_views: totalViews,
    control: { ...ctrl, cr: ctrlCr },
    variants: Object.values(variantStats),
    scroll: {
      pct_25: totalViews ? scroll25 / totalViews : 0,
      pct_50: totalViews ? scroll50 / totalViews : 0,
      pct_75: totalViews ? scroll75 / totalViews : 0,
      pct_100: totalViews ? scroll100 / totalViews : 0,
    },
    avg_time_seconds: Math.round(avgTime),
    top_click_targets: Object.entries(clickTargets)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([k, v]) => ({ target: k, count: v })),
  };
}
