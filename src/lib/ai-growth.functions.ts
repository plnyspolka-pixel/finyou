import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateAiLandingSchema,
  setLandingStatusSchema,
  deleteLandingSchema,
  updateGrowthSettingsSchema,
} from "./ai-growth-schema";
// Logika: src/lib/ai-growth.server.ts (wspólna z narzędziami MCP).

export const generateAiLanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => generateAiLandingSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-growth.server");
    return mod.generateAiLanding(context.supabase, context.userId, data);
  });

export const setLandingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => setLandingStatusSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-growth.server");
    return mod.setLandingStatus(context.supabase, context.userId, data);
  });

export const deleteLanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteLandingSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-growth.server");
    return mod.deleteLanding(context.supabase, context.userId, data);
  });

export const updateGrowthSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateGrowthSettingsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-growth.server");
    return mod.updateGrowthSettings(context.supabase, context.userId, data);
  });
