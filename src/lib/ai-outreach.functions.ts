import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addOutreachTargetSchema,
  updateOutreachTargetSchema,
  deleteOutreachTargetSchema,
  discoverOutreachTargetsSchema,
  generateOutreachMessageSchema,
  updateOutreachMessageSchema,
  deleteOutreachMessageSchema,
} from "./ai-outreach-schema";
// Logika: src/lib/ai-outreach.server.ts (wspólna z narzędziami MCP).

export const addOutreachTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addOutreachTargetSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.addOutreachTarget(context.supabase, context.userId, data);
  });

export const updateOutreachTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateOutreachTargetSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.updateOutreachTarget(context.supabase, context.userId, data);
  });

export const deleteOutreachTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteOutreachTargetSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.deleteOutreachTarget(context.supabase, context.userId, data);
  });

export const discoverOutreachTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => discoverOutreachTargetsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.discoverOutreachTargets(context.supabase, context.userId, data);
  });

export const generateOutreachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => generateOutreachMessageSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.generateOutreachMessage(context.supabase, context.userId, data);
  });

export const updateOutreachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateOutreachMessageSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.updateOutreachMessage(context.supabase, context.userId, data);
  });

export const deleteOutreachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteOutreachMessageSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-outreach.server");
    return mod.deleteOutreachMessage(context.supabase, context.userId, data);
  });
