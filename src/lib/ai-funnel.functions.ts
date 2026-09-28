import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as publicClient } from "@/integrations/supabase/client";
import { getFunnelStatsSchema, generateFunnelInsightsSchema } from "./ai-funnel-schema";
// Logika: src/lib/ai-funnel.server.ts (wspólna z narzędziami MCP).

export const trackFunnelEvent = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        session_id: z.string().min(8).max(80),
        landing_id: z.string().uuid().optional().nullable(),
        step: z.string().min(1).max(80),
        step_order: z.number().int().min(0).max(50).default(0),
        event_type: z
          .enum([
            "pageview",
            "click",
            "form_start",
            "form_submit",
            "scroll",
            "conversion",
            "purchase",
          ])
          .default("pageview"),
        value: z.number().min(0).max(10_000_000).optional().nullable(),
        source: z.string().max(80).optional().nullable(),
        medium: z.string().max(80).optional().nullable(),
        campaign: z.string().max(120).optional().nullable(),
        referrer: z.string().max(500).optional().nullable(),
        country: z.string().max(8).optional().nullable(),
        device: z.enum(["mobile", "tablet", "desktop"]).optional().nullable(),
        metadata: z.record(z.string(), z.any()).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { error } = await publicClient.from("ai_funnel_events").insert({
      session_id: data.session_id,
      landing_id: data.landing_id ?? null,
      step: data.step,
      step_order: data.step_order,
      event_type: data.event_type,
      value: data.value ?? null,
      source: data.source ?? null,
      medium: data.medium ?? null,
      campaign: data.campaign ?? null,
      referrer: data.referrer ?? null,
      country: data.country ?? null,
      device: data.device ?? null,
      metadata: data.metadata ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const getFunnelStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => getFunnelStatsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-funnel.server");
    return mod.getFunnelStats(context.supabase, context.userId, data);
  });

export const generateFunnelInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => generateFunnelInsightsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-funnel.server");
    return mod.generateFunnelInsights(context.supabase, context.userId, data);
  });
