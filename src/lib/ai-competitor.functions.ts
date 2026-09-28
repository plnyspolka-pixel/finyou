import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addCompetitorSchema,
  updateCompetitorSchema,
  deleteCompetitorSchema,
  scanCompetitorSchema,
} from "./ai-competitor-schema";
// Logika: src/lib/ai-competitor.server.ts (wspólna z narzędziami MCP).

export const addCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addCompetitorSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-competitor.server");
    return mod.addCompetitor(context.supabase, context.userId, data);
  });

export const updateCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateCompetitorSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-competitor.server");
    return mod.updateCompetitor(context.supabase, context.userId, data);
  });

export const deleteCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteCompetitorSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-competitor.server");
    return mod.deleteCompetitor(context.supabase, context.userId, data);
  });

export const scanCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => scanCompetitorSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-competitor.server");
    return mod.scanCompetitor(context.supabase, context.userId, data);
  });
