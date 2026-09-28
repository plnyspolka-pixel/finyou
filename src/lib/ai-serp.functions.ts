import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addKeywordSchema,
  updateKeywordSchema,
  deleteKeywordSchema,
  checkKeywordRankingSchema,
} from "./ai-serp-schema";
// Logika: src/lib/ai-serp.server.ts (wspólna z narzędziami MCP).

export const addKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addKeywordSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-serp.server");
    return mod.addKeyword(context.supabase, context.userId, data);
  });

export const updateKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateKeywordSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-serp.server");
    return mod.updateKeyword(context.supabase, context.userId, data);
  });

export const deleteKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteKeywordSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-serp.server");
    return mod.deleteKeyword(context.supabase, context.userId, data);
  });

export const checkKeywordRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => checkKeywordRankingSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-serp.server");
    return mod.checkKeywordRanking(context.supabase, context.userId, data);
  });

export const checkAllRankings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./ai-serp.server");
    return mod.checkAllRankings(context.supabase, context.userId);
  });
