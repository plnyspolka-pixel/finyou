import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  planSeoTopicsSchema,
  generateSeoArticleSchema,
  setArticleStatusSchema,
  deleteSeoArticleSchema,
  deleteSeoTopicSchema,
} from "./ai-seo-schema";
// Logika: src/lib/ai-seo-engine.server.ts (wspólna z narzędziami MCP).

export const planSeoTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => planSeoTopicsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-seo-engine.server");
    return mod.planSeoTopics(context.supabase, context.userId, data);
  });

export const generateSeoArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => generateSeoArticleSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-seo-engine.server");
    return mod.generateSeoArticle(context.supabase, context.userId, data);
  });

export const setArticleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => setArticleStatusSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-seo-engine.server");
    return mod.setArticleStatus(context.supabase, context.userId, data);
  });

export const deleteSeoArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteSeoArticleSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-seo-engine.server");
    return mod.deleteSeoArticle(context.supabase, context.userId, data);
  });

export const deleteSeoTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteSeoTopicSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-seo-engine.server");
    return mod.deleteSeoTopic(context.supabase, context.userId, data);
  });
