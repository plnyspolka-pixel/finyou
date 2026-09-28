import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchClarityMetricsSchema, analyzeClarityMetricsSchema } from "./clarity-schema";
// Logika: src/lib/clarity.server.ts (wspólna z narzędziami MCP).

export const fetchClarityMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => fetchClarityMetricsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./clarity.server");
    return mod.fetchClarityMetrics(context.supabase, context.userId, data);
  });

export const analyzeClarityMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => analyzeClarityMetricsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./clarity.server");
    return mod.analyzeClarityMetrics(context.supabase, context.userId, data);
  });
