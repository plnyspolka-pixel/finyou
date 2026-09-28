import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  searchTargetingSchema,
  listAdPixelsSchema,
  createAdPixelSchema,
  suggestTargetingSchema,
  saveAdDraftSchema,
  getAdDraftSchema,
  deleteAdDraftSchema,
  publishAdDraftSchema,
} from "./meta-ads-creator-schema";
// Logika: src/lib/meta-ads-creator.server.ts (wspólna z narzędziami MCP).

export const listFbPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.listFbPages(context.supabase, context.userId);
  });

export const searchTargeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => searchTargetingSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.searchTargeting(context.supabase, context.userId, data);
  });

export const listAdPixels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => listAdPixelsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.listAdPixels(context.supabase, context.userId, data);
  });

export const createAdPixel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createAdPixelSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.createAdPixel(context.supabase, context.userId, data);
  });

export const suggestTargeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => suggestTargetingSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.suggestTargeting(context.supabase, context.userId, data);
  });

export const saveAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.saveAdDraft(context.supabase, context.userId, data);
  });

export const listAdDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.listAdDrafts(context.supabase, context.userId);
  });

export const getAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => getAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.getAdDraft(context.supabase, context.userId, data);
  });

export const deleteAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.deleteAdDraft(context.supabase, context.userId, data);
  });

export const publishAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => publishAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./meta-ads-creator.server");
    return mod.publishAdDraft(context.supabase, context.userId, data);
  });
