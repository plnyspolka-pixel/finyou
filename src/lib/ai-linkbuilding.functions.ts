import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addBacklinkSchema,
  updateBacklinkSchema,
  deleteBacklinkSchema,
  generateLinkBuildingSuggestionsSchema,
  updateLbSuggestionSchema,
  promoteSuggestionToOutreachSchema,
} from "./ai-linkbuilding-schema";
// Logika: src/lib/ai-linkbuilding.server.ts (wspólna z narzędziami MCP).

export const addBacklink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addBacklinkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-linkbuilding.server");
    return mod.addBacklink(context.supabase, context.userId, data);
  });

export const updateBacklink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateBacklinkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-linkbuilding.server");
    return mod.updateBacklink(context.supabase, context.userId, data);
  });

export const deleteBacklink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteBacklinkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-linkbuilding.server");
    return mod.deleteBacklink(context.supabase, context.userId, data);
  });

export const generateLinkBuildingSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => generateLinkBuildingSuggestionsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-linkbuilding.server");
    return mod.generateLinkBuildingSuggestions(context.supabase, context.userId, data);
  });

export const updateLbSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateLbSuggestionSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-linkbuilding.server");
    return mod.updateLbSuggestion(context.supabase, context.userId, data);
  });

export const promoteSuggestionToOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => promoteSuggestionToOutreachSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./ai-linkbuilding.server");
    return mod.promoteSuggestionToOutreach(context.supabase, context.userId, data);
  });
